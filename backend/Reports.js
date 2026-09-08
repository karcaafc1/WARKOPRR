/**
 * Mengambil ringkasan laporan keuangan harian
 */
function getDailyFinancialReport(dateString) {
  try {
    const db = getDb();
    const targetDateStr = dateString || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');

    // 1. Ambil modal menu (HPP)
    const sheetMenu = db.getSheetByName('Menu');
    const menuValues = sheetMenu.getDataRange().getValues();
    menuValues.shift();

    const menuCostMap = new Map();
    menuValues.forEach(row => {
      menuCostMap.set(String(row[0]), Number(row[3]) || 0);
    });

    // 2. Ambil transaksi yang selesai pada tanggal terpilih
    const sheetPesanan = db.getSheetByName('Pesanan');
    const pesananValues = sheetPesanan.getDataRange().getValues();
    pesananValues.shift();

    const matchedOrderIds = new Set();
    let totalOmset = 0;
    let totalTransaksi = 0;
    const paymentBreakdown = { Tunai: 0, QRIS: 0, Transfer: 0 };

    pesananValues.forEach(row => {
      const orderId = String(row[0]);
      const rawDate = row[1];
      const status = String(row[6]);
      const total = Number(row[4]) || 0;
      const paymentMethod = String(row[5]);

      if (rawDate instanceof Date && status === 'Selesai') {
        const orderDateStr = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        if (orderDateStr === targetDateStr) {
          matchedOrderIds.add(orderId);
          totalOmset += total;
          totalTransaksi++;
          paymentBreakdown[paymentMethod] = (paymentBreakdown[paymentMethod] || 0) + total;
        }
      }
    });

    // 3. Kalkulasi total HPP dari item yang terjual
    const sheetDetail = db.getSheetByName('Detail_Pesanan');
    const detailValues = sheetDetail.getDataRange().getValues();
    detailValues.shift();

    let totalHpp = 0;
    detailValues.forEach(row => {
      const orderId = String(row[1]);
      const menuId = String(row[2]);
      const qty = Number(row[3]) || 0;

      if (matchedOrderIds.has(orderId)) {
        const costPerUnit = menuCostMap.get(menuId) || 0;
        totalHpp += (costPerUnit * qty);
      }
    });

    // 4. Ambil beban pengeluaran operasional
    const sheetPengeluaran = db.getSheetByName('Pengeluaran');
    const pengeluaranValues = sheetPengeluaran.getDataRange().getValues();
    pengeluaranValues.shift();

    let totalPengeluaran = 0;
    const expenseList = [];

    pengeluaranValues.forEach(row => {
      const rawDate = row[1];
      const kategori = String(row[2]);
      const deskripsi = String(row[3]);
      const nominal = Number(row[4]) || 0;

      if (rawDate instanceof Date) {
        const expDateStr = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        if (expDateStr === targetDateStr) {
          totalPengeluaran += nominal;
          expenseList.push({ kategori, deskripsi, nominal });
        }
      }
    });

    // 5. Kalkulasi Laba Kotor dan Bersih
    const labaKotor = totalOmset - totalHpp;
    const labaBersih = labaKotor - totalPengeluaran;
    const marginLabaBersih = totalOmset > 0 ? ((labaBersih / totalOmset) * 100).toFixed(1) : 0;

    return {
      status: 'SUCCESS',
      tanggal: targetDateStr,
      ringkasan: {
        omset: totalOmset,
        hpp: totalHpp,
        labaKotor: labaKotor,
        pengeluaran: totalPengeluaran,
        labaBersih: labaBersih,
        margin: marginLabaBersih,
        totalTransaksi: totalTransaksi
      },
      metodeBayar: paymentBreakdown,
      daftarPengeluaran: expenseList
    };
  } catch (err) {
    return { status: 'ERROR', message: err.message };
  }
}

/**
 * Mencatat beban pengeluaran harian
 */
function recordExpense(payload) {
  try {
    const db = getDb();
    const sheet = db.getSheetByName('Pengeluaran');
    const timestamp = new Date();
    const idPengeluaran = 'EXP-' + Utilities.formatDate(timestamp, 'GMT+8', 'yyyyMMdd-HHmmss');

    sheet.appendRow([
      idPengeluaran,
      timestamp,
      payload.kategori,
      payload.deskripsi,
      Number(payload.nominal),
      payload.pic || 'Kasir'
    ]);

    return { status: 'SUCCESS' };
  } catch (err) {
    return { status: 'ERROR', message: err.message };
  }
}