/**
 * Pooja Registration — Apps Script Backend
 *
 * Actions handled:
 *   register   → write a new registration row
 *   getStatus  → search by flat or phone across all event sheets
 *
 * Sheet structure (one tab per event, columns fixed):
 *   daily-pooja      : Reg ID | Timestamp | Name | Flat | Phone | Date | Slot | Payment Status | Payment Link | Payment Date
 *   kumkuma-pooja    : Reg ID | Timestamp | Name | Flat | Phone | Payment Status | Payment Date
 *   ganapathi-homam  : Reg ID | Timestamp | Name | Flat | Phone | Payment Status | Payment Link | Payment Date
 *
 * How to deploy:
 *   Extensions → Apps Script → paste this code → Deploy → New deployment
 *   Type: Web app | Execute as: Me | Who has access: Anyone
 *   Copy the web app URL → paste into CONFIG.API_URL in index.html
 */

// ─── CONFIG ─────────────────────────────────────────────────
// Update this when event details or sheet IDs change

const SHEET_ID = '1-P3FOKShM4aBRPqL5qAWblXbO0X6XqtB6uMRHL6-rh8'; // Paste your Google Sheet ID here

const EVENT_CONFIG = {
  'daily-pooja': {
    name:     'Daily Pooja',
    dateFrom: '2026-09-14',  // registration allowed from this date
    dateTo:   '2026-09-20',  // registration allowed until this date
    slots:    ['Morning', 'Evening'],
    amount:   516,
    status:   'active',      // 'active' or 'closed'
    prefix:   'DP',
    maxPerSlot: 10,          // max registrations per date+slot; null = no limit
    blockedSlots: [
      { date: '2026-09-14', slot: 'Morning' },  // Ganesh Chaturthi — reserved
      { date: '2026-09-20', slot: 'Evening' },  // Closing day — reserved
    ],
  },
  'kumkuma-pooja': {
    name:             'Kumkuma Pooja',
    amount:           0,
    status:           'active',
    prefix:           'KP',
    maxRegistrations: null,  // null = no limit
  },
  'ganapathi-homam': {
    name:             'Ganapathi Homam',
    amount:           1116,
    status:           'active',
    prefix:           'GH',
    maxRegistrations: 5,     // total cap across all registrations
  },
};

// Columns for each sheet tab (order matters — matches the sheet headers)
const SHEET_COLUMNS = {
  'daily-pooja':      ['Reg ID','Timestamp','Name','Flat','Phone','Date','Slot','Payment Status','Payment Link','Payment Date'],
  'kumkuma-pooja':    ['Reg ID','Timestamp','Name','Flat','Phone','Payment Status','Payment Date'],
  'ganapathi-homam':  ['Reg ID','Timestamp','Name','Flat','Phone','Payment Status','Payment Link','Payment Date'],
};

// ─── Entry point ─────────────────────────────────────────────

function doPost(e) {
  const cors = ContentService.createTextOutput();
  cors.setMimeType(ContentService.MimeType.JSON);

  try {
    const body    = JSON.parse(e.postData.contents);
    const action  = body.action;

    let result;
    if      (action === 'register')  result = handleRegister(body);
    else if (action === 'getStatus') result = handleGetStatus(body);
    else if (action === 'getAdmin')  result = handleGetAdmin(body);
    else                             result = { error: 'unknown_action' };

    cors.setContent(JSON.stringify(result));
  } catch (err) {
    cors.setContent(JSON.stringify({ error: 'server_error', message: err.message }));
  }

  return cors;
}

// Simple ping — confirms the script is live
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── Register ────────────────────────────────────────────────

