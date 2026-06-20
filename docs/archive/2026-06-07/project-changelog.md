# Project Changelog

Date: 2026-06-07

## Production Hardening Pass

- Added HTTPS-only, timeout-bound, private-network-safe outbound HTTP.
- Added bounded request bodies and timing-safe integration secrets.
- Added durable public read/write rate limiting with hashed bucket keys.
- Added lease-aware Stripe and Clerk webhook idempotency.
- Added Stripe billing event ordering and concurrent update protection.
- Added order optimistic concurrency and explicit race errors.
- Added composite tenant foreign keys, review uniqueness, and operational
  indexes through migrations `0018`-`0020`.
- Added configurable PostgreSQL pool limits and timeouts.
- Added protected cleanup for expired rate limits and retained webhook records.
- Added production HSTS and server-only logging credentials.
- Added bounded, idempotent handling to the disabled Moyasar callback.
- Added pagination and scoped queries for merchant and platform dashboards.
- Added architecture, security, testing, operations, and environment
  documentation.
- Verified 257 tests, 7 browser tests, lint, types, translations, dependencies,
  production build, and Git whitespace.

## AI Orchestration Refactor

- Split AI employee responsibilities into smaller modules:
  - `AIEmployeeCart`
  - `AIEmployeeCheckout`
  - `AIEmployeeOrchestration`
  - `AIEmployeeOrderLifecycle`
  - `AIEmployeeSemanticAnalysis`
  - `AIEmployeeReplyGuardPipeline`
- Reduced `AIEmployeeAgent.ts` from more than 6000 lines to about 2840 lines.
- Kept the AI employee agent as the main coordinator for customer messages.
- Kept sensitive actions under platform control.
- Kept customer-facing text generated or repaired by the model path.

## Customer Chat

- Extracted web chat state normalization into `WebOrderChatState`.
- Kept cart controls, confirmation, payment, fulfillment, and location sharing as structured system actions.
- Added feedback panel behavior linked to the web order guest identity.
- Normalized chat and dashboard timestamp display through the configured store timezone.

## Orders and Customers

- Improved archive and permanent delete behavior for orders and customers.
- Preserved organization scoping on dashboard actions.
- Kept order events, reviews, invoices, AI logs, and conversations connected to cleanup flows.

## Product Catalog

- Added product creation utilities.
- Improved duplicate detection and product matching tests for close names and word order changes.
- Improved AI simulation and sales conversation intelligence tests.
- Made uploaded product and store images durable on cloud demo deployments by storing validated image data URLs.

## Subscription and Service Controls

- Adjusted subscription entitlement handling around AI conversation limits.
- Added service control checks around store feature availability.

## Validation

- Full unit test suite passed.
- ESLint passed.
- TypeScript passed.
- Dependency checks passed.
- i18n checks passed.
- Production build passed.
- Production dependency audit passed.

## Webhook Reliability

- Added `webhook_events` table for durable webhook idempotency.
- Added Stripe webhook duplicate protection by Stripe event ID.
- Added Clerk webhook duplicate protection by Svix ID when available, with a deterministic fallback.
- Added retry support for previously failed webhook events.
- Added unit coverage for new, duplicate, and retried webhook events.

## Public Endpoint Protection

- Replaced in-memory public message rate limiting with PostgreSQL-backed durable buckets.
- Added `public_endpoint_rate_limits` table with a unique key per public message scope.
- Updated customer web chat and AI employee message API to await durable rate checks.
- Added unit coverage for allowed, blocked, and reset test paths.

## Database Performance

- Added organization-scoped indexes for products, orders, order events, customers, conversations, conversation messages, AI action logs, reviews, and invoices.
- Targeted dashboard orders, customer history, admin store views, conversation history, archive pages, and cleanup flows.
- Kept indexes tied to observed query shapes instead of broad speculative indexing.

## AI Reply Guard Coverage

- Added direct tests for semantic reply review notes so uncertain guard concerns do not block customer replies.
- Added direct tests for model-based reply repair and post-repair validation.
- Prevented unavailable catalog products from auto-matching close available products into the cart.

## Chat Orchestration Harmony

- Kept product selection ahead of checkout whenever the customer still needs to choose a real catalog item.
- Prevented submitted carts from retaining stale interactive controls.
- Added structured contradiction handling for model claims about cart and sensitive actions.
- Added model-reviewed customer messages for order status events and post-order feedback requests.
- Aligned product suggestions with the cards actually visible to the customer.
- Preserved repeated customer messages while reconciling optimistic chat updates with persisted messages.
- Added diagnostics and regression tests for mixed workflow actions, false action claims, event-state wording, and chat synchronization.

## Public Chat Tenant Isolation

- Added coverage that public web chat message loading does not expose another customer identity's conversation.
- Added coverage that public web chat deletion and feedback submission do not mutate data when the thread identity does not match.

## Feedback Linkage Maintainability

- Extracted conversation metadata order-id parsing into a reusable tested helper.
- Added support for numeric JSON strings while rejecting malformed order identifiers.

## Customer Dashboard Maintainability

- Extracted customer summary aggregation from the customers page into a reusable tested helper.
- Added a large-dataset summary test covering customer identity matching, archived customers, orders, reviews, and complaint counts.
- Narrowed customer detail queries so orders, reviews, and complaint events are loaded for the selected customer instead of loading all organization records and filtering in memory.
