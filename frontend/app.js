const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzzdd1RzVj3a_oenJrsIDPWR7NT5FP2WqUzXH__K_mss3_XeokPV1HvZlYkmxCr1EDH/exec';

let currentUser = null;
let menuCatalog = [];
let cart = [];
let currentCategory = 'Semua';

window.addEventListener('DOMContentLoaded', () => {
  restoreSession();
});

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
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'login', payload })
    });
    const result = await res.json();

    if (result.status === 'SUCCESS') {
      currentUser = result.user;
      localStorage.setItem('wrr_session', JSON.stringify(currentUser));
      enterApplication();
    } else {
      alert(result.message);
    }
  } catch (err) {
    alert('Gagal login: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = 'Masuk ke Kasir';
  }
}

function handleAuthLogout() {
  if (!confirm('Akhiri shift dan keluar?')) return;
  fetch(GAS_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'logout', payload: { username: currentUser.username } })
  });
  localStorage.removeItem('wrr_session');
  location.reload();
}

function enterApplication() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  document.getElementById('headerUserLabel').innerText = `${currentUser.cabang} | ${currentUser.nama} (${currentUser.shift})`;
  loadCatalog();
  loadShiftHistory();
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
      renderCatalog();
    }
  } catch (e) {
    container.innerHTML = `<div class="text-center text-danger py-5">Gagal sinkron menu</div>`;
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
    return alert('Uang yang diterima kurang!');
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

  try {
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'submitOrder', token: currentUser.token, username: currentUser.username, payload })
    });
    const result = await res.json();

    if (result.status === 'SUCCESS') {
      alert(`Transaksi Berhasil! (${payMethod})\nID: ${result.orderId}`);
      cart = [];
      document.getElementById('orderCust').value = '';
      document.getElementById('orderTable').value = '';
      document.getElementById('inputCashPaid').value = '';
      updateCartUI();
      navToTab('menu');
      loadCatalog();
    } else {
      alert('Gagal: ' + result.message);
    }
  } catch (e) {
    alert('Terjadi kesalahan jaringan');
  } finally {
    btn.disabled = false;
    btn.innerText = 'SELESAIKAN TRANSAKSI';
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
    container.innerHTML = `<div class="text-center text-danger py-4 small">Gagal memuat log</div>`;
  }
}

async function loadKasbonData() {
  const container = document.getElementById('kasbonListContainer');
  try {
    const res = await fetch(`${GAS_API_URL}?action=getKasbon&token=${currentUser.token}&username=${currentUser.username}&status=Belum Lunas`);
    const result = await res.json();

    if (result.status === 'SUCCESS') {
      if (!result.data.length) {
        container.innerHTML = `<div class="text-center text-secondary py-5 small">Tidak ada kasbon aktif</div>`;
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
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'payKasbon',
        token: currentUser.token,
        username: currentUser.username,
        payload: { idKasbon, bayarNominal: nominal, metodeBayar: method }
      })
    });
    const result = await res.json();
    if (result.status === 'SUCCESS') {
      alert(result.message);
      bootstrap.Modal.getInstance(document.getElementById('payKasbonModal')).hide();
      loadKasbonData();
    } else {
      alert('Gagal: ' + result.message);
    }
  } catch (e) {
    alert('Koneksi gagal');
  }
}
