# Architecture Map

Generated: 2026-06-28

## Layer responsibilities

- UI layer: pages and client components render state, forms, buttons, cart controls, and chat panels.
- Server actions/API layer: validates input, resolves tenant scope, calls services, mutates database, revalidates paths.
- Service/domain layer: AI orchestration, product resolution, order lifecycle, checkout, rate limiting, billing sync, webhook idempotency.
- Database layer: Drizzle schema and migrations.
- External services: Clerk, Stripe, AI provider, Render, Whapi.cloud,
  PostgreSQL hosting.

## Decision boundaries

- Database is the source of truth.
- System/server code is the decision engine.
- AI is the conversation engine.
- Guardrails validate replies and ask the AI layer to repair unsafe replies; guardrails do not speak directly to customers.
- Sensitive actions remain server-side: order creation/modification, product publishing, customer deletion, billing, platform controls.

## Main coupling risks

- `AIEmployeeAgent.ts` is still large and should continue being split into context loading, persistence, decision, response, and diagnostics modules.
- Some operational reports are documentation-level today; external observability, load testing, and disaster recovery drills still need provider setup.
