# Metta-Mart — Archived Phase 0 Prototype Audit

> **ARCHIVED HISTORICAL DOCUMENT — 18 November 2026.** This file records the state of the original frontend-only prototype before the Django backend and persistent database workflows were implemented. It is not a description of the current application, a current gap list, or an implementation plan.

For current and authoritative information, use:

- [Product specification](PRODUCT_SPEC.md) — current product scope and roles.
- [Business rules and API contract](BUSINESS_RULES_AND_API_CONTRACT.md) — current cooperative operating rules.
- [Implementation status](IMPLEMENTATION_STATUS.md) — implemented functionality, intentional exclusions, and remaining production verification.
- [Deployment guide](DEPLOYMENT.md) — current Vercel, Hostless, and TiDB deployment requirements.

## Historical snapshot

At the time of the Phase 0 audit, Metta-Mart was a frontend prototype. Product, account, order, notification, and settings behaviour relied on hardcoded examples, in-memory state, or browser storage. There was no Django API or persistent application database.

That historical assessment is superseded by the current implementation. The repository now contains a Django REST Framework backend, database-backed catalogue/orders/settings/notifications, session authentication with CSRF protection, inventory movements, online checkout, Admin POS, manual payment verification, pickup/GoSend workflows, and automated CI checks.

## How to use this document

Keep this file only as project history. Do not use its old tables, proposed architecture, role list, risk list, or phase plan to decide whether a current feature is implemented. In particular, the old prototype's proposed cashier role, parent-to-student ordering, payment/courier integrations, and mock-data assumptions are not the current release contract.

When this archive conflicts with any current document linked above, the current document takes precedence.
