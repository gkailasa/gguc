const SHEET_ID = '1-P3FOKShM4aBRPqL5qAWblXbO0X6XqtB6uMRHL6-rh8';
const SCOPES   = 'https://www.googleapis.com/auth/spreadsheets';

// In-memory token cache (lives for the duration of the Worker instance)
let cachedToken = null;
let tokenExpiry = 0;

const EVENT_CONFIG = {
  'daily-pooja': {
    maxPerSlot: 10,
    blockedSlots: [
      { date: '2026-09-14', slot: 'Morning' },  // Ganesh Chaturthi — reserved for sponsors
      { date: '2026-09-14', slot: 'Evening' },  // Ganesh Chaturthi — reserved for sponsors
    ],
    columns: ['Reg ID', 'Timestamp', 'Name', 'Flat', 'Phone', 'Date', 'Slot', 'Payment Status', 'Payment Date'],
  },
  'kumkuma-pooja': {
    maxRegistrations: null,
    columns: ['Reg ID', 'Timestamp', 'Name', 'Flat', 'Phone', 'Payment Status', 'Payment Date'],
  },
  'ganapathi-homam': {
    maxRegistrations: 10,
    columns: ['Reg ID', 'Timestamp', 'Name', 'Flat', 'Phone', 'Payment Status', 'Payment Date'],
  },
};

/* ── Google Auth ─────────────────────────────────────────── */

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
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
  return data.access_token;
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

/* ── Register ────────────────────────────────────────────── */

async function handleRegister(token, event, data) {
  const cfg = EVENT_CONFIG[event];
  if (!cfg) return { success: false, error: 'unknown_event' };

  let rows = [];
  try {
    const res = await sheetsGet(token, `${event}!A:J`);
    rows = res.values || [];
  } catch(e) {}

  const dataRows = rows.slice(1); // skip header row

  if (event === 'daily-pooja') {
    const dup = dataRows.find(r =>
      r[3]?.toLowerCase() === data.flat?.toLowerCase() &&
      r[5] === data.date && r[6] === data.slot
    );
    if (dup) return { success: false, error: 'duplicate' };

    const blocked = (cfg.blockedSlots || []).find(b => b.date === data.date && b.slot === data.slot);
    if (blocked) return { success: false, error: 'blocked', message: 'This slot is reserved.' };

    const slotCount = dataRows.filter(r => r[5] === data.date && r[6] === data.slot).length;
    if (slotCount >= cfg.maxPerSlot) return { success: false, error: 'full' };
  } else {
    const dup = dataRows.find(r => r[3]?.toLowerCase() === data.flat?.toLowerCase());
    if (dup) return { success: false, error: 'duplicate' };

    if (cfg.maxRegistrations !== null && dataRows.length >= cfg.maxRegistrations) {
      return { success: false, error: 'full' };
    }
  }

  const prefix  = { 'daily-pooja': 'DP', 'kumkuma-pooja': 'KP', 'ganapathi-homam': 'GH' }[event] || 'XX';
  const regId   = prefix + Date.now().toString(36).toUpperCase();
  const timestamp = new Date().toISOString();

  let row;
  if (event === 'daily-pooja') {
    row = [regId, timestamp, data.name, data.flat, data.phone, data.date, data.slot, 'Pending', ''];
  } else if (event === 'kumkuma-pooja') {
    row = [regId, timestamp, data.name, data.flat, data.phone, 'Pending', ''];
  } else {
    row = [regId, timestamp, data.name, data.flat, data.phone, 'Pending', ''];
  }

  if (rows.length === 0) {
    await sheetsAppend(token, `${event}!A1`, [cfg.columns]);
  }

  await sheetsAppend(token, `${event}!A:J`, [row]);
  return { success: true, regId };
}

/* ── Get Status ──────────────────────────────────────────── */

async function handleGetStatus(token, query) {
  const events  = ['daily-pooja', 'kumkuma-pooja', 'ganapathi-homam'];
  const isPhone = /^\d{10}$/.test(query);

  const sheets = await Promise.all(events.map(async event => {
    try {
      const res = await sheetsGet(token, `${event}!A:J`);
      return { event, rows: (res.values || []).slice(1) };
    } catch(e) {
      return { event, rows: [] };
    }
  }));

  const results = [];
  for (const { event, rows } of sheets) {
    for (const r of rows) {
      const matchFlat  = r[3]?.toLowerCase() === query.toLowerCase();
      const matchPhone = r[4] === query;
      if (isPhone ? matchPhone : matchFlat) {
        const isDP = event === 'daily-pooja';
        results.push({
          eventKey:      event,
          regId:         r[0] || '',
          timestamp:     r[1] || '',
          name:          r[2] || '',
          flat:          r[3] || '',
          phone:         r[4] || '',
          date:          isDP ? (r[5] || '') : '',
          slot:          isDP ? (r[6] || '') : '',
          paymentStatus: isDP ? (r[7] || '') : (r[5] || ''),
        });
      }
    }
  }

  return { results };
}

/* ── CORS headers ────────────────────────────────────────── */

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
      const serviceAccount = JSON.parse(env.SERVICE_ACCOUNT_JSON);
      const token  = await getAccessToken(serviceAccount);
      const body   = await request.json();
      const { action, event, data, query } = body;

      let result;
      if (action === 'register') {
        result = await handleRegister(token, event, data);
      } else if (action === 'getStatus') {
        result = await handleGetStatus(token, query);
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
