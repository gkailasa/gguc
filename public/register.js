/* ── Read event key from URL ─────────────────────────────── */

const eventKey = new URLSearchParams(location.search).get('event');

if (!eventKey || !CONFIG.events[eventKey]) {
  window.location.replace('index.html');
}

const EVENT = CONFIG.events[eventKey] || {};

/* ── Render page ─────────────────────────────────────────── */

function renderPage() {
  const e = EVENT;

  document.title = `GGUC 2026 — ${e.name}`;

  if (e.status === 'closed') {
    document.getElementById('register-page').innerHTML = `
<div class="section active">
  <div class="topbar">
    <button class="back-btn" onclick="history.back()">&#8592; Back</button>
    <span class="topbar-title">${e.name}</span>
  </div>
  <div class="container">
    <div class="result-box result-error show" style="margin-top:24px;">
      <h3>Registrations Closed</h3>
      <p>Registrations for ${e.name} are currently closed.</p>
    </div>
  </div>
</div>`;
    return;
  }

  const hasSlots = !!e.slots;

  const dateField = hasSlots
    ? `<div class="field">
         <label for="reg-date">Date <span class="req">*</span></label>
         <input type="date" id="reg-date">
       </div>`
    : `<input type="hidden" id="reg-date" value="${e.date || ''}">`;

  const slotField = hasSlots
    ? `<div class="field">
         <label for="reg-slot">Slot <span class="req">*</span></label>
         <select id="reg-slot">
           <option value="">Select slot</option>
         </select>
       </div>`
    : `<input type="hidden" id="reg-slot" value="${e.slot || ''}">`;

  const slotRow = hasSlots
    ? `<div class="two-col">${dateField}${slotField}</div>`
    : `${dateField}${slotField}`;

  document.getElementById('register-page').innerHTML = `
<div class="section active">
  <div class="topbar">
    <button class="back-btn" onclick="history.back()">&#8592; Back</button>
    <span class="topbar-title">${e.name} Registration</span>
  </div>
  <div class="event-strip">
    <div class="strip-inner">
      <div class="event-meta">
        <span>📅 ${e.displayDate}</span>
        <span>🕐 ${e.time}</span>
      </div>
      <span class="amount-pill paid">${e.amountLabel}</span>
    </div>
  </div>
  <div class="container">
    <div class="form-card">
      <div class="form-progress" id="reg-progress">
        <div class="rangoli-row">
          <span class="shape diamond"></span><span class="shape circle"></span>
          <span class="shape petal"></span><span class="shape circle"></span>
          <span class="shape diamond"></span><span class="shape circle"></span>
          <span class="shape petal"></span><span class="shape circle"></span>
          <span class="shape diamond"></span><span class="shape circle"></span>
          <span class="shape petal"></span>
        </div>
        <div class="rangoli-line"></div>
      </div>
      <div class="field">
        <label for="reg-name">Name <span class="req">*</span></label>
        <input type="text" id="reg-name" placeholder="Your full name">
      </div>
      <div class="two-col">
        <div class="field">
          <label for="reg-flat">Flat Number <span class="req">*</span></label>
          <input type="text" id="reg-flat" placeholder="e.g. C806">
        </div>
        <div class="field">
          <label for="reg-phone">Phone <span class="req">*</span></label>
          <input type="tel" id="reg-phone" placeholder="10-digit number" maxlength="10">
        </div>
      </div>
      ${slotRow}
      <button class="submit-btn" id="reg-submit" onclick="submitEvent()">
        <span class="spinner" id="reg-spinner"></span>
        <span id="reg-label">Register</span>
      </button>
    </div>
    <div class="result-box result-success" id="reg-success">
      <h3>Registration Confirmed</h3>
      <div class="reg-id-badge" id="reg-id"></div>
      <div id="reg-payment-note"></div>
    </div>
    <div class="result-box result-error" id="reg-error">
      <h3 id="reg-err-title">Error</h3>
      <p id="reg-err-msg"></p>
      <button class="status-link-btn" onclick="window.location.href='status.html'" style="margin-top:10px">
        Check your status →
      </button>
    </div>
  </div>
</div>`;

  if (hasSlots) {
    const dateEl = document.getElementById('reg-date');
    if (dateEl) { dateEl.min = e.dateFrom; dateEl.max = e.dateTo; }
    const slotEl = document.getElementById('reg-slot');
    if (slotEl) e.slots.forEach(s => slotEl.add(new Option(s, s)));
  }
}

