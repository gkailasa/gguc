/* ── Render home event cards ─────────────────────────────── */

const CARD_COLORS = ['#C8500A', '#7A2A00', '#F0A500', '#2A6A4A', '#4A2A7A'];

const STATS_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>`;

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
      <span>&#128197; ${e.displayDate}</span>
      <span>&#128336; ${e.time}</span>
    </div>
    <p class="card-desc">${e.description}</p>
    <div class="card-actions">
      ${regBtn}
      <button class="card-stats-btn" onclick="openStatsModal('${key}')" title="View registrations">${STATS_ICON}</button>
    </div>
  </div>
</div>`;
  }).join('');
}

/* ── Init ────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', function () {
  document.getElementById('footer-apt').textContent = CONFIG.APARTMENT_NAME;
  renderCards();
});
