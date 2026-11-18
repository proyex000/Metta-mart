# Metta-Mart — Phase 0: Audit dan Gap Analysis

Tanggal audit: 18 November 2026
Cakupan: seluruh isi repo `proyex000/Metta-mart` (branch `main` + perubahan di `feat/phase1-categories-settings-ui`).

## 1. Kesimpulan singkat

Metta-Mart saat ini adalah **prototipe frontend**. Tidak ada backend, database, API, maupun pengujian otomatis.
Semua data (produk, pesanan, notifikasi, akun) adalah data contoh di dalam kode atau di `localStorage`.
Yang bernilai dan layak dipertahankan: shell aplikasi per-role, routing, desain/brand, dan alur layar.
Hampir seluruh logika bisnis harus dibangun baru di backend.

## 2. Inventaris repo

Hanya ada `frontend/` (React 19, TypeScript, Vite 8, Tailwind 4, React Router 8). Tidak ada folder backend, `docker`, CI, atau test.

| Area | File | Keadaan |
|---|---|---|
| Routing + proteksi role | `src/app/routes.tsx` | Berfungsi di sisi klien saja |
| Layout/sidebar per role | `src/layouts/RoleLayout.tsx` | Berfungsi (UI) |
| Auth | `src/services/auth.ts`, `src/hooks/useAuth.tsx` | **Mock**: akun demo di kode, sesi di `localStorage` |
| Data | `src/data/mock.ts` | **Mock**: produk, pesanan, notifikasi, akun demo |
| Produk | `src/services/products.ts` | Store **di memori** (pengganti API), hilang saat refresh |
| Admin | `src/pages/admin/AdminPages.tsx` (~1390 baris) | UI; ikon/Brand/Modal terduplikasi dari `ui.tsx` |
| Murid/Orang tua | `src/pages/shop/*` | UI; pesanan, status, laporan bulanan hardcoded |
| API client | tidak ada | Tidak ada satu pun `fetch`/`axios` |
| Pengujian | tidak ada | Tidak ada test framework |

## 3. Status fitur terhadap Master Prompt

Legenda: **Ada** = benar-benar berfungsi dan persisten · **Simulasi** = tampilan/alur palsu · **Belum** = tidak ada.

| Modul | Status | Catatan |
|---|---|---|
| Login & role | Simulasi | Password admin/murid/ortu tertanam di JS. Tidak ada token, hashing, atau otorisasi server |
| Registrasi | Simulasi | Hanya menampilkan pesan sukses lalu redirect |
| Role Petugas/Kasir | Belum | `Role` hanya `admin | parent | student` |
| Relasi orang tua–siswa | Belum | Tidak ada model maupun verifikasi |
| Produk & kategori | Simulasi | Kategori terpusat di frontend (sudah dikerjakan), tapi data tidak persisten. CRUD produk berjalan hanya di memori |
| SKU, barcode, satuan, harga modal, stok minimum, kedaluwarsa, gambar | Belum | |
| Stock movement, barang masuk/keluar, opname | Belum | Stok hanya angka |
| Pemasok & pembelian | Belum | |
| POS/Kasir, struk, shift, kas | Belum | |
| Pemesanan online | Simulasi | Checkout memakai `setTimeout` lalu pindah halaman; tidak ada keranjang, nomor pesanan, atau pengurangan stok |
| Reservasi stok | Belum | |
| Pembayaran tunai/transfer/QRIS | Simulasi | Pilihan metode saja; halaman sudah menyatakan belum ada gateway |
| Pengiriman (ambil/kurir/GoSend/Grab) | Belum | |
| Notifikasi | Simulasi | Daftar hardcoded, badge "5" tetap |
| Laporan | Simulasi | Angka dan grafik contoh |
| Pengaturan | Simulasi | Disimpan di `localStorage` (logo toko, metode pembayaran, preferensi) |
| Audit log, rate limit, backup | Belum | |

## 4. Risiko dan temuan

