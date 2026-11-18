# Metta-Mart — Status Audit

Tanggal: 18 November 2026  
Branch dasar: `feat/phase1-categories-settings-ui`  
Branch pengerjaan: `feat/phase2-catalog-inventory-orders`

## Status pada branch dasar

- Backend Django + DRF, session auth, CSRF, role Admin/Cashier/Parent/Student, audit log, dan pengaturan toko sudah ada.
- Login frontend sudah terhubung ke backend.
- Katalog, stok, pesanan, checkout, pembayaran, POS, notifikasi, dan laporan pada branch dasar belum menjadi alur transaksi end-to-end; sebagian besar masih mock/state lokal.

## Implementasi yang sudah masuk pada branch fitur

- Kategori dan produk persisten; katalog Admin dan pelanggan membaca API backend.
- Penyesuaian stok melalui endpoint khusus, validasi stok nonnegatif, dan stock movement ledger.
- Checkout pelanggan menghitung harga dan biaya pengiriman di server, mereservasi stok dalam transaksi database, menyimpan snapshot item, dan memvalidasi alamat.
- Order lifecycle dan payment lifecycle dipisah. Perubahan status tercatat pada history dan audit log.
- Student/Parent hanya dapat melihat pesanan milik akun masing-masing; Admin/Cashier dapat melihat antrean toko.
- Admin dapat memverifikasi QRIS secara manual, menerima/menolak pesanan, dan memproses refund yang memang sudah dilakukan secara manual.
- QRIS static toko dikonfigurasi melalui Admin Settings menggunakan URL gambar. Sistem menunggu verifikasi Admin; tidak menganggap screenshot atau callback browser sebagai bukti pembayaran.
- Order QRIS yang belum dibayar dapat kedaluwarsa melalui management command yang melepas stok reservasi.
- Dashboard Admin dan pelanggan, antrean pesanan Admin, detail pesanan, dan riwayat pesanan pelanggan sudah memakai API backend.
- POS Kasir memiliki buka/tutup shift, kas masuk/keluar, penjualan tunai, pencatatan uang diterima/kembalian, perhitungan kas seharusnya, dan selisih saat tutup shift.
- GitHub Actions memeriksa konfigurasi/migrasi/tes backend serta TypeScript dan production build frontend. CI berjalan memakai SQLite, bukan TiDB.

## Batasan dan hal yang belum selesai

1. QRIS image dimasukkan sebagai URL; belum ada upload asset yang dikelola aplikasi. Belum ada upload bukti bayar atau nomor referensi transaksi pelanggan.
2. QRIS masih diverifikasi manual lewat aplikasi merchant. Konfirmasi otomatis memerlukan penyedia/aggregator resmi, kredensial merchant, webhook bertanda tangan, dan rekonsiliasi.
3. GoSend/GrabExpress belum terhubung ke API resmi. Tarif, pemesanan kurir, tracking, dan pembaruan status otomatis belum tersedia.
4. POS belum terhubung ke printer struk khusus; tombol cetak memakai dialog print browser. Belum ada laporan shift/rekap kas Admin.
5. Pembelian pemasok, penerimaan barang, stock opname, retur, dan alur persetujuan pengeluaran barang belum dibangun.
6. Laporan dan notifikasi masih perlu dipindahkan sepenuhnya dari mock ke data backend. Belum ada email/push/realtime notification.
7. Pengelolaan kategori, gambar produk, pencarian/filter, dan tampilan riwayat stock movement masih perlu penyempurnaan UI.
8. Belum dilakukan validasi migrasi, locking, dan concurrency pada TiDB/MySQL target. Tes SQLite tidak membuktikan perilaku transaksi produksi.
9. Belum ada backup/restore drill, monitoring, rate-limit menyeluruh, security review, UAT, atau verifikasi deployment produksi.

## Tahap berikutnya

1. Jalankan migrasi dan tes di database TiDB/MySQL target tanpa menghapus database/data yang sudah ada.
2. Selesaikan layar riwayat stok, pengelolaan kategori/gambar produk, dan laporan stok.
3. Bangun laporan penjualan dan rekap shift kasir dari data transaksi.
4. Hubungkan notifikasi dan audit log UI ke backend.
5. Tambahkan bukti/nomor referensi pembayaran QRIS dan prosedur refund reconciliation.
6. Integrasikan GoSend/GrabExpress hanya setelah akun dan API resmi tersedia.
7. Tambahkan idempotency checkout, concurrency tests pada MySQL/TiDB, security tests, backup, monitoring, dan UAT.
8. Baru setelah seluruh dependensi diuji, lakukan deployment produksi.

Dokumen ini membedakan fitur yang benar-benar terimplementasi dari fitur yang masih memerlukan pekerjaan atau akses pihak ketiga. Tidak ada integrasi eksternal yang boleh dinyatakan aktif tanpa bukti koneksi resmi dan pengujian end-to-end.
