# Metta-Mart — Implementation Status

**Last aligned with repository:** 25 November 2026  
**Scope:** current `main` application behaviour. This document is not a claim that the live deployment has passed end-to-end testing.

## 1. Operating model

- Metta-Mart serves one school cooperative.
- Admin is the cooperative staff role and the only role with access to in-person POS. There is no separate cashier role or cashier-shift workflow.
- Student and parent accounts can self-register, browse the catalogue, place independent orders, view their own orders, and receive in-app notifications.
- Parents place orders for their own accounts. Parent-to-student beneficiary checkout is not supported.
- Online ordering can be used outside cooperative opening hours. Configured hours govern physical pickup.
- Fulfilment options are pickup and GoSend. GoSend fees are estimates; staff books the courier manually.

## 2. Implemented functionality

### Authentication and accounts

- Django session-cookie authentication with CSRF protection and server-side role/ownership checks.
- Student and parent self-registration; Admin account management.
- Student NISN format check (10 digits), without official school-roster verification.
- Parent email login without email-ownership verification.
- Own-profile editing and password change with current-password confirmation.
- Admin account deactivation/reactivation, with safeguards against self-deactivation and deactivation of the last active Admin.
- Admin-assisted password reset: temporary password is displayed once and must be changed at next login.
- Rate limiting on login, registration, and password-change endpoints.

### Catalogue and inventory

- Database-backed product catalogue, categories, search, create/edit, deactivate, and delete handling.
- Optional product images. Products without a photo display the default category illustration.
- New images are browser-compressed to JPEG (maximum 640 px longest edge), sent as Base64 data URLs, validated by the backend, and stored in the product row.
- Cooperative logo and QRIS image data are stored in database settings.
- New uploads do not require persistent media disk. Legacy file-path images still depend on their old media files being available.
- Stock receipts/adjustments require a reason and create inventory movement records.
- Products with historical order/stock references are retained internally when needed to preserve history.
- Online and POS checkout use authoritative database stock, transactional safeguards, and idempotency protection.

### Online orders and payments

- Server-authoritative product prices, totals, availability, and stock checks.
- Order-item snapshots preserve purchased product names, unit prices, quantities, and line totals.
- Order fulfilment and payment status are separate.
- Cash is recorded as paid when Admin confirms handover/receipt.
- Bank transfer and QRIS are manually verified. Customer reference details are not proof of payment.
- Payment rejection requires an Admin reason and is recorded/notified.
- Payment methods are enabled by default in the current settings and can be configured by Admin.
- Eligible cancellation restores reserved stock exactly once. Paid orders and payment-pending orders cannot use the ordinary cancellation flow.
- Refunds are not supported. Automatic unpaid-order expiry is disabled by default.

### Pickup and GoSend

- Pickup is available after Admin marks an order ready and during configured operating hours. Admin confirms physical handover.
- GoSend uses best-effort Nominatim geocoding and distance-based fee estimates from the configured cooperative origin.
- The estimate is not an official courier quote. Staff books GoSend manually; there is no automated booking or live tracking.
- If address geocoding/estimation fails, Admin can set a manual delivery fee. The fee must be set before the order can be accepted or payment submitted.

### Admin POS, dashboard, and reports

- Admin-only POS checkout, payment capture, cash change calculation, receipt, and stock movement.
- Dashboard and sales reports use persisted completed-and-paid transactions, including POS.
- Reporting periods include 1 day, 7 days, 1 month, 3 months, 1 year, and custom ranges.
- Transaction filters and CSV export are available.
- Sales values exclude GoSend fees passed through to the courier. Reports are not profit reports.

### Notifications and settings

- Notifications are persisted per recipient and can be marked read by that recipient.
- Admin announcements are sent to active student and parent accounts. Announcements are enabled by default; accounts opting out of promotional notifications are excluded.
- Notifications are fetched when relevant pages load. Realtime polling/push is not enabled.
- Cooperative profile/contact, operating hours, payment methods/instructions, pickup instructions, delivery estimate settings, and order policy persist in the database.

### Audit and operations

- Backend audit events are recorded for authentication, account/profile changes, orders, payment actions, settings changes, and POS transactions.
- Admin audit-log UI is not included.
- Health endpoint checks database connectivity.
- CI runs frontend TypeScript checking/build, Django checks, migration consistency checks, production configuration guards, and backend tests against MySQL.

## 3. Explicitly not included in this release

These are intentional scope exclusions, not missing features that should be assumed available:

- Parent checkout on behalf of a student.
- Separate cashier role, cashier shifts, or cashier cash-drawer management.
- Supplier receiving/procurement workflows.
- Product returns and refund processing.
- Purchase-cost and gross-profit reporting.
- Admin audit-log screen (backend audit events are recorded).
- Payment gateway, automatic bank/QRIS settlement verification, bank reconciliation, or payment-proof image upload.
- Automated GoSend booking, courier payment, or live tracking.
- Realtime notification polling/push.
- Official student-roster/NISN verification.
- Parent email ownership verification.
- Student class/grade fields and external roster integration.

## 4. Production configuration still required

Before deployment, configure:
- Unique Django secret, DEBUG off, explicit allowed hosts, and exact HTTPS CORS/CSRF origins.
- TiDB/MySQL credentials and TLS.
- Secure session/CSRF cookies and the correct SameSite setting for the split Vercel/Hostless origins.
- Vercel `VITE_API_BASE_URL` pointing to the Hostless API.
- Actual cooperative profile/contact, operating hours, pickup instructions, bank account details, QRIS image, school delivery origin, and delivery settings.
- Database backup and restore procedure, including product images, logo, and QRIS data.

See [DEPLOYMENT.md](DEPLOYMENT.md).

## 5. Required live acceptance testing

CI checks repository code; it does not test the deployed browser session, actual TiDB data, or mobile usability. Before taking real orders, verify on the deployed origins:

1. Admin, student, and parent login, reload persistence, logout, and access isolation.
2. Registration and account-management policies.
3. Product/category CRUD, image upload/replace/remove, and stock movements.
4. Pickup checkout and handover.
5. GoSend normal estimate and manual-fee fallback.
6. Cash, transfer, and QRIS flows, including manual verification and rejection.
7. POS checkout, cash change, receipt, and reporting.
8. Cancellation and exactly-once stock restoration.
9. Notifications, read state, announcement preferences, and recipient isolation.
10. CSV export and all supported report periods.
11. Mobile browser layout and workflows for student, parent, and Admin.
12. Health endpoint, database backup, and successful restore into a separate database.

Do not describe the system as production-verified until these checks pass against the live deployment.
