# Testing Report

Generated: 2026-06-08

## Commands executed

- `npm run check:env:production -- --demo` failed locally because `.env` uses localhost for `NEXT_PUBLIC_APP_URL`.
- `$env:NEXT_PUBLIC_APP_URL='https://www.smartstore-ai.com'; npm run check:env:production -- --demo` passed.
- `npm run lint` passed.
- `npm run type-check` passed.
- `npm test` passed: 55 test files, 270 tests.
- `npm run build` passed: 86 static pages generated and dynamic routes compiled.
- Production smoke test passed against `https://www.smartstore-ai.com`.
- Live web-order checkout verification passed against the real AI path: after
  pickup was selected and an add-on item was added, fulfillment buttons did not
  reappear as active choices.
- Chromium E2E passed: 8 tests, including web-order checkout with product
  selection, phone capture, pickup, payment, add-on item, and duplicate
  fulfillment prevention.

## Coverage strengths

- Product duplicate detection.
- Web chat server actions.
- AI orchestration, guards, semantic hints, system event bridge.
- Persistent checkout metadata synchronization between visible system actions
  and stored conversation state.
- Guard coverage for repeated completed checkout prompts.
- Browser E2E coverage for the web-order checkout state machine.
- Cart and checkout logic.
- Order lifecycle and concurrency.
- Webhook idempotency.
- Store service controls and subscription entitlements.

## Remaining risks

- E2E tests are present but not part of the normal production gate yet.
- Load tests and cross-tenant attack tests should be added before large-scale production.
