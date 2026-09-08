// GANTI DENGAN URL WEB APP DARI GOOGLE APPS SCRIPT ANDA
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxvKLMDVAJatI0y-03NJK50lJ6-WUs1II54pH5oitkeHs4bC5G82cpxWXFTyI5zOC3c/exec';

let menuList = [];
let cart = [];
let currentCategory = 'Semua';
let isOwnerMode = false;
let savedOwnerPin = '';

window.addEventListener('DOMContentLoaded', () => {
  loadMenu();
  loadHistory();
  document.getElementById('reportDate').value = new Date().toISOString().split('T')[0];
});

function switchView(viewName) {
  ['menu', 'cart', 'history', 'owner'].forEach(v => {
    const el = document.getElementById(`view${v.charAt(0).toUpperCase() + v.slice(1)}`);
    const btn = document.getElementById(`tab-${v}-btn`);
    if (el) el.style.display = (v === viewName) ? 'block' : 'none';
    if (btn) btn.classList.toggle('active', v === viewName);
  });

  if (viewName === 'history') loadHistory();
  if (viewName === 'owner') loadReport();
}

async function loadMenu() {
  const container = document.getElementById('menuContainer');
  try {
    const res = await fetch(`${GAS_API_URL}?action=getMenu`);
    const result = await res.json();
    if (result.status === 'SUCCESS') {
      menuList = result.data;
      renderMenu();
    } else {
      container.innerHTML = `<div class="col-12 text-center text-danger py-4">${result.message}</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div class="col-12 text-center text-muted py-4">Gagal koneksi. Periksa URL API di app.js</div>`;
  }
}

function renderMenu() {
  const container = document.getElementById('menuContainer');
  const term = document.getElementById('searchBox').value.toLowerCase();

  const filtered = menuList.filter(item => {
    const matchCat = (currentCategory === 'Semua') || (item.kategori === currentCategory);
    const matchTerm = item.nama.toLowerCase().includes(term) || item.varian.toLowerCase().includes(term);
    return matchCat && matchTerm;
  });

  if (!filtered.length) {
    container.innerHTML = `<div class="col-12 text-center text-muted py-4">Menu tidak ditemukan</div>`;
    return;
  }

  container.innerHTML = filtered.map(item => `
    <div class="col-6 col-md-4 col-lg-3">
      <div class="card card-menu h-100 p-2 shadow-sm" onclick="addToCart('${item.id}')">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="badge bg-secondary badge-varian">${item.varian}</span>
          <small class="text-muted">Stok: ${item.stok}</small>
        </div>
        <h6 class="fw-bold mb-1 text-truncate" style="font-size: 0.95rem;">${item.nama}</h6>
        <div class="text-primary fw-bold small">Rp ${item.harga.toLocaleString('id-ID')}</div>
      </div>
    </div>
  `).join('');
}

function filterCategory(cat) {
  currentCategory = cat;
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.classList.toggle('btn-dark', btn.innerText.includes(cat));
    btn.classList.toggle('btn-outline-secondary', !btn.innerText.includes(cat));
  });
  renderMenu();
}

function filterMenu() {
  renderMenu();
}

function addToCart(id) {
  const item = menuList.find(m => m.id === id);
  if (!item) return;

  const exists = cart.find(c => c.id === id);
  if (exists) {
    exists.qty++;
    exists.subtotal = exists.qty * exists.harga;
  } else {
    cart.push({ ...item, qty: 1, subtotal: item.harga, notes: '' });
  }
  updateCartUI();
}

function updateCartUI() {
  const container = document.getElementById('cartList');
  const totalEl = document.getElementById('grandTotal');
  const badge = document.getElementById('cartCountBadge');
  const bar = document.getElementById('mobileCartBar');
  const barTotal = document.getElementById('mobileBarTotal');
  const barQty = document.getElementById('mobileBarQty');

  const totalQty = cart.reduce((acc, c) => acc + c.qty, 0);
  const totalBayar = cart.reduce((acc, c) => acc + c.subtotal, 0);

  badge.innerText = totalQty;
  barQty.innerText = totalQty;
  totalEl.innerText = 'Rp ' + totalBayar.toLocaleString('id-ID');
  barTotal.innerText = 'Rp ' + totalBayar.toLocaleString('id-ID');

  bar.style.display = totalQty > 0 ? 'block' : 'none';

  if (!cart.length) {
    container.innerHTML = `<div class="text-center text-muted py-4 small">Keranjang masih kosong</div>`;
    return;
  }

  container.innerHTML = cart.map((c, i) => `
    <div class="d-flex justify-content-between align-items-center py-2 border-bottom small">
      <div>
        <div class="fw-bold">${c.nama} (${c.varian})</div>
        <div class="text-muted">${c.qty}x @ Rp ${c.harga.toLocaleString('id-ID')}</div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="fw-semibold">Rp ${c.subtotal.toLocaleString('id-ID')}</span>
        <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="removeItem(${i})">&minus;</button>
      </div>
    </div>
  `).join('');
}

function removeItem(idx) {
  if (cart[idx].qty > 1) {
    cart[idx].qty--;
    cart[idx].subtotal = cart[idx].qty * cart[idx].harga;
  } else {
    cart.splice(idx, 1);
  }
  updateCartUI();
}

