const EVENT_LABELS = {
  'daily-pooja':     'Daily Pooja',
  'kumkuma-pooja':   'Kumkuma Pooja',
  'ganapathi-homam': 'Ganapathi Homam'
};

let adminPassword = '';
let currentUser = null;
let globalAdminData = null;

let activeTabIndex = 0;
let currentSearchQuery = '';
let currentStatusFilter = 'PENDING';
let currentSelectedDate = 'ALL';
let pendingAction = null;

/* ── Utility: Debounce ── */
function debounce(func, delay = 150) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  };
}

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
    currentUser = json.user || { name: 'Admin', canUpdate: true };
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
  currentUser = null;
  globalAdminData = null;
  activeTabIndex = 0;
  currentSearchQuery = '';
  currentStatusFilter = 'PENDING';
  currentSelectedDate = 'ALL';
  
  document.getElementById('admin-screen').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('logout-btn').style.display = 'none';
  document.getElementById('pwd-input').value = '';
  document.getElementById('login-btn').disabled = false;
  document.getElementById('login-btn').textContent = 'Continue';
}

/* ── Helpers ── */
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

/* ── Confirmation Modal ── */
function openConfirmModal(regId, eventKey, flat, name) {
  const eventName = EVENT_LABELS[eventKey] || eventKey;
  document.getElementById('modal-flat').textContent = flat;
  document.getElementById('modal-name').textContent = name;
  document.getElementById('modal-event').textContent = eventName;
  
  pendingAction = { regId, eventKey, flat };
  
  const confirmBtn = document.getElementById('modal-confirm-btn');
  confirmBtn.onclick = executeMarkAsPaid;
  confirmBtn.disabled = false;
  confirmBtn.textContent = 'Confirm Received';
  
  document.getElementById('confirm-modal').classList.add('active');
}

function closeConfirmModal() {
  document.getElementById('confirm-modal').classList.remove('active');
  pendingAction = null;
}

async function executeMarkAsPaid() {
  if (!pendingAction) return;
  const { regId, eventKey } = pendingAction;
  const confirmBtn = document.getElementById('modal-confirm-btn');
  
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Updating…';

  try {
    const res = await adminApi({ action: 'updatePayment', regId, paymentStatus: 'Received', password: adminPassword });
    
    if (res.success) {
      closeConfirmModal();

      // 1. Find and update the record directly in client memory
      const eventData = globalAdminData[eventKey];
      if (eventData && Array.isArray(eventData.rows)) {
        const targetRow = eventData.rows.find(r => r['Reg ID'] === regId);
        if (targetRow) {
          targetRow['Payment Status'] = 'Received';
        }
      }

      // 2. Refresh the UI elements without fetching network data
      renderSummaryCards();
      renderActiveTabContent();

    } else {
      alert(res.error === 'unauthorized' ? 'Session expired. Please log in again.' : 'Update failed.');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Confirm Received';
    }
  } catch(e) {
    alert('Network error. Please try again.');
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Confirm Received';
  }
}

/* ── Main Render Logic ── */
function showAdmin(data) {
  globalAdminData = data || {};
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-screen').style.display = 'block';
  document.getElementById('logout-btn').style.display = 'inline-block';

  const userPill = document.getElementById('user-pill');
  if (currentUser) {
    userPill.style.display = 'inline-block';
    userPill.textContent = currentUser.canUpdate
      ? `👤 ${currentUser.name}`
      : `👤 ${currentUser.name} (Read Only)`;
  }

  setupGlobalFilterListeners();
  renderSummaryCards();
  renderTabs();
  
  switchTab(activeTabIndex);
}

function setupGlobalFilterListeners() {
  const searchInput = document.getElementById('global-search');
  searchInput.value = currentSearchQuery;
  
  const handleSearch = debounce((val) => {
    currentSearchQuery = val.toLowerCase().trim();
    renderActiveTabContent();
  }, 150);
  
  searchInput.oninput = (e) => handleSearch(e.target.value);

  const toggleBtns = document.querySelectorAll('#status-toggle-bar .filter-toggle-btn');
  toggleBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.status === currentStatusFilter);
    btn.onclick = () => {
      currentStatusFilter = btn.dataset.status;
      toggleBtns.forEach(b => b.classList.toggle('active', b.dataset.status === currentStatusFilter));
      renderActiveTabContent();
    };
  });

  const dateSelect = document.getElementById('date-filter-select');
  dateSelect.onchange = (e) => {
    currentSelectedDate = e.target.value;
    renderActiveTabContent();
  };
}

