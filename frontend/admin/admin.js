// ============================================================
//  StudentAccomo 2.0 — admin.js
//  All alerts replaced with toasts
//  All confirms replaced with inline confirmations
//  Inquiry cards & property table use new CSS classes
// ============================================================

const TOKEN = () => localStorage.getItem('admin_token');

// ============================================================
//  TOAST SYSTEM
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
//  CONFIRM DIALOG (replaces window.confirm)
// ============================================================
function showConfirm(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;
    display:flex;align-items:center;justify-content:center;padding:20px;
    animation:fadeIn 0.2s ease;
  `;

  overlay.innerHTML = `
    <div style="
      background:#fff;border-radius:16px;padding:28px 28px 24px;
      max-width:380px;width:100%;box-shadow:0 24px 60px rgba(0,0,0,0.2);
      animation:fadeInUp 0.25s ease;text-align:center;
    ">
      <div style="font-size:36px;margin-bottom:12px;">🗑️</div>
      <h3 style="font-size:17px;font-weight:700;margin-bottom:8px;color:#0d0f1a;">Are you sure?</h3>
      <p style="font-size:14px;color:#6b7280;margin-bottom:24px;line-height:1.6;">${message}</p>
      <div style="display:flex;gap:10px;">
        <button id="confirmCancel" style="
          flex:1;padding:11px;border:1.5px solid #e5e7eb;border-radius:8px;
          background:#fff;font-size:14px;font-weight:600;cursor:pointer;
          font-family:inherit;color:#374151;transition:all 180ms;
        ">Cancel</button>
        <button id="confirmOk" style="
          flex:1;padding:11px;border:none;border-radius:8px;
          background:#e84f3f;color:#fff;font-size:14px;font-weight:700;
          cursor:pointer;font-family:inherit;transition:all 180ms;
        ">Delete</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';

  overlay.querySelector('#confirmCancel').addEventListener('click', () => {
    document.body.style.overflow = '';
    overlay.remove();
  });

  overlay.querySelector('#confirmOk').addEventListener('click', () => {
    document.body.style.overflow = '';
    overlay.remove();
    onConfirm();
  });

  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      document.body.style.overflow = '';
      overlay.remove();
    }
  });
}

// ============================================================
//  LOGOUT
// ============================================================
function logout() {
  localStorage.removeItem('admin_token');
  location.href = '/admin-login.html';
}

// ============================================================
//  DUPLICATE CHECK
// ============================================================
async function checkDuplicateProperty() {
  const title  = document.getElementById('title')?.value;
  const loc    = document.getElementById('location')?.value;
  const rooms  = document.getElementById('rooms_available')?.value;
  const warn   = document.getElementById('dupWarning');
  const btn    = document.getElementById('saveBtn');
  const token  = TOKEN();

  if (!title || !loc || !rooms || !token) {
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

    if (data.exists && !window.editPropertyId) {
      warn.style.display = 'block';
      warn.innerText = '⚠️ A property with this title, location and room count already exists.';
      btn.disabled = true;
    } else {
      warn.style.display = 'none';
      btn.disabled = false;
    }
  } catch (err) {
    console.error(err);
  }
}