function handleRegister(body) {
  const eventKey = body.event;
  const data     = body.data || {};
  const cfg      = EVENT_CONFIG[eventKey];

  if (!cfg) return { error: 'invalid_event', message: 'Unknown event: ' + eventKey };

  // Check if event is closed
  if (cfg.status === 'closed') return { error: 'closed' };

  // Validate required base fields
  if (!data.name || !data.flat || !data.phone) {
    return { error: 'validation', message: 'Name, flat, and phone are required.' };
  }

  const flat  = data.flat.trim().toUpperCase();
  const phone = data.phone.trim();
  const name  = data.name.trim();

  // Basic phone validation
  if (!/^[6-9]\d{9}$/.test(phone)) {
    return { error: 'validation', message: 'Invalid phone number.' };
  }

  const sheet = getOrCreateSheet(eventKey);

  // ── Duplicate check ──────────────────────────────────────
  const isDuplicate = checkDuplicate(sheet, eventKey, flat, data);
  if (isDuplicate) return { error: 'duplicate' };

  // ── Capacity check ───────────────────────────────────────
  if (checkFull(sheet, eventKey, cfg, data)) return { error: 'full' };

  // ── Generate Reg ID ──────────────────────────────────────
  const lastRow = sheet.getLastRow();
  const count   = lastRow <= 1 ? 1 : lastRow; // row 1 is header
  const regId   = cfg.prefix + '-' + String(count).padStart(3, '0');

  const now = new Date().toISOString();

  // ── Build row based on event ─────────────────────────────
  let row;
  if (eventKey === 'daily-pooja') {
    // Validate date and slot
    const date = data.date;
    const slot = data.slot;
    if (!date || !slot)   return { error: 'validation', message: 'Date and slot are required for Daily Pooja.' };
    if (!cfg.slots.includes(slot)) return { error: 'validation', message: 'Invalid slot.' };
    if (date < cfg.dateFrom || date > cfg.dateTo) return { error: 'validation', message: 'Date is outside the allowed range.' };
    const isBlocked = (cfg.blockedSlots || []).some(b => b.date === date && b.slot === slot);
    if (isBlocked) return { error: 'blocked', message: 'This slot is reserved and not available for registration.' };

    row = [regId, now, name, flat, phone, date, slot, 'Pending', '', ''];

  } else if (eventKey === 'kumkuma-pooja') {
    row = [regId, now, name, flat, phone, 'N/A', ''];
    // Free event — status N/A so status page shows "Free Event"

  } else if (eventKey === 'ganapathi-homam') {
    row = [regId, now, name, flat, phone, 'Pending', '', ''];
  }

  sheet.appendRow(row);

  return { success: true, regId };
}

// ─── Get Status ──────────────────────────────────────────────

function handleGetStatus(body) {
  const query = (body.query || '').trim().toUpperCase();
  if (!query) return { error: 'validation', message: 'Query is required.' };

  const results = [];

  Object.keys(EVENT_CONFIG).forEach(eventKey => {
    try {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(eventKey);
      if (!sheet) return; // tab doesn't exist yet — no registrations

      const data  = sheet.getDataRange().getValues();
      if (data.length <= 1) return; // only header row

      const headers = data[0].map(h => h.toString().trim());
      const rows    = data.slice(1);

      rows.forEach(row => {
        const rec = {};
        headers.forEach((h, i) => { rec[h] = row[i]; });

        const flat  = (rec['Flat']  || '').toString().trim().toUpperCase();
        const phone = (rec['Phone'] || '').toString().trim();

        if (flat === query || phone === query || maskPhone(phone) === query) {
          results.push({
            eventKey,
            regId:         rec['Reg ID']        || '',
            name:          rec['Name']           || '',
            flat:          flat,
            phone:         maskPhone(phone),     // never return full phone to client
            date:          rec['Date']           || '',
            slot:          rec['Slot']           || '',
            paymentStatus: rec['Payment Status'] || 'Pending',
            paymentLink:   rec['Payment Link']   || '',
            timestamp:     rec['Timestamp']      || '',
          });
        }
      });
    } catch(err) {
      // Skip sheet if error (sheet might not exist)
      Logger.log('Error reading sheet ' + eventKey + ': ' + err.message);
    }
  });

  // Sort by timestamp descending (newest first)
  results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return { results };
}

