const CONFIG = {
  API_URL:        'https://script.google.com/macros/s/AKfycbxJ3O50Tcq3wFONxE5mkgLYMRGlQs3l5j8Y50LfVZXdrx_2RKgDCdANrQtDLzdNzDTa/exec',
  APARTMENT_NAME: 'Greenmark Galaxy Apartments',
  UPI_ID:         'galaxyapts@icici',     // UPI ID shown on payment confirmation pages
  PAYMENT_CONTACTS: ['9966514485', '9490133404'],  // WhatsApp numbers for screenshot sharing

  events: {
    'daily-pooja': {
      name:        'Daily Pooja',
      emoji:       '🪔',
      displayDate: 'Sep 14–20, 2026',
      dateFrom:    '2026-09-14',          // date picker min
      dateTo:      '2026-09-20',          // date picker max
      time:        'Morning & Evening',
      place:       'Temple Area',
      amount:      516,
      amountLabel: '₹516 / slot',
      description: 'Register your family for daily pooja during the auspicious Ganesh Chaturthi week. Morning and evening slots available.',
      slots:       ['Morning', 'Evening'],
      status:      'active',              // 'active' or 'closed'
    },
    'kumkuma-pooja': {
      name:        'Kumkuma Pooja',
      emoji:       '🔱',
      displayDate: 'Sep 18, 2026',
      time:        '4:00 PM – 6:00 PM',
      place:       'Temple Garden',
      amount:      0,
      amountLabel: 'Free',
      description: 'A special Kumkuma Pooja for all ladies of the community. All residents are warmly invited.',
      status:      'active',
    },
    'ganapathi-homam': {
      name:        'Ganapathi Homam',
      emoji:       '🔥',
      displayDate: 'Sep 16, 2026',
      time:        '5:00 AM – 7:00 AM',
      place:       'Community Hall',
      amount:      1116,
      amountLabel: '₹1116 / family',
      description: 'An auspicious Ganapathi Homam for prosperity and well-being of all families.',
      status:      'active',
    }
  }
};


/* ── Navigation ──────────────────────────────────────────── */

const ALL_SECTIONS = ['home', 'daily-pooja', 'kumkuma-pooja', 'ganapathi-homam', 'status'];

function nav(id) {
  ALL_SECTIONS.forEach(s => {
    document.getElementById('s-' + s).classList.toggle('active', s === id);
  });
  window.scrollTo(0, 0);
  try { history.replaceState(null, '', id === 'home' ? '#' : '#' + id); } catch(e) {}
}

/* ── Swipe right to go back ──────────────────────────────── */

(function () {
  let startX = 0, startY = 0;
  document.addEventListener('touchstart', function (e) {
    startX = e.changedTouches[0].clientX;
    startY = e.changedTouches[0].clientY;
  }, { passive: true });
  document.addEventListener('touchend', function (e) {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    // Right swipe: 50px+ horizontal, more horizontal than vertical, starts in left 50% of screen
    if (dx > 50 && Math.abs(dx) > Math.abs(dy) * 1.2 && startX < window.innerWidth * 0.5) {
      const active = ALL_SECTIONS.find(s =>
        document.getElementById('s-' + s).classList.contains('active'));
      if (active && active !== 'home') nav('home');
    }
  }, { passive: true });
})();

/* ── Payment helpers ─────────────────────────────────────── */

function paymentContactsHtml(style) {
  const s = style || '';
  return CONFIG.PAYMENT_CONTACTS
    .map(n => `<strong ${s}>${n}</strong>`)
    .join(' or ');
}

