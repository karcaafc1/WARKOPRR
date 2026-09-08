/**
 * ============================================================================
 * WARKOP RR - SCRIPT SETUP DATABASE OTOMATIS
 * Jalankan fungsi "initDatabaseWarkopRR()" sekali saja dari Apps Script editor.
 * ============================================================================
 */
function initDatabaseWarkopRR() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. SETUP SHEET 'Menu'
  setupSheetMenu(ss);
  
  // 2. SETUP SHEET 'Pesanan'
  setupSheetPesanan(ss);
  
  // 3. SETUP SHEET 'Detail_Pesanan'
  setupSheetDetailPesanan(ss);
  
  // 4. SETUP SHEET 'Pengeluaran'
  setupSheetPengeluaran(ss);

  // 5. SETUP SHEET 'Rekap_Harian'
  setupSheetRekapHarian(ss);

  // Hapus 'Sheet1' bawaan jika masih ada dan kosong
  const defaultSheet = ss.getSheetByName('Sheet1');
  if (defaultSheet && ss.getSheets().length > 1) {
    try {
      ss.deleteSheet(defaultSheet);
    } catch (e) {
      // Abaikan jika Sheet1 tidak bisa dihapus
    }
  }

  Logger.log('Inisialisasi Database WARKOP RR Berhasil 100%!');
}

/**
 * Helper: Format Header Kolom agar Rapi & Profesional
 */
function applyHeaderStyle(range, bgColor) {
  range.setFontWeight('bold')
       .setFontColor('#ffffff')
       .setBackground(bgColor)
       .setHorizontalAlignment('center')
       .setVerticalAlignment('middle');
}

/**
 * 1. Setup Sheet Menu & Isi Data Awal
 */
