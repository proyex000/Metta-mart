# Metta-Mart — Current Product Specification

**Document status:** Current release specification. This document describes the implemented school-cooperative system, not an aspirational marketplace feature list.

## 1. Product definition

Metta-Mart is an online ordering and cooperative operations system for a school cooperative. Students and parents can browse the catalogue and place independent orders. Cooperative staff use the Admin role to manage products, stock, orders, payments, POS, settings, and sales reports.

The current fulfilment options are:
- **Pickup:** customer collects the order at the school cooperative after Admin marks it ready and during configured operating hours.
- **GoSend:** the system provides an estimated delivery fee; staff books the courier manually outside Metta-Mart.

This is not a multi-vendor marketplace, full accounting/ERP suite, or integrated courier/payment platform.

## 2. Roles

### Admin (cooperative staff)
- Manage cooperative profile and operating settings.
- Create, edit, categorize, deactivate, and manage products and photos.
- Record stock receipts and adjustments with reasons.
- Review and process online orders.
- Verify/reject bank-transfer and QRIS payment submissions.
- Set a manual GoSend fee when the estimate cannot be calculated.
- Confirm pickup handover and GoSend courier/delivery progress.
- Operate the in-person POS and issue transaction receipts.
- Manage student/parent accounts.
- Publish announcements and review sales/inventory information.
- Export transaction data.

There is no separate cashier role. POS is Admin-only.

### Student
- Self-register and sign in.
- Browse/search products and manage a cart.
- Place and track orders for their own account.
- Select an enabled payment method.
- View their own order/payment history and notifications.
- Manage account settings and notification preferences.

### Parent
- Self-register using an email address and sign in.
- Browse/search products and manage a cart.
- Place and track independent orders for their own account.
- Select an enabled payment method.
- View their own order/payment history and notifications.
- Manage account settings and notification preferences.

Parents cannot place orders on behalf of students in this release. Parent email ownership is not verified. Student NISN validation checks format only and is not checked against a school roster.

## 3. Authentication and account management

- Django session-cookie authentication with CSRF protection.
- Server-side role and record-ownership checks.
- Student and parent self-registration; Admin accounts are managed by Admin.
- Own-profile editing and password change after current-password confirmation.
- Admin account activation/deactivation, with safeguards for the last active Admin and self-deactivation.
- Admin-assisted password reset with a one-time displayed temporary password and mandatory password change at next login.
- Login, registration, and password-change endpoints are rate-limited.

## 4. Catalogue and inventory

- Database-backed products and categories.
- Product search and availability controls.
- Optional product photos. If no photo exists, the interface uses a default category illustration.
- New photos are compressed in the browser to JPEG (maximum longest edge 640 px) and stored as Base64 data in the MySQL/TiDB product row.
- Backend validates image data URLs, format, decoded size, and image content.
- Stock receipts/adjustments require a reason and create inventory movement records.
- Historical product/order/inventory references are preserved; products with history are not blindly hard-deleted.
- Online checkout and POS use the same authoritative stock records.

Legacy image paths may still depend on old files under media storage. New image uploads do not require a persistent media disk.

## 5. Online orders and payments

- Backend recalculates product prices, stock availability, subtotals, and totals.
- Order-item snapshots preserve purchased product names, unit prices, quantities, and line totals.
- Checkout is transactional and idempotency-protected.
- Order fulfilment state and payment state are tracked separately.
- Cash is marked paid when Admin confirms receipt.
- Bank transfer and QRIS are manually verified by Admin. Customer reference details are submissions for review, not automatic proof of payment.
- Rejection requires a reason and notifies the customer.
- Payment methods are enabled by default in the current settings; Admin may configure them.
- Bank and QRIS instructions must be populated with the cooperative's real details before customers use them.
- No payment gateway, automatic settlement verification, bank reconciliation, or payment-proof image upload is included.

### Cancellation and refund

