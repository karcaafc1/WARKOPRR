const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzzdd1RzVj3a_oenJrsIDPWR7NT5FP2WqUzXH__K_mss3_XeokPV1HvZIYkmxCr1EDH/exec';

let currentUser = null;
let menuCatalog = [];
let cart = [];
let currentCategory = 'Semua';

// PWA & Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('SW Registration error:', err);
    });
  });
}

// Auto sync antrean offline saat online
window.addEventListener('online', () => {
  syncOfflineOrders();
});

window.addEventListener('DOMContentLoaded', () => {
  restoreSession();
});

// Helper request POST universal untuk mengatasi CORS Google Apps Script
async function postToGAS(action, payload = {}, extraParams = {}) {
  const bodyData = new URLSearchParams();
  bodyData.append('action', action);
  bodyData.append('payload', JSON.stringify(payload));

  if (extraParams.token) bodyData.append('token', extraParams.token);
  if (extraParams.username) bodyData.append('username', extraParams.username);

  const res = await fetch(GAS_API_URL, {
    method: 'POST',
    body: bodyData,
    redirect: 'follow'
  });
  return await res.json();
}

function restoreSession() {
  const saved = localStorage.getItem('wrr_session');
  if (saved) {
    currentUser = JSON.parse(saved);
    enterApplication();
  } else {
    showLoginScreen();
  }
}

async function handleAuthLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('btnLoginSubmit');
  btn.disabled = true;
  btn.innerText = 'Memverifikasi...';

  const payload = {
    username: document.getElementById('loginUsername').value.trim(),
    password: document.getElementById('loginPassword').value.trim(),
    shift: document.getElementById('loginShift').value
  };

  try {
    const result = await postToGAS('login', payload);

    if (result.status === 'SUCCESS') {
      currentUser = result.user;
      localStorage.setItem('wrr_session', JSON.stringify(currentUser));
      enterApplication();
    } else {
      alert(result.message);
    }
  } catch (err) {
    alert('Koneksi backend gagal: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = 'Masuk ke Kasir';
  }
}

function handleAuthLogout() {
  if (!confirm('Akhiri shift dan keluar?')) return;
  postToGAS('logout', { username: currentUser.username });
  localStorage.removeItem('wrr_session');
  location.reload();
}

function enterApplication() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  document.getElementById('headerUserLabel').innerText = `${currentUser.cabang} | ${currentUser.nama} (${currentUser.shift})`;
  loadCatalog();
  loadShiftHistory();
  syncOfflineOrders();
}

function showLoginScreen() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('mainApp').style.display = 'none';
}

