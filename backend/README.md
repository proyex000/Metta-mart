# Metta-Mart Backend

Django REST Framework API for the Metta-Mart school cooperative. Authentication uses Django sessions (HTTP-only cookies) with CSRF protection. Production database: MySQL-compatible TiDB. SQLite is supported for local development only.

## Local development (Windows PowerShell)

1. Open PowerShell in `backend/`.
2. Create and activate a virtual environment:

   ```powershell
   py -m venv .venv
   .venv\Scripts\Activate.ps1
   ```

3. Install dependencies: `py -m pip install -r requirements.txt`.
4. Copy `.env.example` to `.env`; retain its local-development values for local HTTP.
5. Apply migrations: `py manage.py migrate`.
6. Create the initial administrator: `py manage.py createsuperuser`.
7. Start the API: `py manage.py runserver 8000`.
8. Run tests: `py manage.py test`.

Never deploy the local `.env.example` unchanged.

## Production configuration

Set environment variables in the hosting provider, not in committed files:

- `DJANGO_DEBUG=false` and a unique `DJANGO_SECRET_KEY` (at least 50 characters).
- Explicit `DJANGO_ALLOWED_HOSTS` hostnames; never use `*`.
- Exact HTTPS origins in `CORS_ALLOWED_ORIGINS` and `DJANGO_CSRF_TRUSTED_ORIGINS`.
- `DB_ENGINE=mysql`, database name/user/password/host/port, and `DB_SSL=true`.
- `SESSION_COOKIE_SECURE=true` and `CSRF_COOKIE_SECURE=true`.
- For separate Vercel and Hostless sites, set both session and CSRF `SameSite=None`; both cookies must remain Secure.

Production configuration guards reject unsafe settings, missing database credentials, SQLite, wildcard origins, and insecure cookies. Follow [the deployment guide](../docs/DEPLOYMENT.md) for the complete setup, proxy considerations, migrations, and backup procedure.

## Application behaviour

### Accounts and permissions

- Student and parent accounts can self-register. Admin accounts are created/managed by administrators.
- Student NISN is checked for the expected 10-digit format; it is not verified against an official school roster.
- Parent login uses email, but email ownership verification is not implemented.
- Users can edit their own profile and change their password after confirming the current password.
- Admin can deactivate/reactivate accounts and perform an admin-assisted password reset. The temporary password is shown once and must be changed at next login.
- Admin-only operations and record ownership are enforced by the backend.
- Parent accounts place independent orders for themselves. The current checkout does not let a parent order on behalf of a student.

### Catalogue and inventory

- Product catalogue, categories, prices, availability, and stock are persisted in the database.
- New product images are browser-compressed to JPEG and sent as Base64 data URLs. The image data is stored in the product row; new uploads do not require persistent media disk.
- Logo and QRIS image data are also stored in database settings.
- Stock adjustments/receipts require a reason and create inventory movement records.
- Checkout and POS use server-side prices and stock validation. Checkout is idempotency-protected and updates stock transactionally.
- Products with order/stock history are retained internally rather than physically deleted when historical references must be preserved.

### Orders, payments, delivery, and POS

- Online orders support pickup or GoSend when enabled by cooperative settings.
- GoSend address lookup and distance/fee calculation are best-effort estimates, not official courier quotes. Staff books the courier manually; no automated booking or live tracking is integrated.
- If address lookup cannot provide a fee, Admin must set a manual fee before accepting the order or collecting payment.
- Cash is recorded as paid when staff confirms receipt. Bank transfer and QRIS are manually verified by Admin. There is no payment gateway, automatic settlement check, or bank reconciliation.
- Admin-only POS supports in-person checkout, payment capture, cash change calculation, receipt, and inventory movement.
- Cancellation is restricted by order/payment state and restores reserved stock exactly once when eligible. Refund processing is not supported.

## API route groups

The following are the main implemented route groups; consult the Django URL configuration and frontend API client for exact request/response schemas.

- Health: `GET /api/health/`.
- Authentication: `/api/auth/csrf/`, `/api/auth/login/`, `/api/auth/logout/`, `/api/auth/me/`, `/api/auth/register/`, `/api/auth/change-password/`.
- Products: `/api/products/` and `/api/products/<id>/`.
- Orders: `/api/orders/`, `/api/orders/<code>/`, `/api/orders/<code>/cancel/`, and payment-submission routes.
- Delivery estimate: `POST /api/delivery/quote/`.
- Admin users, orders, inventory movements, payment decisions, delivery-fee updates, POS checkout, dashboard, and reports are grouped under `/api/admin/`.
- Store settings: `/api/storefront/settings/` (public-safe read; admin-only write).
- Notifications: `/api/notifications/` and recipient-scoped read actions.
- Audit events: written by the backend for sensitive operations. There is no Admin audit-log screen in this release.

## Checkout integrity

Online and POS checkout require an `Idempotency-Key` header (8–64 characters). Retrying the same submission must reuse the same key. The backend recalculates prices and totals from database records and applies stock/order changes transactionally.

## Tests and operations

CI installs dependencies, runs Django checks and migration consistency checks, validates production configuration guards, and runs backend tests against MySQL. Run `python manage.py check --deploy` against the intended production environment before release.

Back up TiDB/MySQL before migrations and on a schedule. Product photos, QRIS images, and the cooperative logo are stored in database fields/settings and must be included in database backups. Test restore into a separate database. Do not restore over production without a recovery plan.
