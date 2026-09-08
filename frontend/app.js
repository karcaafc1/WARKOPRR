// URL Baru Deployment Google Apps Script (Tanpa Spasi)
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbzQ3G0VdXVfCgd0RczLTGOaZNErFIR0Lq1vt0ISAmTEcjc8pC7REgg5cBzH5DPffTvdGA/exec';

let currentUser = null;
let menuCatalog = [];
let cart = [];
let currentCategory = 'Semua';
let liveMonitorInterval = null;

// PWA Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW Info:', err));
  });
}

window.addEventListener('online', () => syncOfflineOrders());
window.addEventListener('DOMContentLoaded', () => restoreSession());

function getTodayIsoString() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Helper POST Universal anti-CORS via URLSearchParams
async function postToGAS(action, payload = {}, extraParams = {}) {
  const bodyData = new URLSearchParams();
  bodyData.append('action', action);
  bodyData.append('payload', JSON.stringify(payload));

  // Mengirim kredensial login ganda (sebagai payload JSON dan parameter form langsung)
  if (action === 'login' && payload) {
    if (payload.username) bodyData.append('username', payload.username);
    if (payload.password) bodyData.append('password', payload.password);
    if (payload.shift) bodyData.append('shift', payload.shift);
  }

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
    btn.innerText = 'Masuk ke Sistem';
  }
}

function handleAuthLogout() {
  if (!confirm('Akhiri sesi dan keluar?')) return;
  if (liveMonitorInterval) clearInterval(liveMonitorInterval);
  postToGAS('logout', { username: currentUser.username });
  localStorage.removeItem('wrr_session');
  location.reload();
}

function enterApplication() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  document.getElementById('headerUserLabel').innerText = `${currentUser.cabang} | ${currentUser.nama} (${currentUser.shift})`;

  const dockDashboard = document.getElementById('dockDashboard');
  const dockAnalytics = document.getElementById('dockAnalytics');
  const dockReport = document.getElementById('dockReport');
  const dockMenu = document.getElementById('dockMenu');
  const dockCart = document.getElementById('dockCart');
  const wrapLembur = document.getElementById('wrapLembur');
  const floatBar = document.getElementById('floatingCartBar');

  if (currentUser.role === 'Owner') {
    if (dockDashboard) dockDashboard.classList.remove('d-none');
    if (dockAnalytics) dockAnalytics.classList.remove('d-none');
    if (dockReport) dockReport.classList.remove('d-none');
    if (dockMenu) dockMenu.classList.add('d-none');
    if (dockCart) dockCart.classList.add('d-none');
    if (wrapLembur) wrapLembur.classList.add('d-none');
    if (floatBar) floatBar.style.display = 'none';

    const dateInput = document.getElementById('reportFilterDate');
    if (dateInput && !dateInput.value) {
      dateInput.value = getTodayIsoString();
    }

    navToTab('dashboard');

    if (liveMonitorInterval) clearInterval(liveMonitorInterval);
    liveMonitorInterval = setInterval(() => {
      loadLiveMonitorData(false);
    }, 30000);

  } else {
    if (dockDashboard) dockDashboard.classList.add('d-none');
    if (dockAnalytics) dockAnalytics.classList.add('d-none');
    if (dockReport) dockReport.classList.add('d-none');
    if (dockMenu) dockMenu.classList.remove('d-none');
    if (dockCart) dockCart.classList.remove('d-none');
    if (wrapLembur) wrapLembur.classList.remove('d-none');

    navToTab('menu');
    loadCatalog();
    loadShiftHistory();
    syncOfflineOrders();
  }
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

  if (tabName === 'dashboard') loadLiveMonitorData(true);
  if (tabName === 'analytics') loadSalesAnalytics();
  if (tabName === 'history') loadShiftHistory();
  if (tabName === 'kasbon') loadKasbonData();
  if (tabName === 'report') loadOwnerReport();
}

