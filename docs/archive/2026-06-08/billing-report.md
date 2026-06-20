# Billing Report

Generated: 2026-06-08

## Verified controls

- Stripe is used for platform subscription billing.
- Subscription entitlements enforce AI conversations, catalog items, image storage, and team member limits.
- Demo mode can allow the technical showcase without requiring live Stripe payments.
- Stripe webhook sync is idempotent and logs platform audit records.

## Remaining risks

- Live Stripe webhook testing needs production provider setup.
- Failed payment, downgrade, renewal, grace-period, and add-on mismatch scenarios need broader E2E/integration coverage.