['title', 'location', 'rooms_available'].forEach(id => {
  document.addEventListener('input', e => {
    if (e.target.id === id) checkDuplicateProperty();
  });
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
            <th>#</th>
            <th>Title</th>
            <th>Location</th>
            <th>Price</th>
            <th>Rooms</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody id="propTbody"><tr><td colspan="7" style="text-align:center;padding:24px;color:#9ca3af;">Loading...</td></tr></tbody>
      </table>
    </div>`;

  try {
    const res  = await fetch('/properties');
    if (!res.ok) throw new Error('fetch failed');
    const list = await res.json();
    const tbody = document.getElementById('propTbody');

    function renderTable(data) {
      if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:#9ca3af;">No properties yet. Add one above.</td></tr>';
        return;
      }

      tbody.innerHTML = '';
      data.forEach((p, i) => {
        const available = Number(p.rooms_available) > 0;
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="color:#9ca3af;font-size:12px;">#${p.id}</td>
          <td style="font-weight:600;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.title || '—'}</td>
          <td style="font-size:13px;color:#6b7280;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.location || '—'}</td>
          <td style="font-weight:600;color:#e84f3f;">${p.price ? 'R' + Number(p.price).toLocaleString() : '—'}</td>
          <td style="font-weight:600;">${p.rooms_available ?? '—'}</td>
          <td>
            <span style="
              display:inline-flex;align-items:center;gap:5px;
              padding:4px 10px;border-radius:99px;font-size:11px;font-weight:700;
              background:${available ? '#dcfce7' : '#fee2e2'};
              color:${available ? '#16a34a' : '#dc2626'};
            ">
              <span style="width:6px;height:6px;border-radius:50%;background:currentColor;${available ? 'animation:pulse-badge 2s infinite' : ''}"></span>
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

      // Edit buttons
      document.querySelectorAll('.editBtn').forEach(b => {
        b.addEventListener('click', () => editProperty(b.dataset.id, list));
      });

      // Delete buttons
      document.querySelectorAll('.delBtn').forEach(b => {
        b.addEventListener('click', () => {
          const prop = list.find(x => String(x.id) === String(b.dataset.id));
          showConfirm(`This will permanently delete <strong>${prop?.title || 'this property'}</strong> and all its images.`, async () => {
            const token = TOKEN();
            if (!token) { showToast('Not logged in', 'error'); return; }
            const r = await fetch(`/properties/${b.dataset.id}`, {
              method: 'DELETE',
              headers: { Authorization: 'Bearer ' + token }
            });
            if (r.ok) {
              showToast('Property deleted successfully', 'success');
              loadAdminProperties();
            } else {
              showToast('Failed to delete property', 'error');
            }
          });
        });
      });
    }

    renderTable(list);

    // Live search
    document.getElementById('propSearch')?.addEventListener('input', function () {
      const q = this.value.toLowerCase();
      renderTable(list.filter(p =>
        (p.title || '').toLowerCase().includes(q) ||
        (p.location || '').toLowerCase().includes(q)
      ));
    });

  } catch (err) {
    console.error(err);
    document.getElementById('propTbody').innerHTML =
      '<tr><td colspan="7" style="text-align:center;padding:24px;color:#e84f3f;">Failed to load properties.</td></tr>';
    showToast('Failed to load properties', 'error');
  }
};

// ============================================================
//  EDIT PROPERTY — populate form
// ============================================================
async function editProperty(id, cachedList) {
  try {
    let p = cachedList?.find(x => String(x.id) === String(id));
    if (!p) {
      const r = await fetch(`/properties/${id}`);
      if (!r.ok) { showToast('Failed to load property', 'error'); return; }
      p = await r.json();
    }

    window.editPropertyId = id;
    document.getElementById('formTitle').innerText = '✏️ Edit Property';
    document.getElementById('formArea').scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Basic fields
    ['title','location','price','description','rooms_available','walking_time','six_month_rooms'].forEach(fid => {
      const el = document.getElementById(fid);
      if (el) el.value = p[fid] || '';
    });

    document.getElementById('distance_km').value    = p.distance_from_campus || '';
    document.getElementById('room_type').value      = p.room_type || '';
    document.getElementById('deposit_type').value   = p.deposit_type || 'NO';
    document.getElementById('deposit_amount').value = p.deposit_amount || '';
    document.getElementById('lease_term').value     = p.lease_terms || '10';

    restoreCheckbox('transport',     p.transport_options);
    restoreCheckbox('security',      p.security_features);
    restoreCheckbox('amenities',     p.amenities);
    restoreCheckbox('utilities',     p.utilities);
    restoreCheckbox('room_includes', p.room_includes);

    const stSel = document.getElementById('student_types');
    if (stSel) Array.from(stSel.options).forEach(opt =>
      opt.selected = p.student_types?.split(',').map(s => s.trim()).includes(opt.value)
    );

    const fSel = document.getElementById('funding_options');
    if (fSel) Array.from(fSel.options).forEach(opt =>
      opt.selected = p.funding_options?.split(',').map(s => s.trim()).includes(opt.value)
    );

    showToast('Property loaded for editing', 'default');

  } catch (err) {
    console.error(err);
    showToast('Error loading property', 'error');
  }
}

// ============================================================
//  SAVE PROPERTY
// ============================================================
async function saveProperty() {
  const token = TOKEN();
  if (!token) { showToast('You must be logged in', 'error'); return; }

  const btn = document.getElementById('saveBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

  const fd = new FormData();

  ['title','location','price','description','room_type',
   'deposit_type','deposit_amount','rooms_available',
   'distance_km','walking_time','lease_term','six_month_rooms'
  ].forEach(id => fd.append(id, document.getElementById(id)?.value || ''));

  fd.append('student_types',    collectSelect('student_types'));
  fd.append('funding_options',  collectSelect('funding_options'));
  fd.append('transport_options',collectChecks('transport'));
  fd.append('security_features',collectChecks('security'));
  fd.append('amenities',        collectChecks('amenities'));
  fd.append('utilities',        collectChecks('utilities'));
  fd.append('room_includes',    collectChecks('room_includes'));

  const files = document.getElementById('images')?.files;
  if (files) for (let i = 0; i < files.length; i++) fd.append('images', files[i]);

  try {
    const url    = window.editPropertyId ? `/properties/${window.editPropertyId}` : '/properties';
    const method = window.editPropertyId ? 'PUT' : 'POST';

    const res  = await fetch(url, {
      method,
      headers: { Authorization: 'Bearer ' + token },
      body: fd
    });
    const data = await res.json();

    if (res.ok) {
      showToast(window.editPropertyId ? 'Property updated successfully!' : 'Property added successfully!', 'success');
      document.getElementById('propertyForm')?.reset();
      document.getElementById('formTitle').innerText = 'Add Property';
      window.editPropertyId = null;
      loadAdminProperties();
    } else {
      showToast(data.message || 'Failed to save property', 'error');
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
    const res  = await fetch('/admin/inquiries', {
      headers: { Authorization: 'Bearer ' + token }
    });
    if (!res.ok) throw new Error('fetch failed');
    const list = await res.json();

    const countBadge = document.getElementById('inqCountBadge');
    if (countBadge) countBadge.textContent = `${list.length} total`;

    function renderInquiries(data) {
      const cards = document.getElementById('inqCards');
      if (!data.length) {
        cards.innerHTML = `
          <div style="text-align:center;padding:48px 20px;color:#9ca3af;">
            <div style="font-size:40px;margin-bottom:12px;">📭</div>
            <p style="font-weight:600;">No inquiries yet</p>
            <p style="font-size:13px;">When students submit inquiries they'll appear here.</p>
          </div>`;
        return;
      }

      const statusColors = {
        'NEW':               { bg: '#eff6ff', color: '#2563eb', border: '#bfdbfe' },
        'CONTACTED':         { bg: '#fefce8', color: '#ca8a04', border: '#fde68a' },
        'VIEWING SCHEDULED': { bg: '#f5f3ff', color: '#7c3aed', border: '#ddd6fe' },
        'PLACED':            { bg: '#f0fdf4', color: '#16a34a', border: '#bbf7d0' },
        'LOST':              { bg: '#fef2f2', color: '#dc2626', border: '#fecaca' },
      };

      cards.innerHTML = '';
      data.forEach(inq => {
        const sc = statusColors[inq.status] || statusColors['NEW'];
        const card = document.createElement('div');
        card.className = 'inq-card';
        card.dataset.id = inq.id;
        card.innerHTML = `
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
            <div>
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                <strong style="font-size:16px;">${inq.name || '—'}</strong>
                <span style="
                  padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;
                  background:${sc.bg};color:${sc.color};border:1px solid ${sc.border};
                ">${inq.status || 'NEW'}</span>
              </div>
              <div style="margin-top:5px;font-size:13px;color:#6b7280;">
                ${inq.email || ''} &nbsp;·&nbsp; ${inq.phone || ''}
              </div>
            </div>
            <div style="font-size:12px;color:#9ca3af;font-weight:600;">#${inq.id}</div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">
            <div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:8px;padding:10px 12px;">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;margin-bottom:3px;">Property</div>
              <div style="font-size:13px;font-weight:600;color:#0d0f1a;">${inq.house || 'Not specified'}</div>
            </div>
            <div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:8px;padding:10px 12px;">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;margin-bottom:3px;">Preferred Contact</div>
              <div style="font-size:13px;font-weight:600;color:#0d0f1a;">${inq.preferred_contact || 'N/A'}</div>
            </div>
          </div>

          ${inq.message ? `
          <div style="background:#f9fafb;border:1px solid #f3f4f6;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:13px;color:#374151;line-height:1.6;">
            <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#9ca3af;display:block;margin-bottom:4px;">Message</span>
            ${inq.message}
          </div>` : ''}

          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <select class="statusSel" data-id="${inq.id}" style="
              flex:1;min-width:160px;padding:8px 12px;
              border:1.5px solid #e5e7eb;border-radius:8px;
              font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;
              background:#fff;
            ">
              ${['NEW','CONTACTED','VIEWING SCHEDULED','PLACED','LOST'].map(s =>
                `<option value="${s}" ${inq.status === s ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
            <button class="updateStatusBtn btn btn--primary" data-id="${inq.id}" style="padding:8px 16px;font-size:13px;white-space:nowrap;">
              Save
            </button>
            ${inq.preferred_contact === 'whatsapp' || inq.phone ? `
            <a href="https://wa.me/${(inq.phone || '').replace(/\D/g,'').replace(/^0/,'27')}?text=${encodeURIComponent(`Hi ${inq.name}, this is StudentAccomo following up on your inquiry about ${inq.house || 'a property'}.`)}"
               target="_blank" rel="noopener"
               style="
                 padding:8px 14px;background:#25d366;color:#fff;border-radius:8px;
                 font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap;
                 display:inline-flex;align-items:center;gap:5px;
               ">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </a>` : ''}
            <button class="deleteInqBtn" data-id="${inq.id}" style="
              padding:8px 12px;background:#fee2e2;color:#dc2626;
              border:1px solid #fca5a5;border-radius:8px;
              font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;
              white-space:nowrap;
            ">🗑️</button>
          </div>`;

        document.getElementById('inqCards').appendChild(card);
      });

      // Save status
      document.querySelectorAll('.updateStatusBtn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id     = btn.dataset.id;
          const select = document.querySelector(`.statusSel[data-id="${id}"]`);
          const status = select.value;

          const r = await fetch(`/admin/inquiries/${id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + token
            },
            body: JSON.stringify({ status })
          });

          if (r.ok) {
            showToast(`Status updated to ${status}`, 'success');
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
              method: 'DELETE',
              headers: { Authorization: 'Bearer ' + token }
            });
            if (r.ok) {
              showToast('Inquiry deleted', 'success');
              loadAdminInquiries();
            } else {
              showToast('Failed to delete inquiry', 'error');
            }
          });
        });
      });
    }

    renderInquiries(list);

    // Live search
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
    document.getElementById('inqCards').innerHTML =
      '<p style="color:#e84f3f;padding:20px;">Failed to load inquiries.</p>';
    showToast('Failed to load inquiries', 'error');
  }
};

// ============================================================
//  HELPERS
// ============================================================
function collectChecks(name) {
  return [...document.querySelectorAll(`input[name="${name}"]:checked`)]
    .map(x => x.value).join(',');
}

function restoreCheckbox(name, val) {
  if (!val) return;
  const arr = val.split(',').map(x => x.trim());
  document.querySelectorAll(`input[name="${name}"]`).forEach(cb => {
    cb.checked = arr.includes(cb.value);
  });
}

function collectSelect(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  return [...el.selectedOptions].map(o => o.value).join(',');
}

// ============================================================
//  INIT
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('listArea'))  loadAdminProperties();
  if (document.getElementById('inqList'))   loadAdminInquiries();
});