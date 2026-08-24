const SHEET_ID = '1-P3FOKShM4aBRPqL5qAWblXbO0X6XqtB6uMRHL6-rh8';
const SCOPES   = 'https://www.googleapis.com/auth/spreadsheets';

// In-memory token cache across requests on the same instance
let cachedToken = null;
let tokenExpiry = 0;

const COLUMNS = ['Reg ID', 'Timestamp', 'Name', 'Flat', 'Phone', 'Date', 'Slot', 'Payment Status', 'Payment Date'];

const EVENT_CONFIG = {
  'daily-pooja': {
    maxPerSlot: 10,
    blockedSlots: [
      { date: '2026-09-14', slot: 'Morning' },
      { date: '2026-09-14', slot: 'Evening' },
    ],
  },
  'kumkuma-pooja': {
    maxRegistrations: null,
  },
  'ganapathi-homam': {
    maxRegistrations: 10,
  },
};

/* ── Google Auth (Fixed Token Caching) ───────────────────── */

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && tokenExpiry > now + 60) {
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

async function syncToSheetsBackground(env, event, row) {
  try {
    const serviceAccount = JSON.parse(env.SERVICE_ACCOUNT_JSON);
    const token = await getAccessToken(serviceAccount);

    // Check if the tab exists and has a header row; initialize if not
    let existing = [];
    try {
      const res = await sheetsGet(token, `${event}!A1:A1`);
      existing = res.values || [];
    } catch(e) {}

    if (existing.length === 0) {
      await sheetsAppend(token, `${event}!A1`, [COLUMNS]);
    }

    await sheetsAppend(token, `${event}!A:J`, [row]);
  } catch (err) {
    console.error('Background Sheets sync failed:', err.message);
  }
}

/* ── Register Handler ────────────────────────────────────── */

async function handleRegister(db, event, data, env, ctx) {
  const cfg = EVENT_CONFIG[event];
  if (!cfg) return { success: false, error: 'unknown_event' };

  const { name, flat, phone, date = '', slot = '' } = data;
  const normalizedFlat = flat ? flat.trim().toLowerCase() : '';

  if (cfg.maxPerSlot) {
    // Check blocked slots
    const blocked = (cfg.blockedSlots || []).find(b => b.date === date && b.slot === slot);
    if (blocked) return { success: false, error: 'blocked', message: 'This slot is reserved.' };

    // Check duplicate in D1
    const dup = await db.prepare(
      `SELECT id FROM registrations WHERE event_key = ? AND LOWER(flat) = ? AND event_date = ? AND slot = ? LIMIT 1`
    ).bind(event, normalizedFlat, date, slot).first();
    if (dup) return { success: false, error: 'duplicate' };

    // Check capacity in D1
    const countRes = await db.prepare(
      `SELECT COUNT(*) as count FROM registrations WHERE event_key = ? AND event_date = ? AND slot = ?`
    ).bind(event, date, slot).first();
    if (countRes.count >= cfg.maxPerSlot) return { success: false, error: 'full' };
  } else {
    // Non-slot event duplicate check
    const dup = await db.prepare(
      `SELECT id FROM registrations WHERE event_key = ? AND LOWER(flat) = ? LIMIT 1`
    ).bind(event, normalizedFlat).first();
    if (dup) return { success: false, error: 'duplicate' };

    if (cfg.maxRegistrations !== null) {
      const countRes = await db.prepare(
        `SELECT COUNT(*) as count FROM registrations WHERE event_key = ?`
      ).bind(event).first();
      if (countRes.count >= cfg.maxRegistrations) return { success: false, error: 'full' };
    }
  }

  const prefix = { 'daily-pooja': 'DP', 'kumkuma-pooja': 'KP', 'ganapathi-homam': 'GH' }[event] || 'XX';
  const regId = prefix + Date.now().toString(36).toUpperCase();
  const timestamp = new Date().toISOString();
  const row = [regId, timestamp, name, flat, phone, date, slot, 'Pending', ''];

  // Direct insert to D1 (Instant write)
  await db.prepare(
    `INSERT INTO registrations (id, event_key, timestamp, name, flat, phone, event_date, slot, payment_status, payment_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(regId, event, timestamp, name, flat, phone, date, slot, 'Pending', '').run();

  // Async non-blocking push to Google Sheets
  ctx.waitUntil(syncToSheetsBackground(env, event, row));

  return { success: true, regId };
}

/* ── Get Status Handler ──────────────────────────────────── */

async function handleGetStatus(db, query) {
  const normalizedQuery = query.trim().toLowerCase();
  
  const { results } = await db.prepare(
    `SELECT * FROM registrations WHERE LOWER(flat) = ? OR phone = ?`
  ).bind(normalizedQuery, query.trim()).all();

  const formattedResults = (results || []).map(r => ({
    eventKey:      r.event_key,
    regId:         r.id,
    timestamp:     r.timestamp,
    name:          r.name,
    flat:          r.flat,
    phone:         r.phone,
    date:          r.event_date,
    slot:          r.slot,
    paymentStatus: r.payment_status,
  }));

  return { results: formattedResults };
}

/* ── CORS headers ────────────────────────────────────────── */

function cors() {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/* ── Main Handler ────────────────────────────────────────── */

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors() });
    }

    try {
      const body = await request.json();
      const { action, event, data, query } = body;

      let result;
      if (action === 'register') {
        result = await handleRegister(env.DB, event, data, env, ctx);
      } else if (action === 'getStatus') {
        result = await handleGetStatus(env.DB, query);
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