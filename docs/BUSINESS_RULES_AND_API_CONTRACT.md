# Metta-Mart — Business Decisions & Frontend/Backend Contract

This document records the confirmed operating decisions for the school cooperative release. It supplements `docs/PRODUCT_SPEC.md` and is the source of truth when implementation details are ambiguous.

## 1. Confirmed business decisions

| Area | Decision | Required interpretation |
|---|---|---|
| Payment methods | `cash_transfer_qris` | Support cash, bank transfer, and QRIS. Each method can be enabled/disabled by Admin. |
| Pickup | `anytime` during operating hours, once ready | A customer may collect an order at any time the cooperative is open, but only after staff has marked it ready for pickup. No fixed pickup slot is required. |
| Ordering | `anytime` | Customers may submit orders at any time, including outside cooperative operating hours, subject to product availability and stock rules. |
| Fulfilment | Pickup or GoSend | Buyers may collect at the cooperative or request GoSend when enabled. GoSend fee is an estimate from the configured school origin; staff books the courier manually. |
 
## 2. Order fulfilment rules

1. Ordering availability is independent of the cooperative's current opening hours. Do not block checkout solely because the cooperative is currently closed.
2. Admin-configured operating hours govern when physical pickup is possible, not when an order can be submitted.
3. After checkout, the order enters the appropriate pending state. Admin reviews/accepts it and prepares it.
4. Only Admin can transition an order to `ready_for_pickup`.
5. The buyer may collect the order at any time within the cooperative's configured operating hours after it is ready.
6. Do not require the buyer to choose a pickup date, time slot, or appointment.
7. Do not mark an order completed automatically at opening time, after payment, or after a timeout. Admin must confirm physical handover.
8. Record handover actor and timestamp. A short order number or pickup code may be used to locate and verify the order.
9. Admin may configure a pickup deadline/holding policy later, but no automatic cancellation or stock release should be introduced until that policy is explicitly defined.
10. If an order is not yet ready, show its current status and explain that it can be collected once marked ready.

## 3. Payment method rules

### Supported methods
- `cash`: cash payment at the cooperative, normally at pickup or POS checkout.
- `bank_transfer`: customer transfers using the cooperative's officially configured bank instructions; Admin manually verifies receipt unless a real bank/payment-provider integration is implemented.
- `qris`: customer pays using the cooperative's official QRIS. Admin manually verifies receipt unless a real payment-provider integration is implemented.

### Payment integrity
- The payment method chosen by the customer is a request/selection, not proof of payment.
- Keep order fulfilment status separate from payment status.
- Suggested payment states: `unpaid`, `pending_verification`, `paid`, `failed`, `refunded`.
- For bank transfer and QRIS, allow a payment reference and optional proof upload if the school wants it. Uploaded proof is unverified until Admin reviews it.
- Record who verified/rejected a payment, when, and any reason/reference.
- Never display a transfer or QRIS payment as successful solely because the user clicked submit or uploaded an image.
- Cash may be recorded as paid by Admin when cash is actually received. For cash-on-pickup, it may remain unpaid until collection.
- Refunds must be explicit, attributable records; do not silently rewrite payment history.
- QRIS dynamic codes, automatic settlement checks, and automatic bank reconciliation require an actual provider/bank integration. They are not included merely by enabling the QRIS or transfer option.

## 4. Admin settings required

Admin settings should include:
- Store/cooperative name and contact details.
- Operating days and opening/closing times, including closed days/holidays.
- Payment method toggles for cash, bank transfer, and QRIS.
- Official bank transfer instructions (bank name, account holder, account number); show only when transfer is enabled.
- Official QRIS image/instructions; show only when QRIS is enabled.
- Optional checkout notice and pickup instructions.
- Store ordering availability should default to always open. A future emergency/manual pause switch may be provided, but it must be distinct from operating hours and must not silently change the confirmed default.

Validation:
- Opening/closing times must be valid and clearly handle overnight intervals only if the school explicitly needs them.
- Do not expose bank or QRIS settings to unauthorized users.
- If a payment method is disabled after an order was created with it, preserve the order's selected method and let Admin resolve it; do not corrupt historical orders.

## 5. Frontend behavior contract

### Student and Parent
- Product catalogue and checkout remain available outside operating hours.
- Checkout offers only currently enabled payment methods.
- If no payment method is enabled, prevent checkout and show a clear explanation.
- Explain the selected method's actual next step: cash at cooperative; transfer to official account; QRIS using official QRIS.
- Show payment state and order state separately.
- Show pickup instructions and cooperative operating hours.
- Show pickup availability only when order state is `ready_for_pickup` and current time is within configured opening hours; otherwise explain whether the order is not ready or the cooperative is closed.
- For GoSend, collect recipient, phone, and address; show the server-calculated fee as an estimate, not an official GoSend quote.
- Explain that staff books GoSend manually and that there is no live tracking.
- Show pickup availability only when the order is ready and the cooperative is open.
- Parents currently place independent orders for their own account; do not assume a parent can check out on behalf of a student.

### Admin
- Provide order queue filters for pending, processing, ready for pickup, completed, and cancelled.
- Provide explicit actions to accept/process, mark ready, verify/reject payment, and confirm handover, each guarded by valid state transitions.
- Show operating hours and payment settings.
- Make it obvious when an order is paid but not yet collected, or ready but not yet paid.
- POS remains an Admin function; no separate cashier role.

