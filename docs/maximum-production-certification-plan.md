# Maximum Production Certification Plan

## Current Launch Scope Decision

Automated platform billing and customer online payment providers are deferred
until after the current production launch. Stripe, Moyasar, Tap, and any future
payment-provider credentials, checkout or callback activation, price catalog
verification, and live financial reconciliation are not launch blockers while
those capabilities remain disabled. Existing payment foundations are retained
and must continue to pass static and automated regression checks, but no
interim collection process should be exposed in customer-facing or
merchant-facing product copy.

Before any automated payment provider is enabled later, its provider access,
production credentials, webhook or callback delivery, event ordering,
reconciliation, rollback, and failure-mode gates become mandatory again.

Better Stack log forwarding is also deferred and remains an optional
post-launch observability integration. Runtime console and Vercel logs remain
the active baseline. External monitoring and alerting still require a selected
provider before maximum production certification.

Date: 2026-06-13

Status: Mandatory production-readiness debt

This document is the execution plan required before claiming maximum production
readiness for SmartStore AI. "100% production readiness" in this document means
all gates below have passed with evidence, all confirmed blockers are fixed, and
all accepted residual risks are documented with owners and rollback plans.

No gate can be marked complete from opinion alone. Each completed item must have
at least one of:

- Source code evidence
- Runtime evidence
- Build evidence
- Typecheck evidence
- Test evidence
- Log evidence
- Database evidence
- Deployment evidence

## Certification Rules

- Do not mark the project `PRODUCTION CERTIFIED` while any critical gate is
  failing.
- Do not move to the next phase unless the current phase is recorded as
  `PHASE CERTIFIED` with evidence.
- Mark the current phase `PHASE NOT CERTIFIED` when any required item is
  missing, untested, unclear, or proven harmful to the product idea or
  functions.
- Do not delete code until direct, dynamic, runtime, route, script, and future
  documented usage checks are complete.
- Do not fix behavior without naming the root cause, impact, affected files,
  verification, and regression prevention.
- Do not rely on real external providers in automated tests unless the test is
  explicitly labeled as production smoke and safe to run.
- Do not expose secrets in logs, reports, screenshots, commits, or chat.
- Do not certify WhatsApp until web-order and WhatsApp order behavior are
  proven equivalent where the channel supports equivalence.

## Phase Progression Lock

Each phase is an independent certification gate. The next phase must not start
until all required items in the current phase are complete and verified.

Allowed phase decisions:

- `PHASE CERTIFIED`
- `PHASE NOT CERTIFIED`

`PHASE CERTIFIED` requires:

- [ ] Every required item in the phase is checked.
- [ ] Every claim has evidence.
- [ ] Every confirmed defect has root cause, impact, affected files, fix,
  verification, and regression prevention.
- [ ] Required tests for the phase pass.
- [ ] No unresolved blocker remains inside the phase scope.
- [ ] No change harms the core product idea or existing functions.
- [ ] The phase result is written into the gate status ledger.

`PHASE NOT CERTIFIED` is required when:

- [ ] Any required item is missing.
- [ ] Any route, API, function, query, component, hook, workflow, integration,
  or state transition inside the phase scope is not understood.
- [ ] Any required test is not executed.
- [ ] Any confirmed defect remains unresolved.
- [ ] Any fix is unverified.
- [ ] Any regression risk remains untested.

When a phase is `PHASE NOT CERTIFIED`, execution remains inside that phase until
the blockers are fixed and re-verified.

## Phase -1: Pre-Audit Readiness Gate

Goal: prepare the project, environments, evidence trail, and test data before
starting production certification. This phase happens before Phase 0 and blocks
the audit if evidence cannot be collected safely.

Required preparation:

- [ ] Confirm the audit objective, expected launch scope, and excluded future
  work.
- [ ] Freeze the target branch and commit for the first audit pass.
- [ ] Confirm who can approve code changes, deployments, secret rotations, and
  database operations.
- [ ] Confirm access to GitHub, Vercel, production logs, database provider,
  Clerk, Whapi WhatsApp, AI provider, Stripe, Moyasar, and observability tools.
- [ ] Confirm no real secrets will be pasted into chat, tickets, screenshots, or
  committed files.
- [ ] Create a dedicated audit evidence folder or report file.
- [ ] Create a defect ledger for every confirmed issue.
- [ ] Create a decision ledger for accepted risks and launch blockers.
- [ ] Confirm staging or local environments can run without mutating production
  customer/order data.
- [ ] Confirm production smoke tests are read-only or explicitly safe.
- [ ] Confirm test stores, test customers, test products, test orders, and test
  WhatsApp numbers are clearly separated from real customer data.
- [ ] Confirm rollback authority and rollback path before any production-impacting
  change.
- [ ] Confirm database backup/PITR status before running destructive or migration
  tests.
- [ ] Confirm the project can be restored to the target commit if the audit
  discovers a regression.

Required artifacts:

- [ ] Audit scope statement.
- [ ] Access checklist.
- [ ] Evidence ledger.
- [ ] Defect ledger.
- [ ] Risk decision ledger.
- [ ] Test data inventory.
- [ ] Safe production smoke-test agreement.
- [ ] Rollback readiness note.

Exit criteria:

