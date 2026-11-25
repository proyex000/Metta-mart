# Metta-Mart

School cooperative web app: students and parents browse the catalogue and place pickup/GoSend orders; the cooperative admin runs stock, in-person POS, payment verification, notifications, and sales reports.

- `backend/` — Django REST API (session-cookie auth + CSRF, MySQL/TiDB in production, SQLite for local development only).
- `frontend/` — React + Vite + TypeScript single-page app.
- `deploy/` — example Gunicorn systemd unit and Nginx config.
- `docs/` — product spec, business rules/API contract, implementation status, deployment guide.

## Run locally

Backend (from `backend/`):

```sh
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env                                  # local-development defaults
python manage.py migrate
python manage.py createsuperuser                      # first admin account
python manage.py runserver 8000
```

Frontend (from `frontend/`, Node 22):

```sh
npm ci
npm run dev        # Vite proxies /api to http://127.0.0.1:8000
```

## Checks

```sh
cd backend  && python manage.py test && python manage.py makemigrations --check --dry-run
cd frontend && npm run typecheck && npm run build
```

CI (`.github/workflows/ci.yml`) runs the same checks, with the backend tests against MySQL, plus the production-configuration guards.

## Deploying

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for production environment variables, the Vercel + Hostless split deployment, HTTPS/proxy settings, backups, and the go-live checklist. [`docs/IMPLEMENTATION_STATUS.md`](docs/IMPLEMENTATION_STATUS.md) lists what is implemented, what is intentionally out of scope, and what still needs verification against the live deployment.
