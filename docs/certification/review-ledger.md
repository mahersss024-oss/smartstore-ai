# Codebase Review Ledger

Date: 2026-06-27
Status: Active review ledger

This file promotes the external project memory review into repository evidence.
It separates confirmed engineering fixes from deferred product decisions,
historical notes, and operational validation that cannot be proven from code
alone.

## Current Source Of Truth

- Deployment provider: Render.
- WhatsApp provider: Meta WhatsApp Cloud API.
- Active WhatsApp webhook route: `/api/whatsapp/webhook`.
- Active branch: `main`.
- Latest verification commits:
  - `982caf3` `test: run browser e2e sequentially`
  - `0ae42a6` `ci: make semantic release opt-in`

## Verified Checks

The following checks were run locally after the latest stabilization fixes:

- `npm run lint`: passed.
- `npm run check:types`: passed.
- `npm test`: passed.
- `npm run build-local`: passed.
- `npm run test:e2e`: passed after enforcing sequential Playwright workers.

GitHub checks on `0ae42a6` completed successfully:

- Build with 24.x.
- Run static checks.
- Run unit tests.
- Run Storybook.
- Run E2E tests.
- Checkly E2E.
- Production quality gate.
- Crowdin synchronization.
- Create a new release.

## Memory Findings Promoted To Completed Fixes

These findings were listed in the external memory file as real defects and are
now recorded as fixed or covered by repository history and green checks.

| Finding | Status | Evidence |
| --- | --- | --- |
| AGENT-1 duplicate web-chat submissions | Fixed | DB-backed idempotency/unique-guard work recorded in prior commits; unit/E2E checks passed. |
| AGENT-5 premature `aiStatus='reply_ready'` | Fixed | Conversation state now moves through processing before reply-ready; checks passed. |
| CUSTOMER-1 broad customer deletion cascade | Fixed | Customer deletion was narrowed to avoid unrelated cross-channel order deletion; checks passed. |
| METADATA-RACE store metadata writes | Fixed for confirmed paths | Store/WhatsApp/AI settings transactional locking was added in prior stabilization; checks passed. |
| DATETIME timestamp inconsistency | Fixed for confirmed write paths | UTC application timestamps replaced timezone-sensitive `localtimestamp` writes in confirmed paths. |
| TRACK-1 public tracking privacy hardening | Fixed | Non-guessable tracking token support and rate-limited public tracking were added in prior stabilization. |
| CART-2 unsafe cart quantity | Fixed | Cart quantity is clamped to a safe range; covered by tests. |
| Outbox stuck-job and retry classification | Fixed | Reaper, terminal/transient classification, and ordering index were added; checks passed. |
| AI order limit enforcement | Fixed | AI-order entitlement limit is enforced in subscription checks. |
| Product-image hydration performance issue | Fixed | Product images are lazily hydrated for suggested products instead of loading the full image payload everywhere. |
| Guard repair/logging gaps | Fixed for confirmed paths | Bounded repair/re-guard behavior and guard diagnostics were expanded. |
| Moyasar invoice id validation | Fixed | Invoice identifiers are validated/encoded before provider calls. |

## Not Required Bug Work Without Product Decision

These items remain intentionally deferred. They are not current production
blockers unless the product owner changes the intended behavior.

- Support escalation flow: enable or delete only after product decision.
- Free-text product addition behavior: keep system-confirmed product selection
  unless product requirements change.
- Stripe cancellation on Clerk organization deletion: deferred while in-platform
  billing is not active.
- CSP enforcement tightening: security hardening, not a confirmed current
  regression; requires browser verification before enforcement.
- Additional dead-code cleanup where tests/docs still describe the current
  behavior.

## Historical Notes

Older memory entries mention Twilio and Vercel from previous implementation
periods. They are historical only. Active code/config/docs now target Render and
Meta WhatsApp Cloud API.

Historical migrations must not be edited or deleted only because they mention
older provider names. Migrations are point-in-time database history.

## Remaining External Validation

The following cannot be certified from repository code alone:

- Real Render deployment health after each push.
- Production Neon database connectivity, backups, point-in-time recovery, and
  live schema state.
- Meta WhatsApp live webhook delivery from production WABA/phone numbers.
- Sustained capacity claims such as 1000 stores or 100000 customers without a
  controlled load test and production-like monitoring.

## Review Rule

Future findings must be added here with one of these statuses:

- `Fixed`
- `Not a bug / product decision`
- `Historical`
- `Operational validation required`
- `Open defect`

Do not store secrets, customer private data, screenshots with exposed keys, or
provider credentials in this ledger.
