// Worker — Admin API
// Actions: getStatus (public), getAdmin (password), updatePayment (password)
// Data source: D1 only. Google Sheets sync is handled by cloudflare-worker-sync.js.

const EVENTS = ['daily-pooja', 'kumkuma-pooja', 'ganapathi-homam'];

/* ── Auth helpers ────────────────────────────────────────── */

function getAdminUsers(env) {
  try {
    return JSON.parse(env.ADMIN_USERS || '[]');
  } catch (e) {
    return [];
  }
}

function findUser(password, env) {
  return getAdminUsers(env).find(u => u.password === password) || null;
}

/* ── Get Status ──────────────────────────────────────────── */

async function handleGetStatus(db, query) {
  const normalizedQuery = query.trim().toLowerCase();

  const { results } = await db.prepare(
    `SELECT * FROM registrations WHERE LOWER(flat) = ? OR phone = ? ORDER BY timestamp ASC`
  ).bind(normalizedQuery, query.trim()).all();

  return {
    results: (results || []).map(r => ({
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

/* ── Get Admin ───────────────────────────────────────────── */

async function handleGetAdmin(db, password, env) {
  const user = findUser(password, env);
  if (!user) return { error: 'unauthorized' };

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

  return {
    data,
    user: {
      name:      user.name,
      canUpdate: !!user.canUpdate,
    }
  };
}

/* ── Update Payment ──────────────────────────────────────── */

async function handleUpdatePayment(db, regId, paymentStatus, password, env) {
  const user = findUser(password, env);
  if (!user) return { error: 'unauthorized' };
  if (!user.canUpdate) return { error: 'forbidden', message: 'You do not have permission to update payments.' };

  const reg = await db.prepare(
    `SELECT * FROM registrations WHERE id = ? LIMIT 1`
  ).bind(regId).first();

  if (!reg) return { success: false, error: 'not_found' };

  const paymentDate = new Date().toISOString();

  // Update D1 and mark row for re-sync to Sheets
  await db.prepare(
    `UPDATE registrations SET payment_status = ?, payment_date = ?, synced_at = NULL WHERE id = ?`
  ).bind(paymentStatus, paymentDate, regId).run();

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
        result = await handleGetStatus(env.DB, query);
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
