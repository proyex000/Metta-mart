# Metta-Mart Backend — Phase 1

Backend API menggunakan Django 6.1, Django REST Framework, session cookie HttpOnly, CSRF, dan MySQL/TiDB untuk deployment.

## Persiapan Windows

1. Buka PowerShell di folder `backend`.
2. Buat virtual environment: `py -m venv .venv`
3. Aktifkan: `.venv\\Scripts\\Activate.ps1`
4. Install: `py -m pip install -r requirements.txt`
5. Salin konfigurasi: `Copy-Item .env.example .env`
6. Buat secret key baru dan isi `DJANGO_SECRET_KEY` di `.env`.
7. Untuk pengembangan lokal, SQLite aktif secara default.
8. Terapkan migrasi: `py manage.py migrate`
9. Buat admin pertama: `py manage.py createsuperuser`
10. Jalankan: `py manage.py runserver 8000`
11. Jalankan tes: `py manage.py test`

## Endpoint

- `GET /api/auth/csrf/` — menyiapkan cookie CSRF.
- `POST /api/auth/login/` — login dengan `identifier` dan `password`.
- `POST /api/auth/logout/` — logout.
- `GET /api/auth/me/` — sesi pengguna aktif.
- `POST /api/auth/register/` — registrasi mandiri hanya untuk role student dan parent.
- `GET/POST /api/admin/users/` — daftar/buat akun, khusus admin.
- `GET /api/admin/audit-logs/` — audit log, khusus admin.
- `GET/POST /api/admin/settings/` — baca/buat pengaturan global, khusus admin.
- `GET/PATCH /api/admin/settings/<key>/` — baca/perbarui satu pengaturan, khusus admin.

Siswa menggunakan NISN 10 digit sebagai identifier. Orang tua menggunakan email. Admin dan kasir dibuat oleh admin, bukan melalui registrasi publik. Akun orang tua dan siswa independen; tidak ada model atau endpoint relasi keduanya.

## Frontend

Frontend harus memakai `credentials: "include"`, meminta `/api/auth/csrf/` sebelum POST/PATCH/DELETE, dan mengirim token CSRF di header `X-CSRFToken`. Isi `CORS_ALLOWED_ORIGINS` dan `DJANGO_CSRF_TRUSTED_ORIGINS` sesuai origin frontend. Untuk frontend dan API yang benar-benar beda site, set kedua cookie SameSite ke `None` dan Secure ke `true`; konfigurasi reverse proxy satu-site lebih disarankan karena kebijakan third-party cookie browser dapat membatasi cookie lintas-site.

## Database

SQLite hanya untuk pengembangan lokal dan smoke test. Untuk deployment, set `DB_ENGINE=mysql` dan isi kredensial TiDB/MySQL di environment. Jangan commit file `.env`, database, atau credential.

## Batas Phase 1

Phase ini menyediakan fondasi identitas, sesi, role, audit, dan pengaturan global. POS, stok, katalog persisten, checkout, pembayaran, dan pengiriman dibangun pada phase berikutnya. Jangan menganggap endpoint yang belum dibuat sebagai integrasi siap produksi.
