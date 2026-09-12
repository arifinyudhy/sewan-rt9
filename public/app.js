let authToken = localStorage.getItem('authToken') || '';
let isAdmin = !!authToken;
let assets = [];
let pendingAction = null;

// ===== AUTH =====
function updateAuthUI() {
  const badge = document.getElementById('user-badge');
  const label = document.getElementById('user-label');
  const btnAuth = document.getElementById('btn-auth');
  const btnLogout = document.getElementById('btn-logout');
  const mobileLabel = document.getElementById('mobile-user-label');
  const mobileBtnAuth = document.getElementById('mobile-btn-auth');
  const mobileBtnLogout = document.getElementById('mobile-btn-logout');

  if (isAdmin) {
    badge.className = 'user-badge admin';
    label.textContent = 'Admin';
    btnAuth.classList.add('hidden');
    btnLogout.classList.remove('hidden');
    if (mobileLabel) mobileLabel.textContent = 'Admin';
    if (mobileBtnAuth) mobileBtnAuth.classList.add('hidden');
    if (mobileBtnLogout) mobileBtnLogout.classList.remove('hidden');
  } else {
    badge.className = 'user-badge guest';
    label.textContent = 'Tamu';
    btnAuth.classList.remove('hidden');
    btnLogout.classList.add('hidden');
    if (mobileLabel) mobileLabel.textContent = 'Tamu';
    if (mobileBtnAuth) mobileBtnAuth.classList.remove('hidden');
    if (mobileBtnLogout) mobileBtnLogout.classList.add('hidden');
  }

  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });
}

function showLoginModal(action) {
  pendingAction = action || null;
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-modal').classList.add('show');
  document.getElementById('login-user').focus();
}

function closeLoginModal() {
  document.getElementById('login-modal').classList.remove('show');
  pendingAction = null;
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('login-user').value;
  const password = document.getElementById('login-pass').value;
  document.getElementById('login-error').textContent = '';

  const res = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await res.json();

  if (data.success) {
    authToken = data.token;
    isAdmin = true;
    localStorage.setItem('authToken', authToken);
    closeLoginModal();
    updateAuthUI();
    if (pendingAction === 'asset') showAssetModal();
    else if (pendingAction === 'rental') showRentalModal();
    pendingAction = null;
  } else {
    document.getElementById('login-error').textContent = data.error;
  }
});

function requireAdmin(action) {
  if (isAdmin) {
    if (action === 'asset') showAssetModal();
    else if (action === 'rental') showRentalModal();
  } else {
    showLoginModal(action);
  }
}

function logout() {
  authToken = '';
  isAdmin = false;
  localStorage.removeItem('authToken');
  updateAuthUI();
  loadAssets();
  loadRentals();
  loadDashboard();
}

