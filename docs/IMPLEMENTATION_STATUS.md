# Metta-Mart Implementation Status

This document describes the current implementation in the deploy-readiness branch. It supersedes the earlier Phase 0 prototype audit.

## Roles and operating model

- Admin is the cooperative staff member and the only in-person POS operator; there is no separate cashier role.
- Student and parent accounts can browse the catalogue, place independent orders, view their own orders, and receive in-app notifications.
- Parents order for their own account. There is no parent-to-student beneficiary flow in the current checkout.
- Authenticated users can change their own password after confirming the current password. Password reset is not included.
- Online ordering is available at any time; physical pickup uses configured operating hours. POS remains Admin-only and is not restricted by the operating-hours gate in this release.
- Buyers can choose pickup or GoSend when delivery is enabled. GoSend distance and fees are estimates; staff books the courier manually.

## Implemented modules

### Authentication and accounts
- Session-cookie authentication with CSRF protection and role-based server-side permissions.
- Public self-registration for student/parent accounts; admins create and manage accounts.
- Student NISN format is checked (10 digits), but it is not verified against an official school roster.
- Parent login uses email. Email ownership verification is not implemented.
- Admin can deactivate/reactivate accounts, while protections prevent self-deactivation and deactivation of the last active admin.
- Profile editing and authenticated password change.

### Catalogue and inventory
- Persistent product catalogue with the configured categories, search, active/inactive products, create/edit/archive/delete.
- Product photos are compressed in the browser to JPEG (maximum 640 px longest edge) and stored as Base64 text in the MySQL/TiDB product row. No persistent media disk or external image service is required for new uploads.
- The backend validates the image data URL, format, decoded size, and image contents. Legacy file paths remain readable only while their old media files are available.
- Stock receipts/adjustments require an attributable reason and create inventory-movement records.
- Online checkout reserves stock atomically; eligible cancellation restores stock exactly once. POS checkout uses the same authoritative stock records.

### Online orders and payment
- Server-authoritative product prices, totals, availability, and stock checks.
- Order item snapshots preserve purchased names, unit prices, quantities, and line totals.
- Order and payment status are tracked separately.
- Idempotency keys protect checkout and POS retries from creating duplicate transactions.
- Cash is recorded as paid when the admin confirms handover.
- Bank transfer and QRIS remain manually verified. Customers submit sender/bank/e-wallet details, not proof of payment. Admin must verify that funds actually arrived.
- Rejection of a payment requires an admin reason that is recorded and sent to the customer.
- Cancellation is blocked for paid or payment-pending orders; refunds are not supported.

### Delivery and pickup
- Pickup and GoSend are supported.
- Pickup handover is confirmed by Admin after the order is ready and during configured operating hours.
- GoSend address lookup uses Nominatim best-effort geocoding and a distance-based estimate, not an official courier quote.
- If destination geocoding fails, the order can remain pending manual admin fee assignment. The order cannot be accepted or paid until the final fee is set.
- GoSend payment uses transfer/QRIS; staff books the courier outside Metta-Mart. No automated booking or live courier tracking.

### Admin POS, dashboard, and reports
- Admin-only POS checkout, payment capture, cash change calculation, receipt, and stock movement.
- Dashboard metrics and sales reports use persisted completed-and-paid orders, including POS transactions.
- Reports include 1-day, 7-day, 1-month, 3-month, 1-year, and custom date ranges.
- Transaction filters and CSV export are available.
- Sales values exclude GoSend fees passed through to the courier; the reports are not profit reports.

### Notifications and settings
- Notifications are persisted per recipient and can be marked read by that recipient.
- Admin can broadcast announcements to student and parent accounts.
- Notifications are fetched when relevant pages load; realtime polling/push is not enabled.
- Cooperative profile, payment methods/instructions, operating hours, pickup instructions, delivery estimate settings, and order policy persist in the database.
- Logo and QRIS images are stored as Base64 text in settings and therefore count toward database storage.

### Operational safeguards
- Audit events are written for authentication, profile/account changes, orders, payment actions, settings changes, and POS transactions. Admin audit-log UI is not included.
- Login, registration, and password-change endpoints are rate-limited.
- Health endpoint checks database connectivity.
- MySQL-backed backend tests, frontend TypeScript check, and production build are run in CI.

## Explicit exclusions / accepted operating decisions

- Password reset flow.
- Admin audit-log UI.
- Parent placing an order for a student.
- Realtime notification polling/push.
- Official GoSend pricing, automated courier booking, courier payment, and live tracking.
- Automatic payment verification, bank reconciliation, and payment gateway.
- Payment receipt image upload.
- Supplier receiving workflow and purchase-cost/gross-profit reporting.
- Student class/grade fields and external student-roster verification.
- Automatic expiry/cancellation remains disabled by default. Only enable it when the cooperative has approved a policy and a scheduler is installed.
- Price-change history and refund workflow.

## Still requires production verification

CI checks validate repository code, not the Hostless/Vercel environment. Before production use:
- Configure all production secrets, MySQL/TiDB TLS credentials, exact CORS/CSRF origins, and secure cookies.
- Back up the production database, apply all migrations, and verify health.
- Create/review real admin, student, and parent accounts according to school policy.
- Set actual store profile/contact, operating hours, bank/QRIS instructions, delivery origin and fees.
- Test login persistence across browser reloads on the deployed Vercel/Hostless origins.
- Test online pickup, GoSend (normal estimate and manual fee fallback), transfer/QRIS verification/rejection, cash handover, POS, cancellation, stock restoration, receipts, image upload/update/delete, and CSV reports.
- Confirm database backup and restore includes product photos, QRIS image, and store logo.
- Confirm the host's request-body limits accept the supported image payload sizes.

Do not describe the system as production-verified until these checks have passed against the live deployment.