function animateCount(el, target, duration = 800) {
  if (target === 0) { el.textContent = '0'; return; }
  const start = performance.now();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(ease * target);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function renderSummaryCards() {
  const summaryBar = document.getElementById('summary-bar');
  summaryBar.innerHTML = '';
  const eventKeys = Object.keys(EVENT_LABELS);

  eventKeys.forEach(eventKey => {
    const eventObj = globalAdminData[eventKey];
    const rows = (eventObj && Array.isArray(eventObj.rows)) ? eventObj.rows : [];
    const total = rows.length;
    const paid  = rows.filter(r => r['Payment Status'] === 'Received').length;
    const label = EVENT_LABELS[eventKey];

    const card = document.createElement('div');
    card.className = 'summary-card';
    card.innerHTML = `
      <div class="count">0</div>
      <div class="label">${label}</div>
      ${total > 0 ? `
        <div class="summary-status">
          <span class="status-paid">${paid} paid</span> &middot; <span class="status-pending">${total - paid} pending</span>
        </div>
      ` : '<div class="summary-status" style="color:var(--muted)">0 entries</div>'}
    `;
    summaryBar.appendChild(card);
    animateCount(card.querySelector('.count'), total);
  });
}

function renderTabs() {
  const tabsEl = document.getElementById('tabs');
  tabsEl.innerHTML = '';
  const eventKeys = Object.keys(EVENT_LABELS);

  eventKeys.forEach((eventKey, idx) => {
    const label = EVENT_LABELS[eventKey];
    const tab = document.createElement('div');
    tab.className = 'tab' + (idx === activeTabIndex ? ' active' : '');
    tab.textContent = label;
    tab.onclick = () => switchTab(idx);
    tabsEl.appendChild(tab);
  });
}

function switchTab(idx) {
  activeTabIndex = idx;
  const eventKeys = Object.keys(EVENT_LABELS);
  const currentEventKey = eventKeys[idx];

  // Update tab styles
  document.querySelectorAll('.tabs .tab').forEach((t, i) => t.classList.toggle('active', i === idx));

  // Toggle Daily Pooja Date Filter dropdown visibility
  const dateFilterWrap = document.getElementById('date-filter-wrap');
  if (currentEventKey === 'daily-pooja') {
    populateDailyPoojaDates(globalAdminData['daily-pooja']?.rows || []);
    dateFilterWrap.style.display = 'block';
  } else {
    dateFilterWrap.style.display = 'none';
  }

  renderActiveTabContent();
}

function populateDailyPoojaDates(rows) {
  const dateSelect = document.getElementById('date-filter-select');
  const uniqueDates = [...new Set(rows.map(r => r['Date']).filter(Boolean))].sort();

  dateSelect.innerHTML = '<option value="ALL">All Dates</option>';
  uniqueDates.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d;
    opt.textContent = fmtEventDate(d);
    dateSelect.appendChild(opt);
  });

  dateSelect.value = currentSelectedDate;
}