Eligible unpaid orders can be cancelled under the implemented state rules, with reserved stock restored exactly once. Cancellation is blocked for paid orders and payment submissions awaiting verification. Refunds are not supported. Automatic unpaid-order expiry is disabled by default and requires an approved policy plus a scheduled host task before activation.

## 6. Pickup and GoSend

### Pickup
- No customer-selected pickup slot is required.
- Admin marks the order ready.
- Customer collects during configured cooperative opening hours.
- Admin confirms physical handover; payment alone does not complete an order.

### GoSend
- Buyer supplies recipient/contact/address details.
- Server performs best-effort address geocoding and distance-based fee estimation using the configured cooperative origin.
- The fee is an estimate, not an official GoSend quote.
- If geocoding/estimation fails, Admin must set and verify the manual fee before accepting or collecting payment.
- Staff books the courier outside the app.
- Admin records courier handover/delivery progress and confirms completion after delivery.
- Automated courier booking, courier payment, and live tracking are not included.

## 7. Admin POS, dashboard, and reports

- Admin-only POS checkout with server-side price/stock validation, payment capture, cash change calculation, receipt, and inventory movement.
- Dashboard and sales reports use persisted completed-and-paid transactions, including POS transactions.
- Date ranges include 1 day, 7 days, 1 month, 3 months, 1 year, and custom ranges.
- Transaction filters and CSV export are available.
- Sales figures exclude GoSend fees passed through to the courier.
- Reports are sales reports, not profit reports. Purchase-cost/gross-profit reporting is not included.

## 8. Notifications and settings

- Notifications are persisted per recipient and can be marked read by that recipient.
- Admin can publish announcements to active student and parent accounts.
- Announcements are enabled by default; accounts that disable promotional notifications in their settings are excluded from promotional announcements.
- Notifications are fetched when relevant pages load. Realtime polling/push is not enabled.
- Cooperative profile/contact, operating hours, payment methods/instructions, pickup instructions, delivery estimate settings, and order policy persist in the database.
- Logo and QRIS image data are stored in database settings.

## 9. Audit, security, and operations

- Backend audit events cover sensitive actions such as authentication, account/profile changes, orders, payment actions, settings changes, and POS transactions.
- An Admin audit-log screen is not included.
- Login, registration, and password-change endpoints are rate-limited.
- Health endpoint checks database connectivity.
- CI runs frontend typecheck/build, Django checks, migration consistency, production configuration guards, and backend tests against MySQL.
- CI does not prove that the live hosting configuration or browser workflows work.

## 10. Explicit scope exclusions

The current release does not include:
- Parent checkout on behalf of a student.
- Separate cashier role or cashier shifts.
- Supplier receiving/procurement.
- Product returns or refund processing.
- Purchase-cost and gross-profit reporting.
- Admin audit-log UI.
- Payment gateway, automatic bank/QRIS verification, or proof-image upload.
- Automated GoSend booking or live tracking.
- Realtime notifications.
- Official school-roster/NISN verification.
- Parent email ownership verification.

## 11. Production acceptance requirements

The system must not be called production-verified until the following have been tested against the actual Hostless/Vercel deployment:

- Production secrets, MySQL/TiDB TLS, allowed hosts, CORS/CSRF origins, and secure cross-site cookies.
- Database migrations, health endpoint, backup, and restore (including product photos, logo, and QRIS image).
- Admin, student, and parent login persistence after browser reload.
- Account permissions and data isolation between users.
- Product create/edit/deactivate, image upload/replace/remove, and inventory movement.
- Pickup and GoSend orders, including manual delivery-fee fallback.
- Cash, transfer, and QRIS workflows, including Admin verification/rejection.
- POS, receipts, cancellation, stock restoration, reports, and CSV export.
- Notification creation, preferences, and recipient scoping.
- Responsive layouts and core workflows on mobile browsers.
- Hosting request-body limits for supported image payloads.

Passing automated CI is necessary but is not a substitute for this production acceptance test.
