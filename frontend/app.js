const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbyuw-W4MAjdVw05Heu1gwp3FPKk7fOOQ4QBmbHGpsFXFxfuqsz8NlthulaqPwAWZ7fWJw/exec';

let currentUser = null;
let menuCatalog = [];
let cart = [];
let currentCategory = 'Semua';
let activePendingItem = null;

window.addEventListener('DOMContentLoaded', () => {
  restoreSession();
  const dateEl = document.getElementById('reportDatePicker');
  if (dateEl) dateEl.value = new Date().toISOString().split('T')[0];
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
      body: JSON.stringify({ action: 'login', payload: payload })
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
    alert('Koneksi backend gagal: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = 'Masuk ke Kasir';
  }
}

  try {
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
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
    alert('Koneksi backend terputus: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = 'Masuk ke Kasir';
  }
}

async function handleAuthLogout() {
  if (!confirm('Apakah Anda yakin ingin mengakhiri shift & keluar?')) return;
  try {
    await fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'logout',
        payload: { username: currentUser.username }
      })
    });
  } catch (e) {}

  localStorage.removeItem('wrr_session');
  currentUser = null;
  cart = [];
  location.reload();
}

function enterApplication() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';

  document.getElementById('headerUserLabel').innerText = 
    `${currentUser.nama} (${currentUser.role} - ${currentUser.shift})`;

  // Hak Akses Khusus Owner
  if (currentUser.role === 'Owner') {
    document.getElementById('dockOwner').style.display = 'flex';
  } else {
    document.getElementById('dockOwner').style.display = 'none';
  }

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
  if (tabName === 'owner') fetchOwnerReport();
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
    container.innerHTML = `<div class="text-center text-danger py-5">Gagal sinkronisasi menu</div>`;
  }
}

function renderCatalog() {
  const container = document.getElementById('catalogGrid');
  const term = document.getElementById('searchMenu').value.toLowerCase();

  const filtered = menuCatalog.filter(item => {
    const matchCat = (currentCategory === 'Semua') || (item.kategori === currentCategory);
    const matchTerm = item.nama.toLowerCase().includes(term) || item.varian.toLowerCase().includes(term);
    return matchCat && matchTerm;
  });

  if (!filtered.length) {
    container.innerHTML = `<div class="text-center text-secondary py-5">Menu tidak ditemukan</div>`;
    return;
  }

  container.innerHTML = filtered.map(m => `
    <div class="col-6 col-md-4 col-lg-3">
      <div class="menu-card h-100" onclick="openItemCustomModal('${m.id}')">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <span class="menu-badge">${m.varian}</span>
          <small class="text-secondary" style="font-size:0.7rem;">Stok: ${m.stok}</small>
        </div>
        <h6 class="fw-bold text-white mb-1 text-truncate" style="font-size: 0.95rem;">${m.nama}</h6>
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

function openItemCustomModal(id) {
  const item = menuCatalog.find(m => m.id === id);
  if (!item) return;
  activePendingItem = item;

  document.getElementById('customItemId').value = item.id;
  document.getElementById('customItemTitle').innerText = `${item.nama} (${item.varian})`;
  document.getElementById('customItemNote').value = '';

  const modal = new bootstrap.Modal(document.getElementById('itemCustomModal'));
  modal.show();
}

function appendNote(txt) {
  const noteEl = document.getElementById('customItemNote');
  noteEl.value = noteEl.value ? `${noteEl.value}, ${txt}` : txt;
}

function confirmAddToCartWithNote() {
  if (!activePendingItem) return;
  const note = document.getElementById('customItemNote').value.trim();

  const existing = cart.find(c => c.id === activePendingItem.id && c.catatan === note);
  if (existing) {
    existing.qty++;
    existing.subtotal = existing.qty * existing.harga;
  } else {
    cart.push({
      ...activePendingItem,
      qty: 1,
      subtotal: activePendingItem.harga,
      catatan: note
    });
  }

  bootstrap.Modal.getInstance(document.getElementById('itemCustomModal')).hide();
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
    list.innerHTML = `<div class="text-center text-secondary py-4 small">Belum ada menu dipilih</div>`;
    calcChange();
    return;
  }

  list.innerHTML = cart.map((c, i) => `
    <div class="d-flex justify-content-between align-items-center py-2 border-bottom border-dark small">
      <div>
        <div class="fw-bold text-white">${c.nama} (${c.varian})</div>
        <div class="text-secondary">${c.qty}x @ Rp ${Number(c.harga).toLocaleString('id-ID')}</div>
        ${c.catatan ? `<span class="badge bg-dark border border-secondary text-warning" style="font-size:0.65rem;">${c.catatan}</span>` : ''}
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
  if (cart[index].qty <= 0) {
    cart.splice(index, 1);
  } else {
    cart[index].subtotal = cart[index].qty * cart[index].harga;
  }
  updateCartUI();
}

function clearCart() {
  if (confirm('Kosongkan semua pesanan di keranjang?')) {
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
  if (val === 'exact') {
    input.value = totalAmount;
  } else {
    input.value = val;
  }
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
  const cashPaid = Number(document.getElementById('inputCashPaid').value) || totalAmount;

  if (payMethod === 'Tunai' && cashPaid < totalAmount) {
    return alert('Uang diterima kurang dari total transaksi!');
  }

  const btn = document.getElementById('btnSubmitOrder');
  btn.disabled = true;
  btn.innerText = 'Memproses Transaksi...';

  const payload = {
    shift: currentUser.shift,
    isLembur: document.getElementById('checkLembur').checked,
    customerName: document.getElementById('orderCust').value.trim() || 'Walk-in',
    tableNumber: document.getElementById('orderTable').value.trim() || '-',
    totalAmount: totalAmount,
    nominalDiterima: cashPaid,
    kembalian: Math.max(0, cashPaid - totalAmount),
    paymentMethod: payMethod,
    items: cart
  };

  try {
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'submitOrder',
        token: currentUser.token,
        username: currentUser.username,
        payload
      })
    });
    const result = await res.json();

    if (result.status === 'SUCCESS') {
      alert(`Transaksi Berhasil Dicatat!\nNo. Transaksi: ${result.orderId}\nKembalian: Rp ${(cashPaid - totalAmount).toLocaleString('id-ID')}`);
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
    alert('Koneksi terputus: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerText = 'SELESAIKAN TRANSAKSI';
  }
}