function setupSheetMenu(ss) {
  let sheet = ss.getSheetByName('Menu');
  if (!sheet) {
    sheet = ss.insertSheet('Menu');
  } else {
    sheet.clear(); // Bersihkan isi lama jika ingin reset
  }

  const headers = ['id_menu', 'nama_item', 'kategori', 'ukuran_varian', 'harga_modal', 'harga_jual', 'stok', 'status'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  applyHeaderStyle(sheet.getRange(1, 1, 1, headers.length), '#2c3e50');
  sheet.setFrozenRows(1);

  // Data Menu Khusus Warkop RR (Sesuai Permintaan Anda)
  const initialMenuData = [
    // MINUMAN (Kecil & Besar)
    ['MIN01', 'Kopi Susu', 'Minuman', 'Kecil', 4000, 10000, 100, 'Aktif'],
    ['MIN02', 'Kopi Susu', 'Minuman', 'Besar', 6000, 13000, 100, 'Aktif'],
    ['MIN03', 'Kopi Hitam', 'Minuman', 'Kecil', 3000, 7000, 100, 'Aktif'],
    ['MIN04', 'Kopi Hitam', 'Minuman', 'Besar', 5000, 10000, 100, 'Aktif'],
    ['MIN05', 'Teh Panas', 'Minuman', 'Kecil', 2000, 5000, 100, 'Aktif'],
    ['MIN06', 'Teh Panas', 'Minuman', 'Besar', 3000, 7000, 100, 'Aktif'],
    ['MIN07', 'Teh Dingin', 'Minuman', 'Kecil', 2500, 6000, 100, 'Aktif'],
    ['MIN08', 'Teh Dingin', 'Minuman', 'Besar', 3500, 8000, 100, 'Aktif'],
    ['MIN09', 'Milo Panas', 'Minuman', 'Kecil', 4000, 9000, 100, 'Aktif'],
    ['MIN10', 'Milo Panas', 'Minuman', 'Besar', 6000, 12000, 100, 'Aktif'],
    ['MIN11', 'Milo Dingin', 'Minuman', 'Kecil', 4500, 10000, 100, 'Aktif'],
    ['MIN12', 'Milo Dingin', 'Minuman', 'Besar', 6500, 13000, 100, 'Aktif'],
    ['MIN13', 'Fanta / Sprite', 'Minuman', 'Botol', 4000, 7000, 50, 'Aktif'],
    ['MIN14', 'Soda Susu', 'Minuman', 'Standar', 6000, 12000, 50, 'Aktif'],

    // MAKANAN (Indomie Single / Double, Nasi Kuning)
    ['MAK01', 'Indomie Rebus', 'Makanan', 'Single', 3500, 8000, 100, 'Aktif'],
    ['MAK02', 'Indomie Rebus', 'Makanan', 'Double', 6500, 13000, 100, 'Aktif'],
    ['MAK03', 'Indomie Goreng', 'Makanan', 'Single', 3500, 8000, 100, 'Aktif'],
    ['MAK04', 'Indomie Goreng', 'Makanan', 'Double', 6500, 13000, 100, 'Aktif'],
    ['MAK05', 'Nasi Kuning Bungkus', 'Makanan', 'Bungkus', 6000, 10000, 50, 'Aktif'],

    // ADD-ON & TAMBAHAN
    ['EX01', 'Tambah Telur', 'Tambahan', 'Porsi', 2500, 4000, 100, 'Aktif'],
    ['EX02', 'Kacang', 'Tambahan', 'Bungkus', 1500, 3000, 100, 'Aktif'],
    ['EX03', 'Kerupuk', 'Tambahan', 'Bungkus', 1000, 2000, 100, 'Aktif']
  ];

  sheet.getRange(2, 1, initialMenuData.length, headers.length).setValues(initialMenuData);
  
  // Format mata uang Rupiah untuk kolom Harga Modal (E) dan Harga Jual (F)
  sheet.getRange(2, 5, initialMenuData.length, 2).setNumberFormat('"Rp"#,##0');
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * 2. Setup Sheet Pesanan (Transaksi Utama)
 */
function setupSheetPesanan(ss) {
  let sheet = ss.getSheetByName('Pesanan');
  if (!sheet) {
    sheet = ss.insertSheet('Pesanan');
  }

  const headers = [
    'id_pesanan', 'timestamp', 'shift', 'lembur', 
    'nama_pelanggan', 'nomor_meja', 'total_bayar', 
    'metode_bayar', 'status_pesanan', 'kasir'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  applyHeaderStyle(sheet.getRange(1, 1, 1, headers.length), '#16a085');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * 3. Setup Sheet Detail Pesanan (Rincian Item)
 */
function setupSheetDetailPesanan(ss) {
  let sheet = ss.getSheetByName('Detail_Pesanan');
  if (!sheet) {
    sheet = ss.insertSheet('Detail_Pesanan');
  }

  const headers = ['id_detail', 'id_pesanan', 'id_menu', 'qty', 'subtotal', 'catatan'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  applyHeaderStyle(sheet.getRange(1, 1, 1, headers.length), '#2980b9');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * 4. Setup Sheet Pengeluaran (Beban Operasional)
 */
function setupSheetPengeluaran(ss) {
  let sheet = ss.getSheetByName('Pengeluaran');
  if (!sheet) {
    sheet = ss.insertSheet('Pengeluaran');
  }

  const headers = ['id_pengeluaran', 'timestamp', 'kategori', 'deskripsi', 'jumlah', 'pic'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  applyHeaderStyle(sheet.getRange(1, 1, 1, headers.length), '#c0392b');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * 5. Setup Sheet Rekap Harian (Tutup Buku Finansial)
 */
function setupSheetRekapHarian(ss) {
  let sheet = ss.getSheetByName('Rekap_Harian');
  if (!sheet) {
    sheet = ss.insertSheet('Rekap_Harian');
  }

  const headers = [
    'tanggal', 'total_transaksi', 'omset_gross', 
    'hpp_modal', 'laba_kotor', 'biaya_operasional', 
    'laba_bersih', 'margin_persen', 'diarsipkan_pada'
  ];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  applyHeaderStyle(sheet.getRange(1, 1, 1, headers.length), '#8e44ad');
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, headers.length);
}
