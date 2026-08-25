/* ── Navigation ──────────────────────────────────────────── */

const ALL_SECTIONS = ['home', ...Object.keys(CONFIG.events)];

function nav(id) {
  ALL_SECTIONS.forEach(s => {
    document.getElementById('s-' + s).classList.toggle('active', s === id);
  });
  window.scrollTo(0, 0);
  try { history.replaceState(null, '', id === 'home' ? '#' : '#' + id); } catch(e) {}
}

/* ── Render home event cards ─────────────────────────────── */

const CARD_COLORS = ['#C8500A', '#7A2A00', '#F0A500', '#2A6A4A', '#4A2A7A'];

function renderCards() {
  const grid = document.getElementById('events-grid');
  const keys = Object.keys(CONFIG.events);

  grid.innerHTML = keys.map((key, idx) => {
    const e      = CONFIG.events[key];
    const closed = e.status === 'closed';
    const color  = CARD_COLORS[idx % CARD_COLORS.length];

    const amtClass = closed ? 'closed' : (e.amount === 0 ? 'free' : 'paid');
    const amtText  = closed ? 'Closed' : e.amountLabel;

    const regBtn = closed
      ? `<button class="card-btn card-btn-disabled" disabled>Registrations Closed</button>`
      : `<button class="card-btn card-btn-primary" style="background:${color};" onclick="nav('${key}')">Register for ${e.name} &rarr;</button>`;

    return `
<div class="event-card">
  <div class="card-top-bar" style="background:${color};"></div>
  <div class="card-body">
    <div class="card-head">
      <div class="card-name">
        <h2>${e.name}</h2>
      </div>
      <span class="card-amt ${amtClass}" style="background:${color}18;color:${color};border-color:${color}33;">${amtText}</span>
    </div>
    <div class="card-info">
      <span>📅 ${e.displayDate}</span>
      <span>🕐 ${e.time}</span>
    </div>
    <p class="card-desc">${e.description}</p>
    <div class="card-actions">
      ${regBtn}
    </div>
  </div>
</div>`;
  }).join('');
}

/* ── Render event form sections ──────────────────────────── */

function renderEventSections() {
  const container = document.getElementById('event-sections');
  const keys = Object.keys(CONFIG.events);

  container.innerHTML = keys.map(key => {
    const e = CONFIG.events[key];
    const hasSlots = !!e.slots;

    // Slot-based events get visible pickers; fixed events get hidden inputs pre-filled from CONFIG
    const dateField = hasSlots
      ? `<div class="field">
           <label for="${key}-date">Date <span class="req">*</span></label>
           <input type="date" id="${key}-date">
         </div>`
      : `<input type="hidden" id="${key}-date" value="${e.date || ''}">`;

    const slotField = hasSlots
      ? `<div class="field">
           <label for="${key}-slot">Slot <span class="req">*</span></label>
           <select id="${key}-slot">
             <option value="">Select slot</option>
           </select>
         </div>`
      : `<input type="hidden" id="${key}-slot" value="${e.slot || ''}">`;

    const slotRow = hasSlots
      ? `<div class="two-col">${dateField}${slotField}</div>`
      : `${dateField}${slotField}`;

    return `
<div id="s-${key}" class="section">
  <div class="topbar">
    <button class="back-btn" onclick="nav('home')">&#8592; Back</button>
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
      <div class="form-progress" id="${key}-progress">
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
        <label for="${key}-name">Name <span class="req">*</span></label>
        <input type="text" id="${key}-name" placeholder="Your full name">
      </div>
      <div class="two-col">
        <div class="field">
          <label for="${key}-flat">Flat Number <span class="req">*</span></label>
          <input type="text" id="${key}-flat" placeholder="e.g. C806">
        </div>
        <div class="field">
          <label for="${key}-phone">Phone <span class="req">*</span></label>
          <input type="tel" id="${key}-phone" placeholder="10-digit number" maxlength="10">
        </div>
      </div>
      ${slotRow}
      <button class="submit-btn" id="${key}-submit" onclick="submitEvent('${key}')">
        <span class="spinner" id="${key}-spinner"></span>
        <span id="${key}-label">Register</span>
      </button>
    </div>
    <div class="result-box result-success" id="${key}-success">
      <h3>Registration Confirmed</h3>
      <div class="reg-id-badge" id="${key}-reg-id"></div>
      <div id="${key}-payment-note"></div>
    </div>
    <div class="result-box result-error" id="${key}-error">
      <h3 id="${key}-err-title">Error</h3>
      <p id="${key}-err-msg"></p>
      <button class="status-link-btn" onclick="window.location.href='status.html'" style="margin-top:10px">
        Check your status →
      </button>
    </div>
  </div>
</div>`;
  }).join('');

  // Wire up date constraints and slot options after DOM is built
  keys.forEach(key => {
    const e = CONFIG.events[key];
    if (e.slots) {
      const dateEl = document.getElementById(key + '-date');
      if (dateEl) { dateEl.min = e.dateFrom; dateEl.max = e.dateTo; }
      const slotEl = document.getElementById(key + '-slot');
      if (slotEl) e.slots.forEach(s => slotEl.add(new Option(s, s)));
    }
  });
}

