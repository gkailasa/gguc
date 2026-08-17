// Worker 2 — Search + Admin
// Actions: getStatus (public), getAdmin (password), updatePayment (password)

const SHEET_ID = '1-P3FOKShM4aBRPqL5qAWblXbO0X6XqtB6uMRHL6-rh8';
const SCOPES   = 'https://www.googleapis.com/auth/spreadsheets';

const TOKEN_CACHE_ENABLED = true;
let cachedToken = null;
let tokenExpiry  = 0;

const EVENTS  = ['daily-pooja', 'kumkuma-pooja', 'ganapathi-homam'];
const COLUMNS = ['Reg ID', 'Timestamp', 'Name', 'Flat', 'Phone', 'Date', 'Slot', 'Payment Status', 'Payment Date'];

// Sheet column indices (0-based) — same for all events (uniform schema)
const COL = {
  REG_ID:         0,  // A
  TIMESTAMP:      1,  // B
  NAME:           2,  // C
  FLAT:           3,  // D
  PHONE:          4,  // E
  DATE:           5,  // F
  SLOT:           6,  // G
  PAYMENT_STATUS: 7,  // H
  PAYMENT_DATE:   8,  // I
};

/* ── Google Auth ─────────────────────────────────────────── */

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  if (TOKEN_CACHE_ENABLED && cachedToken && tokenExpiry > now + 60) {
    return cachedToken;
  }

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

  if (TOKEN_CACHE_ENABLED) {
    cachedToken = data.access_token;
    tokenExpiry  = now + (data.expires_in || 3600);
  }
  return data.access_token;
}

/* ── Sheets helpers ──────────────────────────────────────── */

async function sheetsGet(token, range) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(range)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error('Sheets GET error: ' + res.status);
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

/* ── Auth check ──────────────────────────────────────────── */

function checkAuth(password, env) {
  return password === env.ADMIN_PASSWORD;
}

/* ── Get Status ──────────────────────────────────────────── */

async function handleGetStatus(db, query, env) {
  const normalizedQuery = query.trim().toLowerCase();
  const isPhone = /^\d{10}$/.test(query.trim());

  // D1 primary
  const { results } = await db.prepare(
    `SELECT * FROM registrations WHERE LOWER(flat) = ? OR phone = ? ORDER BY timestamp ASC`
  ).bind(normalizedQuery, query.trim()).all();

  if (results && results.length > 0) {
    return {
      results: results.map(r => ({
        eventKey:      r.event_key,
        regId:         r.id,
        timestamp:     r.timestamp,
        name:          r.name,
        flat:          r.flat,
        phone:         r.phone,
        date:          r.event_date,
        slot:          r.slot,
        paymentStatus: r.payment_status,
      }))
    };
  }

  // Sheets fallback — for registrations that predate D1 rollout
  try {
    const serviceAccount = JSON.parse(env.SERVICE_ACCOUNT_JSON);
    const token = await getAccessToken(serviceAccount);

    const sheets = await Promise.all(EVENTS.map(async event => {
      try {
        const res = await sheetsGet(token, `${event}!A:I`);
        return { event, rows: (res.values || []).slice(1) };
      } catch(e) {
        return { event, rows: [] };
      }
    }));

    const fallback = [];
    for (const { event, rows } of sheets) {
      for (const r of rows) {
        const matchFlat  = r[COL.FLAT]?.toLowerCase()  === normalizedQuery;
        const matchPhone = r[COL.PHONE] === query.trim();
        if (isPhone ? matchPhone : matchFlat) {
          fallback.push({
            eventKey:      event,
            regId:         r[COL.REG_ID]        || '',
            timestamp:     r[COL.TIMESTAMP]      || '',
            name:          r[COL.NAME]           || '',
            flat:          r[COL.FLAT]           || '',
            phone:         r[COL.PHONE]          || '',
            date:          r[COL.DATE]           || '',
            slot:          r[COL.SLOT]           || '',
            paymentStatus: r[COL.PAYMENT_STATUS] || '',
          });
        }
      }
    }
    return { results: fallback };
  } catch(e) {
    return { results: [] };
  }
}

/* ── Get Admin ───────────────────────────────────────────── */

async function handleGetAdmin(db, password, env) {
  if (!checkAuth(password, env)) return { error: 'unauthorized' };

  const data = {};
  for (const event of EVENTS) {
    const { results } = await db.prepare(
      `SELECT * FROM registrations WHERE event_key = ? ORDER BY timestamp ASC`
    ).bind(event).all();

    data[event] = {
      rows: (results || []).map(r => ({
        'Reg ID':         r.id,
        'Timestamp':      r.timestamp,
        'Name':           r.name,
        'Flat':           r.flat,
        'Phone':          r.phone,
        'Date':           r.event_date,
        'Slot':           r.slot,
        'Payment Status': r.payment_status,
        'Payment Date':   r.payment_date,
      }))
    };
  }

  return { data };
}

/* ── Update Payment ──────────────────────────────────────── */

async function handleUpdatePayment(db, regId, paymentStatus, password, env) {
  if (!checkAuth(password, env)) return { error: 'unauthorized' };

  // Find the registration in D1
  const reg = await db.prepare(
    `SELECT * FROM registrations WHERE id = ? LIMIT 1`
  ).bind(regId).first();

  if (!reg) return { success: false, error: 'not_found' };

  const paymentDate = new Date().toISOString();

  // Update D1
  await db.prepare(
    `UPDATE registrations SET payment_status = ?, payment_date = ? WHERE id = ?`
  ).bind(paymentStatus, paymentDate, regId).run();

  // Update Sheets row
  try {
    const serviceAccount = JSON.parse(env.SERVICE_ACCOUNT_JSON);
    const token = await getAccessToken(serviceAccount);
    const event = reg.event_key;

    // Find the row index by matching Reg ID in column A
    const res    = await sheetsGet(token, `${event}!A:A`);
    const regIds = (res.values || []).map(r => r[0]);
    const rowIndex = regIds.indexOf(regId); // 0-based; row 0 is the header

    if (rowIndex > 0) {
      const sheetRow = rowIndex + 1; // convert to 1-based sheet row number
      await sheetsUpdate(token, `${event}!H${sheetRow}:I${sheetRow}`, [[paymentStatus, paymentDate]]);
    }
  } catch(e) {
    // D1 was updated — Sheets failure is non-critical, log and continue
    console.error('Sheets payment update failed:', e.message);
  }

  return { success: true };
}

/* ── CORS ────────────────────────────────────────────────── */

function cors() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/* ── Main handler ────────────────────────────────────────── */

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors() });
    }

    try {
      const body = await request.json();
      const { action, query, regId, paymentStatus, password } = body;

      let result;
      if (action === 'getStatus') {
        result = await handleGetStatus(env.DB, query, env);
      } else if (action === 'getAdmin') {
        result = await handleGetAdmin(env.DB, password, env);
      } else if (action === 'updatePayment') {
        result = await handleUpdatePayment(env.DB, regId, paymentStatus, password, env);
      } else {
        result = { error: 'unknown action' };
      }

      return new Response(JSON.stringify(result), {
        headers: { ...cors(), 'Content-Type': 'application/json' },
      });
    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), {
        status: 500,
        headers: { ...cors(), 'Content-Type': 'application/json' },
      });
    }
  },
};