async function loadShiftHistory() {
  const container = document.getElementById('historyOrdersList');
  try {
    const res = await fetch(`${GAS_API_URL}?action=getHistory&token=${currentUser.token}&username=${currentUser.username}&shift=${currentUser.shift}`);
    const result = await res.json();

    if (result.status === 'SUCCESS') {
      if (!result.data.length) {
        container.innerHTML = `<div class="text-center text-secondary py-5 small">Belum ada transaksi di shift ini</div>`;
        return;
      }

      container.innerHTML = result.data.map(o => `
        <div class="card bg-dark-card border-0 p-3 mb-2">
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="fw-bold text-white small">${o.id}</span>
            <span class="badge ${o.status === 'Void' ? 'bg-danger' : 'bg-success'}">${o.status}</span>
          </div>
          <div class="d-flex justify-content-between align-items-center text-secondary small">
            <span>Meja: ${o.meja} | ${o.pelanggan} (${o.jam})</span>
            <span class="fw-bold text-accent">Rp ${Number(o.total).toLocaleString('id-ID')}</span>
          </div>
          ${(currentUser.role === 'Owner' && o.status !== 'Void') ? `
            <div class="text-end mt-2">
              <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="voidOrderPrompt('${o.id}')">Batalkan (Void)</button>
            </div>
          ` : ''}
        </div>
      `).join('');
    }
  } catch (e) {
    container.innerHTML = `<div class="text-center text-danger py-4 small">Gagal memuat riwayat</div>`;
  }
}

async function voidOrderPrompt(orderId) {
  const reason = prompt(`Masukkan alasan pembatalan pesanan ${orderId}:`);
  if (!reason) return;

  try {
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'voidOrder',
        token: currentUser.token,
        username: currentUser.username,
        payload: { orderId, reason }
      })
    });
    const result = await res.json();
    if (result.status === 'SUCCESS') {
      alert(result.message);
      loadShiftHistory();
      loadCatalog();
    } else {
      alert('Gagal: ' + result.message);
    }
  } catch (e) {
    alert('Koneksi gagal');
  }
}

async function fetchOwnerReport() {
  if (currentUser.role !== 'Owner') return;
  const date = document.getElementById('reportDatePicker').value;

  try {
    const res = await fetch(`${GAS_API_URL}?action=getReport&date=${date}&token=${currentUser.token}&username=${currentUser.username}`);
    const result = await res.json();

    if (result.status === 'SUCCESS') {
      const s = result.summary;
      document.getElementById('statOmset').innerText = 'Rp ' + Number(s.omset).toLocaleString('id-ID');
      document.getElementById('statHpp').innerText = 'Rp ' + Number(s.hpp).toLocaleString('id-ID');
      document.getElementById('statOps').innerText = 'Rp ' + Number(s.operasional).toLocaleString('id-ID');
      document.getElementById('statNet').innerText = 'Rp ' + Number(s.labaBersih).toLocaleString('id-ID');
      document.getElementById('statShiftPagi').innerText = 'Rp ' + Number(result.shiftOmset.Pagi || 0).toLocaleString('id-ID');
      document.getElementById('statShiftMalam').innerText = 'Rp ' + Number(result.shiftOmset.Malam || 0).toLocaleString('id-ID');
    }
  } catch (e) {
    alert('Gagal mengambil data laporan finansial');
  }
}

async function submitExpenseForm(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSaveExpense');
  btn.disabled = true;

  const payload = {
    kategori: document.getElementById('expCategory').value,
    nominal: document.getElementById('expAmount').value,
    deskripsi: document.getElementById('expDesc').value.trim(),
    shift: currentUser.shift
  };

  try {
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify({
        action: 'recordExpense',
        token: currentUser.token,
        username: currentUser.username,
        payload
      })
    });
    const result = await res.json();

    if (result.status === 'SUCCESS') {
      bootstrap.Modal.getInstance(document.getElementById('expenseModal')).hide();
      document.getElementById('expAmount').value = '';
      document.getElementById('expDesc').value = '';
      alert('Pengeluaran berhasil dicatat!');
      if (currentUser.role === 'Owner') fetchOwnerReport();
    }
  } catch (e) {
    alert('Gagal mencatat beban');
  } finally {
    btn.disabled = false;
  }
}
