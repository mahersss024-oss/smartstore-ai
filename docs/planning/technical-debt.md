# Technical Debt

Last updated: 2026-06-13

Status markers:

- `[x]`: completed with source/test/config evidence.
- `[ ]`: still open or not production-certified.

## Completed Since Initial Debt Register

- [x] Documentation inventory refreshed.

  Evidence: `docs/repository-map.md` was updated with current routes, API
  endpoints, feature folders, database tables, CI workflows, scripts, and
  documentation structure.

- [x] Production validation and smoke-test entry points exist.

  Evidence: `package.json` defines `check:env:production` and
  `smoke:production`; implementation files exist at
  `scripts/validate-production-env.mjs` and
  `scripts/smoke-test-production.mjs`.

- [x] CI runs core static, dependency, i18n, unit, E2E, and build checks.

  Evidence: `.github/workflows/CI.yml` runs build, lint/typegen, typecheck,
  `check:deps`, `check:i18n`, unit tests, Storybook tests, and E2E tests.
  `.github/workflows/production-gate.yml` runs production environment
  validation, lint, typecheck, unit tests, and production build.

- [x] Protected maintenance cleanup endpoint exists.

  Evidence: `src/app/api/maintenance/cleanup/route.ts` uses the runtime
  maintenance secret and `src/libs/OperationalDataRetention.ts`. The daily
  hosting schedule is still open below.

- [x] First useful web-order checkout E2E exists.

  Evidence: `tests/e2e/WebOrderChat.e2e.ts` covers the public web-order chat,
  AI provider mocking, product selection, pickup/payment continuity, cart state,
  and orchestration quality persistence.

- [x] AI employee refactor has meaningful extracted modules.

  Evidence: `src/libs/AIEmployeeCart.ts`, `AIEmployeeCheckout.ts`,
  `AIEmployeeOrderLifecycle.ts`, `AIEmployeeOrchestration.ts`,
  `AIEmployeeSemanticAnalysis.ts`, `AIEmployeeReplyGuardPipeline.ts`, and their
  related tests exist.

- [x] Web-order chat state and identity extraction started.

  Evidence: `src/features/customer/WebOrderChatState.ts`,
  `WebOrderGuestIdentity.ts`, and their tests exist.

- [x] WhatsApp adapter has implemented channel capabilities with tests.

  Evidence: `src/libs/TwilioWhatsApp.ts` and
  `src/libs/TwilioWhatsApp.test.ts` cover thread isolation, signature
  verification, text/interactive/location parsing, product lists, payment
  buttons, cart controls, cart summaries, review list messages, and normalized
  cart metadata.

- [x] WhatsApp order status/review/feedback paths have source and test evidence.

  Evidence: `src/features/dashboard/OrderActions.ts` sends WhatsApp order
  status notifications and interactive review requests; `OrderActions.test.ts`
  covers WhatsApp status updates and completed-order review requests.
  `src/libs/AIEmployeeOrderLifecycle.ts` captures WhatsApp feedback as order
  events; `AIEmployeeOrderLifecycleConcurrency.test.ts` covers WhatsApp
  customer feedback capture.

## Mandatory Maximum Production Certification

- [ ] Before claiming full production readiness, complete the full-system plan in
  `docs/maximum-production-certification-plan.md`.

This plan is mandatory production-readiness debt. The project must not be
declared `PRODUCTION CERTIFIED` until the gates in that document have passed
with evidence, or unresolved risks are explicitly classified and accepted.

Phase progression is locked. The project must not move from one certification
phase to the next until the current phase is completed with evidence, all
confirmed defects inside that phase are fixed or classified as blockers, and the
phase result is recorded as `PHASE CERTIFIED`. If any required item is missing,
untested, unclear, or harmful to the core product idea or functions, the result
is `PHASE NOT CERTIFIED` and the next phase must not begin.

The certification plan also includes mandatory gates for privacy/compliance,
CI/CD protection, SBOM/license/supply-chain review, kill switches, cost and
quota controls, browser/accessibility compatibility, third-party provider
limits, data lifecycle/retention, and detailed incident runbooks. These gates
must not be treated as optional for full production certification.

