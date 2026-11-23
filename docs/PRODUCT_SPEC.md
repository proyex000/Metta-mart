# Metta-Mart — Product & Functional Specification

## 1. Product definition

Metta-Mart is a school-cooperative commerce and operations system, not a general marketplace. There is no separate cashier role: cooperative staff use the Admin account for both administration and point-of-sale (POS) operations.

**Fulfilment policy: PICKUP or GoSend.** Buyers may collect orders at the school cooperative or request GoSend delivery. GoSend distance and fee are estimated by the system from cooperative settings; staff still books the courier manually. Automated GoSend booking and live courier tracking are not included.

## 2. Roles and access

### Admin (cooperative staff)
- Manage products, categories, prices, product images, and availability.
- Record stock receipts, adjustments, and stock movements.
- Process online orders and walk-in POS transactions.
- Review payment records and mark manually verified payments as paid.
- Manage student and parent accounts and their relationships.
- Manage pickup readiness and handover.
- View sales, inventory, transaction, and operational reports.
- Configure cooperative details and operating settings.
- Review audit history.

### Student
- Browse and search available products.
- Manage a cart and submit an order for pickup.
- Choose from payment methods enabled by the cooperative.
- View own orders, payment state, pickup state, and purchase history.
- Receive order status notifications.

### Parent
- Browse and search available products.
- Place independent orders for their own account; parents do not purchase on behalf of students.
- View and manage only their own profile, orders, and payments.
- Receive notifications for relevant orders.

### Authorization rules
- Deny access by default; enforce role and record ownership on the server/API, not only in the UI.
- Students can only read their own profile, orders, and payments.
- Parents can only read their own profile, orders, and payments.
- Admin-only operations must be protected server-side.
- Never trust a client-supplied user ID, price, discount, total, role, payment state, or stock quantity.

## 3. Core modules

1. Authentication, sessions, password reset, and role-based authorization.
2. Student profiles and parent-to-student relationships (one parent may be linked to multiple students; multiple authorized parents per student only if school policy permits).
3. Product catalogue, categories, product search, and product availability.
4. Inventory: stock receipts, adjustments, stock movement history, and low-stock warnings.
5. Cart and checkout with server-side price and stock validation.
6. Orders and order lifecycle.
7. Payments: configurable methods such as cash, bank transfer, or QRIS recorded through an approved provider/manual verification. Never claim automatic verification unless a payment-provider integration confirms it.
8. Admin POS for walk-in purchases; no separate cashier role.
9. Pickup management and handover confirmation.
10. Notifications and in-app order updates.
11. Reports, exports, audit logs, and cooperative settings.

## 4. Order fulfilment lifecycle (pickup and GoSend)

Suggested order states:
- pending_payment: order created and awaiting payment, if prepayment is required.
- pending_confirmation: order awaits staff review, where applicable.
- processing: staff has accepted and is preparing the order.
- ready_for_pickup: order is ready at the cooperative.
- completed: order has been handed over and confirmed.
- cancelled: order was cancelled with a recorded reason.

Payment state is separate from fulfilment state:
- unpaid
- pending_verification
- paid
- failed
- refunded (not supported in this release; cancellation only)

Do not mark an order completed merely because it is paid. Pickup handover must be explicitly confirmed by Admin. Record who confirmed handover and when.

## 5. Inventory and transaction integrity

- Calculate prices and totals on the server from authoritative product data.
- Store immutable order-item snapshots: product name/SKU, unit price, quantity, and line total at purchase time.
- Prevent overselling with an atomic stock check/update or database transaction.
- Define and consistently implement when stock is deducted (recommended: when an order is accepted/confirmed); release reserved stock on cancellation.
- Every stock change must create an inventory movement with reason, quantity delta, actor, and timestamp.
- POS checkout and online checkout must use the same stock and transaction rules.
- Use database transactions for order creation, item creation, payment record creation, and stock reservation.
- Use unique, human-readable order numbers backed by a database uniqueness constraint.
- Prevent duplicate submissions with idempotency protection or equivalent server-side safeguards.
- Completed orders and financial records must not be silently deleted or rewritten. This release does not process refunds; cancellation is allowed only before payment is submitted or marked paid.

## 6. Suggested data entities

Adapt to the existing schema; do not create duplicate tables if equivalent entities already exist.

- users
- student_profiles
- parent_profiles (only if role-specific fields are needed)
- parent_student_relationships
- categories
- products
- inventory_movements
- carts / cart_items (if carts are persisted server-side)
- orders
- order_items
- payments
- notifications
- audit_logs
- store_settings

Potential order fields: order number, buyer, student beneficiary (nullable where not applicable), source (online or POS), status, payment status, subtotal, discount (if supported), total, notes, created/updated timestamps, accepted-by, completed-by, and completion timestamp.

Potential product fields: SKU, name, description, category, image, selling price, cost price (admin-only), stock quantity, low-stock threshold, active flag, and timestamps.

## 7. POS workflow