function openPayModal(amount, eventKey, flat) {
  const evCfg   = CONFIG.events[eventKey] || {};
  const note    = flat ? `${evCfg.name || eventKey} - Flat ${flat}` : (evCfg.name || eventKey);
  const upiLink = `upi://pay?pa=${encodeURIComponent(CONFIG.UPI_ID)}&pn=${encodeURIComponent(CONFIG.APARTMENT_NAME)}&am=${amount}&cu=INR&tn=${encodeURIComponent(note)}`;

  document.getElementById('pay-modal-title').textContent = `Pay \u20B9${amount}`;
  document.getElementById('pay-modal-sub').textContent   = evCfg.name || '';
  document.getElementById('pay-modal-btn').href          = upiLink;
  document.getElementById('pay-modal-upi').textContent   = CONFIG.UPI_ID;

  const qrEl = document.getElementById('pay-modal-qr');
  qrEl.innerHTML = '';
  new QRCode(qrEl, { text: upiLink, width: 180, height: 180, correctLevel: QRCode.CorrectLevel.M });

  document.getElementById('pay-modal-backdrop').style.display = 'block';
  const modal = document.getElementById('pay-modal');
  modal.style.display = 'block';
  requestAnimationFrame(() => modal.classList.add('open'));
  document.body.style.overflow = 'hidden';
}

function closePayModal() {
  const modal = document.getElementById('pay-modal');
  modal.classList.remove('open');
  modal.addEventListener('transitionend', () => {
    modal.style.display = 'none';
    document.getElementById('pay-modal-backdrop').style.display = 'none';
    document.body.style.overflow = '';
  }, { once: true });
}

function paymentNoteHtml(amount, eventKey, flat) {
  const flatArg = flat ? `'${flat}'` : 'null';
  return `<div class="payment-note">
    <p style="margin-bottom:10px;">
      Pay <strong>&#8377;${amount}</strong> via UPI to <span style="font-family:monospace;background:rgba(201,168,76,0.15);padding:2px 7px;border-radius:5px;color:var(--dark);">${CONFIG.UPI_ID}</span>
    </p>
    <button onclick="openPayModal(${amount}, '${eventKey}', ${flatArg})" style="background:var(--red);color:#fff;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;padding:8px 16px;border-radius:8px;border:none;cursor:pointer;margin-bottom:10px;">Pay &#8377;${amount} Now &rarr;</button>
    <p style="color:var(--muted);">Share payment screenshot to ${paymentContactsHtml('style="color:var(--dark2);"')} for payment status update.</p>
  </div>`;
}

/* ── Init on load ────────────────────────────────────────── */

window.addEventListener('load', function () {
  // Populate apartment name in footer
  document.getElementById('footer-apt').textContent = CONFIG.APARTMENT_NAME;

  // Render home event cards
  renderCards();

  // Set date picker bounds for Daily Pooja
  const dpDate = document.getElementById('dp-date');
  const dpCfg  = CONFIG.events['daily-pooja'];
  dpDate.min   = dpCfg.dateFrom;
  dpDate.max   = dpCfg.dateTo;

  // Payment note blocks are populated after successful registration (need flat number)

  // Route to correct section based on hash
  const hash = window.location.hash.replace('#', '').trim();
  nav(ALL_SECTIONS.includes(hash) ? hash : 'home');
});

/* ── Render home event cards ─────────────────────────────── */

