/* ── Navigation ──────────────────────────────────────────── */

const ALL_SECTIONS = ['home', 'daily-pooja', 'kumkuma-pooja', 'ganapathi-homam'];

function nav(id) {
  ALL_SECTIONS.forEach(s => {
    document.getElementById('s-' + s).classList.toggle('active', s === id);
  });
  window.scrollTo(0, 0);
  try { history.replaceState(null, '', id === 'home' ? '#' : '#' + id); } catch(e) {}
}

/* ── Render home event cards ─────────────────────────────── */

function renderCards() {
  const grid = document.getElementById('events-grid');
  const keys = ['daily-pooja', 'kumkuma-pooja', 'ganapathi-homam'];

  const cardColors = ['#C8500A', '#7A2A00', '#F0A500'];

  grid.innerHTML = keys.map((key, idx) => {
    const e      = CONFIG.events[key];
    const closed = e.status === 'closed';
    const color  = cardColors[idx];

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
  if (!d.name)            { showError(pfx, 'Missing Name', 'Please enter your full name.'); return false; }
  if (!validFlat(d.flat)) { showError(pfx, 'Invalid Flat', 'Please enter a valid flat number (e.g. C806).'); return false; }
  if (!validPhone(d.phone)) { showError(pfx, 'Invalid Phone', 'Please enter a valid 10-digit mobile number starting with 6, 7, 8 or 9.'); return false; }
  return true;
}

/* ── Daily Pooja submit ──────────────────────────────────── */

async function submitDailyPooja() {
  clearResults('dp');
  const d    = collectBase('dp');
  const date = document.getElementById('dp-date').value;
  const slot = document.getElementById('dp-slot').value;

  if (!baseCheck('dp', d)) return;
  if (!date) { showError('dp', 'Missing Date', 'Please select a date.'); return; }
  if (!slot) { showError('dp', 'Missing Slot', 'Please select Morning or Evening.'); return; }

  setLoading('dp', true);
  try {
    const res = await api({ action: 'register', event: 'daily-pooja', data: { ...d, date, slot } });
    if (res.success) {
      document.getElementById('dp-payment-note').innerHTML = paymentNoteHtml(getDpAmount(date), 'daily-pooja', d.flat);
      showSuccess('dp', res.regId, d.name);
    } else {
      handleRegError('dp', res, d.flat);
    }
  } catch (e) {
    showError('dp', 'Connection Error', e.message);
  } finally {
    setLoading('dp', false);
  }
}

/* ── Kumkuma Pooja submit ────────────────────────────────── */

async function submitKumkuma() {
  clearResults('kp');
  const d = collectBase('kp');

  if (!baseCheck('kp', d)) return;

  setLoading('kp', true);
  try {
    const res = await api({ action: 'register', event: 'kumkuma-pooja', data: { ...d } });
    if (res.success) {
      document.getElementById('kp-payment-note').innerHTML = paymentNoteHtml(CONFIG.events['kumkuma-pooja'].amount, 'kumkuma-pooja', d.flat);
      showSuccess('kp', res.regId, d.name);
    } else {
      handleRegError('kp', res, d.flat);
    }
  } catch (e) {
    showError('kp', 'Connection Error', e.message);
  } finally {
    setLoading('kp', false);
  }
}

/* ── Ganapathi Homam submit ──────────────────────────────── */

async function submitHomam() {
  clearResults('gh');
  const d = collectBase('gh');

  if (!baseCheck('gh', d)) return;

  setLoading('gh', true);
  try {
    const res = await api({ action: 'register', event: 'ganapathi-homam', data: { ...d } });
    if (res.success) {
      document.getElementById('gh-payment-note').innerHTML = paymentNoteHtml(CONFIG.events['ganapathi-homam'].amount, 'ganapathi-homam', d.flat);
      showSuccess('gh', res.regId, d.name);
    } else {
      handleRegError('gh', res, d.flat);
    }
  } catch (e) {
    showError('gh', 'Connection Error', e.message);
  } finally {
    setLoading('gh', false);
  }
}

/* ── Registration error handler ──────────────────────────── */

function handleRegError(pfx, res, flat) {
  if (res.error === 'duplicate') {
    showError(pfx, 'Already Registered',
      `Flat ${flat} is already registered.`);
  } else if (res.error === 'blocked') {
    showError(pfx, 'Slot Not Available', res.message);
  } else if (res.error === 'closed') {
    showError(pfx, 'Registrations Closed', 'Registrations for this event are currently closed.');
  } else if (res.error === 'full') {
    showError(pfx, 'Slots Full', 'All spots for this event/slot are filled. Please contact the committee.');
  } else {
    showError(pfx, 'Something went wrong', res.message || 'Please try again or contact the committee.');
  }
}

/* ── Init on load ────────────────────────────────────────── */

window.addEventListener('load', function () {
  document.getElementById('footer-apt').textContent = CONFIG.APARTMENT_NAME;

  renderCards();

  const dpDate = document.getElementById('dp-date');
  const dpCfg  = CONFIG.events['daily-pooja'];
  dpDate.min   = dpCfg.dateFrom;
  dpDate.max   = dpCfg.dateTo;

  const hash = window.location.hash.replace('#', '').trim();
  nav(ALL_SECTIONS.includes(hash) ? hash : 'home');
});
