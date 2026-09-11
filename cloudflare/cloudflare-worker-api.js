/*
 * Worker: Public Registration API
 * Actions: register, getStatus
 * Data source: D1 only (Google Sheets sync is handled by the separate sync worker)
 */

const EVENT_CONFIG = {
  'daily-pooja': {
    idPrefix:     'DP',
    maxPerSlot:   10,
    dateFrom:     '2026-09-15',
    dateTo:       '2026-09-20',
    blockedSlots: [
      { date: '2026-09-14', slot: 'Morning' },
      { date: '2026-09-14', slot: 'Evening' },
      { date: '2026-09-20', slot: 'Evening' },
    ],
  },
  'kumkuma-pooja': {
    idPrefix:          'KP',
    maxRegistrations:  null,
  },
  'ganapathi-homam': {
    idPrefix:          'GH',
    maxRegistrations:  10,
  },
};

/* ── Register Handler ────────────────────────────────────── */

async function handleRegister(db, event, data) {
  const cfg = EVENT_CONFIG[event];
  if (!cfg) return { success: false, error: 'unknown_event' };

  const { name, flat, phone, date = '', slot = '' } = data;
  const normalizedFlat = flat ? flat.trim().toLowerCase() : '';

  if (cfg.maxPerSlot) {
    // Check date range
    if (cfg.dateFrom && cfg.dateTo && (date < cfg.dateFrom || date > cfg.dateTo)) {
      return { success: false, error: 'blocked', message: 'This date is not available for registration.' };
    }
    // Check blocked slots
    const blocked = (cfg.blockedSlots || []).find(b => b.date === date && b.slot === slot);
    if (blocked) return { success: false, error: 'blocked', message: 'This slot is not available to register.' };

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

  const regId = (cfg.idPrefix || 'XX') + Date.now().toString(36).toUpperCase();
  const timestamp = new Date().toISOString();

  await db.prepare(
    `INSERT INTO registrations (id, event_key, timestamp, name, flat, phone, event_date, slot, payment_status, payment_date, synced_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(regId, event, timestamp, name, flat, phone, date, slot, 'Pending', '', null).run();

  return { success: true, regId };
}

/* ── Get Stats Handler ───────────────────────────────────── */

async function handleGetStats(db) {
  const { results: dp } = await db.prepare(
    `SELECT event_date, slot, COUNT(*) as count FROM registrations WHERE event_key = 'daily-pooja' GROUP BY event_date, slot ORDER BY event_date, slot`
  ).all();

  const kpCount = await db.prepare(
    `SELECT COUNT(*) as count FROM registrations WHERE event_key = 'kumkuma-pooja'`
  ).first();

  const ghCount = await db.prepare(
    `SELECT COUNT(*) as count FROM registrations WHERE event_key = 'ganapathi-homam'`
  ).first();

  return {
    dailyPooja:     dp  || [],
    kumkumaPooja:   kpCount?.count ?? 0,
    ganapathiHomam: ghCount?.count ?? 0,
    blockedSlots:   EVENT_CONFIG['daily-pooja'].blockedSlots || [],
  };
}

/* ── Get Status Handler ──────────────────────────────────── */

async function handleGetStatus(db, query) {
  const normalizedQuery = query.trim().toLowerCase();

  const { results } = await db.prepare(
    `SELECT * FROM registrations WHERE LOWER(flat) = ? OR phone = ? ORDER BY timestamp ASC`
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
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors() });
    }

    try {
      const body = await request.json();
      const { action, event, data, query } = body;

      let result;
      if (action === 'register') {
        result = await handleRegister(env.DB, event, data);
      } else if (action === 'getStatus') {
        result = await handleGetStatus(env.DB, query);
      } else if (action === 'getStats') {
        result = await handleGetStats(env.DB);
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