/* ── Form state helpers ──────────────────────────────────── */

function setLoading(pfx, on) {
  const btn  = document.getElementById(pfx + '-submit');
  const sp   = document.getElementById(pfx + '-spinner');
  const lbl  = document.getElementById(pfx + '-label');
  const prog = document.getElementById(pfx + '-progress');
  btn.disabled     = on;
  sp.style.display = on ? 'inline-block' : 'none';
  if (on) { lbl.textContent = 'Please wait'; lbl.classList.add('btn-dots'); }
  else    { lbl.textContent = 'Register';    lbl.classList.remove('btn-dots'); }
  if (prog) prog.classList.toggle('active', on);
}

function clearResults(pfx) {
  ['success', 'error'].forEach(t => {
    document.getElementById(pfx + '-' + t).classList.remove('show');
  });
}

function showSuccess(pfx, regId, name) {
  clearResults(pfx);
  const el = document.getElementById(pfx + '-success');
  el.classList.add('show');
  const h3 = el.querySelector('h3');
  if (h3) h3.textContent = name ? `Welcome, ${name}! Thank you for registering.` : 'Registration Confirmed';
  const p = el.querySelector('p');
  if (p) p.style.display = 'none';
  const badge = document.getElementById(pfx + '-reg-id');
  if (badge) badge.textContent = 'Registration ID: ' + regId;
  document.getElementById(pfx + '-submit').style.display = 'none';
  setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
}

function showError(pfx, title, msg) {
  clearResults(pfx);
  document.getElementById(pfx + '-error').classList.add('show');
  document.getElementById(pfx + '-err-title').textContent = title;
  document.getElementById(pfx + '-err-msg').textContent   = msg;
}

/* ── Validation ──────────────────────────────────────────── */

function validPhone(v) { return /^[6-9]\d{9}$/.test(v); }
function validFlat(v)  { return v.trim().length >= 2; }

function collectBase(pfx) {
  return {
    name:  document.getElementById(pfx + '-name').value.trim(),
    flat:  document.getElementById(pfx + '-flat').value.trim().toUpperCase(),
    phone: document.getElementById(pfx + '-phone').value.trim(),
  };
}

function baseCheck(pfx, d) {
  if (!d.name)              { showError(pfx, 'Missing Name',    'Please enter your full name.'); return false; }
  if (!validFlat(d.flat))   { showError(pfx, 'Invalid Flat',    'Please enter a valid flat number (e.g. C806).'); return false; }
  if (!validPhone(d.phone)) { showError(pfx, 'Invalid Phone',   'Please enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.'); return false; }
  return true;
}

/* ── Generic event submit ────────────────────────────────── */

async function submitEvent(key) {
  clearResults(key);
  const d    = collectBase(key);
  const date = document.getElementById(key + '-date').value;
  const slot = document.getElementById(key + '-slot').value;
  const e    = CONFIG.events[key];

  if (!baseCheck(key, d)) return;
  if (e.slots) {
    if (!date) { showError(key, 'Missing Date', 'Please select a date.'); return; }
    if (!slot) { showError(key, 'Missing Slot', 'Please select Morning or Evening.'); return; }
  }

  setLoading(key, true);
  try {
    const res = await api({ action: 'register', event: key, data: { ...d, date, slot } });
    if (res.success) {
      document.getElementById(key + '-payment-note').innerHTML = paymentNoteHtml(getEventAmount(key, date), key, d.flat);
      showSuccess(key, res.regId, d.name);
    } else {
      handleRegError(key, res, d.flat);
    }
  } catch (err) {
    showError(key, 'Connection Error', err.message);
  } finally {
    setLoading(key, false);
  }
}

/* ── Registration error handler ──────────────────────────── */

function handleRegError(pfx, res, flat) {
  if (res.error === 'duplicate') {
    showError(pfx, 'Already Registered', `Flat ${flat} is already registered.`);
  } else if (res.error === 'blocked') {
    showError(pfx, 'Slot Not Available', res.message);
  } else if (res.error === 'closed') {
    showError(pfx, 'Registrations Closed', 'Registrations for this event are currently closed.');
  } else if (res.error === 'full') {
    showError(pfx, 'Slots Full', 'All slots for this event/slot are filled. Please contact the committee.');
  } else {
    showError(pfx, 'Something went wrong', res.message || 'Please try again or contact the committee.');
  }
}

/* ── Init on load ────────────────────────────────────────── */

window.addEventListener('load', function () {
  document.getElementById('footer-apt').textContent = CONFIG.APARTMENT_NAME;
  renderCards();
  renderEventSections();

  const hash = window.location.hash.replace('#', '').trim();
  nav(ALL_SECTIONS.includes(hash) ? hash : 'home');
});
