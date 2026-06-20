# Phase 11: Performance And Capacity Audit

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`PHASE NOT CERTIFIED`

This phase fixed one confirmed WhatsApp lookup scalability issue and recorded
the current source-level capacity evidence. It is not certified yet because no
real p50/p95/p99 load profiles have been executed for the required customer and
store concurrency levels.

## Source Trace

### WhatsApp store connection lookup

Source evidence:

- `src/libs/TwilioWhatsApp.ts`
- `migrations/0022_whatsapp_channel_phone_lookup_idx.sql`
- `src/libs/TwilioWhatsApp.test.ts`

Behavior before this phase:

- The webhook lookup selected every active WhatsApp channel connection and then
  filtered `twilioWhatsAppFrom` in application code.

Behavior after this phase:

- The lookup filters by `config->>'twilioWhatsAppFrom'` in the database query.
- A partial index supports active WhatsApp channel lookups by phone number id.
- The Node-side validation remains in place to verify provider, mode,
  connection status, matching phone number id, and token availability.

Impact:

- Incoming WhatsApp webhook work no longer scales linearly with the total count
  of active WhatsApp store connections before finding the matching store.

### Existing performance foundations

Source evidence:

- `src/models/Schema.ts`
- `src/utils/DBConnection.ts`
- `src/libs/OutboundHttp.ts`
- `src/libs/PublicEndpointRateLimit.ts`
- `src/libs/WebhookIdempotency.ts`

Observed controls:

- DB pool max is configurable via `DATABASE_POOL_MAX`, bounded from 1 to 50.
- DB connection and idle timeouts are configurable.
- Outbound HTTP uses a default timeout and disables redirects.
- Webhook events have provider/event idempotency and status indexes.
- Public endpoint rate-limit buckets have unique key and expiry indexes.
- High-traffic tenant tables include organization-scoped indexes for products,
  orders, customers, conversations, conversation messages, order events, reviews,
  invoices, and platform audit logs.

### Remaining static performance risks

Source evidence:

- `src/app/[locale]/(auth)/dashboard/orders/page.tsx`
- `src/app/[locale]/(auth)/dashboard/customers/page.tsx`
- `src/app/[locale]/(auth)/admin/page.tsx`
- `src/features/customer/WebChatActions.ts`

Risks:

- Dashboard orders, customers, and platform-admin store lists use offset
  pagination. This is acceptable for small pilot datasets but can degrade for
  large offsets.
- Web chat reads up to 500 conversation messages for a thread. This is bounded,
  but it remains a heavy payload for long-running customer conversations.
- AI and WhatsApp latency depends on external provider response time and has not
  been measured under concurrent load.

## Verification Commands

| Command | Result |
| --- | --- |
| `npm test -- src/libs/TwilioWhatsApp.test.ts src/libs/TwilioWhatsApp.test.ts src/app/api/twilio/webhook/route.test.ts` | pass: 3 files, 29 tests |
| `npm run check:types` | pass |

Note:

- The WhatsApp test command failed once under the managed filesystem sandbox
  with `spawn EPERM` while loading Vitest config. The same command passed after
  running outside the sandbox. This was an execution-environment failure, not a
  product-code or test assertion failure.

## Confirmed Findings

### D-0020: WhatsApp connection lookup scanned active WhatsApp connections in application code

Root cause:

- `findWhatsAppStoreConnection` filtered only channel and active status in SQL,
  then iterated over every active WhatsApp channel connection in Node to compare
  `config.twilioWhatsAppFrom`.

Impact:

- WhatsApp webhook latency could grow with the number of active WhatsApp stores
  on the platform.

Affected files:

- `src/libs/TwilioWhatsApp.ts`
- `migrations/0022_whatsapp_channel_phone_lookup_idx.sql`
- `src/libs/TwilioWhatsApp.test.ts`

Fix:

- Added database-level `config->>'twilioWhatsAppFrom' = twilioWhatsAppFrom` filtering.
- Added a partial index for active WhatsApp channel phone-number-id lookup.
- Added focused lookup regression coverage.

Verification:

- WhatsApp lookup, adapter, and route tests passed 29 tests.
- `npm run check:types` passed.

Regression prevention:

- Keep lookup regression tests in the Performance Gate.
- Require indexed lookup evidence before adding new high-cardinality channel
  routing fields stored in JSON config.

### D-0021: full performance and capacity load matrix remains incomplete

Root cause:

- Static source review and focused tests exist, but no load run has measured
  p50/p95/p99 latency, DB query count, connection-pool behavior, AI provider
  latency, or WhatsApp burst handling across the required concurrency profiles.

Impact:

- Performance Gate and Capacity Gate cannot be certified.

Affected areas:

- Web order flow under 10/100/500/1000 concurrent customers.
- WhatsApp burst from same customer and multiple customers.
- Dashboard orders/customers/products latency and query counts.
- AI provider latency, timeout, and cost under load.
- Connection pool saturation and serverless concurrency behavior.

Fix:

- Add a production-safe load-test harness with seeded test tenants and customers.
- Capture p50/p95/p99 latency, error rate, DB query count, pool saturation, AI
  provider latency, and WhatsApp webhook processing time.
- Replace offset pagination with cursor pagination for high-growth dashboard
  lists before certifying larger capacities.

Verification:

- Static performance evidence and one WhatsApp lookup optimization are complete.
- Required load profiles remain pending.

Regression prevention:

- Keep this phase blocked until load-test evidence exists for the agreed pilot
  capacity.

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

## Exit Decision

Phase 11 cannot be certified yet. A real WhatsApp lookup scalability issue was
fixed, but capacity claims still require measured load evidence.