The same plan additionally includes deep operational gates for feature flags and
release strategy, migration verification, notification deliverability, time
zone/locale/currency correctness, financial reconciliation, test/demo data
control, admin human-error protection, audit-log completeness, API contract
documentation, dependency upgrade policy, clock/replay security, and customer
support operations.

Before starting the certification audit, complete `Phase -1: Pre-Audit
Readiness Gate` in the certification plan. The audit must not begin until scope,
access, evidence capture, safe test data, defect tracking, risk decisions, and
rollback authority are ready.

## Required Before Large Production Traffic

1. [ ] Production-like load and query-plan testing

   Measure orders, customers, chat polling, platform administration, webhooks,
   and AI orchestration with realistic data at 100, 500, 1,000, and 5,000
   concurrent users. Record p95/p99 latency, errors, lock waits, pool
   saturation, CPU, memory, and provider cost.

2. [ ] Transaction-scoped PostgreSQL RLS architecture

   Add tenant context inside each transaction and separate roles for merchant
   requests, platform administration, verified webhooks, and migrations before
   enabling RLS. Do not enable RLS directly on the current shared pool.

3. [ ] Production infrastructure validation

   Verify backups/PITR, restore drills, monitoring, alerting, secret rotation,
   WAF/DDoS controls, provider production keys, and gradual rollback.

4. [ ] Nonce-based Content Security Policy

   Validate Clerk, Sentry, product images, smart links, and future payments on
   the real domains before enforcement.

5. [ ] Expanded multi-tenant integration matrix

   Existing focused tests cover critical destructive/public paths. Add complete
   store-A/store-B read and mutation coverage for every server action and API.

6. [ ] Dedicated object storage for high-volume media

   Current cloud demo uploads are durable because validated images are stored as
   database-backed data URLs. Before high production traffic, move product and
   logo media to S3, Supabase Storage, Vercel Blob, or an equivalent tenant-
   scoped object store with signed upload rules, CDN delivery, and lifecycle
   controls.

## Important Maintainability Work

1. [ ] Continue splitting `AIEmployeeAgent.ts`

   - [x] Extract cart, checkout, lifecycle, orchestration, semantic analysis,
     and reply-guard modules.
   - [ ] Extract catalog decision loading, conversation persistence, and prompt
     fact assembly while preserving one orchestration entry point.

2. [ ] Split `WebOrderChat.tsx`

   - [x] Extract web-order chat state normalization and guest identity helpers.
   - [ ] Separate message list, cart, product choices, checkout controls, and
     composer without duplicating state ownership.

3. [ ] Split large dashboard server components

   Continue the data-loader/view boundary for platform admin, settings, AI
   operations, dashboard home, and revenue.

## Operational Follow-Up

- [ ] Schedule `/api/maintenance/cleanup` daily in the hosting provider.
- [x] Keep the cleanup endpoint protected and backed by retention logic.
- [ ] Rerun `npm audit --omit=dev` in CI; the local registry request ended with
  `ECONNRESET`.
- [ ] Add dashboards for AI repair rate, guard findings, webhook failures, checkout
  conversion, complaints, and feedback.
- [ ] Revisit queue-based processing when WhatsApp or other high-volume channel
  adapters are enabled.

## Current Work Order

1. [ ] Add an expanded E2E suite for the web-order checkout journey and core
   dashboard routes.

   - [x] First web-order checkout E2E is implemented.
   - [ ] Core dashboard route E2E coverage is still open.

2. [ ] Add internal AI orchestration analytics before deeper refactoring.

   - [x] Orchestration diagnostics and quality tests exist.
   - [ ] Operational dashboards/metrics for production monitoring are still
     open.

3. [ ] Continue modularizing `AIEmployeeAgent.ts` and `WebOrderChat.tsx` with E2E
   coverage protecting the checkout flow.
4. [ ] Configure external monitoring and alerting.
5. [ ] Start large-production infrastructure work only after the pilot flow is
   observable: object storage, RLS design, load testing, PITR, and restore
   drills.