async function processCheckout() {
  if (!cart.length) return alert('Keranjang masih kosong!');
  const btn = document.getElementById('btnCheckout');
  btn.disabled = true;
  btn.innerText = 'Memproses...';

  const payload = {
    shift: document.querySelector('input[name="shiftOpt"]:checked').value,
    isOvertime: document.getElementById('checkLembur').checked,
    customerName: document.getElementById('custName').value.trim() || 'Walk-in',
    tableNumber: document.getElementById('tableNo').value.trim() || '-',
    paymentMethod: document.getElementById('payMethod').value,
    totalAmount: cart.reduce((acc, c) => acc + c.subtotal, 0),
    items: cart,
    cashier: isOwnerMode ? 'Owner' : 'Kasir'
  };

  try {
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'submitOrder', payload })
    });
    const result = await res.json();
    if (result.status === 'SUCCESS') {
      alert(`Pesanan Sukses! ID: ${result.orderId}`);
      cart = [];
      document.getElementById('custName').value = '';
      document.getElementById('tableNo').value = '';
      updateCartUI();
      switchView('menu');
      loadMenu();
    } else {
      alert('Gagal: ' + result.message);
    }
  } catch (err) {
    alert('Koneksi bermasalah: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = 'Selesaikan Pesanan';
  }
}

async function loadHistory() {
  const container = document.getElementById('historyList');
  try {
    const res = await fetch(`${GAS_API_URL}?action=getHistory&limit=25`);
    const result = await res.json();
    if (result.status === 'SUCCESS') {
      if (!result.data.length) {
        container.innerHTML = `<div class="text-center py-4 text-muted small">Belum ada transaksi hari ini</div>`;
        return;
      }
      container.innerHTML = result.data.map(o => `
        <div class="list-group-item d-flex justify-content-between align-items-center py-2 small">
          <div>
            <span class="fw-bold">${o.id}</span> <span class="badge bg-light text-dark">${o.jam}</span>
            <div class="text-muted">Meja: ${o.meja} | ${o.pelanggan} (${o.shift}${o.lembur ? ' + Lembur' : ''})</div>
          </div>
          <div class="text-end">
            <div class="fw-bold text-success">Rp ${o.total.toLocaleString('id-ID')}</div>
            <span class="badge bg-secondary">${o.metode}</span>
          </div>
        </div>
      `).join('');
    }
  } catch (e) {
    container.innerHTML = `<div class="text-center py-4 text-danger small">Gagal memuat riwayat</div>`;
  }
}

function toggleRoleModal() {
  const modal = new bootstrap.Modal(document.getElementById('pinModal'));
  modal.show();
}

async function submitOwnerPin() {
  const pin = document.getElementById('inputPin').value;
  try {
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'verifyPin', pin })
    });
    const result = await res.json();
    if (result.status === 'SUCCESS') {
      isOwnerMode = true;
      savedOwnerPin = pin;
      document.getElementById('badgeRole').innerText = 'Owner';
      document.getElementById('badgeRole').className = 'badge bg-success';
      document.getElementById('ownerTabNav').style.display = 'block';
      bootstrap.Modal.getInstance(document.getElementById('pinModal')).hide();
      document.getElementById('inputPin').value = '';
      switchView('owner');
    } else {
      alert('PIN Salah!');
    }
  } catch (e) {
    alert('Verifikasi PIN gagal');
  }
}

function switchRoleToKasir() {
  isOwnerMode = false;
  savedOwnerPin = '';
  document.getElementById('badgeRole').innerText = 'Kasir';
  document.getElementById('badgeRole').className = 'badge bg-secondary';
  document.getElementById('ownerTabNav').style.display = 'none';
  bootstrap.Modal.getInstance(document.getElementById('pinModal')).hide();
  switchView('menu');
}

async function loadReport() {
  if (!isOwnerMode) return;
  const date = document.getElementById('reportDate').value;
  try {
    const res = await fetch(`${GAS_API_URL}?action=getReport&date=${date}&pin=${savedOwnerPin}`);
    const data = await res.json();
    if (data.status === 'SUCCESS') {
      const r = data.ringkasan;
      document.getElementById('valOmset').innerText = 'Rp ' + r.omset.toLocaleString('id-ID');
      document.getElementById('valHpp').innerText = 'Rp ' + r.hpp.toLocaleString('id-ID');
      document.getElementById('valOps').innerText = 'Rp ' + r.pengeluaran.toLocaleString('id-ID');
      document.getElementById('valNet').innerText = 'Rp ' + r.labaBersih.toLocaleString('id-ID');
      document.getElementById('shiftOmsetPagi').innerText = 'Rp ' + (data.shiftOmset.Pagi || 0).toLocaleString('id-ID');
      document.getElementById('shiftOmsetMalam').innerText = 'Rp ' + (data.shiftOmset.Malam || 0).toLocaleString('id-ID');
    }
  } catch (e) {
    alert('Gagal mengambil laporan');
  }
}

async function submitExpense(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSaveExpense');
  btn.disabled = true;

  const payload = {
    kategori: document.getElementById('expCategory').value,
    nominal: document.getElementById('expAmount').value,
    deskripsi: document.getElementById('expDescription').value.trim(),
    pic: document.getElementById('expPic').value.trim()
  };

  try {
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'recordExpense', payload })
    });
    const result = await res.json();
    if (result.status === 'SUCCESS') {
      bootstrap.Modal.getInstance(document.getElementById('expenseModal')).hide();
      document.getElementById('expenseForm').reset();
      alert('Pengeluaran berhasil dicatat!');
      if (isOwnerMode) loadReport();
    }
  } catch (e) {
    alert('Gagal mencatat beban');
  } finally {
    btn.disabled = false;
  }
}