function renderActiveTabContent() {
  const eventKeys = Object.keys(EVENT_LABELS);
  const eventKey = eventKeys[activeTabIndex];
  const container = document.getElementById('panels-container');
  container.innerHTML = '';

  const eventObj = globalAdminData[eventKey];
  const rows = (eventObj && Array.isArray(eventObj.rows)) ? eventObj.rows : [];

  // Apply Search, Status, and Date Filters
  let filteredRows = rows.filter(r => {
    // 1. Status Filter
    const matchesStatus = 
      currentStatusFilter === 'ALL' ? true :
      currentStatusFilter === 'RECEIVED' ? r['Payment Status'] === 'Received' :
      r['Payment Status'] !== 'Received';

    if (!matchesStatus) return false;

    // 2. Daily Pooja Date Filter
    if (eventKey === 'daily-pooja' && currentSelectedDate !== 'ALL') {
      if (r['Date'] !== currentSelectedDate) return false;
    }

    // 3. Search Term Filter
    if (!currentSearchQuery) return true;

    const flat = String(r['Flat'] || '').toLowerCase();
    const name = String(r['Name'] || '').toLowerCase();
    const phone = String(r['Phone'] || '').toLowerCase();
    const regId = String(r['Reg ID'] || '').toLowerCase();

    return flat.includes(currentSearchQuery) || 
           name.includes(currentSearchQuery) || 
           phone.includes(currentSearchQuery) || 
           regId.includes(currentSearchQuery);
  });

  if (filteredRows.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-note';
    empty.textContent = currentSearchQuery 
      ? `No results matching "${currentSearchQuery}".` 
      : `No registrations found for current filters.`;
    container.appendChild(empty);
    return;
  }

  // Render Cards Grid
  const cardsList = document.createElement('div');
  cardsList.className = 'cards-list';

  filteredRows.forEach(row => {
    const isPaid = row['Payment Status'] === 'Received';
    const regCard = document.createElement('div');
    regCard.className = `reg-card ${isPaid ? 'paid' : 'pending'}`;
    const rawPhone = row['Phone'] ? String(row['Phone']).replace(/\D/g, '') : '';

    regCard.innerHTML = `
      <div class="card-header">
        <div class="card-flat">Flat ${row['Flat'] || '—'}</div>
        ${statusBadge(row['Payment Status'])}
      </div>
      <div class="card-name">${row['Name'] || '—'}</div>
      
      <div class="card-grid">
        <div class="card-grid-item">
          <span>Date</span>
          ${fmtEventDate(row['Date'])}
        </div>
        <div class="card-grid-item">
          <span>Slot</span>
          ${row['Slot'] || '—'}
        </div>
        <div class="card-grid-item">
          <span>Registered On</span>
          ${typeof fmtDate === 'function' ? fmtDate(row['Timestamp']) : (row['Timestamp'] || '—')}
        </div>
        <div class="card-grid-item">
          <span>Reg ID</span>
          ${row['Reg ID'] || '—'}
        </div>
      </div>

      <div class="card-actions">
        ${rawPhone ? `<a href="tel:${rawPhone}" class="card-btn-call">&#128222; Call</a>` : ''}
        ${!isPaid && rawPhone ? (() => { const waUrl = buildWaFollowupUrl(row, eventKey); return waUrl ? `<a href="${waUrl}" target="_blank" class="card-btn-wa">&#128172; Remind</a>` : ''; })() : ''}
        ${!isPaid && currentUser && currentUser.canUpdate ? `
          <button class="card-btn-pay" onclick="openConfirmModal('${row['Reg ID']}', '${eventKey}', '${row['Flat']}', '${row['Name']}')">
            Mark Paid
          </button>
        ` : ''}
      </div>
    `;
    cardsList.appendChild(regCard);
  });

  container.appendChild(cardsList);
}

/* ── WhatsApp Follow-up ── */
function buildWaFollowupUrl(row, eventKey) {
  const name      = row['Name'] || 'Resident';
  const eventName = EVENT_LABELS[eventKey] || eventKey;
  const phone     = String(row['Phone'] || '').replace(/\D/g, '');
  if (!phone) return null;

  let eventDetails = `*${eventName}*`;
  if (row['Date']) {
    const dateLabel = fmtEventDate(row['Date']);
    eventDetails += ` on *${dateLabel}*`;
    if (row['Slot']) eventDetails += ` (${row['Slot']} slot)`;
  }

  const msg =
    `Dear Sir/Madam 🙏\n\n` +
    `You had registered for ${eventDetails}.\n\n` +
    `We see that the payment is still pending. If you have already paid, kindly share the payment screenshot so we can update your status.\n\n` +
    `Thank you for being part of Ganesh Chaturthi 2026. 🎉\n` +
    `— GGUC Pooja Committee`;

  return `https://wa.me/91${phone}?text=${encodeURIComponent(msg)}`;
}

/* ── CSV Export ── */
function exportCSV() {
  const eventKeys = Object.keys(EVENT_LABELS);
  const eventKey  = eventKeys[activeTabIndex];
  const eventObj  = globalAdminData[eventKey];
  const rows      = (eventObj && Array.isArray(eventObj.rows)) ? eventObj.rows : [];

  // Apply same filters as renderActiveTabContent
  const filteredRows = rows.filter(r => {
    const matchesStatus =
      currentStatusFilter === 'ALL'      ? true :
      currentStatusFilter === 'RECEIVED' ? r['Payment Status'] === 'Received' :
                                           r['Payment Status'] !== 'Received';
    if (!matchesStatus) return false;

    if (eventKey === 'daily-pooja' && currentSelectedDate !== 'ALL') {
      if (r['Date'] !== currentSelectedDate) return false;
    }

    if (!currentSearchQuery) return true;
    const flat  = String(r['Flat']   || '').toLowerCase();
    const name  = String(r['Name']   || '').toLowerCase();
    const phone = String(r['Phone']  || '').toLowerCase();
    const regId = String(r['Reg ID'] || '').toLowerCase();
    return flat.includes(currentSearchQuery) || name.includes(currentSearchQuery) ||
           phone.includes(currentSearchQuery) || regId.includes(currentSearchQuery);
  });

  if (filteredRows.length === 0) {
    alert('No data to export for current filters.');
    return;
  }

  const esc = v => `"${String(v || '').replace(/"/g, '""')}"`;

  const headers = ['Reg ID', 'Name', 'Flat', 'Phone', 'Date', 'Slot', 'Payment Status', 'Payment Date', 'Registered On'];
  const csvRows = [headers.map(esc).join(',')];

  filteredRows.forEach(r => {
    csvRows.push([
      r['Reg ID']         || '',
      r['Name']           || '',
      r['Flat']           || '',
      r['Phone']          || '',
      r['Date']           || '',
      r['Slot']           || '',
      r['Payment Status'] || '',
      r['Payment Date']   || '',
      r['Timestamp']      || ''
    ].map(esc).join(','));
  });

  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `gguc-${eventKey}-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

window.addEventListener('load', () => {
  const pwdInput = document.getElementById('pwd-input');
  if (pwdInput) pwdInput.focus();
});