/* ── Form helpers ────────────────────────────────────────── */

function setLoading(on) {
  const btn  = document.getElementById('reg-submit');
  const sp   = document.getElementById('reg-spinner');
  const lbl  = document.getElementById('reg-label');
  const prog = document.getElementById('reg-progress');
  btn.disabled     = on;
  sp.style.display = on ? 'inline-block' : 'none';
  if (on) { lbl.textContent = 'Please wait'; lbl.classList.add('btn-dots'); }
  else    { lbl.textContent = 'Register';    lbl.classList.remove('btn-dots'); }
  if (prog) prog.classList.toggle('active', on);
}

function clearResults() {
  ['reg-success', 'reg-error'].forEach(id => document.getElementById(id).classList.remove('show'));
}

function showSuccess(regId, name) {
  clearResults();
  const el = document.getElementById('reg-success');
  el.classList.add('show');
  el.querySelector('h3').textContent = name ? `Welcome, ${name}! Thank you for registering.` : 'Registration Confirmed';
  document.getElementById('reg-id').textContent = 'Registration ID: ' + regId;
  document.getElementById('reg-submit').style.display = 'none';
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function showError(title, msg) {
  clearResults();
  document.getElementById('reg-error').classList.add('show');
  document.getElementById('reg-err-title').textContent = title;
  document.getElementById('reg-err-msg').textContent   = msg;
}

/* ── Submit ──────────────────────────────────────────────── */

async function submitEvent() {
  clearResults();
  const name  = document.getElementById('reg-name').value.trim();
  const flat  = document.getElementById('reg-flat').value.trim().toUpperCase();
  const phone = document.getElementById('reg-phone').value.trim();
  const date  = document.getElementById('reg-date').value;
  const slot  = document.getElementById('reg-slot').value;

  if (!name)                              { showError('Missing Name',   'Please enter your full name.'); return; }
  if (flat.length < 2)                    { showError('Invalid Flat',   'Please enter a valid flat number (e.g. C806).'); return; }
  if (!/^[6-9]\d{9}$/.test(phone))       { showError('Invalid Phone',  'Please enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.'); return; }
  if (EVENT.slots) {
    if (!date) { showError('Missing Date', 'Please select a date.'); return; }
    if (!slot) { showError('Missing Slot', 'Please select Morning or Evening.'); return; }
  }

  setLoading(true);
  try {
    const res = await api({ action: 'register', event: eventKey, data: { name, flat, phone, date, slot } });
    if (res.success) {
      document.getElementById('reg-payment-note').innerHTML = paymentNoteHtml(getEventAmount(eventKey, date), eventKey, flat);
      showSuccess(res.regId, name);
    } else {
      handleRegError(res, flat);
    }
  } catch (err) {
    showError('Connection Error', err.message);
  } finally {
    setLoading(false);
  }
}

function handleRegError(res, flat) {
  if (res.error === 'duplicate') {
    showError('Already Registered', `Flat ${flat} is already registered for this event.`);
  } else if (res.error === 'blocked') {
    showError('Slot Not Available', res.message);
  } else if (res.error === 'closed') {
    showError('Registrations Closed', 'Registrations for this event are currently closed.');
  } else if (res.error === 'full') {
    showError('Slots Full', 'All slots are filled. Please contact the committee.');
  } else {
    showError('Something went wrong', res.message || 'Please try again or contact the committee.');
  }
}

/* ── Init ────────────────────────────────────────────────── */

window.addEventListener('load', renderPage);
