# Metta-Mart — Business Rules and API Contract

This document describes the current school-cooperative release. It is aligned with the implemented behaviour documented in [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md). Where a school policy or live deployment value has not been configured, this document does not invent one.

## 1. Roles and operating model

| Role | Current responsibility |
|---|---|
| Admin | Cooperative staff. Manages products, stock, orders, payments, POS, accounts, settings, announcements, and reports. |
| Student | Manages their own account, catalogue, cart, independent orders, payments, and notifications. |
| Parent | Manages their own account, catalogue, cart, independent orders, payments, and notifications. |

There is no separate cashier role. Admin operates the in-person POS.

Students and parents place orders for their own accounts. A parent-to-student beneficiary checkout is not part of the current workflow. Parent/student relationship records, if present for account administration, do not grant a parent the ability to place an order for a student.

## 2. Registration and account rules

- Student and parent accounts support self-registration.
- Student NISN validation checks the expected 10-digit format only; it does not query an official school roster.
- Parent login uses email. Email ownership verification is not implemented.
- Admin accounts are created and managed by an administrator.
- Users can update their own profile and change their password after confirming the current password.
- Admin can deactivate/reactivate accounts and perform an admin-assisted password reset. The temporary password is shown once and must be changed at next login.
- Role permissions and record ownership must be enforced by the backend, not merely by hiding frontend navigation.

## 3. Ordering, opening hours, and fulfilment

### Ordering and pickup

- Online ordering is available at any time, subject to product availability, stock, and configured settings.
- Operating hours govern physical pickup, not whether an online order can be submitted.
- Pickup does not require a customer-selected timeslot.
- Admin accepts/processes orders and marks them ready.
- A pickup order is completed only after Admin confirms handover. Payment alone does not complete an order.
- Admin POS is not blocked by the pickup-hours gate in this release.

### GoSend

- GoSend is available when enabled in cooperative settings.
- The application calculates an estimated distance-based fee using the configured cooperative origin. This is not an official GoSend quote.
- Staff books the courier outside Metta-Mart. Automated courier booking, courier payment integration, and live tracking are not included.
- If address geocoding fails or no usable estimate is returned, the order may remain with a pending manual delivery fee. Admin must set and verify the fee before accepting the order or allowing payment submission.
- The configured school-location fallback is intentional. It is used as the origin, not as a claim that the customer's address has been found.

## 4. Order and payment states

Order fulfilment and payment are separate concepts. An order may be ready while still unpaid, or paid while not yet handed over.

- Pickup: Admin marks ready, then confirms physical handover to complete.
- GoSend: Admin marks ready, records courier handover/delivery start, then confirms completion after delivery is confirmed.
- Cancellation is subject to current order/payment state. Paid orders and orders with payment awaiting verification cannot use the ordinary cancellation flow.
- Eligible cancellation restores reserved stock once.
- Refunds are not supported in this release. Do not describe cancellation as a refund.
- Automatic unpaid-order expiry is disabled by default. Do not enable it without an approved school policy and a scheduled task on the host.

### Payment methods

Cash, bank transfer, and QRIS are supported as payment methods and are enabled by default in the current application settings. Admin can configure payment methods.

- Cash is recorded as paid when Admin confirms that cash was received.
- Bank transfer and QRIS are manually verified by Admin.
- Customers can submit sender/bank/e-wallet reference details. This submission is not proof that funds arrived and does not automatically mark the order paid.
- Admin must verify actual receipt before marking a transfer/QRIS payment paid.
- Rejection requires an Admin reason and is recorded/notified.
- No payment gateway, automatic bank reconciliation, automatic QRIS settlement verification, or payment receipt-image upload is implemented.
- Bank account instructions and the official QRIS image must be configured by the cooperative before those methods are used with customers.

## 5. Inventory and catalogue rules