// ─── Admin ───────────────────────────────────────────────

const ADMIN_PASSWORD = 'gguc2026';

function handleGetAdmin(body) {
  if (body.password !== ADMIN_PASSWORD) return { error: 'unauthorized' };

  const result = {};
  Object.keys(EVENT_CONFIG).forEach(eventKey => {
    try {
      const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(eventKey);
      if (!sheet) { result[eventKey] = { headers: [], rows: [] }; return; }

      const data = sheet.getDataRange().getValues();
      if (data.length <= 1) { result[eventKey] = { headers: [], rows: [] }; return; }

      const headers = data[0].map(h => h.toString().trim());
      const rows    = data.slice(1).map(row => {
        const rec = {};
        headers.forEach((h, i) => {
          rec[h] = (row[i] instanceof Date)
            ? row[i].toISOString()
            : row[i].toString();
        });
        if (rec['Phone']) rec['Phone'] = maskPhone(rec['Phone']);
        return rec;
      });

      result[eventKey] = { headers, rows };
    } catch (err) {
      result[eventKey] = { headers: [], rows: [], error: err.message };
    }
  });

  return { data: result };
}

// ─── Helpers ─────────────────────────────────────────────────

function getOrCreateSheet(eventKey) {
  const ss     = SpreadsheetApp.openById(SHEET_ID);
  let   sheet  = ss.getSheetByName(eventKey);

  if (!sheet) {
    sheet = ss.insertSheet(eventKey);
    const headers = SHEET_COLUMNS[eventKey];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);

    // Style header row
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground('#8B1A1A');
    headerRange.setFontColor('#FFFFFF');
    headerRange.setFontWeight('bold');
  }

  return sheet;
}

function checkFull(sheet, eventKey, cfg, data) {
  if (eventKey === 'daily-pooja') {
    if (!cfg.maxPerSlot) return false;
    const allData = sheet.getDataRange().getValues();
    if (allData.length <= 1) return false;
    const headers = allData[0].map(h => h.toString().trim());
    const dateIdx = headers.indexOf('Date');
    const slotIdx = headers.indexOf('Slot');
    let count = 0;
    for (let i = 1; i < allData.length; i++) {
      if (allData[i][dateIdx] === data.date && allData[i][slotIdx] === data.slot) count++;
    }
    return count >= cfg.maxPerSlot;
  } else {
    if (!cfg.maxRegistrations) return false;
    const filled = Math.max(0, sheet.getLastRow() - 1); // subtract header row
    return filled >= cfg.maxRegistrations;
  }
}

function checkDuplicate(sheet, eventKey, flat, data) {
  const allData = sheet.getDataRange().getValues();
  if (allData.length <= 1) return false; // only header

  const headers = allData[0].map(h => h.toString().trim());
  const flatIdx = headers.indexOf('Flat');

  for (let i = 1; i < allData.length; i++) {
    const row     = allData[i];
    const rowFlat = (row[flatIdx] || '').toString().trim().toUpperCase();

    if (rowFlat !== flat) continue;

    // For daily pooja: duplicate only if same flat + same date + same slot
    if (eventKey === 'daily-pooja') {
      const dateIdx = headers.indexOf('Date');
      const slotIdx = headers.indexOf('Slot');
      const rowDate = (row[dateIdx] || '').toString().trim();
      const rowSlot = (row[slotIdx] || '').toString().trim();
      if (rowDate === data.date && rowSlot === data.slot) return true;
    } else {
      // For one-time events: same flat = duplicate
      return true;
    }
  }

  return false;
}

function maskPhone(phone) {
  const p = phone.toString().trim();
  if (p.length !== 10) return p;
  return p.slice(0, 2) + 'XXXXX' + p.slice(7);
}
