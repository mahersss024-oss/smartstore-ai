# Webhook Report

Generated: 2026-06-08

## Verified controls

- Stripe webhook verifies raw body with Stripe signature and uses a 1 MB body limit.
- Clerk webhook verifies via Clerk webhook verifier.
- `WebhookIdempotency` handles duplicate, failed, in-progress, and stale lease retries.
- Webhook retention cleanup exists.

## Remaining risks

- No external dead-letter queue service is connected yet.
- Ordering conflicts between provider events should be monitored with provider timestamps/watermarks.

