// frontend/admin/admin.js
const TOKEN = () => localStorage.getItem('admin_token');

async function logout() {
  localStorage.removeItem('admin_token');
  location.href = '/admin-login.html';
}

// Sidebar menu behaviour
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.admin-sidebar .menu-item').forEach(mi => {
    mi.addEventListener('click', () => {
      document.querySelectorAll('.admin-sidebar .menu-item').forEach(x => x.classList.remove('active'));
      mi.classList.add('active');
      const href = mi.dataset.href;
      if (href) location.href = href;
    });
  });
});

// ---------------- 🔒 LIVE DUPLICATE CHECK ----------------
async function checkDuplicateProperty() {
  const title = document.getElementById('title')?.value;
  const location = document.getElementById('location')?.value;
  const rooms = document.getElementById('rooms_available')?.value;
  const warn = document.getElementById('dupWarning');
  const btn = document.getElementById('saveBtn');
  const token = TOKEN();

  if (!title || !location || !rooms || !token) {
    if (warn) warn.style.display = 'none';
    if (btn) btn.disabled = false;
    return;
  }

  try {
    const res = await fetch('/admin/properties/check-duplicate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + token
      },
      body: JSON.stringify({
        title,
        location,
        rooms_available: rooms
      })
    });

    const data = await res.json();

    if (data.exists && !window.editPropertyId) {
      warn.style.display = 'block';
      warn.innerText = 'Property already exists';
      btn.disabled = true;
    } else {
      warn.style.display = 'none';
      btn.disabled = false;
    }
  } catch (err) {
    console.error(err);
  }
}

// listen while typing
['title', 'location', 'rooms_available'].forEach(id => {
  document.addEventListener('input', (e) => {
    if (e.target.id === id) checkDuplicateProperty();
  });
});

// ---------------- Properties management ----------------
window.loadAdminProperties = async () => {
  try {
    const res = await fetch('/properties');
    if (!res.ok) throw new Error('Failed fetching properties');
    const list = await res.json();
    const area = document.getElementById('listArea');
    if (!area) return;
    area.innerHTML = '<table class="table"><tr><th>Title</th><th>Location</th><th>Price</th><th></th></tr></table>';
    const table = area.querySelector('.table');

    list.forEach(p => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${p.title || ''}</td>
                      <td>${p.location || ''}</td>
                      <td>${p.price ? 'R' + p.price : 'N/A'}</td>
                      <td>
                        <button class="editBtn" data-id="${p.id}">Edit</button>
                        <button class="delBtn" data-id="${p.id}">Delete</button>
                      </td>`;
      table.appendChild(tr);
    });

    document.querySelectorAll('.editBtn').forEach(b => {
      b.addEventListener('click', async () => {
        const id = b.dataset.id;
        const r = await fetch(`/properties/${id}`);
        if (!r.ok) return alert('Failed to load property');
        const p = await r.json();
        window.editPropertyId = id;

        document.getElementById('formArea').style.display = 'block';
        document.getElementById('formTitle').innerText = 'Edit Property';

        document.getElementById('title').value = p.title || '';
        document.getElementById('location').value = p.location || '';
        document.getElementById('price').value = p.price || '';
        document.getElementById('description').value = p.description || '';
        document.getElementById('room_type').value = p.room_type || '';
        document.getElementById('deposit_type').value = p.deposit_type || 'NO';
        document.getElementById('deposit_amount').value = p.deposit_amount || '';
        document.getElementById('rooms_available').value = p.rooms_available || '';

        document.getElementById('distance_km').value = p.distance_km || '';
        document.getElementById('walking_time').value = p.walking_time || '';
        document.getElementById('lease_term').value = p.lease_term || '10';
        document.getElementById('six_month_rooms').value = p.six_month_rooms || '';

        restoreCheckbox('transport', p.transport);
        restoreCheckbox('security', p.security);
        restoreCheckbox('amenities', p.amenities);
        restoreCheckbox('utilities', p.utilities);
        restoreCheckbox('room_includes', p.room_includes);

        const stSel = document.getElementById('student_types');
        Array.from(stSel.options).forEach(opt =>
          opt.selected = p.student_types?.split(',').map(s => s.trim()).includes(opt.text)
        );

        const fSel = document.getElementById('funding_options');
        Array.from(fSel.options).forEach(opt =>
          opt.selected = p.funding_options?.split(',').map(s => s.trim()).includes(opt.text)
        );
      });
    });

    document.querySelectorAll('.delBtn').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('Delete property?')) return;
        const id = b.dataset.id;
        const token = TOKEN();
        if (!token) return alert('Not logged in');
        const resp = await fetch(`/properties/${id}`, {
          method: 'DELETE',
          headers: { Authorization: 'Bearer ' + token }
        });
        if (resp.ok) loadAdminProperties();
        else alert('Delete failed');
      });
    });
  } catch (err) {
    console.error(err);
  }
};

// Save property
async function saveProperty() {
  const token = TOKEN();
  if (!token) return alert('You must be logged in');

  const fd = new FormData();

  [
    'title','location','price','description','room_type',
    'deposit_type','deposit_amount','rooms_available',
    'distance_km','walking_time','lease_term','six_month_rooms'
  ].forEach(id => fd.append(id, document.getElementById(id)?.value || ''));

  fd.append('student_types', collectSelect('student_types'));
  fd.append('funding_options', collectSelect('funding_options'));

  fd.append('transport', collectChecks('transport'));
  fd.append('security', collectChecks('security'));
  fd.append('amenities', collectChecks('amenities'));
  fd.append('utilities', collectChecks('utilities'));
  fd.append('room_includes', collectChecks('room_includes'));

  const files = document.getElementById('images').files;
  for (let i = 0; i < files.length; i++) fd.append('images', files[i]);

  try {
    const url = window.editPropertyId ? `/properties/${window.editPropertyId}` : '/properties';
    const method = window.editPropertyId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { Authorization: 'Bearer ' + token },
      body: fd
    });

    const data = await res.json();
    document.getElementById('propMsg').innerText = data.message || (res.ok ? 'Saved' : 'Error');
    document.getElementById('formArea').style.display = 'none';
    window.editPropertyId = null;
    loadAdminProperties();

  } catch (err) {
    console.error(err);
  }
}

// Helpers
function collectChecks(name){
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)]
          .map(x=>x.value).join(',');
}

function restoreCheckbox(name, val){
  if(!val) return;
  const arr = val.split(',').map(x=>x.trim());
  document.querySelectorAll(`input[name="${name}"]`).forEach(cb=>{
    cb.checked = arr.includes(cb.value);
  });
}

function collectSelect(id){
  return [...document.getElementById(id).selectedOptions].map(o=>o.text).join(',');
}

// ---------------- INIT ----------------
window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('listArea')) loadAdminProperties();
});