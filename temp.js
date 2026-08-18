/*
 * Worker: Scheduled D1 → Google Sheets Sync (CPU Optimized)
 */

const SHEET_ID = '1-P3FOKShM4aBRPqL5qAWblXbO0X6XqtB6uMRHL6-rh8';
const SCOPES   = 'https://www.googleapis.com/auth/spreadsheets';

const EVENTS  = ['daily-pooja', 'kumkuma-pooja', 'ganapathi-homam'];
const COLUMNS = ['Reg ID', 'Timestamp', 'Name', 'Flat', 'Phone', 'Date', 'Slot', 'Payment Status', 'Payment Date'];

// In-memory module-level caches across warm Worker executions
let cachedToken = null;
let tokenExpiry = 0;
let cachedCryptoKey = null;
let parsedServiceAccount = null;

function getServiceAccount(env) {
  if (!parsedServiceAccount) {
    const parsed = JSON.parse(env.SERVICE_ACCOUNT_JSON);
    parsed.cleanPem = parsed.private_key.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
    parsedServiceAccount = parsed;
  }
  return parsedServiceAccount;
}

async function getAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiry > now + 60) return cachedToken;

  const sa = getServiceAccount(env);
  const header  = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss:   sa.client_email,
    scope: SCOPES,
    aud:   'https://oauth2.googleapis.com/token',
    exp:   now + 3600,
    iat:   now,
  };

  const b64 = obj => btoa(JSON.stringify(obj)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
  const signingInput = `${b64(header)}.${b64(payload)}`;

  if (!cachedCryptoKey) {
    const binaryKey = Uint8Array.from(atob(sa.cleanPem), c => c.charCodeAt(0));
    cachedCryptoKey = await crypto.subtle.importKey(
      'pkcs8', binaryKey,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign']
    );
  }

  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cachedCryptoKey,
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

/* ── Sheets API Helpers ──────────────────────────────────── */

async function sheetsGet(token, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Sheets GET error (${res.status}): ${await res.text()}`);
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

/* ── Sync logic ─────────────────────────────────────────── */

async function syncEvent(db, eventKey, token) {
  const { results } = await db.prepare(
    `SELECT * FROM registrations WHERE event_key = ? AND synced_at IS NULL ORDER BY timestamp ASC`
  ).bind(eventKey).all();

  if (!results || results.length === 0) return 0;

  // Retrieve column A to establish row mapping & check if sheet tab exists
  let regIdsRes = null;
  try {
    regIdsRes = await sheetsGet(token, `${eventKey}!A:A`);
  } catch (e) {
    if (e.message.includes('404') || e.message.includes('Unable to parse range')) {
      await createSheetTab(token, eventKey);
      await sheetsAppend(token, `${eventKey}!A1`, [COLUMNS]);
    } else {
      throw e;
    }
  }

  const idToRow = new Map();
  const values = regIdsRes?.values || [];

  if (values.length === 0) {
    await sheetsAppend(token, `${eventKey}!A1`, [COLUMNS]);
  } else {
    values.forEach((row, idx) => {
      if (row[0] && idx > 0) idToRow.set(row[0], idx + 1);
    });
  }

  const now = new Date().toISOString();
  const rowsToAppend = [];
  const updatePromises = [];
  const syncedIds = [];

  for (const r of results) {
    const rowData = [r.id, r.timestamp, r.name, r.flat, r.phone, r.event_date, r.slot, r.payment_status, r.payment_date];

    if (idToRow.has(r.id)) {
      const sheetRow = idToRow.get(r.id);
      updatePromises.push(sheetsUpdate(token, `${eventKey}!A${sheetRow}:I${sheetRow}`, [rowData]));
    } else {
      rowsToAppend.push(rowData);
    }
    syncedIds.push(r.id);
  }

  // Execute updates & batch appends concurrently
  if (rowsToAppend.length > 0) {
    updatePromises.push(sheetsAppend(token, `${eventKey}!A:I`, rowsToAppend));
  }
  await Promise.all(updatePromises);

  // Batch D1 Database update
  if (syncedIds.length > 0) {
    const updateStmt = db.prepare(`UPDATE registrations SET synced_at = ? WHERE id = ?`);
    await db.batch(syncedIds.map(id => updateStmt.bind(now, id)));
  }

  return results.length;
}

/* ── Handler ────────────────────────────────────────────── */

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil((async () => {
      const token = await getAccessToken(env);
      const results = await Promise.all(
        EVENTS.map(event => syncEvent(env.DB, event, token))
      );
      const total = results.reduce((acc, count) => acc + count, 0);
      console.log(`Sheets sync complete. ${total} rows synced.`);
    })());
  },

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