# Phase -1: Pre-Audit Readiness Gate

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`PHASE NOT CERTIFIED`

This phase has started, and the evidence structure now exists. It is not
certified because several operational confirmations must come from the owner or
production providers before Phase 0 can start safely.

## Audit Objective

Certify SmartStore AI for maximum production readiness across web ordering,
WhatsApp ordering, store dashboard, platform admin, AI employee behavior,
guardrails, database integrity, tenant isolation, billing, security, operations,
mobile/tablet/web behavior, and regression safety.

## Launch Scope

In scope:

- Public marketing, privacy, terms, smart link, web-order, and order tracking.
- Store dashboard: products, orders, customers, payments, revenue,
  subscription, AI operations, launch readiness, and settings.
- Platform admin: stores, subscriptions, runtime keys, provider controls, and
  audit actions.
- APIs: AI employee, WhatsApp webhook, Clerk webhook, Stripe webhook, Moyasar
  callback, and maintenance cleanup.
- Database schema, migrations, tenant isolation, order integrity, reviews,
  complaints, conversations, and operational retention.
- AI employee model behavior, guardrails, semantic review, repair path,
  orchestration diagnostics, and action permissions.
- legacy WhatsApp provider adapter, webhook verification, customer isolation,
  interactive messages, order status notifications, review requests, and
  feedback capture.

Excluded future work unless explicitly promoted to launch scope:

- Customer online payments inside stores.
- Future mobile staff app.
- Product variants/options beyond current implemented behavior.

## Frozen Code Target

- Branch: `main`
- Target code commit for the first audit pass: `880c252`
- GitHub remote: `https://github.com/mahersss024-oss/smartstore-ai.git`
- Freeze note: documentation evidence may be committed after this target; code
  certification findings should explicitly state whether they apply to
  `880c252` or a later code commit.

## Required Preparation Checklist

- [x] Confirm the audit objective, expected launch scope, and excluded future
  work.
- [x] Freeze the target branch and commit for the first audit pass.
- [ ] Confirm who can approve code changes, deployments, secret rotations, and
  database operations.
- [ ] Confirm access to GitHub, Vercel, production logs, database provider,
  Clerk, Meta WhatsApp, AI provider, Stripe, Moyasar, and observability tools.

  - [x] Git remote access confirmed.
  - [x] Vercel project, environment, and deployment inspection access
    confirmed.
  - [x] Production runtime log retrieval confirmed through Vercel logs.
  - [ ] Database provider access not confirmed.
  - [ ] Clerk access not confirmed.
  - [ ] Meta WhatsApp access not confirmed in this evidence folder.
  - [ ] AI provider account access not confirmed.
  - [ ] Stripe access not confirmed.
  - [ ] Moyasar status not confirmed or excluded.
  - [ ] Observability access not confirmed.
- [x] Confirm no real secrets will be pasted into chat, tickets, screenshots, or
  committed files.
- [x] Create a dedicated audit evidence folder or report file.
- [x] Create a defect ledger for every confirmed issue.
- [x] Create a decision ledger for accepted risks and launch blockers.
- [x] Confirm local environments can run without mutating production
  customer/order data.
- [ ] Confirm staging environments can run without mutating production
  customer/order data.
- [x] Confirm the current production smoke-test script is read-only.
- [ ] Confirm test stores, test customers, test products, test orders, and test
  WhatsApp numbers are clearly separated from real customer data.
- [ ] Confirm rollback authority and rollback path before any production-
  impacting change.
- [ ] Confirm database backup/PITR status before running destructive or
  migration tests.
- [ ] Confirm the project can be restored to the target commit if the audit
  discovers a regression.

## Required Artifacts Checklist

- [x] Audit scope statement.
- [x] Access checklist.
- [x] Evidence ledger.
- [x] Defect ledger.
- [x] Risk decision ledger.
- [x] Test data inventory.
- [x] Safe production smoke-test agreement.
- [x] Rollback readiness note.

## Current Blockers

