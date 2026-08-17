const EVENT_LABELS = {
  'daily-pooja':     'Daily Pooja',
  'kumkuma-pooja':   'Kumkuma Pooja',
  'ganapathi-homam': 'Ganapathi Homam',
};

// Column order: key fields first on mobile, Reg ID moved to the end
const DISPLAY_COLS = ['Flat', 'Payment Status', 'Name', 'Action', 'Phone', 'Date', 'Slot', 'Timestamp', 'Reg ID'];

let adminPassword = '';

/* ── Login / Logout ── */

async function login() {
  const pwd = document.getElementById('pwd-input').value.trim();
  if (!pwd) return;

  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  btn.disabled = true;
  btn.textContent = 'Checking…';
  err.style.display = 'none';

  try {
    const json = await adminApi({ action: 'getAdmin', password: pwd });

    if (json.error === 'unauthorized') {
      err.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Continue';
      document.getElementById('pwd-input').value = '';
      return;
    }

    adminPassword = pwd;
    showAdmin(json.data);
  } catch (e) {
    err.textContent = 'Network error. Please try again.';
    err.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Continue';
  }
}

function logout() {
  adminPassword = '';
  document.getElementById('admin-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('logout-btn').style.display = 'none';
  document.getElementById('pwd-input').value = '';
  document.getElementById('login-btn').disabled = false;
  document.getElementById('login-btn').textContent = 'Continue';
}

/* ── Formatters ── */

function fmtEventDate(val) {
  if (!val) return '—';
  const parts = val.split('-');
  if (parts.length === 3) {
    return new Date(val).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  }
  return val;
}

function statusBadge(val) {
  if (val === 'Received') return '<span class="badge badge-received">Received</span>';
  return '<span class="badge badge-pending">Pending</span>';
}

/* ── Refresh ── */

async function refreshAdmin() {
  const btn = document.getElementById('refresh-btn');
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const json = await adminApi({ action: 'getAdmin', password: adminPassword });
    showAdmin(json.data);
  } catch(e) {
    alert('Network error. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = '↻ Refresh';
  }
}

/* ── Mark as Paid ── */

async function markAsPaid(regId, eventKey, flat, btnEl) {
  const eventName = EVENT_LABELS[eventKey] || eventKey;
  if (!confirm(`Mark Flat ${flat} (${eventName}) as Payment Received?`)) return;
  btnEl.disabled = true;
  btnEl.textContent = '…';

  try {
    const res = await adminApi({ action: 'updatePayment', regId, paymentStatus: 'Received', password: adminPassword });
    if (res.success) {
      const json = await adminApi({ action: 'getAdmin', password: adminPassword });
      showAdmin(json.data);
    } else {
      alert(res.error === 'unauthorized' ? 'Session expired. Please log in again.' : 'Update failed. Please try again.');
      btnEl.disabled = false;
      btnEl.textContent = 'Mark Paid';
    }
  } catch(e) {
    alert('Network error. Please try again.');
    btnEl.disabled = false;
    btnEl.textContent = 'Mark Paid';
  }
}

/* ── Render ── */

function showAdmin(data) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-screen').style.display = 'block';
  document.getElementById('logout-btn').style.display = 'inline-block';

  const summaryBar = document.getElementById('summary-bar');
  const tabsEl     = document.getElementById('tabs');
  const panelsEl   = document.getElementById('panels');

  summaryBar.innerHTML = '';
  tabsEl.innerHTML     = '';
  panelsEl.innerHTML   = '';

  const eventKeys = Object.keys(EVENT_LABELS);
  let firstTab = true;

  eventKeys.forEach((eventKey, idx) => {
    const rows  = (data[eventKey] || {}).rows || [];
    const total = rows.length;
    const paid  = rows.filter(r => r['Payment Status'] === 'Received').length;
    const label = EVENT_LABELS[eventKey];

    // Summary card
    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `
      <div class="count">${total}</div>
      <div class="label">${label}</div>
      ${total > 0 ? `<div class="paid">${paid} paid${(total - paid) > 0 ? ` &middot; ${total - paid} pending` : ''}</div>` : ''}
    `;
    summaryBar.appendChild(card);

    // Tab
    const tab = document.createElement('div');
    tab.className = 'tab' + (firstTab ? ' active' : '');
    tab.textContent = label;
    tab.onclick = () => switchTab(idx);
    tabsEl.appendChild(tab);

    // Panel
    const panel = document.createElement('div');
    panel.className = 'tab-panel' + (firstTab ? ' active' : '');
    panel.id = `panel-${idx}`;
    panelsEl.appendChild(panel);

    if (total === 0) {
      panel.innerHTML = `<div class="empty-note">No registrations yet for ${label}.</div>`;
    } else {
      renderGrid(panel, eventKey, rows);
    }

    firstTab = false;
  });
}

function switchTab(idx) {
  document.querySelectorAll('.tab').forEach((t, i) => t.classList.toggle('active', i === idx));
  document.querySelectorAll('.tab-panel').forEach((p, i) => p.classList.toggle('active', i === idx));
}

function renderGrid(container, eventKey, rows) {
  const cols = [...DISPLAY_COLS, 'Action'];

  const columns = cols.map(col => ({
    id:   col,
    name: col === 'Timestamp' ? 'Registered On' : col,
    sort: col !== 'Action',
    formatter: (cell, row) => {
      if (col === 'Payment Status') return gridjs.html(statusBadge(cell));
      if (col === 'Timestamp')      return fmtDate(cell);
      if (col === 'Date')           return fmtEventDate(cell);
      if (col === 'Action') {
        const status = row.cells[cols.indexOf('Payment Status')].data;
        if (status === 'Received') return gridjs.html('');
        const regId = row.cells[cols.indexOf('Reg ID')].data;
        const flat  = row.cells[cols.indexOf('Flat')].data;
        return gridjs.html(
          `<button class="mark-paid-btn" onclick="markAsPaid('${regId}', '${eventKey}', '${flat}', this)">Mark Paid</button>`
        );
      }
      return cell || '—';
    },
  }));

  const tableData = rows.map(row =>
    cols.map(col => col === 'Action' ? '' : (row[col] || ''))
  );

  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'table-scroll';
  container.appendChild(scrollWrap);

  new gridjs.Grid({
    columns,
    data: tableData,
    search: true,
    sort: true,
    pagination: { limit: 20 },
    style: {
      table: { 'white-space': 'nowrap' },
      th:    { 'white-space': 'nowrap' },
      td:    { 'white-space': 'nowrap' },
    },
  }).render(scrollWrap);
}

window.addEventListener('load', () => {
  document.getElementById('pwd-input').focus();
});
