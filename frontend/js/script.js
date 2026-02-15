// load all properties and render with search
let PROPS = [];

async function loadProperties() {
  try {
    const res = await fetch('/properties');
    PROPS = await res.json();
    renderList(PROPS);
  } catch (err) {
    console.error(err);
    document.getElementById('property-list').innerHTML = '<p>Failed to load properties.</p>';
  }
}

function renderList(list){
  const container = document.getElementById('property-list');
  container.innerHTML = '';
  if (!list.length) { container.innerHTML = '<p>No properties found.</p>'; return; }

  list.forEach(p => {
    const images = p.images ? p.images.split(',') : [];
    const main = images.length ? images[0] : '';

    const card = document.createElement('div'); card.className = 'card';
    card.innerHTML = `
      <div class="media">${ main ? `<img src="${main}" alt="${p.title}" />` : '' }</div>
      <div class="body">
        <h3>${p.title}</h3>
        <div class="muted">${p.location || ''}</div>
        <div class="price">${p.price ? 'R' + p.price + ' / Month' : ''}</div>
        <div class="tags">
          ${ p.room_type ? `<span class="tag">${p.room_type}</span>` : '' }
          ${ p.student_types ? `<span class="tag">${p.student_types}</span>` : '' }
          ${ p.funding_options ? `<span class="tag">${p.funding_options}</span>` : '' }
          ${ p.deposit_type === 'YES'
              ? `<span class="tag">Deposit: R${p.deposit_amount}</span>`
              : `<span class="tag">No Deposit</span>` }
          ${ p.rooms_available !== null && p.rooms_available !== undefined
              ? `<span class="tag">${p.rooms_available} Rooms Left</span>` 
              : '' }
        </div>
        <div style="margin-top:12px;">
          <a class="button" href="/property.html?id=${p.id}">View Details</a>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

document.getElementById('searchBtn').addEventListener('click', () => {
  const mode = document.getElementById('searchMode').value;
  const q = document.getElementById('searchInput').value.trim().toLowerCase();
  if (!q) { renderList(PROPS); return; }

  const filtered = PROPS.filter(p => {
    if (mode === 'location') return (p.location || '').toLowerCase().includes(q);
    return (p.title || '').toLowerCase().includes(q);
  });
  renderList(filtered);
});

document.getElementById('clearBtn').addEventListener('click', () => {
  document.getElementById('searchInput').value = '';
  renderList(PROPS);
});

// initial load
loadProperties();