function navToTab(tabName) {
  document.querySelectorAll('.tab-view').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.dock-btn').forEach(btn => btn.classList.remove('active'));

  const view = document.getElementById(`view${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
  const dock = document.getElementById(`dock${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);

  if (view) view.classList.add('active');
  if (dock) dock.classList.add('active');

  if (tabName === 'history') loadShiftHistory();
  if (tabName === 'kasbon') loadKasbonData();
}

async function loadCatalog() {
  const container = document.getElementById('catalogGrid');
  try {
    const res = await fetch(`${GAS_API_URL}?action=getMenu`);
    const result = await res.json();
    if (result.status === 'SUCCESS') {
      menuCatalog = result.data;
      localStorage.setItem('wrr_cached_menu', JSON.stringify(menuCatalog));
      renderCatalog();
    } else {
      loadFallbackCachedMenu(container, result.message);
    }
  } catch (e) {
    loadFallbackCachedMenu(container);
  }
}

function loadFallbackCachedMenu(container, errorMsg) {
  const cached = localStorage.getItem('wrr_cached_menu');
  if (cached) {
    menuCatalog = JSON.parse(cached);
    renderCatalog();
  } else {
    container.innerHTML = `<div class="text-center text-warning py-5">${errorMsg || 'Mode Offline: Menu belum tersedia di cache'}</div>`;
  }
}

function renderCatalog() {
  const container = document.getElementById('catalogGrid');
  const term = document.getElementById('searchMenu').value.toLowerCase();

  const filtered = menuCatalog.filter(item => {
    const matchCat = (currentCategory === 'Semua') || (item.kategori === currentCategory);
    const matchTerm = item.nama.toLowerCase().includes(term);
    return matchCat && matchTerm;
  });

  if (!filtered.length) {
    container.innerHTML = `<div class="text-center text-secondary py-5">Menu tidak ditemukan</div>`;
    return;
  }

  container.innerHTML = filtered.map(m => `
    <div class="col-6 col-md-4 col-lg-3">
      <div class="menu-card h-100" onclick="addToCart('${m.id}')">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="menu-badge">${m.varian}</span>
          <small class="text-secondary" style="font-size:0.7rem;">Stok: ${m.stok}</small>
        </div>
        <h6 class="fw-bold text-white mb-1 text-truncate">${m.nama}</h6>
        <div class="text-accent fw-bold small">Rp ${Number(m.harga).toLocaleString('id-ID')}</div>
      </div>
    </div>
  `).join('');
}

function setCategory(cat, btn) {
  currentCategory = cat;
  document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  renderCatalog();
}

function addToCart(id) {
  const item = menuCatalog.find(m => m.id === id);
  if (!item) return;

  const existing = cart.find(c => c.id === id);
  if (existing) {
    existing.qty++;
    existing.subtotal = existing.qty * existing.harga;
  } else {
    cart.push({ ...item, qty: 1, subtotal: item.harga, catatan: '' });
  }
  updateCartUI();
}

function updateCartUI() {
  const list = document.getElementById('cartItemsList');
  const grandTotalEl = document.getElementById('cartGrandTotal');
  const floatBar = document.getElementById('floatingCartBar');
  const floatCount = document.getElementById('floatingCartCount');
  const floatTotal = document.getElementById('floatingCartTotal');

  const totalQty = cart.reduce((acc, c) => acc + c.qty, 0);
  const totalAmount = cart.reduce((acc, c) => acc + c.subtotal, 0);

  grandTotalEl.innerText = 'Rp ' + totalAmount.toLocaleString('id-ID');
  floatCount.innerText = totalQty;
  floatTotal.innerText = 'Rp ' + totalAmount.toLocaleString('id-ID');
  floatBar.style.display = totalQty > 0 ? 'block' : 'none';

  if (!cart.length) {
    list.innerHTML = `<div class="text-center text-secondary py-4 small">Belum ada pesanan</div>`;
    calcChange();
    return;
  }

  list.innerHTML = cart.map((c, i) => `
    <div class="d-flex justify-content-between align-items-center py-2 border-bottom border-dark small">
      <div>
        <div class="fw-bold text-white">${c.nama} (${c.varian})</div>
        <div class="text-secondary">${c.qty}x @ Rp ${Number(c.harga).toLocaleString('id-ID')}</div>
      </div>
      <div class="d-flex align-items-center gap-2">
        <span class="fw-bold text-accent">Rp ${Number(c.subtotal).toLocaleString('id-ID')}</span>
        <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="modifyCartQty(${i}, -1)">&minus;</button>
        <button class="btn btn-sm btn-outline-success py-0 px-2" onclick="modifyCartQty(${i}, 1)">+</button>
      </div>
    </div>
  `).join('');
  calcChange();
}

function modifyCartQty(index, delta) {
  cart[index].qty += delta;
  if (cart[index].qty <= 0) cart.splice(index, 1);
  else cart[index].subtotal = cart[index].qty * cart[index].harga;
  updateCartUI();
}

function clearCart() {
  if (confirm('Kosongkan keranjang?')) {
    cart = [];
    updateCartUI();
  }
}

function togglePayMethod() {
  const method = document.querySelector('input[name="payType"]:checked').value;
  const cashArea = document.getElementById('cashCalcArea');
  cashArea.style.display = (method === 'Tunai') ? 'block' : 'none';
}

function setQuickCash(val) {
  const totalAmount = cart.reduce((acc, c) => acc + c.subtotal, 0);
  const input = document.getElementById('inputCashPaid');
  input.value = val === 'exact' ? totalAmount : val;
  calcChange();
}

function calcChange() {
  const totalAmount = cart.reduce((acc, c) => acc + c.subtotal, 0);
  const paid = Number(document.getElementById('inputCashPaid').value) || 0;
  const change = Math.max(0, paid - totalAmount);
  document.getElementById('labelChangeAmount').innerText = 'Rp ' + change.toLocaleString('id-ID');
}

async function processOrderCheckout() {
  if (!cart.length) return alert('Pilih menu terlebih dahulu!');
  const totalAmount = cart.reduce((acc, c) => acc + c.subtotal, 0);
  const payMethod = document.querySelector('input[name="payType"]:checked').value;
  const customerName = document.getElementById('orderCust').value.trim();

  if (payMethod === 'Kasbon' && !customerName) {
    return alert('Untuk transaksi KASBON, nama pelanggan WAJIB diisi!');
  }

  const cashPaid = Number(document.getElementById('inputCashPaid').value) || totalAmount;
  if (payMethod === 'Tunai' && cashPaid < totalAmount) {
    return alert('Uang yang diterima kurang dari total belanja!');
  }

  const btn = document.getElementById('btnSubmitOrder');
  btn.disabled = true;
  btn.innerText = 'Menyimpan...';

  const payload = {
    shift: currentUser.shift,
    isLembur: document.getElementById('checkLembur').checked,
    customerName: customerName || 'Walk-in',
    tableNumber: document.getElementById('orderTable').value.trim() || '-',
    totalAmount: totalAmount,
    nominalDiterima: payMethod === 'Kasbon' ? 0 : cashPaid,
    kembalian: payMethod === 'Tunai' ? Math.max(0, cashPaid - totalAmount) : 0,
    paymentMethod: payMethod,
    items: [...cart]
  };

  // Cadangkan offline jika browser tidak memiliki jaringan
  if (!navigator.onLine) {
    saveOrderOffline(payload);
    finalizeOrderSuccess(cashPaid - totalAmount, true);
    btn.disabled = false;
    btn.innerText = 'SELESAIKAN TRANSAKSI';
    return;
  }

  try {
    const result = await postToGAS('submitOrder', payload, {
      token: currentUser.token,
      username: currentUser.username
    });

    if (result.status === 'SUCCESS') {
      finalizeOrderSuccess(cashPaid - totalAmount, false, result.orderId);
      loadCatalog();
    } else {
      alert('Gagal: ' + result.message);
    }
  } catch (e) {
    saveOrderOffline(payload);
    finalizeOrderSuccess(cashPaid - totalAmount, true);
  } finally {
    btn.disabled = false;
    btn.innerText = 'SELESAIKAN TRANSAKSI';
  }
}

function saveOrderOffline(payload) {
  const queue = JSON.parse(localStorage.getItem('wrr_offline_orders') || '[]');
  queue.push({
    offlineId: 'OFF-' + Date.now(),
    payload: payload,
    token: currentUser.token,
    username: currentUser.username
  });
  localStorage.setItem('wrr_offline_orders', JSON.stringify(queue));
}

function finalizeOrderSuccess(kembalian, isOffline, orderId) {
  const notif = isOffline
    ? `[MODE OFFLINE]\nTransaksi disimpan di memori HP.\nKembalian: Rp ${kembalian.toLocaleString('id-ID')}\n(Akan disinkronkan otomatis saat online)`
    : `Transaksi Berhasil!\nID: ${orderId}\nKembalian: Rp ${kembalian.toLocaleString('id-ID')}`;

  alert(notif);
  cart = [];
  document.getElementById('orderCust').value = '';
  document.getElementById('orderTable').value = '';
  document.getElementById('inputCashPaid').value = '';
  updateCartUI();
  navToTab('menu');
}

async function syncOfflineOrders() {
  const queue = JSON.parse(localStorage.getItem('wrr_offline_orders') || '[]');
  if (!queue.length) return;

  const remaining = [];
  for (const item of queue) {
    try {
      const result = await postToGAS('submitOrder', item.payload, {
        token: item.token,
        username: item.username
      });
      if (result.status !== 'SUCCESS') {
        remaining.push(item);
      }
    } catch (err) {
      remaining.push(item);
    }
  }

  localStorage.setItem('wrr_offline_orders', JSON.stringify(remaining));
  if (remaining.length === 0) {
    alert('Semua transaksi offline berhasil disinkronkan!');
    loadCatalog();
    loadShiftHistory();
  }
}

async function loadShiftHistory() {
  const container = document.getElementById('historyOrdersList');
  if (!container || !currentUser) return;

  try {
    const res = await fetch(`${GAS_API_URL}?action=getHistory&token=${currentUser.token}&username=${currentUser.username}`);
    const result = await res.json();

    if (result.status === 'SUCCESS') {
      if (!result.data.length) {
        container.innerHTML = `<div class="text-center text-secondary py-5 small">Belum ada log penjualan</div>`;
        return;
      }

      container.innerHTML = result.data.map(o => `
        <div class="card bg-dark-card border-0 p-3 mb-2">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="fw-bold text-white small">${o.id} <span class="badge bg-secondary">${o.cabang}</span></span>
            <span class="badge ${o.status === 'Kasbon' ? 'bg-warning text-dark' : (o.status === 'Void' ? 'bg-danger' : 'bg-success')}">${o.status}</span>
          </div>
          <div class="d-flex justify-content-between align-items-center text-secondary small">
            <span>${o.pelanggan} | Meja ${o.meja} (${o.metode})</span>
            <span class="fw-bold text-accent">Rp ${Number(o.total).toLocaleString('id-ID')}</span>
          </div>
        </div>
      `).join('');
    }
  } catch (e) {
    container.innerHTML = `<div class="text-center text-danger py-4 small">Gagal memuat log penjualan</div>`;
  }
}

async function loadKasbonData() {
  const container = document.getElementById('kasbonListContainer');
  try {
    const res = await fetch(`${GAS_API_URL}?action=getKasbon&token=${currentUser.token}&username=${currentUser.username}&status=Belum Lunas`);
    const result = await res.json();

    if (result.status === 'SUCCESS') {
      if (!result.data.length) {
        container.innerHTML = `<div class="text-center text-secondary py-5 small">Tidak ada tagihan kasbon aktif</div>`;
        return;
      }

      container.innerHTML = result.data.map(k => `
        <div class="card bg-dark-card border-0 p-3 mb-2">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="fw-bold text-white">${k.pelanggan} <small class="text-secondary">(${k.cabang})</small></span>
            <span class="badge bg-warning text-dark">${k.status}</span>
          </div>
          <div class="d-flex justify-content-between align-items-center small mb-2">
            <span class="text-secondary">${k.tanggal}</span>
            <span class="fw-bold text-danger">Sisa: Rp ${Number(k.sisa).toLocaleString('id-ID')}</span>
          </div>
          <button class="btn btn-sm btn-outline-custom w-100" onclick="openPayKasbonModal('${k.id}', '${k.pelanggan}', ${k.sisa})">Bayar Kasbon</button>
        </div>
      `).join('');
    }
  } catch (e) {
    container.innerHTML = `<div class="text-center text-danger py-4 small">Gagal memuat buku kasbon</div>`;
  }
}

function openPayKasbonModal(id, nama, sisa) {
  document.getElementById('modalKasbonId').value = id;
  document.getElementById('modalKasbonName').innerText = nama;
  document.getElementById('modalKasbonSisa').innerText = 'Rp ' + Number(sisa).toLocaleString('id-ID');
  document.getElementById('modalKasbonPayAmount').value = sisa;
  new bootstrap.Modal(document.getElementById('payKasbonModal')).show();
}

async function submitPayKasbon() {
  const idKasbon = document.getElementById('modalKasbonId').value;
  const nominal = Number(document.getElementById('modalKasbonPayAmount').value);
  const method = document.getElementById('modalKasbonMethod').value;

  if (nominal <= 0) return alert('Nominal pembayaran tidak valid');

  try {
    const result = await postToGAS('payKasbon', {
      idKasbon: idKasbon,
      bayarNominal: nominal,
      metodeBayar: method
    }, {
      token: currentUser.token,
      username: currentUser.username
    });

    if (result.status === 'SUCCESS') {
      alert(result.message);
      bootstrap.Modal.getInstance(document.getElementById('payKasbonModal')).hide();
      loadKasbonData();
    } else {
      alert('Gagal: ' + result.message);
    }
  } catch (e) {
    alert('Koneksi gagal saat melunasi kasbon');
  }
}
