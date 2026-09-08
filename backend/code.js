const SPREADSHEET_ID = "1XAN8fOZjhIp1UphUfgFmbX1Us2OcILMSb0-xMgiEFJ4";

function getDb() {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch (e) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
}

function responseJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    
    let body = {};
    if (e && e.postData && e.postData.contents) {
      try {
        body = JSON.parse(e.postData.contents);
      } catch (errParse) {
        body = e.parameter || {};
      }
    } else if (e && e.parameter) {
      body = e.parameter;
    }

    const action = body.action;

    // 1. ROUTING LOGIN & LOGOUT KASIR
    if (action === 'login') return responseJSON(handleLogin(body.payload || body));
    if (action === 'logout') return responseJSON(handleLogout(body.payload || body));

    // 2. VALIDASI TOKEN SESI AKTIF (Mencegah Akses Tanpa Izin)
    const auth = validateSession(body.token, body.username);
    if (!auth.valid) {
      return responseJSON({ status: 'UNAUTHORIZED', message: auth.message });
    }

    // 3. OPERASIONAL KASIR & OWNER
    if (action === 'openShift') return responseJSON(handleOpenShift(body.payload, auth.user));
    if (action === 'submitOrder') return responseJSON(handleSubmitOrder(body.payload, auth.user));
    if (action === 'voidOrder') return responseJSON(handleVoidOrder(body.payload, auth.user));
    if (action === 'recordExpense') return responseJSON(handleRecordExpense(body.payload, auth.user));

    return responseJSON({ status: 'ERROR', message: 'Endpoint POST tidak ditemukan: ' + action });
  } catch (err) {
    return responseJSON({ status: 'ERROR', message: err.message });
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  const action = e.parameter ? e.parameter.action : null;
  const token = e.parameter ? e.parameter.token : null;
  const username = e.parameter ? e.parameter.username : null;

  if (action === 'getMenu') return responseJSON(getActiveMenu());

  const auth = validateSession(token, username);
  if (!auth.valid) {
    return responseJSON({ status: 'UNAUTHORIZED', message: auth.message });
  }

  if (action === 'getHistory') return responseJSON(getShiftHistory(e.parameter.shift, auth.user));
  if (action === 'getReport') {
    if (auth.user.role !== 'Owner') {
      return responseJSON({ status: 'FORBIDDEN', message: 'Hanya Owner yang berhak mengakses laporan' });
    }
    return responseJSON(getFinancialReport(e.parameter.date));
  }

  return responseJSON({ status: 'OK', message: 'API Warkop RR Beroperasi' });
}

function handleLogin(p) {
  if (!p || !p.username || !p.password) {
    return { status: 'ERROR', message: 'Username dan password wajib diisi' };
  }

  const db = getDb();
  const sheet = db.getSheetByName('User');
  if (!sheet) {
    return { status: 'ERROR', message: 'Sheet User belum dibuat! Jalankan initDatabaseWarkopRR di SetupSheets.gs' };
  }

  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const dbUsername = String(row[1]).trim().toLowerCase();
    const dbPassword = String(row[2]).trim();
    const reqUsername = String(p.username).trim().toLowerCase();
    const reqPassword = String(p.password).trim();

    if (dbUsername === reqUsername && dbPassword === reqPassword) {
      if (row[5] !== 'Aktif') {
        return { status: 'ERROR', message: 'Akun Anda dinonaktifkan' };
      }

      // Cegah 2 Kasir Bertugas Bersamaan
      if (row[3] === 'Kasir') {
        for (let j = 1; j < data.length; j++) {
          if (data[j][3] === 'Kasir' && data[j][6] === 'Ya' && j !== i) {
            return { 
              status: 'ERROR', 
              message: `Akses ditolak! Kasir '${data[j][4]}' sedang bertugas. Minta kasir sebelumnya logout terlebih dahulu.` 
            };
          }
        }
      }

      const token = Utilities.getUuid();
      const now = new Date();

      sheet.getRange(i + 1, 7).setValue('Ya');
      sheet.getRange(i + 1, 8).setValue(token);
      sheet.getRange(i + 1, 9).setValue(now);
      sheet.getRange(i + 1, 10).setValue(p.shift || 'Pagi');

      return {
        status: 'SUCCESS',
        user: {
          username: row[1],
          role: row[3],
          nama: row[4],
          shift: p.shift || 'Pagi',
          token: token
        }
      };
    }
  }
  return { status: 'ERROR', message: 'Username atau Password salah!' };
}

function handleLogout(p) {
  if (!p || !p.username) return { status: 'SUCCESS' };
  const db = getDb();
  const sheet = db.getSheetByName('User');
  if (!sheet) return { status: 'SUCCESS' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === String(p.username).trim().toLowerCase()) {
      sheet.getRange(i + 1, 7).setValue('Tidak');
      sheet.getRange(i + 1, 8).setValue('');
      return { status: 'SUCCESS' };
    }
  }
  return { status: 'SUCCESS' };
}

function validateSession(token, username) {
  if (!token || !username) return { valid: false, message: 'Autentikasi dibutuhkan' };
  const db = getDb();
  const sheet = db.getSheetByName('User');
  if (!sheet) return { valid: false, message: 'Database User tidak ditemukan' };

  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]).trim().toLowerCase() === String(username).trim().toLowerCase()) {
      if (data[i][6] === 'Ya' && String(data[i][7]) === String(token)) {
        return {
          valid: true,
          user: {
            username: data[i][1],
            role: data[i][3],
            nama: data[i][4],
            shift: data[i][9]
          }
        };
      } else {
        return { valid: false, message: 'Sesi kedaluwarsa atau dipakai di perangkat lain.' };
      }
    }
  }
  return { valid: false, message: 'Pengguna tidak ditemukan' };
}