function renderCards() {
  const grid = document.getElementById('events-grid');
  const keys = ['daily-pooja', 'kumkuma-pooja', 'ganapathi-homam'];

  grid.innerHTML = keys.map(key => {
    const e      = CONFIG.events[key];
    const closed = e.status === 'closed';

    const amtClass = closed ? 'closed' : (e.amount === 0 ? 'free' : 'paid');
    const amtText  = closed ? 'Closed' : e.amountLabel;

    const regBtn = closed
      ? `<button class="card-btn card-btn-disabled" disabled>Registrations Closed</button>`
      : `<button class="card-btn card-btn-primary" onclick="nav('${key}')">Register &rarr;</button>`;

    return `
<div class="event-card">
  <div class="card-top-bar"></div>
  <div class="card-body">
    <div class="card-head">
      <div class="card-name">
        <span class="card-emoji">${e.emoji}</span>
        <h2>${e.name}</h2>
      </div>
      <span class="card-amt ${amtClass}">${amtText}</span>
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

/* ── API helper ──────────────────────────────────────────── */

async function api(payload) {
  const r = await fetch(CONFIG.API_URL, {
    method:   'POST',
    headers:  { 'Content-Type': 'text/plain' },
    body:     JSON.stringify(payload),
    redirect: 'follow',
  });
  if (!r.ok) throw new Error('Server error: ' + r.status);
  return r.json();
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

function showSuccess(pfx, regId) {
  clearResults(pfx);
  const el = document.getElementById(pfx + '-success');
  el.classList.add('show');
  const badge = document.getElementById(pfx + '-reg-id');
  if (badge) badge.textContent = 'Registration ID: ' + regId;
  // hide the submit button so user can't resubmit
  document.getElementById(pfx + '-submit').style.display = 'none';
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
      document.getElementById('dp-payment-note').innerHTML = paymentNoteHtml(CONFIG.events['daily-pooja'].amount, 'daily-pooja', d.flat);
      showSuccess('dp', res.regId);
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
      showSuccess('kp', res.regId);
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
      showSuccess('gh', res.regId);
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
      `Flat ${flat} is already registered. Tap "Check Status" at the top of the page to view your registration and payment details.`);
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

/* ── Status search ───────────────────────────────────────── */

async function doSearch() {
  const raw = document.getElementById('sq').value.trim();
  const q   = /^\d{10}$/.test(raw) ? raw : raw.replace(/[-\s]/g, '');
  if (!q) {
    document.getElementById('status-results').innerHTML =
      '<p style="text-align:center;color:var(--red);padding:16px 0;font-weight:600">Please enter your flat number or phone number.</p>';
    return;
  }

  const container = document.getElementById('status-results');
  container.innerHTML = `<div class="search-loader">
    <div class="rangoli-row">
      <span class="shape diamond"></span><span class="shape circle"></span>
      <span class="shape petal"></span><span class="shape circle"></span>
      <span class="shape diamond"></span><span class="shape circle"></span>
      <span class="shape petal"></span><span class="shape circle"></span>
      <span class="shape diamond"></span>
    </div>
    <span class="search-text">Searching registrations…</span>
  </div>`;

  try {
    const res = await api({ action: 'getStatus', query: q });

    if (!res.results || res.results.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="icon">🙏</div>
          <p>No registrations found for <strong>"${q}"</strong>.<br>
          Please check your flat number or phone and try again.</p>
        </div>`;
      return;
    }

    container.innerHTML = res.results.map(r => {
      const evCfg    = CONFIG.events[r.eventKey] || {};
      const isFree   = (evCfg.amount === 0);
      const isRecvd  = r.paymentStatus === 'Received';

      let statusHtml = '';
      if (isFree) {
        statusHtml = `<span class="status-badge badge-free">Free Event</span>`;
      } else if (isRecvd) {
        statusHtml = `<span class="status-badge badge-received">&#10003; Payment Received</span>`;
      } else {
        statusHtml = `<span class="status-badge badge-pending">&#9203; Payment Pending</span>
        ${paymentNoteHtml(evCfg.amount, r.eventKey, r.flat)}`;
      }

      const payBtnHtml = (r.paymentLink && !isFree && !isRecvd)
        ? `<a href="${r.paymentLink}" target="_blank" rel="noopener" class="pay-btn">Pay Now &rarr;</a>`
        : '';

      const slotHtml = r.slot
        ? `<span><strong>Date:</strong> ${fmtDate(r.date)}</span><span><strong>Slot:</strong> ${r.slot}</span>`
        : '';

      return `
<div class="reg-card">
  <div class="reg-event">${evCfg.emoji || ''} ${evCfg.name || r.eventKey}</div>
  <div class="reg-details">
    <span><strong>Reg ID:</strong> ${r.regId}</span>
    <span><strong>Name:</strong> ${r.name}</span>
    <span><strong>Flat:</strong> ${r.flat}</span>
    ${slotHtml}
    <span><strong>Registered on:</strong> ${fmtDate(r.timestamp)}</span>
  </div>
  ${statusHtml}
  ${payBtnHtml}
</div>`;
    }).join('');

  } catch (e) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="icon">&#9888;&#65039;</div>
        <p>${e.message || 'Could not connect. Please try again.'}</p>
      </div>`;
  }
}

function fmtDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ts; }
}

