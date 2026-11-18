# Metta-Mart — Status Audit

Tanggal: 18 November 2026  
Branch dasar: `feat/phase1-categories-settings-ui`  
Branch pengerjaan: `feat/phase2-catalog-inventory-orders`

## Status yang benar-benar ada di branch dasar

- Backend Django + DRF sudah ada.
- Login/logout/me menggunakan session cookie dan CSRF.
- Role Admin, Cashier, Student, Parent sudah ada pada model user.
- Audit log dan model pengaturan global sudah ada.
- Frontend login sudah memanggil API backend.
- Frontend katalog, stok, pesanan, notifikasi, laporan, dan checkout masih memakai data mock atau state lokal. Layar tersebut belum mewakili transaksi sungguhan.
- Belum ada model katalog/stock/order/payment sebelum commerce phase.

## Implementasi commerce yang sedang ditambahkan pada branch fitur

- Kategori dan produk persisten di backend.
- Perubahan stok melalui endpoint khusus dan jejak stock movement.
- Checkout server-side dengan kalkulasi harga dari database, reservasi stok atomik, snapshot nama/harga produk, dan validasi fulfillment.
- Status order terpisah dari status pembayaran.
- Riwayat perubahan status dan audit log.
- Isolasi pesanan pelanggan: Student/Parent hanya melihat pesanan sendiri; Admin/Cashier melihat antrean toko.
- Admin memverifikasi QRIS manual, menerima, atau menolak pesanan; penolakan/pembatalan mengembalikan stok.
- QRIS yang sudah dibayar tetapi order ditolak masuk status refund_pending, bukan dianggap otomatis sudah dikembalikan.
- Perintah terjadwal untuk kedaluwarsa pembayaran QRIS dan melepas stok.

## Yang belum boleh diklaim selesai

1. Frontend belum seluruhnya dihubungkan ke endpoint commerce.
2. QRIS belum menampilkan gambar QR toko dari pengaturan dan belum memiliki bukti pembayaran upload. Verifikasi statis tetap manual sampai provider resmi terhubung.
3. GoSend/GrabExpress belum terhubung ke API resmi; tarif, booking, tracking, dan status kurir masih perlu integrasi.
4. POS, shift kasir, cash drawer, struk, pembelian pemasok, stock opname, retur, refund reconciliation, promo, dan laporan akuntansi belum dibangun.
5. Notifikasi real-time/email/push belum dibangun.
6. Database TiDB belum diverifikasi pada branch ini; migrasi dan tes concurrency wajib dijalankan terhadap database target sebelum produksi.
7. Belum ada CI pipeline, test frontend, observability, backup/restore drill, atau security review menyeluruh.

## Urutan implementasi yang disarankan

1. Selesaikan backend commerce, migrasi, tests, dan validasi MySQL/TiDB.
2. Hubungkan Admin katalog/stok dan layar pesanan ke API nyata.
3. Hubungkan Student/Parent katalog, checkout, detail pesanan, dan polling status.
4. Tambahkan konfigurasi QRIS toko, bukti pembayaran opsional, verifikasi manual, dan rekonsiliasi refund.
5. Bangun POS kasir dan shift.
6. Bangun notifikasi, laporan dari data transaksi, dan audit UI.
7. Integrasikan penyedia kurir dan payment gateway hanya setelah akun/API resmi tersedia.
8. Tambahkan CI, monitoring, backup, load/concurrency/security tests, lalu lakukan UAT.

Dokumen ini sengaja membedakan kode yang sudah ada, yang sedang dibangun, dan dependensi eksternal. Fitur tidak boleh dinyatakan siap produksi hanya karena endpoint atau UI telah dibuat.