function getActiveMenu() {
  const db = getDb();
  const sheet = db.getSheetByName('Menu');
  if (!sheet) return { status: 'ERROR', message: 'Sheet Menu belum dibuat' };

  const data = sheet.getDataRange().getValues();
  data.shift();

  const menu = data
    .filter(r => String(r[7]).toLowerCase() === 'aktif')
    .map(r => ({
      id: String(r[0]),
      nama: String(r[1]),
      kategori: String(r[2]),
      varian: String(r[3]),
      harga: Number(r[5]),
      stok: Number(r[6])
    }));

  return { status: 'SUCCESS', data: menu };
}

function handleSubmitOrder(p, user) {
  const db = getDb();
  const sheetPesanan = db.getSheetByName('Pesanan');
  const sheetDetail = db.getSheetByName('Detail_Pesanan');
  const sheetMenu = db.getSheetByName('Menu');

  const now = new Date();
  const idPesanan = 'WRR-' + Utilities.formatDate(now, 'GMT+8', 'yyyyMMdd-HHmmss');

  sheetPesanan.appendRow([
    idPesanan,
    now,
    p.shift,
    p.isLembur ? 'Ya' : 'Tidak',
    p.customerName || 'Walk-in',
    p.tableNumber || '-',
    Number(p.totalAmount),
    Number(p.nominalDiterima || p.totalAmount),
    Number(p.kembalian || 0),
    p.paymentMethod,
    'Selesai',
    user.username,
    ''
  ]);

  const menuData = sheetMenu.getDataRange().getValues();
  const detailRows = [];

  p.items.forEach((item, idx) => {
    detailRows.push([
      idPesanan + '-' + (idx + 1),
      idPesanan,
      item.id,
      item.nama + ' (' + item.varian + ')',
      item.qty,
      item.subtotal,
      item.catatan || '-'
    ]);

    for (let m = 1; m < menuData.length; m++) {
      if (String(menuData[m][0]) === String(item.id)) {
        const curStock = Number(menuData[m][6]);
        sheetMenu.getRange(m + 1, 7).setValue(Math.max(0, curStock - item.qty));
        break;
      }
    }
  });

  if (detailRows.length > 0) {
    sheetDetail.getRange(sheetDetail.getLastRow() + 1, 1, detailRows.length, detailRows[0].length).setValues(detailRows);
  }

  return { status: 'SUCCESS', orderId: idPesanan };
}

function handleVoidOrder(p, user) {
  const db = getDb();
  const sheetPesanan = db.getSheetByName('Pesanan');
  const sheetDetail = db.getSheetByName('Detail_Pesanan');
  const sheetMenu = db.getSheetByName('Menu');

  const orders = sheetPesanan.getDataRange().getValues();
  let foundRow = -1;

  for (let i = 1; i < orders.length; i++) {
    if (String(orders[i][0]) === String(p.orderId)) {
      if (orders[i][10] === 'Void') {
        return { status: 'ERROR', message: 'Pesanan ini sudah dibatalkan sebelumnya' };
      }
      foundRow = i + 1;
      break;
    }
  }

  if (foundRow === -1) return { status: 'ERROR', message: 'Pesanan tidak ditemukan' };

  sheetPesanan.getRange(foundRow, 11).setValue('Void');
  sheetPesanan.getRange(foundRow, 13).setValue(p.reason + ' (Oleh: ' + user.username + ')');

  const details = sheetDetail.getDataRange().getValues();
  const menuData = sheetMenu.getDataRange().getValues();

  details.forEach(d => {
    if (String(d[1]) === String(p.orderId)) {
      const menuId = String(d[2]);
      const qty = Number(d[4]);

      for (let m = 1; m < menuData.length; m++) {
        if (String(menuData[m][0]) === menuId) {
          const cur = Number(sheetMenu.getRange(m + 1, 7).getValue());
          sheetMenu.getRange(m + 1, 7).setValue(cur + qty);
          break;
        }
      }
    }
  });

  return { status: 'SUCCESS', message: 'Pesanan berhasil dibatalkan dan stok dikembalikan' };
}

function getShiftHistory(shiftName, user) {
  const db = getDb();
  const sheet = db.getSheetByName('Pesanan');
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { status: 'SUCCESS', data: [] };

  const numRows = Math.min(40, lastRow - 1);
  const rows = sheet.getRange(lastRow - numRows + 1, 1, numRows, 13).getValues().reverse();

  const data = rows.map(r => ({
    id: r[0],
    jam: Utilities.formatDate(new Date(r[1]), 'GMT+8', 'HH:mm'),
    shift: r[2],
    pelanggan: r[4],
    meja: r[5],
    total: Number(r[6]),
    metode: r[9],
    status: r[10],
    kasir: r[11]
  }));

  return { status: 'SUCCESS', data: data };
}

function handleRecordExpense(p, user) {
  const db = getDb();
  const sheet = db.getSheetByName('Pengeluaran');
  const idExp = 'EXP-' + Utilities.formatDate(new Date(), 'GMT+8', 'yyyyMMdd-HHmmss');

  sheet.appendRow([
    idExp,
    new Date(),
    p.kategori,
    p.deskripsi,
    Number(p.nominal),
    user.username,
    p.shift || 'Pagi'
  ]);

  return { status: 'SUCCESS' };
}