1. **Keamanan**: kredensial demo (termasuk admin) ada di bundle JS; role hanya dicek di klien. Tidak boleh dipakai produksi.
2. **Integritas data**: stok, harga, dan total dihitung di klien. Semuanya harus dipindah ke backend.
3. **Pengaturan metode pembayaran** dibaca dari `localStorage` oleh halaman pesan, jadi pengaturan Admin tidak bisa memengaruhi pengguna lain.
4. **Duplikasi kode**: `AdminPages.tsx` punya `Icon`, `Brand`, `Status`, `Modal` sendiri; sebagian kode "MobileApp" di dalamnya kemungkinan tidak terpakai.
5. **Tidak ada tes**: setiap perubahan belum bisa diverifikasi otomatis.
6. **Batasan lingkungan kerja ini**: Django, DRF, driver MySQL, dan paket npm belum terpasang, dan jaringan untuk instal dimatikan. Backend dan frontend belum bisa dijalankan, di-build, atau diuji di sini.
7. **Konflik dengan brief sebelumnya**: brief GoSend lama (mode kuotasi manual, aturan harga) akan digabung ke Phase 6 agar tidak ada dua spesifikasi pengiriman yang bertentangan.

## 5. Keputusan arsitektur yang diusulkan

| # | Keputusan | Usulan | Alasan |
|---|---|---|---|
| A1 | Struktur repo | `backend/` Django di samping `frontend/` | Tidak mengubah frontend yang ada |
| A2 | Autentikasi | Session cookie HttpOnly + CSRF (DRF `SessionAuthentication`), frontend dan API satu domain lewat reverse proxy | Token tidak terbaca JavaScript; lebih aman dari JWT di `localStorage`. Alternatif: JWT bila nanti ada klien mobile |
| A3 | User model | Custom `User` tunggal dengan `role` (admin, cashier, student, parent); murid login dengan NISN, orang tua dengan email | Cocok dengan layar login sekarang |
| A4 | Relasi orang tua–siswa | Orang tua mengajukan, **admin memverifikasi** sebelum bisa melihat/memesan untuk anak | Memenuhi syarat "bukan input bebas" |
| A5 | Database | MySQL-compatible (TiDB). Tes konkurensi stok dijalankan di MySQL, bukan SQLite | Perilaku locking SQLite berbeda |
| A6 | Uang | Bilangan bulat Rupiah; total selalu dihitung di server | Hindari galat pembulatan |
| A7 | Stok | Update atomik (`UPDATE ... WHERE stock >= qty`) + baris `InventoryMovement` untuk setiap perubahan; reservasi punya `expires_at` | Cegah overselling dan stok ganda |
| A8 | Reservasi kedaluwarsa | Management command berkala (cron) + pengecekan saat checkout; tanpa Celery dulu | Lebih sederhana untuk koperasi sekolah |
| A9 | Pembayaran/kurir | Adapter per penyedia; credential hanya dari environment variable; status "belum dikonfigurasi" bila kunci tidak ada | Tidak ada integrasi palsu |
| A10 | Frontend | Tambah API client tipis dan ganti `mock.ts`, `auth.ts`, `products.ts` per phase; pertahankan UI | Perubahan minimal |

## 6. Rencana Phase 1 (Backend Foundation)

Isi: proyek Django + DRF di `backend/`, konfigurasi dari environment variable, model `User`/role/permission, `Student`, `ParentStudentRelation`, `AuditLog`, `StoreSetting`, migrasi awal, endpoint login/logout/me/CSRF, daftar akun dan relasi (admin), rate limiting pada login, CORS terkonfigurasi, `.env.example`, dokumentasi setup, dan test (unit, hak akses, API).
Frontend: API client, `useAuth` memakai endpoint nyata, halaman login memakai backend, role `cashier` ditambahkan, akun demo dihapus dari bundle.

File baru (perkiraan): `backend/manage.py`, `backend/config/*`, `backend/accounts/*`, `backend/core/*`, `backend/requirements.txt`, `backend/.env.example`, `backend/README.md`; ubah: `frontend/src/services/auth.ts`, `hooks/useAuth.tsx`, `types/index.ts`, `pages/auth/AuthPages.tsx`, `data/mock.ts` (hapus `demoAccounts`).

Syarat selesai Phase 1: migrasi berjalan di MySQL, seluruh test lulus, login nyata dari frontend, akses antar role ditolak oleh backend.

## 7. Pekerjaan yang sudah ada dan akan diganti

Branch `feat/phase1-categories-settings-ui` (kategori terpusat, Seragam Sekolah, Settings di sidebar, penyelarasan UI) tetap dipakai. Store produk di memori dan `mock.ts` akan diganti API di Phase 2 dan 4.
