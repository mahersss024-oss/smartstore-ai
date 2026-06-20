# Phase 13: Test Expansion Plan

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`PHASE NOT CERTIFIED`

This phase added permanent WhatsApp regression coverage for cart/action context
forwarding and empty AI replies. It is not certified yet because the complete
test expansion matrix listed in the production plan is still incomplete.

## Added Regression Coverage

### WhatsApp reply context parity

Source evidence:

- `src/app/api/twilio/webhook/route.test.ts`
- `src/app/api/twilio/webhook/route.ts`
- `src/libs/TwilioWhatsApp.ts`

New coverage:

- A WhatsApp inbound message is routed through the same `sendWebChatMessage`
  engine used by web chat.
- The returned web-chat cart context is forwarded to `sendWhatsAppReplyMessage`.
- The forwarded context includes:
  - current cart
  - customer details
  - order id
  - suggested products
  - visible system actions
- This protects the adapter boundary needed for WhatsApp interactive messages,
  cart summaries, and action prompts.

### Empty AI reply handling

Source evidence:

- `src/app/api/twilio/webhook/route.test.ts`
- `src/app/api/twilio/webhook/route.ts`

New coverage:

- When the AI result is successful but `replyToCustomer` is blank after trim,
  the webhook route does not send an outbound WhatsApp message.
- The conversation processing lock is still released.

Impact:

- This prevents a blank WhatsApp outbound message attempt while preserving lock
  safety for the next customer message.

## Verification Commands

| Command | Result |
| --- | --- |
| `npm test -- src\\app\\api\\twilio\\webhook\\route.test.ts src\libs\TwilioWhatsApp.test.ts` | pass: 2 files, 30 tests |

Note:

- The same command failed once under the managed filesystem sandbox with
  `spawn EPERM` before loading Vitest config. It passed outside the sandbox.

## Remaining Required Test Suites

The following Phase 13 suites are still incomplete as a full certification
matrix:

- Runtime production keys tests.
- WhatsApp full webhook integration tests.
- WhatsApp interactive message scenario tests.
- WhatsApp full order creation tests.
- WhatsApp review and complaint tests.
- Web-order checkout E2E expansion.
- Tracking page E2E expansion.
- Store dashboard E2E.
- Platform admin E2E.
- Tenant isolation integration matrix.
- AI guardrail adversarial tests across web and WhatsApp.
- Order lifecycle concurrency matrix.
- Public endpoint abuse tests.
- Dead-code deletion regression tests.

## Confirmed Findings

### D-0023: complete regression expansion matrix remains incomplete

Root cause:

- Focused regression tests now cover several high-risk routes and libraries,
  but Phase 13 requires a cross-cutting matrix across production keys,
  WhatsApp, web checkout, tracking, dashboards, admin, tenant isolation, AI,
  orders, public abuse, and dead-code deletion.

Impact:

- Regression Gate cannot be certified.
- Future changes can still regress unimplemented scenario classes without a
  failing automated test.

Affected areas:

- Runtime production-key behavior.
- WhatsApp integration and interaction scenarios.
- Web customer E2E and tracking feedback.
- Store and platform admin E2E.
- Tenant isolation integration.
- AI adversarial parity.
- Order lifecycle concurrency.
- Public endpoint abuse controls.
- Dead-code deletion safety.

Fix:

- Continue adding focused test suites by risk order, starting with paths that
  previously produced user-visible production issues: WhatsApp order
  completion, review/complaint capture, dashboard visibility, and tenant
  isolation.

Verification:

- WhatsApp route and adapter focused tests pass 30 tests after this phase's
  additions.
- Full Phase 13 matrix remains pending.

Regression prevention:

- Every fixed production-risk bug must add a focused regression test before the
  phase can be certified.

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
- D-0019: full reliability and observability matrix remains incomplete.
- D-0021: full load-test and capacity matrix remains incomplete.
- D-0022: full dead-code runtime-use proof matrix remains incomplete.

## Exit Decision

Phase 13 cannot be certified yet. Permanent WhatsApp regression coverage was
expanded, but the full regression matrix remains open.
