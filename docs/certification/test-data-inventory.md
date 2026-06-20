# Test Data Inventory

Date started: 2026-06-13

Status: incomplete.

Purpose: keep audit and smoke tests separated from real merchant/customer data.

## Known Test Data

| Data type | Identifier | Environment | Status | Notes |
| --- | --- | --- | --- | --- |
| E2E organization | `org_e2e_orchestration` | local/E2E | confirmed | Used by `tests/e2e/WebOrderChat.e2e.ts`. |
| E2E product | `E2E Meal` | local/E2E | confirmed | Seeded in `tests/e2e/WebOrderChat.e2e.ts`. |
| E2E product | `E2E Yogurt` | local/E2E | confirmed | Seeded in `tests/e2e/WebOrderChat.e2e.ts`. |
| E2E phone | `0500000000` | local/E2E | confirmed | Used by `tests/e2e/WebOrderChat.e2e.ts`. |
| Production/pilot store | `org_3EBLVeHRaYimicJRmAZADwEprZz` | production | confirmed for read-only smoke | Read-only production smoke passed against public connect and web-order pages. Write safety still needs confirmation. |
| WhatsApp test customer | `966549764152` | Meta/production-like | needs confirmation | Used in manual WhatsApp setup conversation; confirm whether safe for continued testing. |
| Meta test phone number | `+1 555 654 1565` | Meta test WABA | needs confirmation | Confirm current availability and test-only status. |

## Local Test Isolation Evidence

- `playwright.config.ts` runs the E2E web server against `localhost`.
- `playwright.config.ts` starts `pglite-server` and applies migrations before
  running tests.
- `tests/e2e/WebOrderChat.e2e.ts` seeds `org_e2e_orchestration`, `E2E Meal`,
  `E2E Yogurt`, and `0500000000` into the test database.

## Required Before Phase 0

- [ ] Identify every production smoke-test store.
- [ ] Identify every test customer phone number.
- [ ] Identify every test WhatsApp number and WABA.
- [ ] Confirm test orders are tagged or otherwise distinguishable.
- [ ] Confirm test reviews/complaints are distinguishable from real customer
  feedback.
- [ ] Confirm local and staging tests cannot mutate real production data.