- [ ] Pre-Audit Readiness Gate passes.
- [ ] Any missing access, missing evidence path, unsafe test data, or unclear
  authority is recorded as a blocker.

## Phase 0: Baseline Freeze And Inventory

Goal: define exactly what is being certified.

Required work:

- [ ] Record current commit, branch, deployment URL, and Vercel deployment ID.
- [ ] Confirm `git status --short` is clean before starting each audit block.
- [ ] Inventory every file and folder.
- [ ] Inventory every Next.js route: `page.tsx`, `layout.tsx`, `route.ts`,
  `loading.tsx`, `error.tsx`, `not-found.tsx`, middleware/proxy, sitemap,
  robots, manifest.
- [ ] Inventory every server action.
- [ ] Inventory every public endpoint.
- [ ] Inventory every database table and migration.
- [ ] Inventory every AI, guardrail, order, customer, WhatsApp, billing,
  platform-admin, store-admin, and security module.
- [ ] Inventory every dependency and devDependency.
- [ ] Inventory every environment variable and its owner:
  Vercel-only, platform-admin managed, store-admin managed, or deprecated.

Evidence required:

- [ ] File count
- [ ] Route/API list
- [ ] Server action list
- [ ] Database table list
- [ ] Environment variable matrix
- [ ] Test inventory

Exit criteria:

- [ ] `docs/repository-map.md` or an equivalent inventory is current.
- [ ] Unknown ownership files are listed as blockers.

## Phase 1: Baseline Quality Gates

Goal: establish whether the current project passes the non-negotiable build
and test gates.

Required commands:

