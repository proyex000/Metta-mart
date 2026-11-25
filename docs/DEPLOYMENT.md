# Metta-Mart deployment guide

This guide describes the current split deployment: React/Vite frontend on Vercel, Django API on Hostless, and MySQL-compatible TiDB database. New product photos, cooperative logo, and QRIS image data are stored in the database, so new uploads do not require a persistent media disk. This does not remove the need for database backups.

## 1. Production environment

The tracked `backend/.env.example` is a **local-development template only**. Do not copy it unchanged into Hostless. Configure production values in Hostless environment settings. Never commit production secrets.

Required backend settings:

- `DJANGO_DEBUG=false`
- `DJANGO_SECRET_KEY`: unique random secret, at least 50 characters
- `DJANGO_ALLOWED_HOSTS`: comma-separated hostnames, without schemes
- `DJANGO_CSRF_TRUSTED_ORIGINS`: explicit HTTPS origins
- `CORS_ALLOWED_ORIGINS`: explicit HTTPS frontend origins
- `DB_ENGINE=mysql`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST`, and `DB_PORT`
- `DB_SSL=true` for encrypted MySQL/TiDB connections
- `SESSION_COOKIE_SECURE=true` and `CSRF_COOKIE_SECURE=true`

Production startup fails closed if DEBUG is not safely disabled, the secret is missing/too short, allowed hosts are empty or contain `*`, SQLite is selected, database credentials are missing, database TLS is disabled, origins are missing/wildcarded, or session/CSRF cookies are not Secure.

### Vercel

- Set **Root Directory** to `frontend`.
- `frontend/vercel.json` rewrites application routes to `index.html`, allowing deep links and browser reloads.
- Set `VITE_API_BASE_URL` to `https://<hostless-backend-domain>/api`.

### Hostless cross-origin cookies

For the split Vercel/Hostless deployment:

- Set `CORS_ALLOWED_ORIGINS` and `DJANGO_CSRF_TRUSTED_ORIGINS` to the exact HTTPS Vercel origin.
- Set `SESSION_COOKIE_SAMESITE=None` and `CSRF_COOKIE_SAMESITE=None`.
- Keep both Secure cookie flags enabled.

Browsers or privacy settings may block third-party cookies even when the server configuration is correct. Test login persistence after a full browser reload. If cookies are blocked, use a same-site custom domain or proxy `/api/` through the frontend origin; do not weaken cookie security. For a same-site deployment, `SameSite=Lax` may be appropriate.

## 2. Build, migrate, and start

Frontend (from `frontend/`):

```sh
pnpm install --frozen-lockfile
npm run typecheck
npm run build
```

Backend (from `backend/`):

```sh
python -m pip install -r requirements.txt
python manage.py check --deploy
python manage.py makemigrations --check --dry-run
# Back up the production database before migrating.
python manage.py migrate
python manage.py collectstatic --noinput
gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 60
```

Adapt the Gunicorn bind address and static-file serving to Hostless's process contract. Do not assume the example bind command is a universal Hostless start command.

### Image storage

For each new product photo, the browser resizes the longest side to at most 640 pixels, converts it to JPEG, and limits the Base64 data URL to 380,000 characters before sending it to Django. Django validates the encoded image and stores it in the product row. Cooperative logo and QRIS image data are also stored in database settings.

No persistent media volume or external image service is required for new uploads. Legacy rows containing file paths still depend on old media files being available and served. If ephemeral storage has lost those files, replace the affected photos from Admin → Kelola Stok.

Because images are stored in TiDB, they consume database storage and must be included in backups. Confirm Hostless request-body limits accept the supported upload size.

### Shared rate-limit counters

Login, registration, and password-change throttles (and the geocode cache) use Django's default cache, which is per-process memory. With multiple Gunicorn workers, each worker counts separately and in-memory counters reset on restart.

For shared counters, configure `CACHE_DB_TABLE` (for example `mettamart_cache`) and create the table before starting the application:

```sh
python manage.py createcachetable
```

If `CACHE_DB_TABLE` is set but the table does not exist, throttled endpoints can fail. Leaving it unset retains per-process behaviour.

## 3. HTTPS and proxy headers

Terminate TLS at the hosting platform or trusted reverse proxy. Only enable `SECURE_PROXY_SSL_HEADER_ENABLED=true` when the trusted proxy overwrites inbound `X-Forwarded-Proto` values. Set `SECURE_SSL_REDIRECT=true` only after HTTPS and proxy forwarding work end-to-end; otherwise redirect loops may occur.

