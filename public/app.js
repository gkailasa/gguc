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
      : `<a class="card-btn card-btn-primary" style="background:${color};" href="register.html?event=${key}">Register for ${e.name} &rarr;</a>`;

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

/* ── Init ────────────────────────────────────────────────── */

window.addEventListener('load', function () {
  document.getElementById('footer-apt').textContent = CONFIG.APARTMENT_NAME;
  renderCards();
});
