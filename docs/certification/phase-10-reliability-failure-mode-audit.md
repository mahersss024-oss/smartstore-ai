# Phase 10: Reliability And Failure Mode Audit

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`PHASE NOT CERTIFIED`

This phase added executable reliability coverage for Stripe and Clerk webhook
failure modes, expanded the existing public API and WhatsApp failure checks, and
fixed one confirmed Clerk webhook idempotency defect. It is not certified yet
because the full reliability and observability matrix is not executable across
AI provider timeouts, DB failures, deployment transitions, expired WhatsApp
tokens, and production logs.

## Source Trace

### Stripe webhook reliability

Source evidence:

- `src/app/api/stripe/webhooks/route.ts`
- `src/libs/WebhookIdempotency.ts`
- `src/libs/StripeBillingSync.ts`
- `src/libs/RequestBody.ts`

Behavior:

- Missing `STRIPE_WEBHOOK_SECRET` fails closed before signature construction.
- Missing or invalid Stripe signature rejects the request.
- Bodies over 1MB are rejected before Stripe event construction.
- Valid events execute `syncBillingFromStripe` through `runWebhookEventOnce`.
- In-progress webhook events return HTTP 503 with `Retry-After: 5`.
- Processing failures return a generic non-secret response.

Test evidence:

- `src/app/api/stripe/webhooks/route.test.ts`

### Clerk webhook reliability

Source evidence:

- `src/app/api/clerk/webhooks/route.ts`
- `src/libs/WebhookIdempotency.ts`
- `src/libs/ClerkOrganizationSync.ts`

Behavior:

- Unverifiable Clerk webhook requests fail before idempotency processing.
- Valid organization events execute `syncOrganizationFromClerk` through
  `runWebhookEventOnce`.
- In-progress webhook events return HTTP 503 with `Retry-After: 5`.
- When `svix-id` is absent or blank, the route now uses the deterministic
  fallback event id `${event.type}:${event.data.id}`.
- Processing failures return a generic non-secret response.

Test evidence:

- `src/app/api/clerk/webhooks/route.test.ts`

### Existing reliability controls carried into this phase

Source and test evidence:

- `src/app/api/twilio/webhook/route.test.ts`
- `src/app/api/ai-employee/messages/route.test.ts`
- `src/libs/WebhookIdempotency.test.ts`
- `src/libs/PublicEndpointRateLimit.test.ts`
- `src/libs/StoreServiceControls.test.ts`

Covered behavior:

- WhatsApp send failures do not make Meta retry already-processed AI work.
- WhatsApp duplicate and in-progress handling is idempotent.
- Public AI route missing runtime key and rate-limit paths fail safely.
- Store expired/inactive subscription state blocks AI features.
- Durable webhook idempotency supports duplicate, processing, failure, and retry
  states.

## Verification Commands

| Command | Result |
| --- | --- |
| `npm test -- src/app/api/stripe/webhooks/route.test.ts src/app/api/clerk/webhooks/route.test.ts` | pass: 2 files, 10 tests |
| `npm test -- src/app/api/stripe/webhooks/route.test.ts src/app/api/clerk/webhooks/route.test.ts src/app/api/twilio/webhook/route.test.ts src/app/api/ai-employee/messages/route.test.ts src/libs/WebhookIdempotency.test.ts src/libs/PublicEndpointRateLimit.test.ts src/libs/StoreServiceControls.test.ts` | pass: 7 files, 42 tests |
| `npm run check:types` | pass |

Note:

- The second test command failed once under the managed filesystem sandbox with
  `spawn EPERM` while loading Vitest config. The same command passed after
  running outside the sandbox. This was an execution-environment failure, not a
  product-code or test assertion failure.

## Confirmed Findings

### D-0018: blank Clerk `svix-id` bypassed deterministic fallback id

Root cause:

- `src/app/api/clerk/webhooks/route.ts` used `request.headers.get('svix-id')`
  directly with nullish fallback. A blank header value is an empty string, not
  `null`, so idempotency could receive `eventId: ''`.

Impact:

- Blank `svix-id` values could collapse multiple Clerk webhook events into the
  same empty idempotency key, causing incorrect duplicate or processing-state
  behavior.

Affected files:

- `src/app/api/clerk/webhooks/route.ts`
- `src/app/api/clerk/webhooks/route.test.ts`

Fix:

- Trim `svix-id` and use the deterministic fallback when the value is absent or
  blank.

Verification:

- `npm test -- src/app/api/stripe/webhooks/route.test.ts src/app/api/clerk/webhooks/route.test.ts`
  passed 10 tests.
- The broader Phase 10 webhook/API reliability command passed 42 tests.
- `npm run check:types` passed.

Regression prevention:

- Keep the blank `svix-id` fallback test in the Reliability Gate and require
  idempotency-key tests for every provider webhook.

### D-0019: full reliability and observability matrix remains incomplete

Root cause:

- Focused route and library tests cover high-risk webhook and public API failure
  modes, but the complete Phase 10 matrix is not executable across AI provider
  timeout/invalid responses, DB connection failures, transaction rollback,
  serverless timeout behavior, expired WhatsApp tokens, deployment env
  transitions, and production log assertions.

Impact:

- Reliability Gate and Observability Gate cannot be certified.

Affected areas:

- AI provider timeout and invalid response.
- DB connection and partial transaction failure.
- Vercel function timeout behavior.
- Expired store WhatsApp token handling.
- Old/new deployment environment transition.
- Production logs for route, organization ID, event ID, and safe error code.
- Secret/token absence from real production logs.

Fix:

- Add controlled failure-injection tests around AI provider client, order
  transaction paths, WhatsApp outbound token failures, and provider webhook
  processing.
- Add production-safe log capture or observability smoke checks.
- Add deployment transition and rollback rehearsal evidence after production DB
  configuration is corrected.

Verification:

- Focused route/library reliability tests pass.
- Full matrix remains pending.

Regression prevention:

- Keep focused provider-webhook and public API failure-mode tests in the
  Reliability Gate.
- Add failure-injection tests before refactoring webhook, AI provider, DB
  transaction, or deployment runtime code.

## Carried Blockers

- D-0001: production/provider authority and access confirmations incomplete.
- D-0002: Clerk production keys not proven; Vercel reports development keys.
- D-0003: WhatsApp runtime-source proof blocked by DB connectivity.
- D-0004: Vercel Production `DATABASE_URL` resolves to `127.0.0.1:5433`.
- D-0007: lint still reports 333 warnings.
- D-0008: large cross-channel orchestration hotspots remain.
- D-0009: full multi-tenant scenario suite remains incomplete.
- D-0010: WhatsApp live production parity is not certified.
- D-0011: full web customer journey coverage is incomplete.
- D-0013: full order integrity matrix remains incomplete.
- D-0015: full adversarial AI matrix remains incomplete.
- D-0016: full admin authorization and secrets matrix remains incomplete.
- D-0017: full security and abuse matrix remains incomplete.

## Exit Decision

Phase 10 cannot be certified yet. One confirmed Clerk idempotency defect was
fixed and high-risk webhook/API failure modes now have executable coverage, but
the complete reliability and observability matrix remains incomplete.