function authHeaders() {
  return authToken
    ? { 'Authorization': 'Basic ' + authToken, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

// ===== NAVIGATION =====
document.querySelectorAll('.nav-item').forEach(link => {
  link.addEventListener('click', e => {
    e.preventDefault();
    document.querySelectorAll('.nav-item').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    link.classList.add('active');
    document.getElementById('page-' + link.dataset.page).classList.add('active');
    if (link.dataset.page === 'dashboard') loadDashboard();
    if (link.dataset.page === 'assets') loadAssets();
    if (link.dataset.page === 'rentals') loadRentals();
  });
});

// ===== DASHBOARD =====
async function loadDashboard() {
  const [dashRes, assetsRes] = await Promise.all([
    fetch('/api/dashboard'),
    fetch('/api/assets')
  ]);
  const d = await dashRes.json();
  const dashAssets = await assetsRes.json();

  document.getElementById('stat-assets').textContent = d.total_assets;
  document.getElementById('stat-stock').textContent = d.total_stock;
  document.getElementById('stat-active').textContent = d.active_rentals;
  document.getElementById('stat-revenue').textContent = 'Rp ' + (d.total_all_revenue).toLocaleString('id-ID');

  const grid = document.getElementById('dashboard-assets');
  if (dashAssets.length === 0) {
    grid.innerHTML = '<div class="empty-state" style="padding:24px"><p>Belum ada aset</p></div>';
  } else {
    grid.innerHTML = dashAssets.map(a => `
      <div class="asset-item">
        <div class="asset-item-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        </div>
        <div class="asset-item-info">
          <div class="asset-item-name">${a.name}</div>
          <div class="asset-item-stock">Stok: <strong>${a.stock}</strong></div>
          <div class="asset-item-price">Rp ${a.price_per_day.toLocaleString('id-ID')}/hari</div>
        </div>
      </div>
    `).join('');
  }
}

// ===== ASSETS =====
async function loadAssets() {
  const res = await fetch('/api/assets');
  assets = await res.json();
  const tbody = document.getElementById('assets-table');
  const cards = document.getElementById('assets-cards');
  const empty = document.getElementById('assets-empty');

  if (assets.length === 0) {
    tbody.innerHTML = '';
    cards.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = assets.map(a => `
    <tr>
      <td><strong>${a.name}</strong></td>
      <td>${a.stock}</td>
      <td>Rp ${a.price_per_day.toLocaleString('id-ID')}</td>
      <td class="admin-only" style="${isAdmin ? '' : 'display:none'}">
        <button class="btn btn-sm btn-ghost" onclick="editAsset(${a.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteAsset(${a.id})">Hapus</button>
      </td>
    </tr>
  `).join('');

  cards.innerHTML = assets.map(a => `
    <div class="data-card">
      <div class="data-card-header">
        <div class="data-card-title">${a.name}</div>
      </div>
      <div class="data-card-body">
        <div class="data-card-field"><span class="field-label">Stok</span><span class="field-value">${a.stock}</span></div>
        <div class="data-card-field"><span class="field-label">Harga/Hari</span><span class="field-value">Rp ${a.price_per_day.toLocaleString('id-ID')}</span></div>
      </div>
      ${isAdmin ? `
      <div class="data-card-actions">
        <button class="btn btn-sm btn-ghost" onclick="editAsset(${a.id})">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteAsset(${a.id})">Hapus</button>
      </div>` : ''}
    </div>
  `).join('');
}

function showAssetModal(asset = null) {
  document.getElementById('asset-modal-title').textContent = asset ? 'Edit Aset' : 'Tambah Aset';
  document.getElementById('asset-id').value = asset ? asset.id : '';
  document.getElementById('asset-name').value = asset ? asset.name : '';
  document.getElementById('asset-stock').value = asset ? asset.stock : '';
  document.getElementById('asset-price').value = asset ? asset.price_per_day : '';
  document.getElementById('asset-modal').classList.add('show');
}

function closeAssetModal() {
  document.getElementById('asset-modal').classList.remove('show');
}

function editAsset(id) {
  if (!isAdmin) return requireAdmin('asset');
  const a = assets.find(x => x.id === id);
  if (a) showAssetModal(a);
}

async function saveAsset() {
  const id = document.getElementById('asset-id').value;
  const data = {
    name: document.getElementById('asset-name').value,
    stock: parseInt(document.getElementById('asset-stock').value) || 0,
    price_per_day: parseInt(document.getElementById('asset-price').value) || 0
  };
  if (!data.name) return alert('Nama aset wajib diisi');

  if (id) {
    await fetch('/api/assets/' + id, { method: 'PUT', headers: authHeaders(), body: JSON.stringify(data) });
  } else {
    await fetch('/api/assets', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) });
  }
  closeAssetModal();
  loadAssets();
}

async function deleteAsset(id) {
  if (!isAdmin) return requireAdmin('asset');
  if (!confirm('Hapus aset ini?')) return;
  await fetch('/api/assets/' + id, { method: 'DELETE', headers: authHeaders() });
  loadAssets();
}

// ===== RENTALS =====
async function loadRentals() {
  const res = await fetch('/api/rentals');
  const rentals = await res.json();
  const tbody = document.getElementById('rentals-table');
  const cards = document.getElementById('rentals-cards');
  const empty = document.getElementById('rentals-empty');

  if (rentals.length === 0) {
    tbody.innerHTML = '';
    cards.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  tbody.innerHTML = rentals.map(r => `
    <tr>
      <td><strong>${r.tenant_name}</strong>${r.tenant_phone ? '<br><span style="color:var(--text-muted);font-size:12px">' + r.tenant_phone + '</span>' : ''}</td>
      <td>${r.asset_name || '-'}</td>
      <td>${r.quantity}</td>
      <td>${r.start_date}</td>
      <td>${r.end_date}</td>
      <td>
        <strong>Rp ${r.total_cost.toLocaleString('id-ID')}</strong>
        ${isAdmin ? '<br><button class="btn btn-sm btn-ghost" onclick="editCost(' + r.id + ',' + r.total_cost + ')" style="padding:2px 6px;font-size:11px;margin-top:2px">Ubah</button>' : ''}
      </td>
      <td>${r.is_rt9 ? '<span class="badge badge-rt9">RT9</span>' : '-'}</td>
      <td><span class="badge badge-${r.status === 'active' ? 'active' : 'returned'}">${r.status === 'active' ? 'Aktif' : 'Selesai'}</span></td>
      <td class="admin-only" style="${isAdmin ? '' : 'display:none'}">
        ${r.status === 'active' ? '<button class="btn btn-sm btn-success" onclick="returnRental(' + r.id + ')">Kembali</button> ' : ''}
        <button class="btn btn-sm btn-danger" onclick="deleteRental(${r.id})">Hapus</button>
      </td>
    </tr>
  `).join('');

  cards.innerHTML = rentals.map(r => `
    <div class="data-card">
      <div class="data-card-header">
        <div class="data-card-title">${r.tenant_name}${r.tenant_phone ? ' <span style="font-weight:400;font-size:12px;color:var(--text-muted)">(' + r.tenant_phone + ')</span>' : ''}</div>
        <span class="badge badge-${r.status === 'active' ? 'active' : 'returned'}">${r.status === 'active' ? 'Aktif' : 'Selesai'}</span>
      </div>
      <div class="data-card-body">
        <div class="data-card-field"><span class="field-label">Aset</span><span class="field-value">${r.asset_name || '-'}</span></div>
        <div class="data-card-field"><span class="field-label">Qty</span><span class="field-value">${r.quantity}</span></div>
        <div class="data-card-field"><span class="field-label">Tgl Sewa</span><span class="field-value">${r.start_date}</span></div>
        <div class="data-card-field"><span class="field-label">Tgl Kembali</span><span class="field-value">${r.end_date}</span></div>
        <div class="data-card-field"><span class="field-label">Biaya</span><span class="field-value">Rp ${r.total_cost.toLocaleString('id-ID')}${isAdmin ? ' <button class="btn btn-sm btn-ghost" onclick="editCost(' + r.id + ',' + r.total_cost + ')" style="padding:1px 5px;font-size:10px;vertical-align:middle">Ubah</button>' : ''}</span></div>
        <div class="data-card-field"><span class="field-label">Ket</span><span class="field-value">${r.is_rt9 ? '<span class="badge badge-rt9">RT9</span>' : '-'}</span></div>
      </div>
      ${isAdmin ? `
      <div class="data-card-actions">
        ${r.status === 'active' ? '<button class="btn btn-sm btn-success" onclick="returnRental(' + r.id + ')">Kembali</button>' : ''}
        <button class="btn btn-sm btn-danger" onclick="deleteRental(${r.id})">Hapus</button>
      </div>` : ''}
    </div>
  `).join('');
}

async function loadAssetsForSelect() {
  const res = await fetch('/api/assets');
  assets = await res.json();
  const sel = document.getElementById('rental-asset');
  sel.innerHTML = assets.map(a =>
    `<option value="${a.id}" data-price="${a.price_per_day}" data-stock="${a.stock}">${a.name} (Stok: ${a.stock}, Rp ${a.price_per_day.toLocaleString('id-ID')}/hari)</option>`
  ).join('');
}

function showRentalModal() {
  loadAssetsForSelect();
  document.getElementById('rental-name').value = '';
  document.getElementById('rental-phone').value = '';
  document.getElementById('rental-qty').value = 1;
  document.getElementById('rental-start').value = new Date().toISOString().split('T')[0];
  document.getElementById('rental-end').value = '';
  document.getElementById('rental-rt9').checked = false;
  document.getElementById('rental-custom-cost').value = '';
  document.getElementById('rt9-cost-group').classList.add('hidden');
  document.getElementById('cost-preview').textContent = '';
  document.getElementById('rental-modal').classList.add('show');
  updateCostPreview();
}

function closeRentalModal() {
  document.getElementById('rental-modal').classList.remove('show');
}

// RT9 checkbox
document.getElementById('rental-rt9').addEventListener('change', function () {
  const group = document.getElementById('rt9-cost-group');
  if (this.checked) {
    group.classList.remove('hidden');
    document.getElementById('rental-custom-cost').value = '';
  } else {
    group.classList.add('hidden');
  }
  updateCostPreview();
});

function updateCostPreview() {
  const isRt9 = document.getElementById('rental-rt9').checked;
  const preview = document.getElementById('cost-preview');

  if (isRt9) {
    const custom = parseInt(document.getElementById('rental-custom-cost').value) || 0;
    preview.textContent = custom > 0 ? `Biaya Sukarela: Rp ${custom.toLocaleString('id-ID')}` : 'Masukkan biaya sukarela';
    return;
  }

  const sel = document.getElementById('rental-asset');
  if (!sel || !sel.options[sel.selectedIndex]) return;
  const opt = sel.options[sel.selectedIndex];
  const price = parseInt(opt.dataset.price) || 0;
  const qty = parseInt(document.getElementById('rental-qty').value) || 1;
  const start = document.getElementById('rental-start').value;
  const end = document.getElementById('rental-end').value;
  if (start && end) {
    const days = Math.max(1, Math.ceil((new Date(end) - new Date(start)) / 86400000) + 1);
    const total = price * qty * days;
    preview.textContent = `${days} hari x ${qty} item x Rp ${price.toLocaleString('id-ID')} = Rp ${total.toLocaleString('id-ID')}`;
  } else {
    preview.textContent = '';
  }
}

document.getElementById('rental-asset')?.addEventListener('change', updateCostPreview);
document.getElementById('rental-qty')?.addEventListener('input', updateCostPreview);
document.getElementById('rental-start')?.addEventListener('change', updateCostPreview);
document.getElementById('rental-end')?.addEventListener('change', updateCostPreview);
document.getElementById('rental-custom-cost')?.addEventListener('input', updateCostPreview);

async function saveRental() {
  const isRt9 = document.getElementById('rental-rt9').checked;
  const data = {
    tenant_name: document.getElementById('rental-name').value,
    tenant_phone: document.getElementById('rental-phone').value,
    asset_id: parseInt(document.getElementById('rental-asset').value),
    quantity: parseInt(document.getElementById('rental-qty').value) || 1,
    start_date: document.getElementById('rental-start').value,
    end_date: document.getElementById('rental-end').value,
    is_rt9: isRt9,
    custom_cost: isRt9 ? (parseInt(document.getElementById('rental-custom-cost').value) || 0) : 0
  };
  if (!data.tenant_name) return alert('Nama penyewa wajib diisi');
  if (!data.start_date || !data.end_date) return alert('Tanggal wajib diisi');
  if (new Date(data.end_date) < new Date(data.start_date)) return alert('Tanggal selesai harus setelah tanggal mulai');
  if (isRt9 && data.custom_cost <= 0) return alert('Isi nominal biaya sukarela');

  const res = await fetch('/api/rentals', { method: 'POST', headers: authHeaders(), body: JSON.stringify(data) });
  const result = await res.json();
  if (result.error) return alert(result.error);
  closeRentalModal();
  loadRentals();
}

function editCost(id, current) {
  if (!isAdmin) return requireAdmin('rental');
  document.getElementById('cost-rental-id').value = id;
  document.getElementById('cost-edit-value').value = current;
  document.getElementById('cost-modal').classList.add('show');
}

function closeCostModal() {
  document.getElementById('cost-modal').classList.remove('show');
}

async function saveCostEdit() {
  const id = document.getElementById('cost-rental-id').value;
  const cost = parseInt(document.getElementById('cost-edit-value').value) || 0;
  await fetch('/api/rentals/' + id + '/cost', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ total_cost: cost }) });
  closeCostModal();
  loadRentals();
}

async function returnRental(id) {
  if (!isAdmin) return requireAdmin('rental');
  if (!confirm('Tandai sudah dikembalikan?')) return;
  await fetch('/api/rentals/' + id + '/return', { method: 'PUT', headers: authHeaders() });
  loadRentals();
}

async function deleteRental(id) {
  if (!isAdmin) return requireAdmin('rental');
  if (!confirm('Hapus catatan sewa ini?')) return;
  await fetch('/api/rentals/' + id, { method: 'DELETE', headers: authHeaders() });
  loadRentals();
}

// ===== PDF =====
function downloadPDF() {
  const start = document.getElementById('report-start').value;
  const end = document.getElementById('report-end').value;
  let url = '/api/report/pdf?';
  if (start) url += 'start=' + start + '&';
  if (end) url += 'end=' + end;
  window.open(url, '_blank');
}

// ===== INIT =====
updateAuthUI();
loadDashboard();