## 6. Backend/API contract

Suggested settings representation (adapt to existing project conventions):

```json
{
  "ordering_policy": "always",
  "fulfillment_methods": ["pickup", "gosend"],
  "pickup_policy": "anytime_when_ready_during_hours",
  "operating_hours": [],
  "payment_methods": {
    "cash": true,
    "bank_transfer": true,
    "qris": true
  }
}
```

Suggested order fields:
- `source`: `online` or `pos`
- `status`: order/fulfilment lifecycle
- `payment_status`: independent payment lifecycle
- `payment_method`: `cash`, `bank_transfer`, or `qris`
- `ready_at`, `ready_by_id`
- `completed_at`, `completed_by_id`
- `pickup_code` or unique order number
- `created_at`, `updated_at`

Suggested payment fields:
- `order_id`
- `method`
- `amount`
- `status`
- `reference` (nullable)
- `proof_file` (nullable)
- `verified_by_id` (nullable)
- `verified_at` (nullable)
- `rejection_reason` (nullable)
- timestamps

Required backend enforcement:
1. Recalculate all prices and totals from database product records.
2. Validate stock atomically; never rely on frontend stock values.
3. Validate selected payment method against current settings at order creation.
4. Preserve the chosen method on existing orders if settings later change.
5. Enforce role and record ownership for every endpoint.
6. Validate each order/payment state transition server-side.
7. Require Admin authorization for payment verification, order readiness, and pickup handover.
8. Require an `Idempotency-Key` header (8–64 characters) for online and POS checkout; reuse the same key when retrying the same checkout attempt.
9. Write audit/inventory movement records for sensitive actions.
10. Use database transactions for checkout, stock reservation/deduction, and payment record creation.

Suggested endpoint groups (names are illustrative; align with existing API):
- `GET /api/storefront/settings/` — public-safe hours, enabled payment methods, pickup instructions.
- `GET /api/products/` — active catalogue with filtering/pagination.
- `POST /api/orders/` — authenticated Student/Parent checkout; accepts product IDs/quantities, beneficiary where authorized, payment method, and note; never accepts trusted prices/totals.
- `GET /api/orders/` and `GET /api/orders/{id}/` — ownership-scoped buyer views.
- `GET /api/admin/orders/` — Admin order queue.\n- `GET/PATCH /api/admin/users/<id>/` — Admin views and updates account name/active status; roles and login identifiers remain protected.
- `POST /api/admin/orders/{id}/accept/`
- `POST /api/admin/orders/{id}/ready/`
- `POST /api/admin/orders/{id}/complete-pickup/`
- `POST /api/admin/orders/{id}/cancel/`
- `POST /api/orders/{id}/payment-proof/` — optional proof/reference submission.
- `POST /api/admin/payments/{id}/verify/` and `/reject/`
- `GET/PATCH /api/admin/settings/` — Admin-only settings management.
- `POST /api/admin/pos/checkout/` — Admin POS checkout.

## 7. State transition baseline

Order:
- `pending_payment` → `pending_confirmation` or `processing`, according to payment policy.
- `pending_confirmation` → `processing` or `cancelled`.
- `processing` → `ready_for_pickup` or `cancelled`.
- `ready_for_pickup` → `completed` only after Admin confirms handover; cancellation requires explicit policy and stock handling.
- `completed` is terminal; corrections use auditable reversal/refund records.

Payment:
- `unpaid` → `pending_verification` → `paid` or `failed`.
- `paid` → `refunded` only when a refund is actually recorded.
- Cash received by Admin can transition from `unpaid` to `paid` with actor/time evidence.

The exact use of `pending_confirmation` versus `processing` should be consistent with the actual school workflow. Do not infer payment success from order acceptance.

## 8. Acceptance tests for the confirmed decisions

- Student can submit an order outside operating hours.
- Parent can submit an authorized order outside operating hours.
- Admin can see and process orders submitted while closed.
- A ready order can be collected during any configured open period without a scheduled slot.
- A not-ready order cannot be marked completed by the buyer.
- An order marked ready outside opening hours remains ready and can be collected during the next open period.
- Cash, bank transfer, and QRIS can each be enabled/disabled in settings.
- Disabled methods are absent from new checkout sessions.
- Existing orders retain their historical payment method if settings change.
- Transfer/QRIS proof upload does not automatically mark payment paid.
- Only Admin can verify/reject payment and confirm pickup handover.
- Paid does not imply completed; ready does not imply paid.
- Checkout remains blocked when all payment methods are disabled.
- Pickup and GoSend are distinct fulfillment methods; GoSend must never be represented as automatically booked or tracked.

## 9. Explicitly unresolved policy (do not invent)

The school has not yet specified:
- Exact operating days and hours.
- Whether bank transfer/QRIS must be paid before staff starts preparing, or whether staff may prepare while payment is pending.
- Whether cash is accepted only at pickup or also at POS (POS cash should be supported).
- Order cancellation cutoff and uncollected-order holding deadline.
- Whether proof upload is mandatory for transfer/QRIS.
- Whether one parent may place orders for multiple linked children in a single checkout.

Keep these configurable or defer the decision. Do not hardcode assumptions into business logic.
