# Metta-Mart Implementation Status

This document describes the school-cooperative scope implemented on the development branch.

## Roles and operating model

- Admin is the cooperative staff member and the only in-person POS operator; there is no separate cashier role.
- Student and parent accounts can browse the catalogue, place orders, view their own orders, and receive notifications.
- Authenticated users can change their own password after confirming the current password; password-change attempts are rate-limited and recorded in the audit log.
- Online ordering is available at any time.
- Physical pickup and POS transactions are restricted to configured cooperative operating hours.
- Pickup can be confirmed only after an order is marked ready.
- Buyers can choose pickup or GoSend when delivery is enabled. GoSend fee/address are validated and calculated by the backend; staff books the courier manually.

## Implemented modules

### Catalogue and inventory
- Admin product create, update, deactivate/delete behavior.
- Student and parent catalogue access to active products.
- Stock is reserved atomically when an online order is created and restored on eligible cancellation.
- Product stock changes require an admin reason and are written to the inventory movement ledger.
- Product photos are optional; admins can upload, replace, or remove a JPG/PNG/WEBP image (maximum 5 MB). Products without photos keep the existing category illustration.
- Uploaded product files are stored under `MEDIA_ROOT`; production hosting must persist this directory and serve the `/media/` URL path.
- Inventory ledger distinguishes initial stock, manual adjustment, online reservation, cancellation, and POS sale.
- Admin inventory screen displays recent movement history and low-stock products.

### Online orders and payment
- Server-authoritative prices and stock validation.
- Separate order and payment states.
- Admin workflow: pending → accepted → ready for pickup → completed.
- Cash is confirmed by admin at handover.
- Bank transfer and QRIS remain manual-verification methods.
- For transfer/QRIS, customers submit sender account name, bank/e-wallet source, optional last four account digits, and an optional note. This is identification information, not proof of payment.
- Admin must verify that funds actually arrived before marking the payment paid.
- Payment receipt image upload and automated bank/QRIS settlement are out of scope.

### Delivery (GoSend)
- Buyer provides recipient, phone, and destination address.
- Backend estimates delivery distance and fee using cooperative settings; it is not an official GoSend quote.
- GoSend orders require transfer/QRIS and must be paid before handover to the courier.
- Staff manually books GoSend outside Metta-mart; no automatic booking or live tracking integration.

### Admin POS
- Admin-only POS checkout with current server prices and atomic stock checks.
- Creates completed, paid POS transactions and writes inventory/payment/audit events.
- Cash transactions require the amount received and calculate change.
- POS supports enabled cash, bank transfer, and QRIS methods; admin confirms non-cash receipt before checkout.
- POS is blocked outside configured operating hours.

### Dashboard, reports, filters, and notifications
- Admin dashboard uses live backend counts, recent orders, daily sales, and low-stock data.
- Sales reports count only completed and paid orders, including POS transactions.
- Admin order list supports search and filters for order status, payment status, payment method, channel, and date range.
- Filtered transaction rows can be exported as UTF-8 CSV for spreadsheet use.
- Persistent notifications are stored per recipient and can be marked read only by that recipient.
- Admin can broadcast announcements to student and parent accounts.

### Settings
- Admin settings persist cooperative profile, payment methods/instructions, operating hours, pickup instructions, and notification preferences.

## Intentionally out of scope

- Payment receipt image upload.
- Supplier receiving workflow; admins can adjust stock directly with a required reason.
- Product purchase cost and gross-profit reporting.
- Student class/grade fields.
- Permanent logo upload.
- Price-change history.
- Automated courier booking, courier payment, and live GoSend tracking integration.
- Automated order expiry or uncollected-order cancellation until the school defines a policy.
- Dynamic QRIS, automatic transfer reconciliation, and automatic settlement without a payment provider.

## Still requires operational verification

- Confirm production environment variables, database connectivity, and apply pending migrations on the deployment database.
- Configure actual cooperative opening days/hours and official bank/QRIS payment instructions.
- Create admin, student, and parent accounts according to school policy.
- Test online ordering, transfer/QRIS manual verification, pickup and GoSend handover, POS sale, cancellation, and stock reconciliation in the deployed environment.
- Configure database backups and basic operational monitoring.

CI checks do not by themselves prove that the deployed production environment is correctly configured.