// ============================================================
//  StudentAccomo 2.0 — admin.js
// ============================================================

const TOKEN = () => localStorage.getItem('admin_token');

// ============================================================
//  TOAST
// ============================================================
function showToast(msg, type = 'default', duration = 3500) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.id = 'toastContainer';
    document.body.appendChild(container);
  }
  const icons = { success: '✅', error: '❌', warning: '⚠️', default: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${icons[type] || icons.default}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ============================================================
//  CONFIRM DIALOG
// ============================================================
function showConfirm(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;`;
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:16px;padding:28px;max-width:380px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,0.2);text-align:center;">
      <div style="font-size:36px;margin-bottom:12px;">🗑️</div>
      <h3 style="font-size:17px;font-weight:700;margin-bottom:8px;color:#0d0f1a;">Are you sure?</h3>
      <p style="font-size:14px;color:#6b7280;margin-bottom:24px;line-height:1.6;">${message}</p>
      <div style="display:flex;gap:10px;">
        <button id="confirmCancel" style="flex:1;padding:11px;border:1.5px solid #e5e7eb;border-radius:8px;background:#fff;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;">Cancel</button>
        <button id="confirmOk" style="flex:1;padding:11px;border:none;border-radius:8px;background:#e84f3f;color:#fff;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;">Delete</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
  const close = () => { document.body.style.overflow = ''; overlay.remove(); };
  overlay.querySelector('#confirmCancel').addEventListener('click', close);
  overlay.querySelector('#confirmOk').addEventListener('click', () => { close(); onConfirm(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

// ============================================================
//  LOGOUT
// ============================================================
function logout() {
  localStorage.removeItem('admin_token');
  location.href = '/admin-login.html';
}

// ============================================================
//  HELPERS — FIX: restoreCheckbox now ALWAYS unchecks first
// ============================================================
function collectChecks(name) {
  const checked = [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(x => x.value);
  return checked.length ? checked.join(',') : '';
}

function restoreCheckbox(name, val) {
  // ALWAYS uncheck all first — this was the bug causing stuck checkboxes
  document.querySelectorAll(`input[name="${name}"]`).forEach(cb => { cb.checked = false; });
  if (!val) return;
  const arr = val.split(',').map(x => x.trim()).filter(Boolean);
  document.querySelectorAll(`input[name="${name}"]`).forEach(cb => {
    cb.checked = arr.includes(cb.value.trim());
  });
}

function collectSelect(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  return [...el.selectedOptions].map(o => o.value).join(',');
}

// ============================================================
//  RESET FORM FULLY — FIX: proper full reset including checkboxes
// ============================================================
function resetPropertyForm() {
  const form = document.getElementById('propertyForm');
  if (form) form.reset();

  // form.reset() doesn't always uncheck custom checkboxes — force it
  ['transport','security','amenities','utilities','room_includes'].forEach(name => {
    document.querySelectorAll(`input[name="${name}"]`).forEach(cb => { cb.checked = false; });
  });

  // Reset multi-selects
  ['student_types','funding_options'].forEach(id => {
    const el = document.getElementById(id);
    if (el) Array.from(el.options).forEach(o => { o.selected = false; });
  });

  document.getElementById('formTitle').innerText = 'Add Property';
  const warn = document.getElementById('dupWarning');
  if (warn) warn.style.display = 'none';
  const btn = document.getElementById('saveBtn');
  if (btn) { btn.disabled = false; btn.textContent = 'Save Property'; }
  window.editPropertyId = null;
}

// ============================================================
//  DUPLICATE CHECK
// ============================================================
async function checkDuplicateProperty() {
  const title = document.getElementById('title')?.value;
  const loc   = document.getElementById('location')?.value;
  const rooms = document.getElementById('rooms_available')?.value;
  const warn  = document.getElementById('dupWarning');
  const btn   = document.getElementById('saveBtn');
  const token = TOKEN();

  if (!title || !loc || !rooms || !token || window.editPropertyId) {
    if (warn) warn.style.display = 'none';
    if (btn)  btn.disabled = false;
    return;
  }

  try {
    const res  = await fetch('/admin/properties/check-duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify({ title, location: loc, rooms_available: rooms })
    });
    const data = await res.json();
    if (data.exists) {
      warn.style.display = 'block';
      warn.innerText = '⚠️ A property with this title, location and room count already exists.';
      btn.disabled = true;
    } else {
      warn.style.display = 'none';
      btn.disabled = false;
    }
  } catch (err) { console.error(err); }
}

['title','location','rooms_available'].forEach(id => {
  document.addEventListener('input', e => { if (e.target.id === id) checkDuplicateProperty(); });
});

// ============================================================
//  LOAD PROPERTIES TABLE
// ============================================================
window.loadAdminProperties = async () => {
  const area = document.getElementById('listArea');
  if (!area) return;

  area.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap;">
      <input id="propSearch" placeholder="🔍 Search properties..." style="flex:1;min-width:200px;padding:9px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;font-family:inherit;" />
    </div>
    <div class="admin-table-wrap">
      <table class="table" id="propTable">
        <thead>
          <tr>
            <th>#</th><th>Title</th><th>Location</th><th>Price</th><th>Rooms</th><th>Status</th><th>Actions</th>
          </tr>
        </thead>
        <tbody id="propTbody"><tr><td colspan="7" style="text-align:center;padding:24px;color:#9ca3af;">Loading...</td></tr></tbody>
      </table>
    </div>`;

  try {
    const res  = await fetch('/properties');
    if (!res.ok) throw new Error('fetch failed');
    const list = await res.json();

    function renderTable(data) {
      const tbody = document.getElementById('propTbody');
      if (!tbody) return;
      if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#9ca3af;">No properties yet. Add one above.</td></tr>';
        return;
      }
      tbody.innerHTML = '';
      data.forEach(p => {
        const available = Number(p.rooms_available) > 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="color:#9ca3af;font-size:12px;">#${p.id}</td>
          <td style="font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.title || '—'}</td>
          <td style="font-size:13px;color:#6b7280;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.location || '—'}</td>
          <td style="font-weight:600;color:#e84f3f;">${p.price ? 'R' + Number(p.price).toLocaleString() : '—'}</td>
          <td style="font-weight:600;">${p.rooms_available ?? '—'}</td>
          <td>
            <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:99px;font-size:11px;font-weight:700;background:${available ? '#dcfce7' : '#fee2e2'};color:${available ? '#16a34a' : '#dc2626'};">
              <span style="width:6px;height:6px;border-radius:50%;background:currentColor;"></span>
              ${available ? 'Available' : 'Full'}
            </span>
          </td>
          <td>
            <div style="display:flex;gap:6px;">
              <button class="btn btn--ghost editBtn" data-id="${p.id}" style="padding:6px 12px;font-size:12px;">✏️ Edit</button>
              <button class="btn delBtn" data-id="${p.id}" style="padding:6px 12px;font-size:12px;background:#fee2e2;color:#dc2626;border-color:#fca5a5;">🗑️</button>
            </div>
          </td>`;
        tbody.appendChild(tr);
      });

      document.querySelectorAll('.editBtn').forEach(b => {
        b.addEventListener('click', () => editProperty(b.dataset.id, list));
      });

      document.querySelectorAll('.delBtn').forEach(b => {
        b.addEventListener('click', () => {
          const prop = list.find(x => String(x.id) === String(b.dataset.id));
          showConfirm(`This will permanently delete <strong>${prop?.title || 'this property'}</strong> and all its images.`, async () => {
            const token = TOKEN();
            if (!token) { showToast('Not logged in', 'error'); return; }
            const r = await fetch(`/properties/${b.dataset.id}`, {
              method: 'DELETE', headers: { Authorization: 'Bearer ' + token }
            });
            if (r.ok) { showToast('Property deleted', 'success'); loadAdminProperties(); }
            else showToast('Failed to delete property', 'error');
          });
        });
      });
    }

    renderTable(list);

    document.getElementById('propSearch')?.addEventListener('input', function () {
      const q = this.value.toLowerCase();
      renderTable(list.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.location || '').toLowerCase().includes(q)
      ));
    });

  } catch (err) {
    console.error(err);
    const tbody = document.getElementById('propTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#e84f3f;">Failed to load properties.</td></tr>';
    showToast('Failed to load properties', 'error');
  }
};

// ============================================================
//  EDIT PROPERTY — FIX: always fetches fresh from server
// ============================================================
async function editProperty(id) {
  try {
    // Always fetch fresh from server — never use stale cached data
    const r = await fetch(`/properties/${id}`);
    if (!r.ok) { showToast('Failed to load property', 'error'); return; }
    const p = await r.json();

    window.editPropertyId = id;
    document.getElementById('formTitle').innerText = '✏️ Edit Property';

    // Scroll to form
    document.getElementById('formArea')?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // FIX: reset form fully first so nothing old lingers
    resetPropertyForm();
    window.editPropertyId = id; // set again after reset clears it

    // Set basic text inputs
    const fieldMap = {
      'title':           p.title,
      'location':        p.location,
      'price':           p.price,
      'description':     p.description,
      'rooms_available': p.rooms_available,
      'walking_time':    p.walking_time,
      'six_month_rooms': p.six_month_rooms,
      'distance_km':     p.distance_from_campus,
      'deposit_amount':  p.deposit_amount,
    };
    Object.entries(fieldMap).forEach(([fid, val]) => {
      const el = document.getElementById(fid);
      if (el) el.value = val ?? '';
    });

    // Selects
    const roomTypeEl = document.getElementById('room_type');
    if (roomTypeEl) roomTypeEl.value = p.room_type || '';

    const depositEl = document.getElementById('deposit_type');
    if (depositEl) depositEl.value = p.deposit_type || 'NO';

    const leaseEl = document.getElementById('lease_term');
    if (leaseEl) leaseEl.value = p.lease_terms || '10';

    // FIX: restoreCheckbox now unchecks everything first before re-checking
    restoreCheckbox('transport',     p.transport_options);
    restoreCheckbox('security',      p.security_features);
    restoreCheckbox('amenities',     p.amenities);
    restoreCheckbox('utilities',     p.utilities);
    restoreCheckbox('room_includes', p.room_includes);

    // Multi-selects
    const stSel = document.getElementById('student_types');
    if (stSel && p.student_types) {
      const arr = p.student_types.split(',').map(s => s.trim());
      Array.from(stSel.options).forEach(opt => { opt.selected = arr.includes(opt.value); });
    }

    const fSel = document.getElementById('funding_options');
    if (fSel && p.funding_options) {
      const arr = p.funding_options.split(',').map(s => s.trim());
      Array.from(fSel.options).forEach(opt => { opt.selected = arr.includes(opt.value); });
    }

    showToast(`Editing: ${p.title}`, 'default');

  } catch (err) {
    console.error(err);
    showToast('Error loading property', 'error');
  }
}

// ============================================================
//  SAVE PROPERTY — FIX: proper FormData + reset after save
// ============================================================
async function saveProperty() {
  const token = TOKEN();
  if (!token) { showToast('You must be logged in', 'error'); return; }

  // Basic validation
  const title = document.getElementById('title')?.value?.trim();
  const loc   = document.getElementById('location')?.value?.trim();
  const rooms = document.getElementById('rooms_available')?.value?.trim();

  if (!title) { showToast('Title is required', 'warning'); return; }
  if (!loc)   { showToast('Location is required', 'warning'); return; }
  if (!rooms) { showToast('Rooms available is required', 'warning'); return; }

  const btn = document.getElementById('saveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  const fd = new FormData();

  // Text fields
  [
    'title','location','price','description','room_type',
    'deposit_type','deposit_amount','rooms_available',
    'distance_km','walking_time','lease_term','six_month_rooms'
  ].forEach(id => {
    const el = document.getElementById(id);
    fd.append(id, el?.value ?? '');
  });

  // Checkboxes & selects
  fd.append('student_types',     collectSelect('student_types'));
  fd.append('funding_options',   collectSelect('funding_options'));
  fd.append('transport_options', collectChecks('transport'));
  fd.append('security_features', collectChecks('security'));
  fd.append('amenities',         collectChecks('amenities'));
  fd.append('utilities',         collectChecks('utilities'));
  fd.append('room_includes',     collectChecks('room_includes'));

  // Images
  const files = document.getElementById('images')?.files;
  if (files) for (let i = 0; i < files.length; i++) fd.append('images', files[i]);

  try {
    const isEdit = !!window.editPropertyId;
    const url    = isEdit ? `/properties/${window.editPropertyId}` : '/properties';
    const method = isEdit ? 'PUT' : 'POST';

    const res  = await fetch(url, {
      method,
      headers: { Authorization: 'Bearer ' + token },
      body: fd
    });

    let data = {};
    try { data = await res.json(); } catch(e) {}

    if (res.ok) {
      showToast(isEdit ? '✅ Property updated!' : '✅ Property added!', 'success');
      resetPropertyForm(); // FIX: use proper full reset
      loadAdminProperties();
    } else {
      showToast(data.message || data.error || 'Failed to save property', 'error');
    }

  } catch (err) {
    console.error(err);
    showToast('Server error. Please try again.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Save Property'; }
  }
}

// ============================================================
//  LOAD INQUIRIES
// ============================================================
window.loadAdminInquiries = async () => {
  const token = TOKEN();
  if (!token) { showToast('Not logged in', 'error'); return; }

  const area = document.getElementById('inqList');
  if (!area) return;

  area.innerHTML = `
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;">
      <input id="inqSearch" placeholder="🔍 Search by name, email or property..." style="flex:1;min-width:200px;padding:9px 14px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;font-family:inherit;" />
    </div>
    <div id="inqCards"></div>`;

  try {
    const res  = await fetch('/admin/inquiries', { headers: { Authorization: 'Bearer ' + token } });
    if (!res.ok) throw new Error('fetch failed');
    const list = await res.json();

    const countBadge = document.getElementById('inqCountBadge');
    if (countBadge) countBadge.textContent = `${list.length} total`;

    const STATUS_COLORS = {
      'NEW':               { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
      'CONTACTED':         { bg: '#fefce8', color: '#ca8a04', border: '#fde68a' },
      'VIEWING SCHEDULED': { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' },
      'PLACED':            { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
      'LOST':              { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
    };

    function renderInquiries(data) {
      const cards = document.getElementById('inqCards');
      if (!cards) return;
      if (!data.length) {
        cards.innerHTML = `<div style="text-align:center;padding:48px 20px;color:#9ca3af;"><div style="font-size:40px;margin-bottom:12px;">📭</div><p style="font-weight:600;">No inquiries yet</p></div>`;
        return;
      }
      cards.innerHTML = '';
      data.forEach(inq => {
        const sc = STATUS_COLORS[inq.status] || STATUS_COLORS['NEW'];
        const card = document.createElement('div');
        card.className = 'inq-card';
        card.dataset.id = inq.id;

        // Build WhatsApp link — convert local 0XX to 27XX
        const rawPhone  = (inq.phone || '').replace(/\D/g, '');
        const waPhone   = rawPhone.startsWith('0') ? '27' + rawPhone.slice(1) : rawPhone;
        const waMsg     = encodeURIComponent(`Hi ${inq.name}, this is StudentAccomo following up on your inquiry about ${inq.house || 'a property'}.`);
        const waLink    = waPhone.length >= 10 ? `https://wa.me/${waPhone}?text=${waMsg}` : null;

        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
            <div>
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <strong style="font-size:16px;">${inq.name || '—'}</strong>
                <span style="padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;background:${sc.bg};color:${sc.color};border:1px solid ${sc.border};">${inq.status || 'NEW'}</span>
              </div>
              <div style="margin-top:5px;font-size:13px;color:#6b7280;">${inq.email || ''} · ${inq.phone || ''}</div>
            </div>
            <div style="font-size:12px;color:#9ca3af;font-weight:600;">#${inq.id}</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            <div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:8px;padding:10px 12px;">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;margin-bottom:3px;">Property</div>
              <div style="font-size:13px;font-weight:600;">${inq.house || 'Not specified'}</div>
            </div>
            <div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:8px;padding:10px 12px;">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;margin-bottom:3px;">Preferred Contact</div>
              <div style="font-size:13px;font-weight:600;">${inq.preferred_contact || 'N/A'}</div>
            </div>
          </div>

          ${inq.message ? `<div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:#374151;line-height:1.6;"><span style="font-size:10px;font-weight:700;text-transform:uppercase;color:#9ca3af;display:block;margin-bottom:4px;">Message</span>${inq.message}</div>` : ''}

          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select class="statusSel" data-id="${inq.id}" style="flex:1;min-width:160px;padding:8px 12px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;background:#fff;">
              ${['NEW','CONTACTED','VIEWING SCHEDULED','PLACED','LOST'].map(s =>
                `<option value="${s}" ${inq.status === s ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
            <button class="updateStatusBtn btn btn--primary" data-id="${inq.id}" style="padding:8px 16px;font-size:13px;white-space:nowrap;">Save</button>
            ${waLink ? `<a href="${waLink}" target="_blank" rel="noopener" style="padding:8px 14px;background:#25d366;color:#fff;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap;display:inline-flex;align-items:center;gap:5px;">📱 WhatsApp</a>` : ''}
            <button class="deleteInqBtn" data-id="${inq.id}" style="padding:8px 12px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;white-space:nowrap;">🗑️</button>
          </div>`;

        cards.appendChild(card);
      });

      // Save status
      document.querySelectorAll('.updateStatusBtn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id     = btn.dataset.id;
          const select = document.querySelector(`.statusSel[data-id="${id}"]`);
          const r = await fetch(`/admin/inquiries/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
            body: JSON.stringify({ status: select.value })
          });
          if (r.ok) {
            showToast(`Status updated to ${select.value}`, 'success');
            btn.textContent = '✓ Saved';
            setTimeout(() => btn.textContent = 'Save', 2000);
          } else {
            showToast('Failed to update status', 'error');
          }
        });
      });

      // Delete
      document.querySelectorAll('.deleteInqBtn').forEach(btn => {
        btn.addEventListener('click', () => {
          const inq = list.find(x => String(x.id) === String(btn.dataset.id));
          showConfirm(`Delete inquiry from <strong>${inq?.name || 'this student'}</strong>? This cannot be undone.`, async () => {
            const r = await fetch(`/admin/inquiries/${btn.dataset.id}`, {
              method: 'DELETE', headers: { Authorization: 'Bearer ' + token }
            });
            if (r.ok) { showToast('Inquiry deleted', 'success'); loadAdminInquiries(); }
            else showToast('Failed to delete', 'error');
          });
        });
      });
    }

    renderInquiries(list);

    document.getElementById('inqSearch')?.addEventListener('input', function () {
      const q = this.value.toLowerCase();
      renderInquiries(list.filter(i =>
        (i.name || '').toLowerCase().includes(q) ||
        (i.email || '').toLowerCase().includes(q) ||
        (i.house || '').toLowerCase().includes(q) ||
        (i.phone || '').toLowerCase().includes(q)
      ));
    });

  } catch (err) {
    console.error(err);
    const cards = document.getElementById('inqCards');
    if (cards) cards.innerHTML = '<p style="color:#e84f3f;padding:20px;">Failed to load inquiries.</p>';
    showToast('Failed to load inquiries', 'error');
  }
};

// ============================================================
//  INIT
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('listArea')) loadAdminProperties();
  if (document.getElementById('inqList'))  loadAdminInquiries();

  // Cancel button
  document.getElementById('cancelBtn')?.addEventListener('click', () => {
    resetPropertyForm();
    showToast('Cancelled', 'default');
  });

  // Form submit
  document.getElementById('propertyForm')?.addEventListener('submit', e => {
    e.preventDefault();
    saveProperty();
  });
});