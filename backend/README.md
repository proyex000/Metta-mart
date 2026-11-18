# Metta-Mart Backend

Backend menggunakan Django, Django REST Framework, session cookie HttpOnly, CSRF, dan database MySQL-compatible (TiDB) untuk deployment. SQLite hanya untuk pengembangan lokal.

## Setup Windows

1. Buka PowerShell di folder `backend`.
2. Buat virtual environment: `py -m venv .venv`.
3. Aktifkan: `.venv\\Scripts\\Activate.ps1`.
4. Install: `py -m pip install -r requirements.txt`.
5. Salin `.env.example` menjadi `.env`, lalu isi secret key lokal.
6. Untuk lokal, gunakan `DB_ENGINE=sqlite`. Untuk TiDB, isi `DB_ENGINE=mysql` dan kredensial dari dashboard TiDB.
7. Migrasi: `py manage.py migrate`.
8. Buat admin pertama: `py manage.py createsuperuser`.
9. Jalankan: `py manage.py runserver 8000`.
10. Tes: `py manage.py test`.

## Endpoint yang tersedia

- Auth: `GET /api/auth/csrf/`, `POST /api/auth/login/`, `POST /api/auth/logout/`, `GET/PATCH /api/auth/me/`, `POST /api/auth/register/`.
- Admin users: `GET/POST /api/admin/users/`.
- Store settings and audit: `/api/admin/settings/`, `/api/admin/audit-logs/`.
- Catalog: `GET/POST /api/categories/`, `GET/PATCH/DELETE /api/categories/{id}/`, `GET/POST /api/products/`, `GET/PATCH/DELETE /api/products/{id}/`.
- Inventory: `POST /api/products/{id}/stock-adjustments/`, `GET /api/admin/stock-movements/`.
- Orders: `POST /api/orders/checkout/`, `GET /api/orders/`, `GET /api/orders/{code}/`, `POST /api/orders/{code}/actions/`.
- POS/shift: `GET /api/pos/shifts/current/`, `POST /api/pos/shifts/open/`, `POST /api/pos/shifts/close/`, `POST /api/pos/shifts/movements/`, `POST /api/pos/checkout/`.

## POS and cashier shifts

Cashier/Admin must open a shift with an opening cash balance before POS checkout. Each POS cash sale reduces stock and is linked to the active shift. Expected cash is calculated from opening cash + paid cash sales + cash-in - cash-out. Cash-out cannot exceed the expected drawer balance. POS requires the tendered cash to cover the total and records cash received/change due. Closing a shift records the physical closing cash and variance. POS transactions are completed immediately and recorded as paid cash sales.

## Order flow

Online checkout is available to Student and Parent accounts. The server recalculates prices, checks stock, reserves inventory in a database transaction, snapshots item names/prices, and records stock movement and status history. Customers can only read their own orders. Admin and Cashier can read the order queue; only Admin can accept/reject orders or verify QRIS payment. Admin/Cashier can move accepted orders through processing and fulfillment.

- Cash: order enters `pending_review`; payment remains unpaid until staff completes handoff.
- Static store QRIS: order enters `awaiting_payment`; payment remains `pending_verification` until an Admin checks the merchant transaction record and verifies it. The application does not infer payment success from the customer device or a QR image.
- Reject/cancel releases reserved stock. If a QRIS payment was already verified, payment becomes `refund_pending`; an actual refund must be performed outside this system and reconciled by staff.
- QRIS pending orders expire after 20 minutes. Run `py manage.py expire_qris_orders` periodically (for example, every 5 minutes using a scheduler) to expire them and release stock.

## Important deployment requirements / known gaps

- The QRIS image/merchant account is not configured by code. Admin still needs a verified store QRIS asset and a safe public setting/upload workflow.
- Static QRIS verification is manual. Automatic confirmation requires an official QRIS payment provider, merchant API credentials, signed webhook verification, and provider reconciliation.
- GoSend/GrabExpress live booking and fare quotes require official partner/API credentials. Do not expose credentials in frontend code.
- Configure TiDB/MySQL before production. Test transaction/locking behavior on the same database engine used in production; SQLite is not a substitute for concurrency tests.
- Configure HTTPS, production secret key, allowed hosts, CSRF/CORS origins, secure cookies, backups, logging, and scheduled expiry jobs before deployment.
- Frontend still contains prototype order/product views until the commerce API integration phase is completed. Do not treat this backend phase alone as a complete user-facing store.

## Security

Never commit `.env`, database files, provider credentials, QRIS merchant secrets, or private keys. Production startup fails if `DJANGO_SECRET_KEY` is missing while debug mode is disabled. Keep server-side role checks enabled; client-side route guards are only a usability layer.