- Product prices, order totals, availability, and stock are authoritative on the backend.
- Order items preserve purchase-time product names, quantities, and unit prices.
- Online and POS checkout use the same authoritative stock records and transactional safeguards.
- Checkout uses an idempotency key to prevent duplicate transactions when a request is retried.
- Stock receipts and adjustments require an attributable reason and create inventory movement records.
- Products referenced by historical orders or stock movements are retained internally when hard deletion would damage history.
- A product without an uploaded photo uses the default category illustration. This is a visual fallback, not a demo product.

## 6. Notifications and preferences

- Notifications are persisted per recipient and users can mark their own notifications as read.
- Admin can publish announcements to active student and parent accounts.
- Announcements are enabled by default. Accounts that disable promotional notifications in their own settings are excluded from promotional announcements.
- Notification data is fetched when relevant pages load. Realtime push or background polling is not enabled; users may need to reload or revisit a page to see new updates.
- Do not describe in-app notifications as email, SMS, WhatsApp, or push notifications. Those integrations are not part of this release.

## 7. Cooperative settings

Admin-configurable settings include the cooperative profile/contact details, operating hours, payment instructions/methods, pickup instructions, delivery estimate configuration, and order policy.

Production setup must replace any unconfigured/default profile details with the cooperative's real information. In particular, configure the bank account holder/number, official QRIS image, school origin/address, operating schedule, and customer contact details before go-live.

## 8. Audit and reports

- The backend records audit events for sensitive actions, including authentication, account/profile changes, orders, payment actions, settings changes, and POS transactions.
- An Admin-facing audit-log screen is not included in this release.
- Dashboard and sales reports use persisted completed-and-paid transactions, including POS transactions.
- Sales reports are not profit reports. Sales values exclude GoSend fees passed through to the courier. No supplier receiving, purchase-cost management, or gross-profit reporting is included.
- Transaction filtering and CSV export are available.

## 9. Data storage and privacy

- New product images are compressed in the browser and stored as Base64 data in the product row in MySQL/TiDB.
- Cooperative logo and QRIS image data are stored in database settings.
- These images are part of the database backup; they do not depend on a persistent media volume for new uploads.
- Legacy image file paths may still depend on old media files being present. If those files were lost on an ephemeral host, replace the affected images through Admin.
- Keep student and parent personal information limited to the account owner and authorized Admin workflows. Do not expose unnecessary personal data on pickup screens.

## 10. API contract principles

The API route names and payload schemas are defined by the backend URL configuration, serializers, views, and the frontend API client. This section records invariants rather than proposing unimplemented endpoints.

1. The backend recalculates prices and totals; client-supplied prices/totals are never authoritative.
2. Stock is checked and changed transactionally. Concurrent orders must not oversell inventory.
3. Online and POS checkout require an `Idempotency-Key` header (8–64 characters); retries of the same checkout must reuse the same key.
4. Role permissions and object ownership are checked server-side for every protected operation.
5. Order and payment state transitions are validated server-side.
6. Payment method configuration affects new orders; historical orders retain their selected method.
7. Payment submission is not equivalent to payment verification.
8. Admin authorization is required for payment verification/rejection, order processing, delivery-fee changes, POS, and handover confirmation.
9. Stock movement and audit records are written for relevant sensitive actions.
10. Public settings responses must not disclose private administrative or payment-management data beyond the customer-facing instructions required for checkout.

## 11. Explicit exclusions for this release

Do not add or document these as currently available features:

- Parent checkout on behalf of a student.
- Separate cashier accounts or cashier shifts.
- Supplier receiving/procurement workflows.
- Cost-price maintenance and profit reporting.
- Product return management.
- Refund processing.
- Admin audit-log user interface (backend audit events are recorded).
- Payment gateway or automatic transfer/QRIS verification.
- Payment proof image upload.
- Automated GoSend booking, courier payment, or live tracking.
- Realtime notification push/polling.
- Student roster integration or official NISN verification.
- Parent email ownership verification.

These are scope exclusions, not defects that must be added before deploying the current release.
