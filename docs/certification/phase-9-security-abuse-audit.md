# Phase 9: Security And Abuse Audit

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`PHASE NOT CERTIFIED`

This phase added executable API-route coverage for the public AI employee
message endpoint and expanded WhatsApp webhook oversized-payload coverage. It
is not certified yet because the complete security and abuse matrix is not
executable across every public route, server action, redirect, output surface,
and upload/static asset boundary.

## Source Trace

### Public AI employee message API

Source evidence:

- `src/app/api/ai-employee/messages/route.ts`
- `src/libs/RequestBody.ts`
- `src/libs/PublicEndpointRateLimit.ts`
- `src/libs/SecureTokens.ts`
- `src/libs/StoreServiceControls.ts`

Behavior:

- Production requests fail closed when the AI employee webhook secret is not
  configured.
- When the AI employee webhook secret is configured, requests must include a
  matching `x-ai-employee-secret` header.
- Request bodies are limited to 64KB before schema validation or AI processing.
- Public message writes pass through durable organization/channel/customer/thread
  and IP rate-limit buckets.
- Store AI feature and subscription state are checked before the AI employee is
  called.
- Internal `aiOrchestration` data is removed from successful API responses.

Test evidence:

- `src/app/api/ai-employee/messages/route.test.ts`

### WhatsApp webhook security controls

Source evidence:

- `src/app/api/twilio/webhook/route.ts`
- `src/libs/TwilioWhatsApp.ts`
- `src/libs/WebhookIdempotency.ts`

Behavior:

- Meta verification requires the configured verify token.
- POST bodies are limited to 256KB before signature verification.
- Invalid webhook signatures are rejected before idempotency or AI processing.
- Valid inbound messages are idempotent by WhatsApp message ID.
- Same-customer WhatsApp threads use a processing lock before AI routing.

Test evidence:

- `src/app/api/twilio/webhook/route.test.ts`
- `src/libs/TwilioWhatsApp.test.ts`
- `src/libs/WebhookIdempotency.test.ts`

### Shared abuse and secret controls

Source evidence:

- `src/libs/PublicEndpointRateLimit.ts`
- `src/libs/SecureTokens.ts`
- `src/libs/AIReplySafetyGuards.ts`
- `src/features/admin/PlatformAdminActions.ts`

Behavior:

- Public endpoint bucket keys are hashed before storage.
- Public message rate limits include both customer/thread and IP-scoped buckets.
- Timing-safe token comparison is used for shared secret checks.
- AI replies are guarded against customer-private data and secret-like value
  leakage before customer delivery.
- Platform runtime secrets and AI provider keys are encrypted before persistence.

## Verification Commands

| Command | Result |
| --- | --- |
| `npm test -- src/app/api/ai-employee/messages/route.test.ts` | pass: 1 file, 5 tests |
| `npm test -- src/app/api/ai-employee/messages/route.test.ts src/app/api/twilio/webhook/route.test.ts src/libs/TwilioWhatsApp.test.ts src/libs/PublicEndpointRateLimit.test.ts src/libs/SecureTokens.test.ts src/libs/WebhookIdempotency.test.ts` | pass: 6 files, 49 tests |
| `npm run check:types` | pass |

## Confirmed Findings

### D-0017: full security and abuse matrix remains incomplete

Root cause:

- Focused API, webhook, rate-limit, secure-token, AI safety, and platform secret
  tests exist, but the complete Phase 9 matrix is not executable across every
  public route, server action, redirect, output surface, and static or upload
  boundary.

Impact:

- Security Gate and Abuse Control Gate cannot be certified.

Affected areas:

- Auth and RBAC review.
- Server action authorization review.
- Open redirect review.
- Output escaping review.
- SSRF review.
- File/image upload and static asset review.
- CORS behavior review.
- Error-message disclosure review.
- CSP enforcement plan.
- Log redaction verification beyond focused route responses.

Fix:

- Add route/action inventory-driven tests for unauthorized access, cross-tenant
  mutation attempts, redirect allowlists, escaped output, CORS behavior, safe
  outbound URL handling, and non-disclosing error responses.
- Add log capture assertions for representative public and privileged failures.
- Add a CSP implementation plan or enforced policy with tests.

Verification:

- Public AI employee message route security tests pass.
- WhatsApp webhook oversized-payload, signature, idempotency, and adapter tests
  pass.
- Shared public rate-limit and secure-token tests pass.
- Full security matrix remains pending.

Regression prevention:

- Keep the new API route and webhook payload tests in the Security Gate.
- Require every new public route and server action to declare its auth, rate
  limit, body-size, tenant-scope, and error-disclosure behavior in tests.

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

## Exit Decision

Phase 9 cannot be certified yet. The public AI employee route and WhatsApp
webhook now have stronger executable security coverage, but the full
route/action security and abuse matrix remains incomplete.