// 1. MONITORING LIVE TRANSAKSI
async function loadLiveMonitorData(isManual) {
  if (!currentUser || currentUser.role !== 'Owner') return;

  const timerEl = document.getElementById('lastUpdatedTimer');
  if (timerEl) timerEl.innerText = 'Menyinkronkan...';

  try {
    const today = getTodayIsoString();
    const res = await fetch(`${GAS_API_URL}?action=getReport&token=${encodeURIComponent(currentUser.token)}&username=${encodeURIComponent(currentUser.username)}&date=${today}&cabang=Semua`);
    const result = await res.json();

    const resHist = await fetch(`${GAS_API_URL}?action=getHistory&token=${encodeURIComponent(currentUser.token)}&username=${encodeURIComponent(currentUser.username)}`);
    const resultHist = await resHist.json();

    if (result.status === 'SUCCESS') {
      const ringkas = result.data.ringkasan;
      document.getElementById('monTotalOmset').innerText = 'Rp ' + Number(ringkas.totalOmsetKotor || 0).toLocaleString('id-ID');
      document.getElementById('monNetCash').innerText = 'Kas Bersih: Rp ' + Number(ringkas.labaBersihKas || 0).toLocaleString('id-ID');
      document.getElementById('monTotalTrx').innerText = (ringkas.jumlahTransaksi || 0) + ' Struk';
      document.getElementById('monTotalPiutang').innerText = 'Piutang: Rp ' + Number(ringkas.totalPiutangBelumLunas || 0).toLocaleString('id-ID');

      if (resultHist.status === 'SUCCESS') {
        const orders = resultHist.data || [];
        let cenOmset = 0, cenCount = 0;
        let mapOmset = 0, mapCount = 0;

        orders.forEach(o => {
          if (o.status !== 'Void') {
            const cb = String(o.cabang || '');
            if (cb.includes('Cenderawasih')) {
              cenOmset += Number(o.total || 0);
              cenCount++;
            } else if (cb.includes('Mappaoddang')) {
              mapOmset += Number(o.total || 0);
              mapCount++;
            }
          }
        });

        document.getElementById('monCenOmset').innerText = 'Rp ' + cenOmset.toLocaleString('id-ID');
        document.getElementById('monCenTrx').innerText = cenCount + ' Transaksi';
        document.getElementById('monMapOmset').innerText = 'Rp ' + mapOmset.toLocaleString('id-ID');
        document.getElementById('monMapTrx').innerText = mapCount + ' Transaksi';

        renderLiveMonitorFeed(orders);
      }
    }

    if (timerEl) {
      const d = new Date();
      timerEl.innerText = `Sync: ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
    }
  } catch (err) {
    if (timerEl) timerEl.innerText = 'Sync Gagal';
  }
}

function renderLiveMonitorFeed(orders) {
  const container = document.getElementById('liveOrderFeedList');
  if (!container) return;

  if (!orders.length) {
    container.innerHTML = `<div class="text-center text-secondary py-5 small">Belum ada transaksi hari ini</div>`;
    return;
  }

  container.innerHTML = orders.map(o => {
    const isCenderawasih = String(o.cabang || '').includes('Cenderawasih');
    const badgeCabang = isCenderawasih
      ? `<span class="badge badge-cenderawasih">Cenderawasih</span>`
      : `<span class="badge badge-mappaoddang">Mappaoddang</span>`;

    const badgeStatus = o.status === 'Kasbon'
      ? `<span class="badge bg-warning text-dark">Kasbon</span>`
      : (o.status === 'Void' ? `<span class="badge bg-danger">Void</span>` : `<span class="badge bg-success">Selesai</span>`);

    return `
      <div class="card bg-dark-card border-0 p-3 mb-2 shadow-sm">
        <div class="d-flex justify-content-between align-items-center mb-1">
          <div class="d-flex align-items-center gap-2">
            ${badgeCabang}
            <span class="fw-bold text-white small">${o.id}</span>
          </div>
          <span class="small text-secondary">${o.jam}</span>
        </div>
        <div class="d-flex justify-content-between align-items-center small">
          <div>
            <span class="text-white fw-semibold">${o.pelanggan}</span>
            <span class="text-secondary"> &bull; Meja ${o.meja} (${o.kasir})</span>
          </div>
          <div class="text-end">
            <div class="fw-bold text-accent">Rp ${Number(o.total || 0).toLocaleString('id-ID')}</div>
            <div class="d-flex align-items-center justify-content-end gap-1">
              <small class="text-info">${o.metode}</small>
              ${badgeStatus}
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 2. ANALISA PENJUALAN OWNER
async function loadSalesAnalytics() {
  if (!currentUser || currentUser.role !== 'Owner') return;

  const periode = document.getElementById('analyticsPeriode').value;
  const cabang = document.getElementById('analyticsCabang').value;
  const rangeLabel = document.getElementById('analyticsRangeLabel');

  rangeLabel.innerText = 'Menghitung analisa performa...';

  try {
    const res = await fetch(`${GAS_API_URL}?action=getSalesAnalytics&token=${encodeURIComponent(currentUser.token)}&username=${encodeURIComponent(currentUser.username)}&periode=${encodeURIComponent(periode)}&cabang=${encodeURIComponent(cabang)}`);
    const result = await res.json();

    if (result.status === 'SUCCESS') {
      const d = result.data;
      rangeLabel.innerText = `Rentang: ${d.startDate} - ${d.endDate}`;

      document.getElementById('anaTotalOmset').innerText = 'Rp ' + Number(d.ringkasan.omset || 0).toLocaleString('id-ID');
      document.getElementById('anaLabaKas').innerText = 'Laba Kas: Rp ' + Number(d.ringkasan.labaKas || 0).toLocaleString('id-ID');
      document.getElementById('anaAvgBasket').innerText = 'Rp ' + Number(d.ringkasan.avgBasket || 0).toLocaleString('id-ID');
      document.getElementById('anaTotalTrx').innerText = (d.ringkasan.transaksi || 0) + ' Transaksi';

      document.getElementById('anaTunai').innerText = 'Rp ' + Number(d.ringkasan.tunai || 0).toLocaleString('id-ID');
      document.getElementById('anaQris').innerText = 'Rp ' + Number(d.ringkasan.qris || 0).toLocaleString('id-ID');
      document.getElementById('anaKasbon').innerText = 'Rp ' + Number(d.ringkasan.kasbon || 0).toLocaleString('id-ID');
      document.getElementById('anaBeban').innerText = 'Rp ' + Number(d.ringkasan.beban || 0).toLocaleString('id-ID');

      // 5 Menu Terlaris
      const topContainer = document.getElementById('anaTopItemsList');
      if (!d.topItems || !d.topItems.length) {
        topContainer.innerHTML = `<div class="text-center text-secondary py-2 small">Belum ada menu terjual di periode ini</div>`;
      } else {
        topContainer.innerHTML = d.topItems.map((item, idx) => `
          <div class="d-flex justify-content-between align-items-center py-2 border-bottom border-dark small">
            <div>
              <span class="badge bg-secondary me-1">#${idx + 1}</span>
              <span class="text-white fw-semibold">${item.nama}</span>
            </div>
            <div class="text-end">
              <span class="fw-bold text-accent">${item.qty} porsi</span>
              <small class="text-secondary d-block">Rp ${Number(item.omset || 0).toLocaleString('id-ID')}</small>
            </div>
          </div>
        `).join('');
      }

      // Visual Tren Bar
      const trendContainer = document.getElementById('anaTrendBars');
      const trendKeys = Object.keys(d.trend || {});
      document.getElementById('anaTrendTitle').innerText = periode === 'harian' ? 'Jam Paling Ramai (Peak Hours)' : 'Tren Penjualan Harian';

      if (!trendKeys.length) {
        trendContainer.innerHTML = `<div class="text-center text-secondary py-2 small">Tidak ada transaksi tercatat</div>`;
      } else {
        const maxVal = Math.max(...Object.values(d.trend), 1);
        trendContainer.innerHTML = trendKeys.map(key => {
          const val = Number(d.trend[key] || 0);
          const percent = Math.round((val / maxVal) * 100);
          return `
            <div class="mb-2">
              <div class="d-flex justify-content-between small mb-1">
                <span class="text-secondary">${key}</span>
                <span class="text-white fw-bold">Rp ${val.toLocaleString('id-ID')}</span>
              </div>
              <div class="progress" style="height: 6px; background-color: #1F2937;">
                <div class="progress-bar bg-warning" style="width: ${percent}%"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    } else {
      alert('Gagal mengambil analisis: ' + (result.message || 'Error'));
    }
  } catch (err) {
    rangeLabel.innerText = 'Koneksi backend gagal';
  }
}

// 3. LAPORAN KEUANGAN AUDIT OWNER
async function loadOwnerReport() {
  if (!currentUser || currentUser.role !== 'Owner') return;

  const filterCabang = document.getElementById('reportFilterCabang').value;
  const dateInput = document.getElementById('reportFilterDate');
  
  if (!dateInput.value) {
    dateInput.value = getTodayIsoString();
  }
  const filterDate = dateInput.value;

  try {
    const res = await fetch(`${GAS_API_URL}?action=getReport&token=${encodeURIComponent(currentUser.token)}&username=${encodeURIComponent(currentUser.username)}&date=${encodeURIComponent(filterDate)}&cabang=${encodeURIComponent(filterCabang)}`);
    const result = await res.json();

    if (result.status === 'SUCCESS') {
      const d = result.data.ringkasan;
      document.getElementById('repOmsetKotor').innerText = 'Rp ' + Number(d.totalOmsetKotor || 0).toLocaleString('id-ID');
      document.getElementById('repLabaBersih').innerText = 'Rp ' + Number(d.labaBersihKas || 0).toLocaleString('id-ID');
      document.getElementById('repTunai').innerText = 'Rp ' + Number(d.totalTunai || 0).toLocaleString('id-ID');
      document.getElementById('repQris').innerText = 'Rp ' + Number(d.totalQris || 0).toLocaleString('id-ID');
      document.getElementById('repPengeluaran').innerText = 'Rp ' + Number(d.totalPengeluaran || 0).toLocaleString('id-ID');
      document.getElementById('repKasbonHariIni').innerText = 'Rp ' + Number(d.totalKasbonBaru || 0).toLocaleString('id-ID');
      document.getElementById('repTotalPiutang').innerText = 'Rp ' + Number(d.totalPiutangBelumLunas || 0).toLocaleString('id-ID');
      document.getElementById('repJumlahTrx').innerText = (d.jumlahTransaksi || 0) + ' Struk';

      const expContainer = document.getElementById('repListPengeluaran');
      if (!result.data.pengeluaran || !result.data.pengeluaran.length) {
        expContainer.innerHTML = `<div class="text-center text-secondary py-3 small">Tidak ada pengeluaran</div>`;
      } else {
        expContainer.innerHTML = result.data.pengeluaran.map(e => `
          <div class="card bg-dark-card border-0 p-2 mb-1 small d-flex justify-content-between flex-row">
            <div>
              <span class="text-white fw-bold">[${e.cabang}] ${e.kategori}</span>
              <div class="text-secondary" style="font-size:0.75rem;">${e.deskripsi} (${e.pic})</div>
            </div>
            <span class="text-danger fw-bold">Rp ${Number(e.nominal || 0).toLocaleString('id-ID')}</span>
          </div>
        `).join('');
      }
    } else {
      alert('Gagal memuat laporan: ' + (result.message || ''));
    }
  } catch (err) {
    alert('Koneksi backend laporan gagal: ' + err.message);
  }
}

// 4. KATALOG & TRANSAKSI KASIR
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
  
  if (currentUser && currentUser.role !== 'Owner') {
    floatBar.style.display = totalQty > 0 ? 'block' : 'none';
  }

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
    return alert('Uang yang diterima kurang dari total tagihan!');
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
    loadCatalog();
    loadShiftHistory();
  }
}

async function loadShiftHistory() {
  const container = document.getElementById('historyOrdersList');
  if (!container || !currentUser) return;

  try {
    const res = await fetch(`${GAS_API_URL}?action=getHistory&token=${encodeURIComponent(currentUser.token)}&username=${encodeURIComponent(currentUser.username)}`);
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
            <span class="fw-bold text-accent">Rp ${Number(o.total || 0).toLocaleString('id-ID')}</span>
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
    const res = await fetch(`${GAS_API_URL}?action=getKasbon&token=${encodeURIComponent(currentUser.token)}&username=${encodeURIComponent(currentUser.username)}&status=Belum Lunas`);
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
            <span class="fw-bold text-danger">Sisa: Rp ${Number(k.sisa || 0).toLocaleString('id-ID')}</span>
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
