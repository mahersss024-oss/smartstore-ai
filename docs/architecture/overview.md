# Architecture

## System Boundaries

SmartStore AI follows five authority layers:

1. PostgreSQL is the durable source of truth.
2. Platform services decide and execute business actions.
3. The AI model owns natural customer-facing conversation.
4. Guardrails validate structured facts and model output.
5. React/Next.js surfaces render structured actions and state.

The model does not directly write orders, prices, payments, permissions, or
tenant data. It requests platform actions; server-side code validates current
database state before execution.

## Main Areas

- `src/app`: App Router pages, layouts, and HTTP endpoints.
- `src/features/ai`: AI employee orchestration entry point.
- `src/libs/AIEmployee*`: cart, checkout, product resolution, lifecycle,
  semantic validation, model repair, diagnostics, and event replies.
- `src/features/customer`: public web chat, structured cart controls, feedback,
  and browser guest identity.
- `src/features/dashboard`: authenticated merchant actions and views.
- `src/libs`: billing, auth sync, service controls, outbound HTTP, rate limits,
  webhook idempotency, logging, retention, and shared domain services.
- `src/models/Schema.ts`: PostgreSQL schema.
- `migrations`: ordered production schema migrations.

## Conversation Pipeline

1. Resolve one organization and one customer/thread identity.
2. Load tenant-scoped catalog, cart, order, and conversation context.
3. Analyze intent and product evidence.
4. Ask one clarification when resolution is ambiguous.
5. Execute only validated platform-owned state transitions.
6. Generate a natural model reply from authoritative structured facts.
7. Run deterministic high-confidence checks and semantic review.
8. Ask the model to repair its own reply when validation fails.
9. Persist traceable conversation/action data.
10. Return text plus structured UI actions.

Guardrails return structured validation results. They do not author customer
messages.

## Order Pipeline

Order mutations validate:

- tenant ownership
- current order/cart version
- product identity and availability
- catalog price
- completeness
- permission
- fulfillment and payment compatibility
- legal workflow transition

Optimistic conditions prevent concurrent updates from silently overwriting one
another.

## Multi-Tenant Model

Protected merchant operations derive the active organization from Clerk.
Public customer operations resolve an explicit store and bind messages to a
store-scoped guest/thread identity. Store-owned tables carry
`organization_id`; important relations also use composite tenant foreign keys.

Platform administration is a separate privileged boundary and must never reuse
merchant authorization assumptions.

## External Integrations

- Clerk: authentication, organizations, membership lifecycle.
- Stripe: SaaS plans, add-ons, and usage-related billing state.
- Configurable AI provider: customer dialogue and semantic repair.
- Moyasar: prepared customer-payment integration, currently disabled.
- Better Stack/Sentry: optional server logging and error monitoring.

Outbound HTTP is HTTPS-only, timeout-bound, redirect-restricted, and blocks
private/local destinations.

## Scaling Model

The current architecture can scale horizontally when deployed with:

- shared managed PostgreSQL
- managed connection pooling
- shared durable rate limits and webhook idempotency
- external logging/error monitoring
- CDN/platform caching for static assets
- pagination on high-volume dashboards

Claims about 10,000 stores or 100,000 customers require staged load tests and
real query plans; they cannot be proven by unit tests alone.
