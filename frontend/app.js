// URL Web App Google Apps Script Anda (diperbarui setelah deploy web app)
const GAS_API_URL = 'ISI_DENGAN_URL_WEB_APP_GAS_ANDA';

let menuList = [];
let cart = [];

window.addEventListener('DOMContentLoaded', () => {
  loadMenu();
});

async function loadMenu() {
  const container = document.getElementById('menuContainer');
  try {
    const res = await fetch(`${GAS_API_URL}?action=getMenu`);
    const result = await res.json();
    
    if (result.status === 'SUCCESS') {
      menuList = result.data;
      renderMenu(menuList);
    } else {
      container.innerHTML = `<div class="col-12 text-center text-danger py-4">Gagal memuat: ${result.message}</div>`;
    }
  } catch (err) {
    container.innerHTML = `<div class="col-12 text-center text-muted py-4">Menghubungkan ke server backend...</div>`;
  }
}

function renderMenu(items) {
  const container = document.getElementById('menuContainer');
  if (!items.length) {
    container.innerHTML = `<div class="col-12 text-center text-muted py-4">Tidak ada menu aktif.</div>`;
    return;
  }

  container.innerHTML = items.map(item => `
    <div class="col-md-4 col-sm-6 menu-item-card" data-name="${item.nama.toLowerCase()}">
      <div class="card card-menu h-100 p-3 shadow-sm border-0" onclick="addToCart('${item.id}')">
        <span class="badge bg-secondary w-auto align-self-start mb-2">${item.kategori}</span>
        <h6 class="fw-bold mb-1">${item.nama}</h6>
        <div class="d-flex justify-content-between align-items-center text-muted small mt-2">
          <span class="fw-semibold text-dark">Rp ${item.harga.toLocaleString('id-ID')}</span>
          <span>Stok: ${item.stok}</span>
        </div>
      </div>
    </div>
  `).join('');
}

function addToCart(id) {
  const item = menuList.find(m => m.id === id);
  if (!item) return;

  const exists = cart.find(c => c.id === id);
  if (exists) {
    exists.qty++;
    exists.subtotal = exists.qty * exists.harga;
  } else {
    cart.push({ ...item, qty: 1, subtotal: item.harga });
  }
  renderCart();
}

function renderCart() {
  const container = document.getElementById('cartList');
  if (!cart.length) {
    container.innerHTML = `<div class="text-center text-muted small py-4">Belum ada item dipilih</div>`;
    document.getElementById('grandTotal').innerText = 'Rp 0';
    return;
  }

  let total = 0;
  container.innerHTML = cart.map((c, i) => {
    total += c.subtotal;
    return `
      <div class="d-flex justify-content-between align-items-center mb-2 small border-bottom pb-2">
        <div>
          <strong>${c.nama}</strong><br>
          <span class="text-muted">${c.qty}x @ Rp ${c.harga.toLocaleString('id-ID')}</span>
        </div>
        <div class="text-end">
          <div class="fw-semibold mb-1">Rp ${c.subtotal.toLocaleString('id-ID')}</div>
          <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="removeItem(${i})">&times;</button>
        </div>
      </div>
    `;
  }).join('');
  document.getElementById('grandTotal').innerText = 'Rp ' + total.toLocaleString('id-ID');
}

function removeItem(idx) {
  cart.splice(idx, 1);
  renderCart();
}

function filterMenu() {
  const term = document.getElementById('searchBox').value.toLowerCase();
  document.querySelectorAll('.menu-item-card').forEach(el => {
    el.style.display = el.getAttribute('data-name').includes(term) ? '' : 'none';
  });
}

async function processCheckout() {
  if (!cart.length) return alert('Pilih minimal 1 menu!');
  const btn = document.getElementById('btnCheckout');
  btn.disabled = true;
  btn.innerText = 'Memproses...';

  const payload = {
    customerName: document.getElementById('custName').value || 'Pelanggan Walk-in',
    tableNumber: document.getElementById('tableNo').value || '-',
    paymentMethod: document.getElementById('payMethod').value,
    totalAmount: cart.reduce((acc, cur) => acc + cur.subtotal, 0),
    items: cart
  };

  try {
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'submitOrder', payload: payload })
    });
    const data = await res.json();

    if (data.status === 'SUCCESS') {
      alert('Transaksi Berhasil! ID: ' + data.orderId);
      cart = [];
      renderCart();
      loadMenu();
    } else {
      alert('Gagal: ' + data.message);
    }
  } catch (err) {
    alert('Koneksi bermasalah: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = 'Selesaikan Transaksi';
  }
}

async function submitExpense(e) {
  e.preventDefault();
  const btn = document.getElementById('btnSaveExpense');
  btn.disabled = true;
  btn.innerText = 'Menyimpan...';

  const payload = {
    kategori: document.getElementById('expCategory').value,
    nominal: document.getElementById('expAmount').value,
    deskripsi: document.getElementById('expDescription').value.trim(),
    pic: document.getElementById('expPic').value.trim()
  };

  try {
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      body: JSON.stringify({ action: 'recordExpense', payload: payload })
    });
    const data = await res.json();

    if (data.status === 'SUCCESS') {
      const modal = bootstrap.Modal.getInstance(document.getElementById('expenseModal'));
      modal.hide();
      document.getElementById('expenseForm').reset();
      alert('Beban operasional berhasil dicatat!');
    } else {
      alert('Gagal: ' + data.message);
    }
  } catch (err) {
    alert('Gagal mencatat beban: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = 'Simpan';
  }
}