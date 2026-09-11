/* ── Stats Modal ─────────────────────────────────────────── */

let _statsModalReady = false;

function ensureStatsModal() {
  if (_statsModalReady) return;
  _statsModalReady = true;

  const backdrop = document.createElement('div');
  backdrop.id = 'stats-modal-backdrop';
  backdrop.onclick = closeStatsModal;

  const modal = document.createElement('div');
  modal.id = 'stats-modal';
  modal.innerHTML = `
    <div class="stats-modal-header">
      <div id="stats-modal-title" class="stats-modal-title"></div>
      <button class="stats-modal-close" onclick="closeStatsModal()">&#x2715;</button>
    </div>
    <div id="stats-modal-body" class="stats-modal-body"></div>`;

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
}

async function openStatsModal(key) {
  ensureStatsModal();
  const evName = (CONFIG.events[key] || {}).name || key;
  document.getElementById('stats-modal-title').textContent = evName + ' \u2014 Registrations';
  document.getElementById('stats-modal-body').innerHTML = '<div class="stats-loading">Loading\u2026</div>';

  const backdrop = document.getElementById('stats-modal-backdrop');
  const modal    = document.getElementById('stats-modal');
  backdrop.style.display = 'block';
  modal.style.display    = 'block';
  requestAnimationFrame(() => modal.classList.add('open'));
  document.body.style.overflow = 'hidden';

  try {
    const data = await api({ action: 'getStats' });
    renderStatsBody(key, data);
  } catch (e) {
    document.getElementById('stats-modal-body').innerHTML = '<p class="stats-error">Could not load data. Please try again.</p>';
  }
}

function closeStatsModal() {
  const modal    = document.getElementById('stats-modal');
  const backdrop = document.getElementById('stats-modal-backdrop');
  if (!modal) return;
  modal.classList.remove('open');
  modal.addEventListener('transitionend', () => {
    modal.style.display    = 'none';
    backdrop.style.display = 'none';
    document.body.style.overflow = '';
  }, { once: true });
}

function renderStatsBody(key, data) {
  const body = document.getElementById('stats-modal-body');
  if (key === 'daily-pooja') {
    body.innerHTML = renderDailyPoojaStats(data.dailyPooja || [], data.blockedSlots || []);
  } else if (key === 'kumkuma-pooja') {
    body.innerHTML = renderKumkumaStats(data.kumkumaPooja || 0);
  } else if (key === 'ganapathi-homam') {
    body.innerHTML = renderHomamStats(data.ganapathiHomam || 0);
  }
}

function renderDailyPoojaStats(rows, blockedSlots) {
  const countMap = {};
  for (const r of rows) countMap[r.event_date + '|' + r.slot] = r.count;

  const blockedSet = new Set(blockedSlots.map(b => b.date + '|' + b.slot));

  const cfg      = CONFIG.events['daily-pooja'];
  const dateFrom = new Date(cfg.dateFrom + 'T00:00:00');
  const dateTo   = new Date(cfg.dateTo   + 'T00:00:00');
  const slots    = cfg.slots || ['Morning', 'Evening'];
  const max      = 10;

  let html = '';
  for (let d = new Date(dateFrom); d <= dateTo; d.setDate(d.getDate() + 1)) {
    const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const dayName = d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    html += `<div class="stats-date-group"><div class="stats-date-label">${dayName}</div>`;
    for (const slot of slots) {
      const k         = dateStr + '|' + slot;
      const isBlocked = blockedSet.has(k);
      const count     = isBlocked ? null : (countMap[k] || 0);
      html += renderBarRow(slot, count, max, isBlocked);
    }
    html += '</div>';
  }
  return html;
}

function renderBarRow(label, count, max, isBlocked) {
  if (isBlocked) {
    return `<div class="stats-bar-row">
      <div class="stats-bar-label">${label}</div>
      <div class="stats-bar-blocked">Blocked</div>
    </div>`;
  }
  const pct        = max ? Math.min(100, Math.round((count / max) * 100)) : 0;
  const isFull     = count >= max;
  const colorClass = isFull ? 'bar-full' : pct >= 70 ? 'bar-high' : 'bar-mid';
  return `<div class="stats-bar-row">
    <div class="stats-bar-label">${label}</div>
    <div class="stats-bar-track"><div class="stats-bar-fill ${colorClass}" style="width:${pct}%"></div></div>
    <div class="stats-bar-count${isFull ? ' count-full' : ''}">${count}/${max}${isFull ? ' FULL' : ''}</div>
  </div>`;
}

function renderKumkumaStats(count) {
  return `<div class="stats-summary-count"><span class="stats-big-num">${count}</span><span class="stats-big-label">registered</span></div>
    <p class="stats-empty" style="margin-top:0">${count === 0 ? 'No registrations yet.' : 'No limit \u2014 all are welcome!'}</p>`;
}

function renderHomamStats(count) {
  const max = 10;
  const row = renderBarRow('Families', count, max, false).replace('stats-bar-row', 'stats-bar-row stats-bar-row-lg');
  return `<div class="stats-homam-bar">${row}</div>`;
}