- [ ] `npm run check:types`
- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run check:env:production`
- [ ] `npm run check:deps`
- [ ] `npm run check:i18n`
- [ ] `npm run smoke:production`

Required review:

- [ ] Separate failures from warnings.
- [ ] Classify every failure as blocker, high, medium, low, or accepted risk.
- [ ] Confirm tests are not silently skipping critical flows.
- [ ] Confirm build does not rely on local-only state.

Exit criteria:

- [ ] All required commands pass, or failures are documented with owner,
  root cause, and remediation.

## Phase 2: Architecture And Runtime Boundary Audit

Goal: prove that major boundaries are understandable and production-safe.

Required work:

- [ ] Map marketing, auth, dashboard, admin, API, customer web-order, and
  tracking boundaries.
- [ ] Map frontend-to-server-action boundaries.
- [ ] Map API-to-library boundaries.
- [ ] Map database access modules.
- [ ] Map AI orchestration boundaries.
- [ ] Map WhatsApp adapter boundaries.
- [ ] Map billing provider boundaries.
- [ ] Map platform settings and store settings ownership.
- [ ] Identify modules that are too large or too coupled.
- [ ] Identify duplicated business logic between web and WhatsApp.

Special focus:

- [ ] `AIEmployeeAgent.ts`
- [ ] `WebOrderChat.tsx`
- [ ] `WhapiWhatsApp.ts`
- [ ] `WebChatActions.ts`
- [ ] `OrderOperations.ts`
- [ ] `OrderWorkflow.ts`
- [ ] Platform admin pages and actions
- [ ] Store settings pages and actions

Exit criteria:

- [ ] Every critical flow has a documented entry point, core logic module, DB
  writes, external side effects, and tests.

## Phase 3: Database Integrity And Tenant Isolation

Goal: prove no store can read or mutate another store's data.

Required work:

- [ ] Review every table in `src/models/Schema.ts`.
- [ ] Review every migration in order.
- [ ] Verify `organizationId` presence on tenant-scoped data.
- [ ] Verify indexes and unique constraints for tenant-scoped lookups.
- [ ] Review all `select`, `insert`, `update`, and `delete` calls.
- [ ] Verify every dashboard read is scoped to the active organization.
- [ ] Verify every mutation checks organization ownership.
- [ ] Verify archive/delete flows cannot cross tenant boundaries.
- [ ] Verify public links are scoped and cannot enumerate tenant data.
- [ ] Verify customer identity/channel merging cannot merge customers across
  stores.
- [ ] Verify platform-admin access is intentionally broader and audited.

Required tests:

- [ ] Store A cannot read Store B orders.
- [ ] Store A cannot update Store B order status.
- [ ] Store A cannot read Store B customers.
- [ ] Store A cannot update Store B settings.
- [ ] Store A cannot access Store B products.
- [ ] Public tracking link cannot access another store's order.
- [ ] Two customers on the same store link remain isolated.
- [ ] Same phone number across two stores remains isolated.
- [ ] Same WhatsApp business phone serving multiple customers remains isolated.
- [ ] Concurrent customers do not share cart state.
- [ ] Concurrent stores do not share settings or AI context.

Exit criteria:

- [ ] Multi-Tenant Isolation Gate passes.
- [ ] Database Integrity Gate passes.

## Phase 4: WhatsApp Production Flow Audit

Goal: prove WhatsApp works end-to-end with the same business correctness as
web-order.

Required source trace:

- [ ] Whapi webhook verification request.
- [ ] Whapi webhook message request.
- [ ] Signature verification.
- [ ] Idempotency.
- [ ] Conversation lock.
- [ ] Store connection lookup by phone number ID.
- [ ] Access token decryption.
- [ ] Customer identity normalization.
- [ ] Conversation selection/creation.
- [ ] Message persistence.
- [ ] AI processing.
- [ ] Guardrail processing.
- [ ] Product selection.
- [ ] Cart mutation.
- [ ] Checkout progression.
- [ ] Order creation.
- [ ] Order status notification.
- [ ] Review request.
- [ ] Review capture.
- [ ] Complaint/feedback capture.
- [ ] WhatsApp outbound send and failure handling.

Required failure scenarios:

- [ ] Missing platform app secret.
- [ ] Invalid signature.
- [ ] Duplicate webhook event.
- [ ] Store connection not found.
- [ ] Expired or invalid store access token.
- [ ] Customer sends multiple messages while previous reply is processing.
- [ ] Whapi send API fails.
- [ ] AI provider fails.
- [ ] DB write fails after message is received.
- [ ] Interactive payload is malformed.
- [ ] Unsupported message type.

Required WhatsApp parity tests:

- [ ] Greeting and catalog discovery.
- [ ] Product list suggestions.
- [ ] Product selection using text.
- [ ] Product selection using interactive list/button.
- [ ] Cart update.
- [ ] Cart summary.
- [ ] Fulfillment method selection.
- [ ] Payment method selection.
- [ ] Order confirmation.
- [ ] Order status update.
- [ ] Review inside WhatsApp without external link.
- [ ] Complaint/feedback routed to customer feedback section, not only chat.

Exit criteria:

- [ ] WhatsApp Production Flow Gate passes.
- [ ] WhatsApp does not require code changes for per-store credential updates.
- [ ] WhatsApp failure modes are observable.

## Phase 5: Web Customer Flow Audit

Goal: prove the customer web journey works fully on mobile, tablet, and
desktop.

Required trace:

- [ ] Open public store link.
- [ ] Load store settings, products, delivery, payment, and AI context.
- [ ] Guest/customer identity creation.
- [ ] Chat start.
- [ ] AI reply.
- [ ] Product recommendations.
- [ ] Add to cart.
- [ ] Update quantity.
- [ ] Remove item.
- [ ] Restore cancelled cart.
- [ ] Fulfillment method.
- [ ] Payment method.
- [ ] Confirm order.
- [ ] Track order.
- [ ] Submit review.
- [ ] Submit complaint/feedback.
- [ ] Revisit as same customer.
- [ ] Revisit as different customer.

Required UI checks:

- [ ] Mobile no overflow.
- [ ] Tablet no overlap.
- [ ] Desktop no overlap.
- [ ] RTL Arabic text is readable.
- [ ] Loading states exist.
- [ ] Empty states exist.
- [ ] Error states exist.
- [ ] Buttons remain accessible.
- [ ] Product choices do not resize layout unpredictably.

Exit criteria:

- [ ] Web Customer Flow Gate passes.
- [ ] Mobile Gate passes.
- [ ] Tablet Gate passes.
- [ ] Web Gate passes.

## Phase 6: Orders, Cart, Reviews, And Complaints Integrity

Goal: prove business state is correct and cannot drift.

Required work:

- [ ] Review cart state machine.
- [ ] Review checkout state machine.
- [ ] Review order lifecycle.
- [ ] Review order status transitions.
- [ ] Review order event writing.
- [ ] Review order notifications.
- [ ] Review customer review persistence.
- [ ] Review complaint/feedback persistence.
- [ ] Review customer page aggregation.
- [ ] Review archive/delete behavior.

Required tests:

- [ ] Cannot confirm empty cart.
- [ ] Cannot skip required checkout facts.
- [ ] Cannot transition order to invalid status.
- [ ] Concurrent order status updates remain consistent.
- [ ] Review is stored in review table and shown in customer page.
- [ ] Complaint is stored in complaint/feedback section and shown in customer
  page.
- [ ] Chat messages remain chat messages and do not masquerade as reviews.
- [ ] Order notifications do not leak to another customer.

Exit criteria:

- [ ] Orders Integrity Gate passes.
- [ ] Customer Feedback Gate passes.

## Phase 7: AI And Guardrails Forensic Audit

Goal: prove the AI assistant is useful, bounded, and does not break ordering.

Required work:

- [ ] Map prompt construction.
- [ ] Map store context injection.
- [ ] Map customer context injection.
- [ ] Map catalog grounding.
- [ ] Map semantic analysis.
- [ ] Map orchestration.
- [ ] Map guardrail decisions.
- [ ] Map reply rewrites.
- [ ] Map system action creation.
- [ ] Map order lifecycle integration.
- [ ] Map hallucination controls.
- [ ] Map prohibited actions.

Required adversarial tests:

- [ ] Prompt injection asking for secrets.
- [ ] Prompt injection asking for another store's data.
- [ ] Customer asks for unavailable item.
- [ ] Customer sends nonsense/off-menu message.
- [ ] Customer changes mind mid-checkout.
- [ ] Customer asks price after cart exists.
- [ ] Customer sends multiple products in one message.
- [ ] Customer refuses required info.
- [ ] AI proposes an invalid order action.
- [ ] Guardrail rewrite does not destroy valid sales answer.

Exit criteria:

- [ ] AI Safety Gate passes.
- [ ] Guardrails Gate passes.
- [ ] Web and WhatsApp behavior are channel-equivalent where possible.

## Phase 8: Platform Admin And Store Admin Audit

Goal: prove administrative operations are safe and complete.

Platform admin:

- [ ] Runtime production keys.
- [ ] AI provider keys.
- [ ] Store list.
- [ ] Store plan/capacity controls.
- [ ] Store suspension/partial suspension.
- [ ] Subscription cancellation.
- [ ] Audit logs.
- [ ] Platform admin permissions.

Store admin:

- [ ] Store identity/settings.
- [ ] WhatsApp credentials.
- [ ] Products.
- [ ] Orders.
- [ ] Customers.
- [ ] Reviews.
- [ ] Complaints.
- [ ] Payment methods.
- [ ] Delivery methods.
- [ ] Team/member access through Clerk.

Required tests:

- [ ] Store admin cannot edit platform runtime keys.
- [ ] Platform service permission required for platform keys.
- [ ] Store admin cannot access another store's settings.
- [ ] WhatsApp store credentials are encrypted.
- [ ] Empty credential update does not erase existing secret.
- [ ] Clear credential checkbox only clears when explicitly checked.

Exit criteria:

- [ ] Platform Admin Gate passes.
- [ ] Store Admin Gate passes.
- [ ] Secrets Gate passes.

## Phase 9: Security And Abuse Audit

Goal: prove public and privileged surfaces resist common attacks.

Required work:

- [ ] Auth and RBAC review.
- [ ] Server action authorization review.
- [ ] Webhook verification review.
- [ ] Replay/idempotency review.
- [ ] Rate limit review.
- [ ] Input validation review.
- [ ] Output escaping review.
- [ ] SSRF review.
- [ ] Open redirect review.
- [ ] File/image upload review.
- [ ] Secret leakage review.
- [ ] Log redaction review.
- [ ] CSP plan review.
- [ ] CORS behavior review.
- [ ] Error message disclosure review.

Required tests:

- [ ] Invalid webhook signatures rejected.
- [ ] Missing webhook secrets rejected in production.
- [ ] Oversized payload rejected.
- [ ] Rate limit triggers for abusive public chat.
- [ ] Unauthorized admin action rejected.
- [ ] Cross-tenant mutation rejected.
- [ ] Production keys are not printed in responses or logs.

Exit criteria:

- [ ] Security Gate passes.
- [ ] Abuse Control Gate passes.

## Phase 10: Reliability And Failure Mode Audit

Goal: prove the system fails safely and recoverably.

Required scenarios:

- [ ] AI provider timeout.
- [ ] AI provider invalid response.
- [ ] WhatsApp send failure.
- [ ] WhatsApp duplicate webhook.
- [ ] Stripe webhook retry.
- [ ] Clerk webhook retry.
- [ ] DB connection failure.
- [ ] Partial DB transaction failure.
- [ ] Vercel function timeout.
- [ ] Missing runtime key.
- [ ] Expired store token.
- [ ] Deployment with old and new env transition.

Required observability:

- [ ] Logs include route, organizationId, event ID, and safe error code.
- [ ] Logs do not include secrets or raw access tokens.
- [ ] Admin-visible audit logs exist for platform mutations.
- [ ] Runbooks exist for WhatsApp failure, AI failure, DB failure, deployment
  rollback, and secret rotation.

Exit criteria:

- [ ] Reliability Gate passes.
- [ ] Observability Gate passes.

## Phase 11: Performance And Capacity Audit

Goal: estimate how many stores and customers can be served safely.

Required work:

- [ ] Measure p50/p95/p99 latency for public web-order.
- [ ] Measure p50/p95/p99 latency for WhatsApp webhook.
- [ ] Measure p50/p95/p99 latency for dashboard orders/customers/products.
- [ ] Count DB queries per critical route.
- [ ] Identify N+1 queries.
- [ ] Review indexes for high-traffic paths.
- [ ] Review payload sizes.
- [ ] Review serverless timeout risk.
- [ ] Review connection pool settings.
- [ ] Review AI provider latency and cost.

Required load profiles:

- [ ] 10 concurrent customers, 1 store.
- [ ] 100 concurrent customers, 1 store.
- [ ] 100 concurrent customers, 10 stores.
- [ ] 500 concurrent customers, 50 stores.
- [ ] 1,000 concurrent customers, 100 stores.
- [ ] WhatsApp burst: multiple messages per same customer.
- [ ] WhatsApp burst: multiple customers on same store phone number.

Exit criteria:

- [ ] Performance Gate passes for agreed pilot capacity.
- [ ] Capacity beyond pilot is documented as limit or future work.

## Phase 12: Dead Code And Dependency Forensics

Goal: remove or classify unused code safely.

Required tools:

- [ ] `npm run check:deps`
- [ ] `tsc --noEmit`
- [ ] `eslint`
- [ ] `rg`
- [ ] Route inventory
- [ ] Dynamic import/string usage search
- [ ] Package import search

Required classification:

- [ ] Safe to remove
- [ ] Keep
- [ ] Needs manual confirmation
- [ ] Future-documented

Deletion proof required:

- [ ] No direct import.
- [ ] No dynamic import.
- [ ] No Next.js route convention usage.
- [ ] No script usage.
- [ ] No test usage.
- [ ] No production runtime usage.
- [ ] No documented future dependency.
- [ ] Tests/typecheck/build pass after deletion.

Exit criteria:

- [ ] Dead Code Gate passes.
- [ ] Dependency Gate passes.

## Phase 13: Test Expansion Plan

Goal: convert discovered risks into permanent regression coverage.

Required suites:

- [ ] Runtime production keys tests.
- [ ] WhatsApp webhook integration tests.
- [ ] WhatsApp interactive message tests.
- [ ] WhatsApp order creation tests.
- [ ] WhatsApp review/complaint tests.
- [ ] Web-order checkout E2E.
- [ ] Tracking page E2E.
- [ ] Store dashboard E2E.
- [ ] Platform admin E2E.
- [ ] Tenant isolation integration matrix.
- [ ] AI guardrail adversarial tests.
- [ ] Order lifecycle concurrency tests.
- [ ] Public endpoint abuse tests.
- [ ] Dead code deletion regression tests.

Exit criteria:

- [ ] Regression Gate passes.
- [ ] Every fixed production-risk bug has a regression test.

## Phase 14: Production Operations Certification

Goal: prove the platform can be operated, monitored, and recovered.

Required work:

- [ ] Vercel production deployment checklist.
- [ ] Environment variable ownership matrix.
- [ ] Secret rotation runbook.
- [ ] Database backup verification.
- [ ] Restore drill.
- [ ] Migration rollback plan.
- [ ] Incident response contacts.
- [ ] Monitoring dashboards.
- [ ] Alert thresholds.
- [ ] Log retention.
- [ ] Data retention cleanup schedule.
- [ ] WhatsApp provider incident runbook.
- [ ] AI provider incident runbook.
- [ ] Payment provider incident runbook.

Exit criteria:

- [ ] Operations Gate passes.
- [ ] Rollback Gate passes.
- [ ] Disaster Recovery Gate passes.

## Phase 15: Additional Mandatory Gates Not To Miss

Goal: cover production risks that are often missed when the project only
focuses on build, tests, and happy-path flows.

### Privacy, Compliance, And Data Rights Gate

Required work:

- [ ] Define who owns customer data: platform, store, or shared responsibility.
- [ ] Review privacy policy against actual collected data.
- [ ] Review terms against actual store/customer workflows.
- [ ] Document customer data deletion process.
- [ ] Document customer data export process.
- [ ] Document store data export process.
- [ ] Document account/store deletion process.
- [ ] Document WhatsApp/customer communication consent expectations.
- [ ] Review Saudi PDPL obligations for phone numbers, chats, orders, reviews,
  and complaints.
- [ ] Review GDPR exposure if stores serve customers outside Saudi Arabia.
- [ ] Verify sensitive data is not exposed in public links, logs, or error
  messages.

Required tests/evidence:

- [ ] Privacy data inventory.
- [ ] Data deletion runbook.
- [ ] Data export runbook.
- [ ] Legal page URL validation.
- [ ] Public link privacy review.

Exit criteria:

- [ ] Privacy Gate passes.
- [ ] Compliance Gate passes or accepted legal review is documented.

### CI/CD And Repository Protection Gate

Required work:

- [ ] Review every GitHub workflow.
- [ ] Require typecheck, tests, build, and lint for protected branches.
- [ ] Require production environment validation for release candidates.
- [ ] Prevent direct pushes to `main` for normal work once production traffic is
  live.
- [ ] Require review for production-affecting code.
- [ ] Ensure secrets are never printed in CI logs.
- [ ] Ensure migrations are reviewed before deployment.
- [ ] Ensure failed checks block deployment or promotion.
- [ ] Document emergency hotfix process.

Required tests/evidence:

- [ ] Branch protection screenshot or repository rules evidence.
- [ ] CI workflow run evidence.
- [ ] Failed-check blocking evidence.
- [ ] Hotfix runbook.

Exit criteria:

- [ ] CI/CD Gate passes.
- [ ] Repository Protection Gate passes.

### SBOM, License, And Supply Chain Gate

Required work:

- [ ] Generate or document a software bill of materials.
- [ ] Review production dependencies.
- [ ] Review dev dependencies that affect build or code generation.
- [ ] Review package licenses for commercial compatibility.
- [ ] Review transitive high-risk packages.
- [ ] Pin or document package update policy.
- [ ] Verify lockfile is committed and used in CI.
- [ ] Review package scripts for unsafe lifecycle behavior.

Required commands/evidence:

- [ ] `npm audit --omit=dev`
- [ ] `npm ls --omit=dev`
- [ ] License review output or documented manual review.
- [ ] Lockfile integrity evidence.

Exit criteria:

- [ ] SBOM Gate passes.
- [ ] License Gate passes.
- [ ] Supply Chain Gate passes.

### Kill Switches And Degraded Mode Gate

Required work:

- [ ] Platform-level AI disable switch.
- [ ] Platform-level WhatsApp disable switch.
- [ ] Store-level WhatsApp disable switch.
- [ ] Store-level AI disable switch.
- [ ] Store-level public ordering disable switch.
- [ ] Provider-level outage mode.
- [ ] Maintenance mode for selected public endpoints.
- [ ] Clear customer-facing fallback messages.
- [ ] Admin-visible reason for disabled service.

Required tests:

- [ ] AI kill switch prevents model calls without breaking dashboard.
- [ ] WhatsApp kill switch stops outbound replies safely.
- [ ] Store suspension blocks public order creation.
- [ ] Degraded mode returns safe customer message.

Exit criteria:

- [ ] Kill Switch Gate passes.
- [ ] Degraded Mode Gate passes.

### Cost And Quota Control Gate

Required work:

- [ ] Define AI usage limits by store plan.
- [ ] Define WhatsApp message usage limits by store plan or policy.
- [ ] Define public chat/request limits.
- [ ] Define expensive route limits.
- [ ] Define alerts for AI cost spikes.
- [ ] Define alerts for WhatsApp send failures or spikes.
- [ ] Define store-level abuse throttling.
- [ ] Define platform-level emergency throttling.
- [ ] Track per-store usage for AI, WhatsApp, media, and public endpoints.

Required tests/evidence:

- [ ] Quota enforcement tests.
- [ ] Rate limit tests.
- [ ] Cost dashboard or report plan.
- [ ] Alert threshold document.

Exit criteria:

- [ ] Cost Control Gate passes.
- [ ] Quota Gate passes.

### Browser, Accessibility, And Device Compatibility Gate

Required browsers/devices:

- [ ] Chrome desktop.
- [ ] Edge desktop.
- [ ] Safari iPhone.
- [ ] Android Chrome.
- [ ] Small mobile viewport.
- [ ] Tablet viewport.
- [ ] Desktop RTL Arabic.

Accessibility requirements:

- [ ] Keyboard navigation for key flows.
- [ ] Visible focus states.
- [ ] Sufficient contrast.
- [ ] Screen-reader basics for forms and buttons.
- [ ] Touch targets are large enough on mobile.
- [ ] Dialogs and menus are usable without mouse.
- [ ] Error messages are associated with relevant fields.

Required tests/evidence:

- [ ] Responsive screenshots.
- [ ] Playwright browser matrix or documented manual browser checks.
- [ ] Accessibility audit output or documented manual review.

Exit criteria:

- [ ] Browser Compatibility Gate passes.
- [ ] Accessibility Gate passes.

### Third-Party Provider Limits Gate

Required providers:

- [ ] Whapi WhatsApp provider.
- [ ] OpenAI.
- [ ] DeepSeek or OpenAI-compatible providers.
- [ ] Clerk.
- [ ] Vercel.
- [ ] Neon/Postgres or active DB provider.
- [ ] Stripe.
- [ ] Moyasar.
- [ ] Better Stack/Sentry or active observability providers.

Required work:

- [ ] Document rate limits.
- [ ] Document timeout limits.
- [ ] Document retry behavior.
- [ ] Document quota and billing behavior.
- [ ] Document account suspension risks.
- [ ] Document token expiration behavior.
- [ ] Document escalation/support paths.
- [ ] Document fallback behavior for each provider.

Exit criteria:

- [ ] Third-Party Limits Gate passes.
- [ ] Provider Fallback Gate passes.

### Data Lifecycle And Retention Gate

Required data classes:

- [ ] Store settings.
- [ ] Products and media.
- [ ] Customers.
- [ ] Conversations.
- [ ] Conversation messages.
- [ ] Orders.
- [ ] Order events.
- [ ] Reviews.
- [ ] Complaints/feedback.
- [ ] Invoices.
- [ ] Webhook idempotency records.
- [ ] Rate limit records.
- [ ] AI audit logs.
- [ ] Platform admin audit logs.

Required work:

- [ ] Define retention period for each data class.
- [ ] Define archive versus hard-delete behavior.
- [ ] Define restore behavior.
- [ ] Define cleanup schedule.
- [ ] Define legal hold behavior if needed.
- [ ] Verify `/api/maintenance/cleanup` is scheduled and protected.
- [ ] Verify cleanup cannot delete active customer/order data.

Required tests:

- [ ] Retention cleanup test.
- [ ] Archive/restore test.
- [ ] Hard-delete authorization test.
- [ ] Active data preservation test.

Exit criteria:

- [ ] Data Lifecycle Gate passes.
- [ ] Retention Gate passes.

### Detailed Incident Runbooks Gate

Required runbooks:

- [ ] WhatsApp receives messages but does not reply.
- [ ] WhatsApp replies fail to send.
- [ ] AI provider fails or returns invalid output.
- [ ] Store cannot see orders.
- [ ] Customer cannot complete checkout.
- [ ] Public store link fails.
- [ ] Cross-tenant data exposure suspected.
- [ ] Secret exposure suspected.
- [ ] Vercel deployment fails.
- [ ] Migration fails.
- [ ] Database unavailable.
- [ ] Rollback needed after production regression.
- [ ] High AI or WhatsApp cost spike.
- [ ] Stripe webhook failure.
- [ ] Clerk auth failure.

Each runbook must include:

- [ ] Symptoms.
- [ ] Detection signal.
- [ ] Immediate containment.
- [ ] Diagnosis commands.
- [ ] Safe recovery steps.
- [ ] Rollback path.
- [ ] Customer/store communication guidance.
- [ ] Post-incident follow-up.

Exit criteria:

- [ ] Incident Runbooks Gate passes.

### Additional Deep Operational Gates

These gates capture production risks that appear after the first launch, during
maintenance, provider changes, migrations, and human operations.

#### Feature Flags And Release Strategy Gate

Required work:

- [ ] Define how new risky features are released to one store, a small cohort,
  then all stores.
- [ ] Define feature flag ownership and emergency disable process.
- [ ] Define canary release criteria.
- [ ] Define rollback versus feature-disable decision rules.
- [ ] Verify store-specific enablement for high-risk features such as WhatsApp,
  AI model changes, checkout changes, and payments.

Exit criteria:

- [ ] Feature Flags Gate passes.
- [ ] Release Strategy Gate passes.

#### Data Migration Verification Gate

Required work:

- [ ] Add pre-migration checks for row counts, required indexes, and expected
  schema state.
- [ ] Add post-migration checks for row counts, relationships, backfills, and
  constraints.
- [ ] Define partial migration failure recovery.
- [ ] Define migration rollback or forward-fix strategy.
- [ ] Verify migrations do not corrupt tenant isolation.
- [ ] Verify migrations are safe for production data volume.

Exit criteria:

- [ ] Migration Verification Gate passes.

#### Notification Deliverability Gate

Required scope:

- [ ] WhatsApp notifications.
- [ ] Future email notifications.
- [ ] Future SMS notifications.
- [ ] Store/admin operational notifications.

Required work:

- [ ] Document provider failure handling.
- [ ] Document retry policy.
- [ ] Document duplicate notification prevention.
- [ ] Document customer-safe fallback when notification delivery fails.
- [ ] Track notification delivery failures by provider and store.

Exit criteria:

- [ ] Notification Deliverability Gate passes.

#### Time Zone, Locale, Currency, And Formatting Gate

Required work:

- [ ] Verify Riyadh time display for orders, customers, conversations, and
  audit logs.
- [ ] Verify UTC/DB/Vercel time conversions.
- [ ] Verify date sorting around day boundaries.
- [ ] Verify Arabic RTL date and number formatting.
- [ ] Verify currency formatting for SAR.
- [ ] Verify translations for production states and customer-visible messages.
- [ ] Verify store operating hours if added later.

Exit criteria:

- [ ] Time Zone Gate passes.
- [ ] Locale Formatting Gate passes.

#### Financial Reconciliation Gate

Required work:

- [ ] Reconcile order total with invoice total.
- [ ] Reconcile payment status with order status.
- [ ] Reconcile Stripe subscription state with store plan state.
- [ ] Reconcile add-ons with entitlement counters.
- [ ] Reconcile cancelled/refunded/failed payments.
- [ ] Verify webhook replay cannot double-count entitlement or payment state.
- [ ] Verify manual platform plan overrides are visible and audited.

Exit criteria:

- [ ] Financial Reconciliation Gate passes.

#### Test Data And Demo Data Control Gate

Required work:

- [ ] Identify all demo/test stores.
- [ ] Identify all demo/test customers.
- [ ] Identify all demo/test products.
- [ ] Ensure demo/test data cannot be mistaken for real customer data.
- [ ] Ensure test scripts do not mutate production records unless explicitly
  safe and documented.
- [ ] Define cleanup process for test data.
- [ ] Define safe production test organization(s).

Exit criteria:

- [ ] Test Data Control Gate passes.

#### Admin Human Error Protection Gate

Required high-risk actions:

- [ ] Delete/archive store.
- [ ] Delete/archive customer.
- [ ] Delete/archive product.
- [ ] Cancel subscription.
- [ ] Change platform runtime keys.
- [ ] Change AI provider key/model/base URL.
- [ ] Change WhatsApp credentials.
- [ ] Disable store service.
- [ ] Run destructive maintenance.

Required work:

- [ ] Require explicit confirmation for destructive actions.
- [ ] Show clear affected organization/customer/order identifiers.
- [ ] Add audit log entry for high-risk actions.
- [ ] Define undo/restore path where possible.
- [ ] Verify empty secret fields do not accidentally clear existing secrets.

Exit criteria:

- [ ] Human Error Protection Gate passes.

#### Audit Log Completeness Gate

Required work:

- [ ] Define mandatory audit events.
- [ ] Verify platform key changes are audited.
- [ ] Verify AI provider changes are audited.
- [ ] Verify store status/plan/capacity changes are audited.
- [ ] Verify destructive store/customer/order/product actions are audited.
- [ ] Verify actor, timestamp, target, action, and summary are stored.
- [ ] Verify sensitive values are not stored in audit logs.
- [ ] Verify audit logs are retained according to policy.

Exit criteria:

- [ ] Audit Log Completeness Gate passes.

#### API Contract Documentation Gate

Required APIs/contracts:

- [ ] Public web-order entry contracts.
- [ ] Public tracking link contracts.
- [ ] AI employee API contract.
- [ ] WhatsApp webhook contract.
- [ ] Clerk webhook contract.
- [ ] Stripe webhook contract.
- [ ] Moyasar callback contract.
- [ ] Maintenance endpoint contract.
- [ ] Server action contracts for high-risk mutations.

Required details:

- [ ] Request schema.
- [ ] Response schema.
- [ ] Error schema.
- [ ] Auth requirements.
- [ ] Idempotency behavior.
- [ ] Rate limits.
- [ ] Side effects.

Exit criteria:

- [ ] API Contract Documentation Gate passes.

#### Dependency Upgrade Policy Gate

Required packages:

- [ ] Next.js.
- [ ] React.
- [ ] Clerk.
- [ ] Drizzle.
- [ ] Stripe.
- [ ] Sentry/logging providers.
- [ ] WhatsApp/Whapi API version.
- [ ] TypeScript.
- [ ] Playwright/Vitest.

Required work:

- [ ] Define update cadence.
- [ ] Define security hotfix process.
- [ ] Define major version upgrade test plan.
- [ ] Define rollback process for dependency regressions.
- [ ] Track provider API deprecation dates.

Exit criteria:

- [ ] Dependency Upgrade Policy Gate passes.

#### Clock And Replay Security Gate

Required work:

- [ ] Review timestamp validation for providers that sign timestamps.
- [ ] Review replay windows for webhooks.
- [ ] Review idempotency event IDs.
- [ ] Review duplicate request handling for public endpoints.
- [ ] Review clock drift assumptions between Vercel, DB, and providers.
- [ ] Verify old replayed payloads cannot duplicate orders or state updates.

Exit criteria:

- [ ] Clock Security Gate passes.
- [ ] Replay Security Gate passes.

#### Customer Support Operations Gate

Required support scenarios:

- [ ] Customer says order is missing.
- [ ] Store says WhatsApp does not reply.
- [ ] Store says model gives wrong answer.
- [ ] Store says cart/order state is stuck.
- [ ] Store entered wrong WhatsApp credentials.
- [ ] Customer wants data deletion.
- [ ] Customer sent complaint or bad rating.
- [ ] Payment state is wrong.
- [ ] Store cannot access dashboard.

Required work:

- [ ] Define support triage steps.
- [ ] Define what support can and cannot access.
- [ ] Define escalation to platform admin.
- [ ] Define customer/store-safe communication templates.
- [ ] Define evidence collection without exposing secrets.

Exit criteria:

- [ ] Customer Support Operations Gate passes.

## Phase 16: Final Certification Report

Goal: make a clear launch decision.

Final report must include:

- [ ] Commit hash.
- [ ] Deployment URL.
- [ ] Deployment ID or timestamp.
- [ ] Passed gates.
- [ ] Failed gates.
- [ ] Fixed issues.
- [ ] Accepted risks.
- [ ] Remaining blockers.
- [ ] Test commands and results.
- [ ] Build result.
- [ ] Production smoke result.
- [ ] Security notes.
- [ ] Capacity estimate.
- [ ] Rollback plan.
- [ ] Final decision.

Allowed final decisions:

- `PRODUCTION CERTIFIED`
- `PRODUCTION NOT CERTIFIED`

`PRODUCTION CERTIFIED` is allowed only when all critical gates pass and no
unresolved critical or high severity production blocker remains.

## Severity Model

Critical:

- Data leak across stores.
- Customer or order mutation across tenants.
- Secret exposure.
- Public unauthenticated privileged mutation.
- Order/payment corruption.
- WhatsApp webhook accepts forged payloads.
- AI can create unauthorized business actions.

High:

- Valid customer flow blocked.
- WhatsApp cannot complete order flow.
- Reviews/complaints stored in wrong place.
- Missing idempotency in externally retried webhook.
- Production deploy requires manual code edits per store.
- Critical route untested.

Medium:

- Poor failure message.
- Missing observability on non-critical path.
- UI issue affecting some devices but workaround exists.
- Duplicated logic with manageable risk.

Low:

- Cosmetic issue.
- Documentation drift.
- Non-critical warning.

## Bug Handling Template

Each confirmed bug must be tracked with:

- Root cause:
- Impact:
- Affected files:
- Reproduction:
- Fix:
- Verification:
- Regression prevention:
- Residual risk:

## Gate Status Ledger

| Gate | Status | Evidence | Blockers |
| --- | --- | --- | --- |
| Baseline Inventory | Pending | | |
| Typecheck | Pending | | |
| Tests | Pending | | |
| Lint | Pending | | |
| Build | Pending | | |
| Env Validation | Pending | | |
| Dependency Check | Pending | | |
| Architecture | Pending | | |
| Database Integrity | Pending | | |
| Multi-Tenant Isolation | Pending | | |
| WhatsApp Production Flow | Pending | | |
| Web Customer Flow | Pending | | |
| Orders Integrity | Pending | | |
| Customer Feedback | Pending | | |
| AI Safety | Pending | | |
| Guardrails | Pending | | |
| Platform Admin | Pending | | |
| Store Admin | Pending | | |
| Secrets | Pending | | |
| Security | Pending | | |
| Abuse Control | Pending | | |
| Reliability | Pending | | |
| Observability | Pending | | |
| Performance | Pending | | |
| Dead Code | Pending | | |
| Regression | Pending | | |
| Operations | Pending | | |
| Disaster Recovery | Pending | | |
