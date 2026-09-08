/**
 * Konfigurasi Koneksi Database Google Sheets
 */
function getDb() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

/**
 * REST API Entry Point: Menerima request POST dari Frontend
 */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const body = JSON.parse(e.postData.contents);
    const action = body.action;
    let result;

    if (action === 'submitOrder') {
      result = submitOrder(body.payload);
    } else if (action === 'recordExpense') {
      result = recordExpense(body.payload);
    } else {
      result = { status: 'ERROR', message: 'Aksi POST tidak valid' };
    }

    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'ERROR', message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

/**
 * REST API Entry Point: Menerima request GET dari Frontend
 */
function doGet(e) {
  const action = e.parameter ? e.parameter.action : null;
  let result;

  if (action === 'getMenu') {
    result = getActiveMenu();
  } else if (action === 'getReport') {
    result = getDailyFinancialReport(e.parameter.date);
  } else {
    result = { status: 'OK', message: 'API WARKOP RR Aktif' };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Mengambil daftar menu aktif dari sheet 'Menu'
 */
function getActiveMenu() {
  try {
    const sheet = getDb().getSheetByName('Menu');
    const data = sheet.getDataRange().getValues();
    data.shift(); // Buang header baris 1
    
    const items = data
      .filter(row => String(row[6]).toLowerCase() === 'aktif')
      .map(row => ({
        id: String(row[0]),
        nama: String(row[1]),
        kategori: String(row[2]),
        harga: Number(row[4]),
        stok: Number(row[5])
      }));
      
    return { status: 'SUCCESS', data: items };
  } catch (err) {
    return { status: 'ERROR', message: err.message };
  }
}

/**
 * Memproses transaksi pesanan baru
 */
function submitOrder(payload) {
  const db = getDb();
  const sheetPesanan = db.getSheetByName('Pesanan');
  const sheetDetail = db.getSheetByName('Detail_Pesanan');
  const sheetMenu = db.getSheetByName('Menu');

  const timestamp = new Date();
  const idPesanan = 'WRR-' + Utilities.formatDate(timestamp, 'GMT+8', 'yyyyMMdd-HHmmss');

  // Simpan data utama transaksi
  sheetPesanan.appendRow([
    idPesanan,
    timestamp,
    payload.customerName,
    payload.tableNumber,
    payload.totalAmount,
    payload.paymentMethod,
    'Selesai',
    payload.cashier || 'Kasir'
  ]);

  const menuData = sheetMenu.getDataRange().getValues();
  const rowsDetail = [];

  // Catat detail item & kurangi stok
  payload.items.forEach((item, index) => {
    rowsDetail.push([
      idPesanan + '-' + (index + 1),
      idPesanan,
      item.id,
      item.qty,
      item.subtotal,
      item.notes || '-'
    ]);

    for (let i = 1; i < menuData.length; i++) {
      if (String(menuData[i][0]) === String(item.id)) {
        const currentStock = Number(menuData[i][5]);
        sheetMenu.getRange(i + 1, 6).setValue(Math.max(0, currentStock - item.qty));
        break;
      }
    }
  });

  if (rowsDetail.length > 0) {
    sheetDetail.getRange(sheetDetail.getLastRow() + 1, 1, rowsDetail.length, rowsDetail[0].length).setValues(rowsDetail);
  }

  return { status: 'SUCCESS', orderId: idPesanan };
}