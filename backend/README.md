# Metta-Mart Backend

Metta-Mart uses a Django REST Framework API with session-cookie authentication, CSRF protection, MySQL/TiDB in production, and SQLite for local development only.

## Local development (Windows)

1. Open PowerShell in `backend/`.
2. Create a virtual environment: `py -m venv .venv`.
3. Activate it: `.venv\Scripts\Activate.ps1`.
4. Install dependencies: `py -m pip install -r requirements.txt`.
5. Copy `.env.example` to `.env`; keep the local-development defaults for local HTTP.
6. Apply migrations: `py manage.py migrate`.
7. Create the first admin account: `py manage.py createsuperuser`.
8. Start Django: `py manage.py runserver 8000`.
9. Run backend tests: `py manage.py test`.

The `.env.example` file is for local development only. Do not deploy it unchanged.

## Production configuration

Production must set:
- `DJANGO_DEBUG=false`.
- A unique `DJANGO_SECRET_KEY` of at least 50 characters.
- Explicit `DJANGO_ALLOWED_HOSTS` (no wildcard).
- `DB_ENGINE=mysql`, database name/user/password/host/port, and `DB_SSL=true` for managed TiDB/MySQL.
- Exact HTTPS values for `CORS_ALLOWED_ORIGINS` and `DJANGO_CSRF_TRUSTED_ORIGINS`.
- `SESSION_COOKIE_SECURE=true` and `CSRF_COOKIE_SECURE=true`. For separate Vercel and Hostless sites, set both SameSite values to `None`.

The app refuses unsafe production defaults, missing required production database values, and SQLite in production. Run `python manage.py check --deploy` and `python manage.py makemigrations --check --dry-run` before release.

## Main API endpoints

### Authentication and accounts
- `GET /api/health/` — public application/database health.
- `GET /api/auth/csrf/` — prepare CSRF cookie/token.
- `POST /api/auth/login/`, `POST /api/auth/logout/`, `GET /api/auth/me/`.
- `PATCH /api/auth/me/` — update own profile.
- `POST /api/auth/change-password/` — change own password with current-password confirmation.
- `POST /api/auth/register/` — self-registration for student and parent accounts.
- `GET/POST /api/admin/users/`; `GET/PATCH /api/admin/users/<id>/` — admin account management.
- `GET /api/parent/children/` and `GET/POST/DELETE /api/admin/parent-student-links/` — relationship records. They are not used to place parent orders for students.

### Catalogue and inventory
- `GET/POST /api/products/`; `GET/PATCH/DELETE /api/products/<id>/`.
- `GET /api/admin/inventory-movements/`.
- Product image data is sent as a Base64 data URL after browser-side JPEG compression. The database stores the image data in the product row; no persistent media volume is required for new images.

### Orders, payments, and POS
- `GET/POST /api/orders/`; `GET /api/orders/<code>/`.
- `POST /api/orders/<code>/cancel/`; `POST /api/orders/<code>/payment-submission/`.
- `POST /api/delivery/quote/` — best-effort GoSend estimate, not an official quote.
- `GET /api/admin/orders/`.
- `POST /api/admin/orders/<code>/<action>/` — accept, ready, complete-pickup, or cancel.
- `POST /api/admin/orders/<code>/payment/<action>/` — verify/reject manual payment. Rejection requires a reason.
- `POST /api/admin/orders/<code>/delivery-fee/` — set a manual fee when an estimated quote is unavailable.
- `POST /api/admin/pos/checkout/` — admin POS checkout.
- `GET /api/admin/dashboard/`; `GET /api/admin/reports/summary/`.

### Settings and notifications
- `GET/PATCH /api/storefront/settings/` — public-safe settings read; admin-only write.
- `GET/POST /api/notifications/`; `POST /api/notifications/<id>/read/`.
- `GET /api/admin/audit-logs/` — backend audit history; the Admin UI is excluded from this release.

## Checkout integrity

Online and POS checkout require an `Idempotency-Key` header of 8–64 characters. The frontend reuses a key when retrying the same submission. The backend recalculates prices and stock from database records and commits order/items/stock movements atomically.

For GoSend, external address geocoding is performed before the order/stock transaction starts. If address lookup is unavailable, the order may be created with an unconfirmed manual delivery fee; Admin must set that fee before accepting or collecting payment.

## Data and backup

Back up MySQL/TiDB before migrations and on a scheduled basis. Product photo data, QRIS images, and store logo data are stored in database text fields/settings and must be included in the same database backup. Test restoration into a separate database. Never restore directly over production without a recovery plan.

The backend test suite runs against MySQL in CI. SQLite is intended for local development only.