1. Admin opens POS.
2. Search/select products and quantities.
3. Server validates stock and authoritative prices.
4. Admin selects payment method and records payment.
5. Transaction is committed atomically and a receipt/transaction detail is available.
6. Stock movement and audit records are created.
7. POS transactions appear in the same reports as online orders, with source clearly identified.

## 8. Pickup and GoSend workflow

1. Buyer selects pickup or GoSend at checkout. GoSend requires a recipient name, valid phone number, and delivery address.
2. The server calculates the configured delivery estimate; the estimate is not an official GoSend quote.
3. Admin accepts and prepares the order, then marks it ready.
4. For pickup, staff verifies the order number and hands over the items. For GoSend, staff books the courier manually outside Metta-mart.
5. Admin confirms handover for pickup or dispatch/handover to the GoSend courier. The order becomes completed and records the staff member and timestamp.

Do not expose unnecessary student personal data on pickup screens. A short pickup code/order number is preferable to displaying sensitive profile details.

## 9. Reporting

- Sales by day, week, and month.
- Transaction count and average transaction value.
- Sales by product and category.
- Top-selling and low-selling products.
- Gross sales and discounts; refunds are not supported in this release.
- Cost and gross-profit reports only when cost prices are maintained accurately.
- Current stock and inventory movement history.
- Online vs POS transaction breakdown.
- Payment-method breakdown and outstanding payment verification.
- CSV export where useful.

Clearly distinguish gross sales, cash received, refunds, and estimated gross profit. Do not label revenue as profit.

## 10. Notifications

Notify the relevant buyer/authorized parent when:
- An order is received/accepted.
- Payment is verified or rejected.
- Preparation begins, if surfaced to users.
- The order is ready for pickup.
- The order is cancelled.
- Pickup is completed.

Notifications must be scoped to the buyer and authorized linked parents. In-app notifications are the baseline; email/WhatsApp/push integrations are optional future work.

## 11. Security, privacy, and reliability

- Hash passwords using the backend framework's recommended password hasher.
- Validate all inputs on the server.
- Apply CSRF/CORS/session protections appropriate to the chosen authentication architecture.
- Rate-limit login and sensitive endpoints.
- Keep secrets in environment variables; never commit credentials.
- Use least-privilege database access.
- Keep audit records for sensitive admin actions, payment verification, stock adjustments, and pickup handover.
- Avoid exposing parent/student personal data to unrelated users.
- Provide database backup and restore procedures.
- Use pagination and server-side filtering for growing datasets.
- Show useful empty, loading, and error states; never silently swallow failed requests.

## 12. Acceptance checklist

### Roles
- [ ] Admin can access management and POS functions.
- [ ] Student cannot access admin endpoints by changing URLs or API requests.
- [ ] Parent can access only their own profile, orders, and payments.
- [ ] Student can see only own orders and payments.
- [ ] Every authenticated user can change only their own password after entering the current password; admins cannot reset another user's password.

### Catalogue and stock
- [ ] Admin can create, edit, deactivate, and categorize products.
- [ ] Inactive/out-of-stock products cannot be purchased.
- [ ] Concurrent checkout cannot create negative stock.
- [ ] Every stock adjustment has an attributable movement record.

### Checkout and orders
- [ ] Cart totals are recalculated by the server.
- [ ] Order items preserve the price/name snapshot.
- [ ] Duplicate submission does not create duplicate orders.
- [ ] Order and payment states are independent and validated.
- [ ] Cancellation releases reserved stock exactly once.

### Pickup
- [ ] Checkout offers pickup and GoSend when enabled.
- [ ] GoSend address, recipient, phone, and server-calculated estimated fee are validated.
- [ ] Staff manually books GoSend; Metta-mart does not claim automatic booking or live tracking.
- [ ] Admin can mark orders ready and confirm pickup handover or courier handoff.
- [ ] Completion records staff identity and timestamp.

### Payments and reports
- [ ] Manual payment verification is attributable to an admin.
- [ ] POS and online sales are included in reports and distinguishable.
- [ ] Cancellation is blocked while payment is pending verification or already paid; refunds are not offered.
- [ ] Reports distinguish sales, cash received, and gross profit; do not imply refund support.

### Release quality
- [ ] Production build succeeds.
- [ ] Backend tests cover permissions, stock concurrency, checkout, payment transitions, cancellation, and pickup.
- [ ] No secrets are committed.
- [ ] Database migrations are reversible where practical and tested on a copy.
- [ ] Deployment environment variables and backup process are documented.

## 13. Explicit scope exclusions

Out of scope for this school-cooperative release:
- Automated GoSend booking, payment, and live courier tracking integrations.
- Separate cashier role.
- Multi-vendor marketplace features.
- Complex accounting/ERP, payroll, procurement approval chains, and enterprise multi-branch controls.
- Stored-value wallet or student credit/debt ledger unless the school explicitly approves and defines its financial/legal operating rules.
- Automatic payment confirmation without an actual provider integration.

## 14. Implementation rule

Audit the existing repository before changing application code. Preserve working components and established design tokens. Implement incrementally, run frontend build/type checks and backend tests after each meaningful phase, and do not describe a feature as complete until implemented and tested end-to-end.
