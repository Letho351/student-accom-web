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

    // edit handlers
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
        const stSel = document.getElementById('student_types');
        Array.from(stSel.options).forEach(opt => opt.selected = p.student_types?.split(',').map(s => s.trim()).includes(opt.text));
        const fSel = document.getElementById('funding_options');
        Array.from(fSel.options).forEach(opt => opt.selected = p.funding_options?.split(',').map(s => s.trim()).includes(opt.text));
      });
    });

    // delete handlers
    document.querySelectorAll('.delBtn').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('Delete property?')) return;
        const id = b.dataset.id;
        const token = TOKEN();
        if (!token) return alert('Not logged in');
        const resp = await fetch(`/properties/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token }});
        if (resp.ok) loadAdminProperties();
        else alert('Delete failed');
      });
    });
  } catch (err) {
    console.error(err);
    const area = document.getElementById('listArea');
    if (area) area.innerText = 'Failed to load properties';
  }
};

// Save (add or update) property
async function saveProperty() {
  const token = TOKEN();
  if (!token) return alert('You must be logged in');
  const fd = new FormData();
  fd.append('title', document.getElementById('title').value);
  fd.append('location', document.getElementById('location').value);
  fd.append('price', document.getElementById('price').value);
  fd.append('description', document.getElementById('description').value);
  fd.append('room_type', document.getElementById('room_type').value);
  fd.append('deposit_type', document.getElementById('deposit_type').value);
  fd.append('deposit_amount', document.getElementById('deposit_amount').value);
  fd.append('rooms_available', document.getElementById('rooms_available').value);

  const st = Array.from(document.getElementById('student_types').selectedOptions).map(o => o.text).join(',');
  fd.append('student_types', st);
  const f = Array.from(document.getElementById('funding_options').selectedOptions).map(o => o.text).join(',');
  fd.append('funding_options', f);

  const files = document.getElementById('images').files;
  for (let i=0;i<files.length;i++) fd.append('images', files[i]);

  try {
    let res;
    if (window.editPropertyId) {
      res = await fetch(`/properties/${window.editPropertyId}`, { method: 'PUT', headers: { Authorization: 'Bearer ' + token }, body: fd });
    } else {
      res = await fetch('/properties', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
    }
    const data = await res.json();
    document.getElementById('propMsg').innerText = data.message || (res.ok ? 'Saved' : 'Error');
    document.getElementById('formArea').style.display = 'none';
    window.editPropertyId = null;
    loadAdminProperties();
  } catch (err) {
    console.error(err);
    document.getElementById('propMsg').innerText = 'Error saving';
  }
}

document.addEventListener('click', (ev) => {
  if (ev.target?.id === 'saveBtn') saveProperty();
});

// ---------------- Inquiries management ----------------
window.loadAdminInquiries = async () => {
  const token = TOKEN();
  if (!token) {
    const area = document.getElementById('inqList') || document.getElementById('listArea');
    if (area) area.innerText = 'Not logged in';
    return;
  }

  try {
    const res = await fetch('/admin/inquiries', { headers: { Authorization: 'Bearer ' + token }});
    if (!res.ok) throw new Error('Failed to fetch inquiries');
    const list = await res.json();

    const container = document.getElementById('inqList');
    container.innerHTML = '';
    list.forEach(i => {
      const card = document.createElement('div');
      card.className = 'card';
      card.style.marginBottom = '8px';
      card.innerHTML = `
        <div style="padding:12px">
          <div><strong>${i.name || '(no name)'}</strong> — <span class="small">${i.email || ''} • ${i.phone || ''}</span></div>
          <div class="muted small">Property: ${i.house || ''} • ${i.created_at ? new Date(i.created_at).toLocaleString() : ''}</div>
          <div style="margin-top:8px">${i.message || ''}</div>
          <div style="margin-top:8px">
            <select data-id="${i.id}" class="statusSel">
              <option ${i.status==='New'?'selected':''}>New</option>
              <option ${i.status==='CONTACTED'?'selected':''}>CONTACTED</option>
              <option ${i.status==='VIEWING SCHEDULED'?'selected':''}>VIEWING SCHEDULED</option>
              <option ${i.status==='PLACED'?'selected':''}>PLACED</option>
              <option ${i.status==='LOST'?'selected':''}>LOST</option>
            </select>
            <button data-id="${i.id}" class="saveStatusBtn">Save</button>
            <button data-id="${i.id}" class="delInquiryBtn">Delete</button>
          </div>
        </div>
      `;
      container.appendChild(card);
    });

    // save status buttons
    document.querySelectorAll('.saveStatusBtn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const sel = document.querySelector(`select[data-id="${id}"]`);
        const status = sel.value;
        await fetch(`/admin/inquiries/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
          body: JSON.stringify({ status })
        });
        btn.innerText = 'Saved';
        setTimeout(() => btn.innerText = 'Save', 1000);
        await loadAdminInquiries();
      });
    });

    // delete inquiry buttons
    document.querySelectorAll('.delInquiryBtn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this inquiry?')) return;
        const id = btn.dataset.id;
        const res = await fetch(`/admin/inquiries/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token }});
        if (res.ok) await loadAdminInquiries();
        else alert('Delete failed');
      });
    });

  } catch (err) {
    console.error(err);
    const container = document.getElementById('inqList');
    if (container) container.innerText = 'Failed to load inquiries';
  }
};

// ---------------- Overview ----------------
window.loadOverview = async () => {
  const token = TOKEN();
  if (!token) return;
  try {
    const res = await fetch('/admin/inquiries', { headers: { Authorization: 'Bearer ' + token }});
    if (!res.ok) return;
    const list = await res.json();
    const el = document.getElementById('overview');
    if (el) el.innerText = `Total inquiries: ${list.length} • New: ${list.filter(i => i.status === 'New').length}`;
  } catch (err) {
    console.error(err);
  }
};

window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('overview')) loadOverview();
  if (document.getElementById('listArea')) loadAdminProperties();
  if (document.getElementById('inqList')) loadAdminInquiries();
});
