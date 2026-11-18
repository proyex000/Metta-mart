# Metta-Mart Implementation Status

This document records the implementation scope on the development branch. A feature is considered implemented only when its frontend is connected to a backend endpoint and its core behavior is covered by tests where practical.

## Roles and operating model

- Admin is the cooperative staff member and the only in-person POS operator. There is no separate cashier role.
- Student accounts can browse the catalogue, place orders, view their own orders, and receive notifications.
- Parent accounts can browse the catalogue and place orders only for students explicitly linked by an admin.
- Online ordering is available at any time.
- Physical pickup and POS transactions are restricted to configured cooperative operating hours.
- Pickup can be confirmed only after an order is marked ready.
- There is no courier, shipping address, delivery fee, or GoSend workflow.

## Implemented application modules

### Catalogue and inventory
- Admin product create, update, deactivate/delete behavior.
- Student and parent catalogue access to active products.
- Stock is reserved atomically when an online order is created.
- Stock is restored on eligible admin cancellation.
- Product stock changes require an admin reason and are written to the inventory movement ledger.
- Inventory ledger distinguishes initial stock, manual adjustment, online reservation, cancellation, and POS sale.
- Admin inventory screen displays recent movement history.
- Low-stock products appear on the admin dashboard; configurable notification preferences control low-stock alerts.

### Online orders and pickup
- Server-authoritative prices and stock validation.
- Separate order and payment states.
- Admin workflow: pending → accepted → ready for pickup → completed.
- Pickup completion checks configured operating hours.
- Cash is confirmed by admin at handover.
- Bank transfer and QRIS remain manual-verification methods; submitted references do not automatically mark an order paid.
- Parent orders store a beneficiary student and validate that the parent-student relationship exists.

### Parent and student accounts
- Admin can create and remove parent-student links.
- Parent accounts can retrieve only their linked students.
- Parent checkout requires selecting a linked student.
- Parent order history and admin order detail show the selected student beneficiary.

### Admin POS
- Admin-only POS checkout.
- Uses current catalogue prices and atomic stock checks.
- Creates completed, paid POS transactions and writes inventory/payment/audit events.
- POS supports enabled cash, bank transfer, and QRIS methods; the admin is responsible for confirming non-cash receipt before checkout.
- Cash transactions require the amount received and calculate change.
- POS is blocked outside configured operating hours.

### Dashboard, reports, notifications, and settings
- Admin dashboard uses live backend counts, recent orders, daily sales, and low-stock data.
- Sales reports count only completed and paid orders, including POS transactions.
- Persistent notifications are stored per recipient and can be marked read only by that recipient.
- Order and payment events notify relevant users; admin can broadcast announcements to student and parent accounts.
- Admin settings persist store profile, payment methods/instructions, operating hours, pickup instructions, and notification preferences.

## Known limitations and external dependencies

- QRIS dynamic payment creation, bank reconciliation, and automatic payment settlement are not integrated. Those require an actual payment provider and merchant credentials.
- Payment verification for bank transfer and QRIS is manual.
- No file upload for payment receipts is enabled; users submit a reference or note for admin verification.
- No automatic order expiry or uncollected-order cancellation is enabled because the school has not defined a pickup deadline policy.
- No automated scheduled weekly report delivery is enabled.
- Student class/grade data is not currently modeled; only the student account identity and verified parent relationship are stored.
- Logo upload remains browser-local and is not shared across devices.
- Deployment environment variables, production database migration, domain, backups, and operational monitoring must be verified on the target hosting environment before production use.

## Operational setup required before live use

1. Create the admin account(s).
2. Create student and parent accounts, or allow registration according to school policy.
3. Link each parent account to the correct student account from Admin → Settings → Relasi Orang Tua & Siswa.
4. Set actual cooperative operating days and opening/closing times.
5. Configure which payment methods are enabled and enter official bank/QRIS instructions.
6. Enter products and opening stock; record reasons for subsequent stock changes.
7. Verify the backend database migrations have been applied on the deployment environment.
8. Run a test online order, manual payment verification, ready-for-pickup handover, POS sale, cancellation, and stock reconciliation before opening to users.
