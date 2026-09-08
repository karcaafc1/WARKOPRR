const OWNER_PIN = "8899"; // Ganti dengan 4 digit PIN rahasia Owner Anda

function getDb() {
  return SpreadsheetApp.openById("1XAN8fOZjhIp1UphUfgFmbX1Us2OcILMSb0-xMgiEFJ4");
}

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
    } else if (action === 'verifyPin') {
      result = { status: body.pin === OWNER_PIN ? 'SUCCESS' : 'INVALID' };
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

function doGet(e) {
  const action = e.parameter ? e.parameter.action : null;
  let result;

  if (action === 'getMenu') {
    result = getActiveMenu();
  } else if (action === 'getHistory') {
    result = getRecentOrders(e.parameter.limit || 30);
  } else if (action === 'getReport') {
    if (e.parameter.pin !== OWNER_PIN) {
      result = { status: 'UNAUTHORIZED', message: 'PIN Owner tidak valid' };
    } else {
      result = getDailyFinancialReport(e.parameter.date);
    }
  } else {
    result = { status: 'OK', message: 'API Warkop RR Beroperasi' };
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function getActiveMenu() {
  try {
    const sheet = getDb().getSheetByName('Menu');
    const data = sheet.getDataRange().getValues();
    data.shift();
    
    const items = data
      .filter(row => String(row[7]).toLowerCase() === 'aktif')
      .map(row => ({
        id: String(row[0]),
        nama: String(row[1]),
        kategori: String(row[2]),
        varian: String(row[3]),
        harga: Number(row[5]),
        stok: Number(row[6])
      }));
      
    return { status: 'SUCCESS', data: items };
  } catch (err) {
    return { status: 'ERROR', message: err.message };
  }
}

function submitOrder(payload) {
  const db = getDb();
  const sheetPesanan = db.getSheetByName('Pesanan');
  const sheetDetail = db.getSheetByName('Detail_Pesanan');
  const sheetMenu = db.getSheetByName('Menu');

  const timestamp = new Date();
  const idPesanan = 'WRR-' + Utilities.formatDate(timestamp, 'GMT+8', 'yyyyMMdd-HHmmss');

  sheetPesanan.appendRow([
    idPesanan,
    timestamp,
    payload.shift || 'Pagi',
    payload.isOvertime ? 'Ya' : 'Tidak',
    payload.customerName || 'Walk-in',
    payload.tableNumber || '-',
    Number(payload.totalAmount),
    payload.paymentMethod || 'Tunai',
    'Selesai',
    payload.cashier || 'Kasir'
  ]);

  const menuData = sheetMenu.getDataRange().getValues();
  const rowsDetail = [];

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
        const currentStock = Number(menuData[i][6]);
        sheetMenu.getRange(i + 1, 7).setValue(Math.max(0, currentStock - item.qty));
        break;
      }
    }
  });

  if (rowsDetail.length > 0) {
    sheetDetail.getRange(sheetDetail.getLastRow() + 1, 1, rowsDetail.length, rowsDetail[0].length).setValues(rowsDetail);
  }

  return { status: 'SUCCESS', orderId: idPesanan };
}

function getRecentOrders(limit) {
  try {
    const sheet = getDb().getSheetByName('Pesanan');
    const lastRow = sheet.getLastRow();
    if (lastRow <= 1) return { status: 'SUCCESS', data: [] };

    const startRow = Math.max(2, lastRow - Number(limit) + 1);
    const numRows = lastRow - startRow + 1;
    const values = sheet.getRange(startRow, 1, numRows, 10).getValues().reverse();

    const orders = values.map(r => ({
      id: r[0],
      jam: Utilities.formatDate(new Date(r[1]), 'GMT+8', 'HH:mm'),
      shift: r[2],
      lembur: r[3] === 'Ya',
      pelanggan: r[4],
      meja: r[5],
      total: Number(r[6]),
      metode: r[7]
    }));

    return { status: 'SUCCESS', data: orders };
  } catch (err) {
    return { status: 'ERROR', message: err.message };
  }
}