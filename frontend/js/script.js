/* ============================================================
   STUDENTACCOMO 2.0 — script.js
   Public frontend: load, filter, sort, render properties
   ============================================================ */

'use strict';

// ---- State ----
let ALL_PROPS    = [];
let FILTERED     = [];
let SEARCH_MODE  = 'location'; // 'location' or 'name'

// ---- DOM refs ----
const listEl       = () => document.getElementById('property-list');
const resultCount  = () => document.getElementById('resultCount');
const searchInput  = () => document.getElementById('searchInput');
const searchMode   = () => document.getElementById('searchMode');
const sortSelect   = () => document.getElementById('sortSelect');
const priceRange   = () => document.getElementById('priceRange');

// ============================================================
// TOAST SYSTEM
// ============================================================
function showToast(message, type = 'default', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const icons = { success: '✅', error: '❌', warning: '⚠️', default: 'ℹ️' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.default}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================================
// SKELETONS
// ============================================================
function renderSkeletons(count = 6) {
  const grid = listEl();
  if (!grid) return;
  grid.innerHTML = Array.from({ length: count }, () => `
    <div class="skeleton-card">
      <div class="skeleton skeleton-img"></div>
      <div class="skeleton-body">
        <div class="skeleton skeleton-line" style="width:70%"></div>
        <div class="skeleton skeleton-line short"></div>
        <div class="skeleton skeleton-line shorter" style="margin-top:14px"></div>
        <div class="skeleton skeleton-line" style="width:50%;margin-top:6px"></div>
        <div class="skeleton skeleton-line" style="width:80%;margin-top:14px;height:36px;border-radius:8px"></div>
      </div>
    </div>
  `).join('');
}

// ============================================================
// FETCH PROPERTIES
// ============================================================
async function loadProperties() {
  renderSkeletons(6);

  try {
    const res = await fetch('/properties');
    if (!res.ok) throw new Error('Failed to load');
    ALL_PROPS = await res.json();

    if (ALL_PROPS.length) {
      const maxPrice = Math.max(...ALL_PROPS.map(p => Number(p.price) || 0));
      const rangeEl = priceRange();
      if (rangeEl) {
        const rounded = Math.ceil(maxPrice / 500) * 500;
        rangeEl.max   = rounded;
        rangeEl.value = rounded;
        document.getElementById('priceMax').textContent = rounded.toLocaleString();
        rangeEl.style.setProperty('--val', '100%');
      }
    }

    updateHeroStats(ALL_PROPS);
    applyFiltersAndRender();

  } catch (err) {
    console.error(err);
    const grid = listEl();
    if (grid) grid.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">😕</div>
        <h3>Could not load properties</h3>
        <p>Please refresh the page or try again shortly.</p>
      </div>`;
    showToast('Failed to load properties. Please refresh.', 'error');
  }
}

// ============================================================
// HERO STATS
// ============================================================
function updateHeroStats(props) {
  const total    = props.length;
  const avail    = props.filter(p => Number(p.rooms_available) > 0).length;
  const rooms    = props.reduce((sum, p) => sum + (Number(p.rooms_available) || 0), 0);
  const prices   = props.map(p => Number(p.price)).filter(Boolean);
  const minPrice = prices.length ? Math.min(...prices) : 0;

  animateCount('statTotal', total, '');
  animateCount('statAvail', avail, '');
  animateCount('statRooms', rooms, '');

  const fromEl = document.getElementById('statFrom');
  if (fromEl) {
    if (minPrice) {
      animateCount('statFrom', minPrice, 'R');
    } else {
      fromEl.textContent = '—';
    }
  }

  animateCount('aboutTotal', total, '');
  animateCount('aboutRooms', rooms, '');
}

function animateCount(id, target, prefix = '') {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.opacity = '0';
  el.style.transform = 'translateY(8px)';
  el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
  setTimeout(() => {
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';
    const steps = 40;
    const interval = 1200 / steps;
    let step = 0;
    const timer = setInterval(() => {
      step++;
      const eased = 1 - Math.pow(1 - step / steps, 3);
      const current = Math.round(eased * target);
      el.textContent = prefix + current.toLocaleString();
      if (step >= steps) {
        el.textContent = prefix + target.toLocaleString();
        clearInterval(timer);
      }
    }, interval);
  }, 100);
}

// ============================================================
// FILTERS
// ============================================================
function getFilters() {
  const maxPrice = Number(priceRange()?.value || 99999);
  const search   = searchInput()?.value.trim().toLowerCase() || '';
  const mode     = SEARCH_MODE;
  const sort     = sortSelect()?.value || 'newest';

  const roomTypes   = [...document.querySelectorAll('input[name="roomType"]:checked')].map(x => x.value);
  const studTypes   = [...document.querySelectorAll('input[name="studentType"]:checked')].map(x => x.value);
  const fundings    = [...document.querySelectorAll('input[name="funding"]:checked')].map(x => x.value);
  const amenities   = [...document.querySelectorAll('input[name="amenity"]:checked')].map(x => x.value);
  const noDeposit   = document.querySelector('input[name="deposit"][value="NO"]')?.checked;
  const availOnly   = document.querySelector('input[name="availability"][value="available"]')?.checked;

  return { maxPrice, search, mode, sort, roomTypes, studTypes, fundings, amenities, noDeposit, availOnly };
}

function applyFiltersAndRender() {
  const f = getFilters();
  let list = [...ALL_PROPS];

  if (f.search) {
    list = list.filter(p => {
      const field = f.mode === 'location' ? (p.location || '') : (p.title || '');
      return field.toLowerCase().includes(f.search);
    });
  }

  list = list.filter(p => !p.price || Number(p.price) <= f.maxPrice);

  if (f.roomTypes.length) {
    list = list.filter(p => p.room_type && f.roomTypes.includes(p.room_type));
  }

  if (f.studTypes.length) {
    list = list.filter(p => {
      if (!p.student_types) return false;
      return f.studTypes.some(t => p.student_types.includes(t));
    });
  }

  if (f.fundings.length) {
    list = list.filter(p => {
      if (!p.funding_options) return false;
      return f.fundings.some(t => p.funding_options.includes(t));
    });
  }

  if (f.amenities.length) {
    list = list.filter(p => {
      const combined = `${p.amenities || ''} ${p.utilities || ''}`;
      return f.amenities.every(a => combined.includes(a));
    });
  }

  if (f.noDeposit) {
    list = list.filter(p => p.deposit_type === 'NO' || !p.deposit_type);
  }

  if (f.availOnly) {
    list = list.filter(p => Number(p.rooms_available) > 0);
  }

  list = sortList(list, f.sort);
  FILTERED = list;

  const activeCount = [
    f.roomTypes.length, f.studTypes.length, f.fundings.length,
    f.amenities.length, f.noDeposit ? 1 : 0, f.availOnly ? 1 : 0,
    f.maxPrice < Number(priceRange()?.max || 99999) ? 1 : 0,
    f.search ? 1 : 0
  ].reduce((a, b) => a + b, 0);

  const countEl = document.getElementById('activeFilterCount');
  if (countEl) countEl.textContent = activeCount ? `(${activeCount})` : '';

  renderList(list);
}

function sortList(list, mode) {
  switch (mode) {
    case 'price_asc':  return [...list].sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    case 'price_desc': return [...list].sort((a, b) => (Number(b.price) || 0) - (Number(a.price) || 0));
    case 'rooms':      return [...list].sort((a, b) => (Number(b.rooms_available) || 0) - (Number(a.rooms_available) || 0));
    default:           return [...list].sort((a, b) => b.id - a.id);
  }
}

// ============================================================
// RENDER CARDS
// ============================================================
function renderList(list) {
  const grid = listEl();
  const countEl = resultCount();
  if (!grid) return;

  if (countEl) countEl.textContent = list.length;

  if (!list.length) {
    grid.innerHTML = `
      <div class="no-results">
        <div class="no-results-icon">🔍</div>
        <h3>No properties found</h3>
        <p>Try adjusting your filters or search term.</p>
        <button class="btn btn--ghost" style="margin-top:16px" onclick="clearAllFilters()">
          Clear All Filters
        </button>
      </div>`;
    return;
  }

  grid.innerHTML = '';

  list.forEach((p, index) => {
    const images  = p.images ? p.images.split(',').filter(Boolean) : [];
    const mainImg = images[0] || '';
    const isAvail = Number(p.rooms_available) > 0;

    const tags = [
      p.room_type        && { label: p.room_type,        cls: '' },
      p.student_types    && { label: p.student_types,    cls: '' },
      p.funding_options  && { label: p.funding_options,  cls: 'tag--gold' },
      p.deposit_type === 'YES'
        ? { label: `Deposit R${p.deposit_amount}`, cls: '' }
        : { label: 'No Deposit', cls: 'tag--green' },
    ].filter(Boolean);

    const card = document.createElement('div');
    card.className = 'card animate-fade-in-up';
    card.style.animationDelay = `${Math.min(index * 60, 360)}ms`;

    card.innerHTML = `
      <div class="media">
        ${mainImg
          ? `<img src="${mainImg}" alt="${escapeHtml(p.title || '')}" loading="lazy" />`
          : `<div class="media-placeholder">🏠</div>`
        }
        <div class="badge-availability ${isAvail ? 'available' : 'full'}">
          ${isAvail ? 'Available' : 'Full'}
        </div>
        ${images.length > 1 ? `<div class="img-count">📷 ${images.length}</div>` : ''}
      </div>
      <div class="body">
        <h3>${escapeHtml(p.title || 'Untitled')}</h3>
        <div class="location">
          <span></span>
          <span>${escapeHtml(p.location || 'Location not specified')}</span>
        </div>
        <div class="price">
          ${p.price ? `R${Number(p.price).toLocaleString()}` : 'Price on request'}
          ${p.price ? '<span> / month</span>' : ''}
        </div>
        <div class="tags">
          ${tags.map(t => `<span class="tag ${t.cls}">${escapeHtml(t.label)}</span>`).join('')}
          ${isAvail && p.rooms_available
            ? `<span class="tag tag--green"> ${p.rooms_available} room${p.rooms_available > 1 ? 's' : ''} left</span>`
            : ''
          }
        </div>
        <a class="btn btn--primary btn--full" href="/property.html?id=${p.id}" style="margin-top:auto">
          View Details →
        </a>
      </div>
    `;

    grid.appendChild(card);
  });
}

// ============================================================
// SEARCH MODE TOGGLE
// ============================================================
function setSearchMode(mode) {
  SEARCH_MODE = mode;
  const locBtn  = document.getElementById('modeLocation');
  const nameBtn = document.getElementById('modeName');
  if (locBtn && nameBtn) {
    locBtn.className  = 'mode-btn ' + (mode === 'location' ? 'mode-btn--active' : 'mode-btn--inactive');
    nameBtn.className = 'mode-btn ' + (mode === 'name'     ? 'mode-btn--active' : 'mode-btn--inactive');
  }
  const input = document.getElementById('searchInput');
  if (input) {
    input.placeholder = mode === 'location' ? 'Search by location...' : 'Search by house name...';
    input.value = '';
  }
  applyFiltersAndRender();
}

// ============================================================
// CLEAR SEARCH
// ============================================================
function clearSearch() {
  const input = document.getElementById('searchInput');
  if (input) input.value = '';
  applyFiltersAndRender();
}

// ============================================================
// CLEAR FILTERS
// ============================================================
function clearAllFilters() {
  const si = searchInput();
  if (si) si.value = '';

  document.querySelectorAll('.filter-sidebar input[type="checkbox"]')
    .forEach(cb => cb.checked = false);

  const pr = priceRange();
  if (pr) {
    pr.value = pr.max;
    pr.style.setProperty('--val', '100%');
    const maxEl = document.getElementById('priceMax');
    if (maxEl) maxEl.textContent = Number(pr.max).toLocaleString();
  }

  const ss = sortSelect();
  if (ss) ss.value = 'newest';

  applyFiltersAndRender();
}

// ============================================================
// HELPERS
// ============================================================
function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ============================================================
// EVENT LISTENERS
// ============================================================
document.addEventListener('DOMContentLoaded', () => {

  document.getElementById('searchBtn')?.addEventListener('click', () => {
    applyFiltersAndRender();
  });

  document.getElementById('searchInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') { applyFiltersAndRender(); }
  });

  document.getElementById('searchInput')?.addEventListener('input', function() {
    applyFiltersAndRender();
  });

  document.getElementById('sortSelect')?.addEventListener('change', applyFiltersAndRender);

  document.querySelectorAll('.filter-sidebar input[type="checkbox"]')
    .forEach(cb => cb.addEventListener('change', applyFiltersAndRender));

  document.getElementById('clearFilters')?.addEventListener('click', clearAllFilters);

  const pr = priceRange();
  if (pr) {
    pr.addEventListener('input', () => {
      const val = Number(pr.value);
      const max = Number(pr.max);
      document.getElementById('priceMax').textContent = val.toLocaleString();
      pr.style.setProperty('--val', `${(val / max) * 100}%`);
      applyFiltersAndRender();
    });
  }

  loadProperties();
});