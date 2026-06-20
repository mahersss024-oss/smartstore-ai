# SmartStore AI Development Plan

## Current Foundation

- [x] Stripe-only billing for plans and add-ons
- [x] Clerk limited to authentication and organizations
- [x] Product image storage measured by real file size
- [x] Store dashboard, products, orders, customers, subscription, and settings areas
- [x] Basic conversation, customer, and AI order tables

## AI Store Employee Roadmap

Full plan: `../ai-store-employee-roadmap.md`

## Production Readiness Action Plan

### Can Be Done Now

- [x] Add GitHub CI/CD gate for `npm ci`, `npm run lint`, `npm run type-check`, `npm test`, and `npm run build`.
  - Estimated time: 30-60 minutes.
  - Impact: prevents broken changes from reaching the deployed demo.

- [x] Add production environment validation script.
  - Estimated time: 20-40 minutes.
  - Impact: detects missing Clerk, database, app URL, demo mode, and optional Stripe settings before deployment.

- [x] Add production smoke test script.
  - Estimated time: 20-40 minutes.
  - Impact: verifies homepage, smart link, web order page, sign-in, robots, and sitemap after deployment.

- [x] Update deployment and operations documentation.
  - Estimated time: 20-40 minutes.
  - Impact: gives the technical team clear local, cloud, rollback, and troubleshooting steps.

- [ ] Review remaining browser console warnings.
  - Estimated time: 20-45 minutes.
  - Impact: separates harmless development warnings from production issues.

### Next Engineering Improvements

- [ ] Expand E2E tests for sign-in, dashboard routing, smart link, web chat, products, orders, feedback, and archive flows.
  - Estimated time: 1-2 hours for the first useful set.
  - Start with the web-order checkout path because it covers catalog matching, system action buttons, cart state, fulfillment, payment, and confirmation.
  - [x] First web-order checkout E2E added for product selection, phone capture, pickup, payment, add-on item, and duplicate fulfillment prevention.

- [ ] Continue splitting `WebOrderChat.tsx` into message list, cart controls, product choices, system actions, and composer.
  - Estimated time: 2-4 hours.

- [ ] Continue splitting `AIEmployeeAgent.ts` into smaller context, persistence, decision, and response modules.
  - Estimated time: 4-8 hours for the next safe pass.

- [ ] Add internal orchestration analytics for model decisions, guard findings, repair attempts, visible system actions, and cart/order outcomes.
  - Estimated time: 2-4 hours.
  - Include repeated-step prevention, model repair rate, empty system action rate, and checkout step conversion.

### Needs External Service Setup

- [ ] Move uploaded media to Vercel Blob, Supabase Storage, S3, or an equivalent tenant-scoped object store.
  - Estimated time: 1-3 hours after provider choice and keys are available.

- [ ] Configure production monitoring and alerting with Sentry and/or Better Stack.
  - Estimated time: 1-3 hours after production tokens are available.

### Large Production Readiness

- [ ] Design and implement transaction-scoped PostgreSQL RLS.
  - Estimated time: 1-3 days because it affects every database access path.

- [ ] Run production-like load tests and query-plan reviews for 100, 500, 1,000, and 5,000 concurrent users.
  - Estimated time: 1+ day depending on tooling and data volume.

- [ ] Verify backup, PITR, restore drills, WAF/DDoS controls, and secret rotation.
  - Estimated time: depends on the selected infrastructure provider.

## Next Priorities

- [x] Complete store readiness checks before enabling customer AI
- [x] Add platform-owned AI system prompt, safety rules, and policy versioning
- [x] Add platform-managed supported languages and dialects list
- [x] Add structured AI action schema and forbidden action validation
- [x] Add AI setup assistant for subscribed stores
- [x] Add store-owned AI employee settings page
- [x] Add store-controlled country, language, and local dialect settings for AI replies
- [x] Add store knowledge base fields for policies, delivery, hours, FAQs, and safe payment instructions
- [x] Improve catalog quality fields and AI-suggestable product controls
- [x] Add product availability and AI visibility controls
- [x] Centralize order, payment, delivery, conversation, and AI status constants
- [x] Add order event history and transition rules
- [x] Define store-customer payment handling separately from Stripe platform billing
- [x] Keep customer payment handling provider-independent until the automated
  billing scope is enabled.
- [x] Reserve electronic customer payment methods as inactive future infrastructure
- [x] Add store-scoped AI context loader with strict organization filtering
- [x] Add minimum AI permission enforcement and action audit log
- [x] Add rate limiting and spam protection for public chat endpoints
- [x] Add simulation mode for testing AI before publishing
- [x] Add owner approval queue for AI-suggested setup changes
- [x] Build a structured conversation engine shared by web chat and WhatsApp
- [x] Add sales intelligence layer for contextual product recommendations
- [x] Replace public web order flow with chat-first ordering
- [x] Add cart state to conversation metadata
- [x] Add product cards with images inside web chat
- [x] Create orders only after customer confirmation
- [x] Add store approval and modification workflow
- [x] Send customer updates when order status changes
- [x] Request and capture reviews after completion
- [ ] Add order event automation for status updates and review requests
- [x] Add webhook idempotency and retry handling
- [ ] Add external webhook failure monitoring, dead-letter handling, and provider event ordering alerts
- [ ] Add analytics for AI conversations, carts, approvals, completion, and reviews

## Current Recommended Sequence

1. Review production browser console warnings.
2. Add the first expanded E2E suite for the customer web-order journey and core dashboard routes.
3. Add internal AI orchestration analytics for guards, repairs, visible actions, and checkout conversion.
4. Continue modularizing `AIEmployeeAgent.ts` and `WebOrderChat.tsx` after E2E coverage is in place.
5. Configure external monitoring and scheduled maintenance.
6. Prepare large-production work: object storage, RLS design, load testing, backup/PITR validation, and recovery drills.