1. Deployment, secret rotation, database migration, and database rollback
   authority are not fully documented.
2. Provider access remains incomplete: database provider, Clerk, Meta WhatsApp,
   AI provider, Stripe, Moyasar status, observability, and DNS/domain provider
   are not fully confirmed.
3. Strict production env validation fails because Clerk keys are development
   keys.
4. Vercel production env validation warns that WhatsApp app secret and webhook
   verify token are missing from Vercel env; platform-stored runtime values need
   separate proof.
5. Read-only DB status check under Vercel Production env failed against
   `127.0.0.1:5433`; managed production database connectivity is not proven.
6. Staging data separation is not confirmed.
7. Write-based production smoke tests are not approved; only the current
   read-only smoke script is reviewed and passed.
8. Test data inventory is not complete.
9. Rollback authority and provider rollback path are not fully confirmed.
10. Database backup/PITR status is not confirmed.

## Exit Criteria

Phase -1 can only become `PHASE CERTIFIED` after every blocker above is resolved
or explicitly accepted with an owner and rollback path.

## Additional Evidence Collected

- `scripts/smoke-test-production.mjs` performs `fetch` requests only, uses
  `redirect: 'manual'`, and does not submit forms, create orders, send
  messages, mutate database rows, or trigger payment providers.
- The current read-only production smoke command passed on 2026-06-13 against
  `https://www.smartstore-ai.com` and organization
  `org_3EBLVeHRaYimicJRmAZADwEprZz`.
- Vercel project inspection confirmed project `martstore-ai`; deployment
  inspection confirmed production deployment `dpl_4JwJ1V73ZjBjijNuGXMtcDh8ie4E`
  is Ready and aliased to `https://www.smartstore-ai.com`.
- Vercel runtime log access was confirmed with recent production GET requests
  from the read-only smoke flow.
- `playwright.config.ts` starts tests against localhost and a PGLite database
  server, with `NEXT_PUBLIC_APP_URL` set to the local base URL. This confirms
  local E2E can run without production data.
- `.env.example` provides the current environment variable inventory template
  for Phase 0 ownership mapping.
- `src/libs/Env.ts` defines the runtime environment contract for database,
  Clerk, Stripe, WhatsApp, Moyasar, Better Stack, platform runtime secrets,
  maintenance, and public app URL variables.
- `src/libs/PlatformRuntimeConfig.ts` confirms platform-managed runtime secret
  support for WhatsApp, AI employee webhook, and maintenance keys with
  environment fallbacks.
- `npx --yes vercel env run --environment=production -- node scripts/validate-production-env.mjs --demo`
  completed without required-variable failure, but warned that Clerk keys are
  development keys and WhatsApp env fallback keys are missing in Vercel.
- A read-only DB status check through Vercel Production env failed with
  `ECONNREFUSED 127.0.0.1:5433`. The local shell did not have `DATABASE_URL`,
  so production database connectivity remains unproven and blocked.
- `scripts/validate-production-env.mjs` now has `--strict` / `--certification`
  mode. In strict mode, local database hosts and Clerk development keys are
  production failures instead of soft warnings.
- `scripts/check-production-runtime.mjs` was added as a read-only runtime check
  for DB connectivity, platform runtime keys, and platform AI provider status
  without printing secrets. Running it through Vercel Production env currently
  fails at DB connection with `connect ECONNREFUSED 127.0.0.1:5433`.
- `src/libs/ProductionEnvValidationScript.test.ts` covers the strict production
  env gate for valid production-shaped values, local DB rejection, non-strict
  compatibility warnings, and Clerk development-key rejection.
- Commit `9e713f3` deployed to Vercel production deployment
  `dpl_Hj3gsyGA5B1TqdNUthoWKjWLdkWn`; the read-only production smoke test passed
  after deployment. Strict env validation and runtime DB checks still fail
  because Vercel Production env resolves `DATABASE_URL` to `127.0.0.1:5433`
  and still exposes Clerk development keys.
