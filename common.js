const CONFIG = {
  API_URL:          'https://ggucapi.giri-kailasam.workers.dev/',
  APARTMENT_NAME:   'Greenmark Galaxy Apartments',
  UPI_ID:           'galaxyapts@icici',
  PAYMENT_CONTACTS: [
    { number: '9490133404', name: 'Teja' },
    { number: '9966514485', name: 'Giridhar' },
  ],

  events: {
    'daily-pooja': {
      name:        'Daily Pooja',
      emoji:       '🪔',
      displayDate: 'Sep 15–24, 2026',
      dateFrom:    '2026-09-15',          // date picker min (Sep 14 blocked for sponsors)
      dateTo:      '2026-09-24',          // date picker max
      time:        'Morning & Evening',
      place:       'Ganapathi Mandapam',
      amount:      516,                   // weekday amount; weekends are 1116
      amountLabel: '₹516 / ₹1116 (weekends)',
      description: 'Register your family for daily pooja during the auspicious Ganesh Chaturthi festival. Morning and evening slots available.',
      slots:       ['Morning', 'Evening'],
      status:      'active',              // 'active' or 'closed'
    },
    'kumkuma-pooja': {
      name:        'Kumkuma Pooja',
      emoji:       '🔱',
      displayDate: 'Sep 18, 2026',
      time:        '4:00 PM – 6:00 PM',
      place:       'Ganapathi Mandapam',
      amount:      216,
      amountLabel: '₹216 / person',
      description: 'A special Kumkuma Pooja for all ladies of the community. All residents are warmly invited.',
      status:      'active',
    },
    'ganapathi-homam': {
      name:        'Ganapathi Homam',
      emoji:       '🔥',
      displayDate: 'Sep 16, 2026',
      time:        '5:30 AM – 7:30 AM',
      place:       'Ganapathi Mandapam',
      amount:      2116,
      amountLabel: '₹2116 / family',
      description: 'An auspicious Ganapathi Homam for prosperity and well-being of all families.',
      status:      'active',
    }
  }
};

// Daily Pooja: weekends (Sat/Sun) are ₹1116, weekdays are ₹516
function getDpAmount(dateStr) {
  if (!dateStr) return CONFIG.events['daily-pooja'].amount;
  const day = new Date(dateStr + 'T00:00:00').getDay(); // 0=Sun,6=Sat
  return (day === 0 || day === 6) ? 1116 : 516;
}

/* ── API helper ──────────────────────────────────────────── */

async function api(payload) {
  const r = await fetch(CONFIG.API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'text/plain' },
    body:    JSON.stringify(payload),
  });
  if (!r.ok) throw new Error('Server error: ' + r.status);
  return r.json();
}

/* ── Date formatter ──────────────────────────────────────── */

function fmtDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch { return ts; }
}

/* ── Payment helpers ─────────────────────────────────────── */

function paymentContactsHtml(style) {
  const s = style || '';
  return CONFIG.PAYMENT_CONTACTS
    .map(c => `<strong ${s}>${c.name} (${c.number})</strong>`)
    .join(' or ');
}

function openPayModal(amount, eventKey, flat) {
  const evCfg   = CONFIG.events[eventKey] || {};
  const note    = flat ? `${evCfg.name || eventKey} - Flat ${flat}` : (evCfg.name || eventKey);
  const upiEnc  = s => encodeURIComponent(s).replace(/%20/g, '+');
  const upiLink = `upi://pay?pa=${upiEnc(CONFIG.UPI_ID)}&pn=${upiEnc(CONFIG.APARTMENT_NAME)}&am=${amount}&cu=INR&tn=${upiEnc(note)}`;

  document.getElementById('pay-modal-title').textContent = `Pay \u20B9${amount}`;
  document.getElementById('pay-modal-sub').textContent   = evCfg.name || '';
  document.getElementById('pay-modal-btn').href          = upiLink;
  document.getElementById('pay-modal-upi').textContent   = CONFIG.UPI_ID;

  const qrEl = document.getElementById('pay-modal-qr');
  qrEl.innerHTML = '<img src="galaxy_cultural_qr.png" width="240" height="240" style="border-radius:8px;display:block;" alt="UPI QR Code">';

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

function copyUpiId() {
  const upiId = document.getElementById('pay-modal-upi').textContent;
  const btn   = document.getElementById('upi-copy-btn');
  navigator.clipboard.writeText(upiId).then(() => {
    btn.textContent = '✓';
    setTimeout(() => { btn.innerHTML = '&#x2398;'; }, 2000);
  });
}

function paymentNoteHtml(amount, eventKey, flat) {
  const flatArg   = flat ? `'${flat}'` : 'null';
  const evName    = (CONFIG.events[eventKey] || {}).name || eventKey;
  const flatPart  = flat ? ` (Flat ${flat})` : '';
  const waMsg     = encodeURIComponent(
    `Hi, I have completed the payment for ${evName} registration${flatPart}. Please find the payment screenshot attached. Kindly update my registration status to Paid.`
  );
  const waIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white" style="flex-shrink:0;"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>`;
  const waButtons = CONFIG.PAYMENT_CONTACTS.map(c =>
    `<a href="https://wa.me/91${c.number}?text=${waMsg}" target="_blank" style="display:inline-flex;align-items:center;gap:7px;background:#25D366;color:#fff;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:600;padding:10px 16px;border-radius:24px;text-decoration:none;line-height:1;">${waIcon} ${c.name} · ${c.number}</a>`
  ).join('');
  return `<div class="payment-note">
    <button onclick="openPayModal(${amount}, '${eventKey}', ${flatArg})" style="background:var(--red);color:#fff;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:700;padding:8px 16px;border-radius:8px;border:none;cursor:pointer;margin-bottom:10px;">Pay &#8377;${amount} Now &rarr;</button>
    <p style="color:var(--muted);margin-bottom:8px;">After payment, share the screenshot to either of the below numbers to get your status updated to Paid.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">${waButtons}</div>
  </div>`;
}
