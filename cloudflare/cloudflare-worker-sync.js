/*
 * Worker: Scheduled D1 → Google Sheets Sync
 * Runs on a Cloudflare Cron Trigger.
 * Finds unsynced rows, upserts them to Sheets, marks them synced in batches.
 */

const SHEET_ID = '1-P3FOKShM4aBRPqL5qAWblXbO0X6XqtB6uMRHL6-rh8';
const SCOPES   = 'https://www.googleapis.com/auth/spreadsheets';

// Add new events here — EVENTS list is derived from this config.
// No other changes needed in this worker when adding an event.
const EVENT_CONFIG = {
  'daily-pooja':     {},
  'kumkuma-pooja':   {},
  'ganapathi-homam': {},
};
const EVENTS      = Object.keys(EVENT_CONFIG);
const BATCH_LIMIT = 5; // Per event limit per scheduled execution

// In-memory token cache across requests on the same warm instance
let cachedToken = null;
let tokenExpiry = 0;

/* ── Google Auth ───────────────────────────────────────────── */

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiry > now + 60) return cachedToken;

  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss:   serviceAccount.client_email,
    scope: SCOPES,
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  };

  const b64 = obj => btoa(JSON.stringify(obj)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const signingInput = `${b64(header)}.${b64(payload)}`;

  const pem = serviceAccount.private_key
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const binaryKey = Uint8Array.from(atob(pem), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false, ['sign']
  );

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey,
    new TextEncoder().encode(signingInput)
  );
  const encodedSig = btoa(String.fromCharCode(...new Uint8Array(sig)))
    .replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');

  const jwt = `${signingInput}.${encodedSig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Auth failed: ' + JSON.stringify(data));

  cachedToken = data.access_token;
  tokenExpiry = now + (data.expires_in || 3600);
  return cachedToken;
}

/* ── Sheets API Helpers ───────────────────────────────────── */

async function sheetsGet(token, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Sheets GET error: ' + res.status);
  return res.json();
}

async function sheetsAppend(token, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error('Sheets APPEND error: ' + res.status);
  return res.json();
}

async function sheetsUpdate(token, range, values) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ values }),
  });
  if (!res.ok) throw new Error('Sheets UPDATE error: ' + res.status);
  return res.json();
}

/* ── Sync one event ──────────────────────────────────────── */

async function syncEvent(db, eventKey, token) {
  // Fetch up to BATCH_LIMIT unsynced rows
  const { results } = await db.prepare(
    `SELECT * FROM registrations WHERE event_key = ? AND synced_at IS NULL ORDER BY timestamp ASC LIMIT ?`
  ).bind(eventKey, BATCH_LIMIT).all();

  if (!results || results.length === 0) return 0;

  // Read Column A IDs from existing sheet
  const sheetData = await sheetsGet(token, `${eventKey}!A:A`);
  const existingRows = sheetData.values || [];

  // Map existing Reg IDs → sheet row index (1-based)
  const idToRow = new Map();
  existingRows.forEach((row, idx) => {
    if (row[0] && idx > 0) idToRow.set(row[0], idx + 1);
  });

  const now = new Date().toISOString();
  const updateSyncStmt = db.prepare(`UPDATE registrations SET synced_at = ? WHERE id = ?`);
  const batchStatements = [];

  for (const r of results) {
    const rowData = [r.id, r.timestamp, r.name, r.flat, r.phone, r.event_date, r.slot, r.payment_status, r.payment_date];

    if (idToRow.has(r.id)) {
      const sheetRow = idToRow.get(r.id);
      await sheetsUpdate(token, `${eventKey}!A${sheetRow}:I${sheetRow}`, [rowData]);
    } else {
      await sheetsAppend(token, `${eventKey}!A:I`, [rowData]);
    }

    batchStatements.push(updateSyncStmt.bind(now, r.id));
  }

  // Batch update all successfully processed IDs in D1 in a single round-trip
  if (batchStatements.length > 0) {
    await db.batch(batchStatements);
  }

  return results.length;
}

/* ── Main scheduled handler ──────────────────────────────── */

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      // 1. Quick existence check before performing JSON parsing or RSA auth
      const query = `SELECT 1 FROM registrations WHERE synced_at IS NULL AND event_key IN (${EVENTS.map(() => '?').join(',')}) LIMIT 1`;
      const pendingCheck = await env.DB.prepare(query).bind(...EVENTS).first();

      if (!pendingCheck) {
        console.log('No unsynced rows found. Skipping auth & sync.');
        return;
      }

      // 2. Parse credentials & obtain access token lazily
      const serviceAccount = JSON.parse(env.SERVICE_ACCOUNT_JSON);
      const token = await getAccessToken(serviceAccount);

      let total = 0;
      for (const event of EVENTS) {
        total += await syncEvent(env.DB, event, token);
      }
      console.log(`Sheets sync complete. ${total} rows synced.`);
    })());
  },

  // Optional manual HTTP trigger for testing
  async fetch(request, env, ctx) {
    if (request.method !== 'POST') {
      return new Response('Send POST to trigger sync', { status: 405 });
    }

    const auth = request.headers.get('Authorization') || '';
    if (auth !== `Bearer ${env.SYNC_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }

    return this.scheduled(null, env, ctx);
  },
};