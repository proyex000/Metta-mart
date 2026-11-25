# Metta-Mart

Metta-Mart is a web-based school cooperative system. Students and parents register their own accounts, browse the cooperative catalogue, and place independent pickup or GoSend orders. Cooperative staff use the Admin account for catalogue and stock management, online-order processing, payment verification, in-person POS, settings, and reports.

## Repository

- `frontend/` — React, TypeScript, and Vite single-page application.
- `backend/` — Django REST Framework API with session-cookie authentication and CSRF protection.
- `docs/` — current product scope, business rules/API contract, implementation status, and deployment instructions.
- `deploy/` — example service and reverse-proxy configuration.

Production architecture: Vercel frontend, Hostless Django API, and MySQL-compatible TiDB database. SQLite is for local development only.

## Run locally

Backend (PowerShell, from `backend/`):

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
Copy-Item .env.example .env
py manage.py migrate
py manage.py createsuperuser
py manage.py runserver 8000
```

Frontend (from `frontend/`, Node.js 22):

```sh
npm ci
npm run dev
```

The Vite development server proxies `/api` to the local Django server.

## Verification

```sh
# backend/
python manage.py test
python manage.py makemigrations --check --dry-run

# frontend/
npm ci
npm run typecheck
npm run build
```

GitHub Actions runs frontend typecheck/build and backend checks/tests against MySQL. Passing CI verifies the repository checks; it does not verify the live Hostless/Vercel configuration or browser workflows.

## Current scope and limitations

- Admin is the cooperative staff role and also operates POS; there is no separate cashier role.
- Students and parents place orders independently. Parent-to-student beneficiary checkout is not supported.
- Fulfilment is pickup or GoSend. GoSend fees are estimates; staff book couriers manually. No automated booking or live tracking is provided.
- Cash is recorded by staff. Bank transfer and QRIS are manually verified; enabling a method does not integrate a payment gateway.
- Notifications are persisted but are fetched when relevant pages load; realtime push/polling is not enabled.
- Refund processing, supplier receiving, purchase-cost/profit reporting, and an Admin audit-log screen are outside this release. Audit events are still recorded by the backend.
- New product photos, cooperative logo, and QRIS image data are stored in database fields. Include them in database backups.

See [Implementation status](docs/IMPLEMENTATION_STATUS.md) for the implemented behaviour and exclusions, [Business rules and API contract](docs/BUSINESS_RULES_AND_API_CONTRACT.md) for operational rules, and [Deployment guide](docs/DEPLOYMENT.md) for production configuration and go-live verification.