Enable HSTS only after confirming every relevant subdomain supports HTTPS. Start with a short `SECURE_HSTS_SECONDS` value and increase it deliberately.

## 4. Cooperative setup and order operations

Before accepting real orders, Admin must configure actual cooperative data:

- Cooperative name, logo, contact phone/email, and school address.
- Operating days and opening/closing times.
- Official bank name, account number, and account holder.
- Official QRIS image and instructions.
- Pickup instructions.
- GoSend origin and delivery-estimate settings.

Cash, bank transfer, and QRIS are enabled by default in the current application settings. This is only the availability of payment methods: bank transfer and QRIS still require real cooperative instructions and manual Admin verification. No payment gateway or automatic settlement verification is integrated.

Other current operating rules:

- Students and parents place independent orders for their own accounts. Parent checkout for a student is not supported.
- Online ordering is available outside operating hours; operating hours govern physical pickup.
- Admin operates POS; there is no separate cashier role.
- GoSend fees are estimates, not official quotes. Staff books the courier manually. Automated booking and live tracking are not included.
- If GoSend address lookup cannot calculate a fee, Admin must set the manual fee before accepting the order or allowing payment submission.
- Paid orders and orders with payment pending verification cannot use ordinary cancellation. Refund processing is not supported.
- Automatic cancellation is disabled by default. Keep `auto_cancel_unpaid_after_hours=0` unless the school approves an expiry policy and a scheduler is installed.

### Optional automatic expiry

If the school formally approves automatic unpaid-order expiry, set the appropriate policy and schedule:

```sh
python manage.py cancel_stale_orders
```

Run it at the approved interval (the guide's suggested interval is every 10 minutes). Without a scheduled task, global background expiry is not guaranteed. The command is idempotent. Paid orders and payment submissions waiting for Admin verification are excluded.

### Geocoding limitations

GoSend address lookup uses the public Nominatim service on a best-effort basis and has no uptime guarantee. Checkout performs address lookup before the stock-reservation transaction. A database row lock reserves the request interval across workers sharing the database; the result cache is process-local. Keep the manual-fee fallback available and do not use the public geocoder for bulk lookups. Admin must verify manually priced addresses are serviceable before accepting the order.

## 5. Health, logs, backup, and recovery

- `/api/health/` returns HTTP 200 only when Django can query the database; otherwise it returns 503.
- Logs go to stdout/stderr. Set `LOG_DIR` to enable rotating `mettamart.log` files (5 MiB per file, five backups); ensure the service account can write there.
- Back up TiDB/MySQL daily and before every migration.
- Database backups must include product photo data, cooperative logo, and QRIS image data.
- Test restoration into a separate database before go-live. Never restore over the live database without a verified recovery plan.
- The backend records audit events, but this release does not include an Admin audit-log screen.

## 6. Go-live checklist

- [ ] Production secrets configured; no secrets committed
- [ ] Explicit allowed hosts and HTTPS CORS/CSRF origins configured
- [ ] HTTPS, proxy headers, and secure cookie settings verified
- [ ] Vercel API base URL points to the Hostless API
- [ ] TiDB/MySQL TLS connection verified
- [ ] Migrations applied and health endpoint returns HTTP 200
- [ ] Admin, student, and parent login persist after browser reload
- [ ] Role permissions and account/order data isolation tested
- [ ] Real cooperative profile, contact details, hours, bank instructions, QRIS, and delivery origin configured
- [ ] Pickup and GoSend order flows tested, including manual delivery-fee fallback
- [ ] Cash, transfer, and QRIS flows tested, including Admin verification/rejection
- [ ] POS checkout, receipt, stock movement, and sales reports tested
- [ ] Cancellation and stock restoration tested
- [ ] Product image upload, view, replace, and remove tested after backend restart
- [ ] Database backup and restore verified with product images, logo, and QRIS included
- [ ] Host request-body limits accept supported image payloads
- [ ] Student, parent, and Admin workflows checked on mobile browsers
- [ ] Automatic expiry remains disabled unless the approved policy and scheduler are both in place

This checklist does not replace the school's approval of student-data retention and privacy policy. Passing CI alone does not mean the live deployment is production-verified.
