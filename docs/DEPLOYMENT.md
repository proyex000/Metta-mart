# MettaMart deployment guide

This guide assumes the frontend is built with Vite and served by Nginx, while Django runs behind Gunicorn. Use a separate production database (MySQL/TiDB) and persistent storage for uploaded media.

## 1. Production environment

Copy `backend/.env.example` to a private `.env` or set the variables in your hosting provider. Never commit production secrets.

Required:
- `DJANGO_DEBUG=false`
- `DJANGO_SECRET_KEY`: unique random secret, at least 50 characters
- `DJANGO_ALLOWED_HOSTS`: comma-separated hostnames, without schemes
- `DJANGO_CSRF_TRUSTED_ORIGINS`: full HTTPS origins
- `CORS_ALLOWED_ORIGINS`: full frontend origins
- `DB_ENGINE=mysql` and database credentials
- `DB_SSL=true` for managed MySQL/TiDB unless your provider says otherwise

Production startup fails when DEBUG is false and the secret is still the development placeholder/too short, or allowed hosts are empty or contain `*`.

For a same-domain deployment, proxy `/api/` and `/media/` to Django and all other paths to the built frontend. For separate frontend/backend origins, explicitly set CORS and CSRF trusted origins.

## 2. Build and start

From `frontend/`:
```sh
npm ci
npm run build
```

From `backend/`:
```sh
python -m pip install -r requirements.txt
python manage.py check --deploy
python manage.py makemigrations --check --dry-run
python manage.py migrate
python manage.py collectstatic --noinput
gunicorn config.wsgi:application --bind 127.0.0.1:8000 --workers 3 --timeout 60
```

Set `STATIC_ROOT` in your host configuration or serve static assets through the frontend build. Uploaded product images need persistent storage and a backup policy; do not rely on ephemeral container filesystems.

## 3. HTTPS and proxy headers

Terminate TLS at Nginx or your platform. The supplied Nginx example redirects HTTP to HTTPS and sends the forwarded protocol header. Only enable `SECURE_PROXY_SSL_HEADER_ENABLED=true` when the trusted reverse proxy overwrites inbound `X-Forwarded-Proto` values. Set `SECURE_SSL_REDIRECT=true` after HTTPS is working end-to-end. Enable HSTS only after confirming every relevant subdomain supports HTTPS; begin with `SECURE_HSTS_SECONDS=300`, then increase deliberately.

Set `SESSION_COOKIE_SECURE=true` and `CSRF_COOKIE_SECURE=true` for production HTTPS (the example file keeps these false for local HTTP development, and explicit false values override Django defaults). Keep `SESSION_COOKIE_SAMESITE=Lax` and `CSRF_COOKIE_SAMESITE=Lax` unless the hosting architecture requires a documented alternative.

## 4. Order operations

- Order policy defaults to 5 active orders per account. Set 0 for no active-order cap.
- Automatic cancellation is disabled by default. Configure `auto_cancel_unpaid_after_hours` in Admin → Pengaturan → Kebijakan Pesanan.
- Schedule `python manage.py cancel_stale_orders` with cron/system scheduler at a suitable interval (for example every 10 minutes). The command is idempotent; new checkout requests also check stale orders for that account.
- Paid orders and payment submissions waiting for admin verification are excluded from automatic cancellation.
- GoSend fallback: if Nominatim cannot resolve the destination or is temporarily unavailable, the order can still be placed as `ongkir menunggu admin`. The admin must set the fee in the order detail before accepting; the customer receives the final amount notification. No payment can be submitted until the fee is set.
- Nominatim remains a best-effort public geocoder without an uptime guarantee. The 1.1-second request slot is reserved through a database row lock, so Gunicorn workers sharing the same MySQL/TiDB database share the rate limit. The default geocode result cache is process-local, so separate workers may repeat a lookup after a cache miss, but they still serialize the external requests. Keep the manual-fee fallback enabled; do not use public geocoding for bulk lookups. For manually priced deliveries, the admin must verify the address is reachable before accepting the order.

## 5. Logs, health, backup, and recovery

- `/api/health/` returns HTTP 200 only when Django can query the database; otherwise it returns 503. Point an uptime monitor at this endpoint.
- Logs always go to stdout/stderr. Set `LOG_DIR` to enable rotating `mettamart.log` files (5 MiB per file, five backups). Ensure the service account can write to that directory and monitor disk usage.
- Back up the MySQL/TiDB database daily and before every migration. Test restore to a separate database before go-live. Back up uploaded media separately.
- Never restore a backup over the live database without a verified recovery plan.

## 6. Go-live checklist

- [ ] Production secrets and explicit hostnames configured
- [ ] HTTPS active; redirect and HSTS settings reviewed
- [ ] Database TLS and backups verified
- [ ] Migrations applied and static assets published
- [ ] Admin login, student login, registration policy, and role permissions tested
- [ ] Online checkout, POS checkout, stock restoration, payment verification, and receipt tested
- [ ] Manual GoSend fee path tested end-to-end
- [ ] Scheduled stale-order command installed and tested
- [ ] Health endpoint and log collection monitored
- [ ] Product media persistence and restore tested

This checklist does not replace the school's approval of its student-data retention and privacy policy.
