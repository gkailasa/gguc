/*
 * Worker: Scheduled D1 → Google Sheets Sync
 * Runs on a Cloudflare Cron Trigger.
 * Finds rows with synced_at IS NULL, upserts them to Sheets, marks them synced.
 * Also handles payment-status updates for already-synced rows that changed again.
 */

const SHEET_ID = '1-P3FOKShM4aBRPqL5qAWblXbO0X6XqtB6uMRHL6-rh8';
const SCOPES   = 'https://www.googleapis.com/auth/spreadsheets';

const EVENTS  = ['daily-pooja', 'kumkuma-pooja', 'ganapathi-homam'];
const COLUMNS = ['Reg ID', 'Timestamp', 'Name', 'Flat', 'Phone', 'Date', 'Slot', 'Payment Status', 'Payment Date'];

// In-memory token cache across requests on the same instance
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

/* ── Sheets helpers ──────────────────────────────────────── */

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

async function createSheetTab(token, title) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requests: [{ addSheet: { properties: { title } } }],
    }),
  });
  if (!res.ok) throw new Error('Create sheet tab error: ' + res.status);
  return res.json();
}

/* ── Sync one event ──────────────────────────────────────── */

async function syncEvent(db, eventKey, token) {
  const { results } = await db.prepare(
    `SELECT * FROM registrations WHERE event_key = ? AND synced_at IS NULL ORDER BY timestamp ASC`
  ).bind(eventKey).all();

  if (!results || results.length === 0) return 0;

  // Ensure tab exists and has headers
  let tabExists = false;
  try {
    await sheetsGet(token, `${eventKey}!A1:A1`);
    tabExists = true;
  } catch (e) {
    if (e.message.includes('404') || e.message.includes('Unable to parse range')) {
      // Tab probably does not exist
    } else {
      throw e;
    }
  }

  if (!tabExists) {
    await createSheetTab(token, eventKey);
    await sheetsAppend(token, `${eventKey}!A1`, [COLUMNS]);
  } else {
    // Ensure headers exist if tab is empty
    let existing = [];
    try {
      const res = await sheetsGet(token, `${eventKey}!A1:A1`);
      existing = res.values || [];
    } catch (e) {}
    if (existing.length === 0) {
      await sheetsAppend(token, `${eventKey}!A1`, [COLUMNS]);
    }
  }

  // Build map of existing Reg IDs → sheet row number (1-based)
  const regIdsRes = await sheetsGet(token, `${eventKey}!A:A`);
  const idToRow = new Map();
  (regIdsRes.values || []).forEach((row, idx) => {
    if (row[0] && idx > 0) idToRow.set(row[0], idx + 1);
  });

  const now = new Date().toISOString();
  const updateSyncStmt = db.prepare(`UPDATE registrations SET synced_at = ? WHERE id = ?`);

  for (const r of results) {
    const rowData = [r.id, r.timestamp, r.name, r.flat, r.phone, r.event_date, r.slot, r.payment_status, r.payment_date];

    if (idToRow.has(r.id)) {
      const sheetRow = idToRow.get(r.id);
      await sheetsUpdate(token, `${eventKey}!A${sheetRow}:I${sheetRow}`, [rowData]);
    } else {
      await sheetsAppend(token, `${eventKey}!A:I`, [rowData]);
    }

    await updateSyncStmt.bind(now, r.id).run();
  }

  return results.length;
}

/* ── Main scheduled handler ──────────────────────────────── */

export default {
  async scheduled(controller, env, ctx) {
    const serviceAccount = JSON.parse(env.SERVICE_ACCOUNT_JSON);

    ctx.waitUntil((async () => {
      const token = await getAccessToken(serviceAccount);
      let total = 0;
      for (const event of EVENTS) {
        total += await syncEvent(env.DB, event, token);
      }
      console.log(`Sheets sync complete. ${total} rows synced.`);
    })());
  },

  // Optional: allow manual trigger via HTTP for testing
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
