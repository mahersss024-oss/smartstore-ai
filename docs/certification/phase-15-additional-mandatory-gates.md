# Phase 15: Additional Mandatory Gates Not To Miss

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`PHASE NOT CERTIFIED`

This phase reviewed the additional deep production gates and collected source,
workflow, and package evidence for several areas. The phase is not certified
because most gates require external provider evidence, legal/owner decisions,
browser/accessibility runs, support operations confirmation, or additional
scenario tests before they can pass.

## Evidence Collected

### Privacy, compliance, and data rights

Source evidence:

- `src/app/[locale]/(marketing)/privacy/page.tsx`
- `src/app/[locale]/(marketing)/terms/page.tsx`
- `src/features/marketing/LegalPage.tsx`
- `src/locales/*.json`

Observed state:

- Public privacy and terms pages exist and are localized through translation
  namespaces.
- The code has public legal routes under the marketing route group.

Blocking gaps:

- Legal review against actual collected production data is not recorded.
- Customer/store data export and deletion runbooks are not complete.
- PDPL/GDPR applicability and responsibility model are not certified.

### CI/CD and repository protection

Source evidence:

- `.github/workflows/CI.yml`
- `.github/workflows/production-gate.yml`
- `.github/workflows/release.yml`
- `.github/workflows/checkly.yml`
- `.github/dependabot.yml`

Observed state:

- CI runs build, static checks, dependency check, i18n check, unit tests,
  Storybook tests, E2E tests, and visual regression checks.
- Production Gate runs env validation, lint, typecheck, unit/component tests,
  and local production build.
- Release workflow runs `npm audit signatures` before semantic release.
- Checkly workflow runs on successful deployment status events.
- Dependabot is configured for monthly npm and GitHub Actions updates.

Blocking gaps:

- Branch protection and required-check enforcement are not proven from GitHub
  repository settings.
- Failed-check blocking evidence is not recorded.
- Emergency hotfix process is not fully certified.

### SBOM, license, and supply chain

Command evidence:

- `npm ls --omit=dev --depth=0`
- `npm audit --omit=dev`

Observed state:

- Production dependency tree resolved at depth 0.
- `npm audit --omit=dev` reported `found 0 vulnerabilities`.
- `package-lock.json` exists and CI uses `npm ci`.
- Dependabot is configured for npm and GitHub Actions updates.

Blocking gaps:

- Formal SBOM output is not generated.
- License compatibility review is not recorded.
- Transitive high-risk package review is not complete.
- Package lifecycle-script review is not recorded.

### Kill switches and degraded mode

Source evidence:

- `src/libs/StoreServiceControls.ts`
- `src/app/[locale]/(auth)/admin/page.tsx`
- `src/app/[locale]/(auth)/admin/stores/[organizationId]/page.tsx`
- `src/features/admin/PlatformAdminActions.ts`
- `src/libs/PublicEndpointRateLimit.ts`

Observed state:

- Store feature controls exist for `ai`, `productPublishing`, `webOrders`, and
  `whatsapp`.
- Platform admin screens expose store status and partial suspension controls.
- Public message/read rate limiting exists.

Blocking gaps:

- Platform-wide emergency disable flags for AI, WhatsApp, ordering, payments,
  read-only mode, and maintenance mode are not fully implemented as global
  kill switches.
- Degraded-mode customer messages are not proven for every public path.

### Cost and quota control

Source evidence:

- `src/utils/PricingPlans.ts`
- `src/libs/SubscriptionAccess.ts`
- `src/libs/SubscriptionEntitlements.ts`
- `src/app/[locale]/(auth)/dashboard/subscription/page.tsx`
- `src/app/[locale]/(auth)/admin/stores/[organizationId]/page.tsx`

Observed state:

- Store plans and add-on counters exist for AI orders, products, storage, team
  members, and channels.
- Dashboard/admin pages surface plan limits and usage counters.

Blocking gaps:

- AI provider cost alerts are not configured.
- WhatsApp usage/cost alerts are not configured.
- Store-level and platform-level emergency throttling policies are not fully
  proven under load.

### Browser, accessibility, and device compatibility

Source evidence:

- `tests/e2e/WebOrderChat.e2e.ts`
- `.github/workflows/CI.yml`

Observed state:

- Existing E2E coverage includes web-order flow and mobile/tablet overflow
  checks.
- CI runs E2E tests and visual regression integration.

Blocking gaps:

- Browser matrix evidence for Chrome desktop, Edge desktop, Safari iPhone,
  Android Chrome, small mobile, tablet, and desktop RTL is not complete.
- Accessibility audit output is not recorded.
- Keyboard navigation, focus, contrast, screen-reader basics, and touch target
  evidence remain pending.

### Third-party provider limits

Known providers:

- legacy WhatsApp provider.
- AI provider through platform runtime settings.
- Clerk.
- Vercel.
- PostgreSQL provider.
- Stripe.
- Moyasar.
- Sentry/Better Stack or active observability providers.

Observed state:

- Provider integration points exist in source and operations docs.
- Provider incident runbooks were expanded in Phase 14.

Blocking gaps:

- Rate limits, timeout limits, retry behavior, quota/billing behavior,
  suspension risk, token expiration, support path, and fallback behavior are
  not documented from current provider accounts.

### Data lifecycle and retention

Source evidence:

- `src/libs/OperationalDataRetention.ts`
- `src/app/api/maintenance/cleanup/route.ts`
- `docs/operations/production-operations-certification.md`

Observed state:

- Operational retention exists for rate-limit buckets and webhook idempotency
  records.
- Protected cleanup endpoint exists.

Blocking gaps:

- Retention periods are not defined for every data class.
- Data export, legal hold, full cleanup schedule, and scheduled production
  cleanup evidence are not complete.
- Archive/restore/hard-delete full matrix remains pending.

### Incident runbooks

Source evidence:

- `docs/runbooks/index.md`
- `docs/operations/production-operations-certification.md`

Observed state:

- Runbooks exist for AI outage, database outage, Clerk outage, Stripe outage,
  webhook failure, tenant isolation alert, high AI cost, migration failure,
  secret rotation, WhatsApp no-reply, AI provider failure, and payment provider
  failure.

Blocking gaps:

- Detailed runbooks for every required support scenario are not complete.
- Detection signals, exact commands, communication templates, and post-incident
  review templates are not verified for every incident type.

### Feature flags and release strategy

Source evidence:

- Store-level partial suspensions in platform admin/source.
- Vercel deployment workflow.

Observed state:

- Store-scoped feature suspension exists.

Blocking gaps:

- Formal canary rollout strategy is not documented.
- Cohort rollout and emergency feature-flag ownership are not complete.

### Data migration verification

Source evidence:

- `migrations/`
- `drizzle.config.ts`
- `docs/operations/production-operations-certification.md`

Observed state:

- Migration files exist and operational guidance requires backups before
  migrations.

Blocking gaps:

- Pre-migration/post-migration row-count and relationship checks are not
  implemented as repeatable scripts.
- Migration rollback/forward-fix drill remains unproven.

### Notification deliverability

Source evidence:

- WhatsApp outbound send path in `src/libs/TwilioWhatsApp.ts`.
- Order status notification paths in dashboard/order operations.

Observed state:

- WhatsApp notification delivery exists at the adapter level.

Blocking gaps:

- Delivery failure tracking by provider/store is not fully surfaced.
- Retry policy and duplicate notification prevention are not certified for
  every notification class.

### Time zone, locale, currency, and formatting

Source evidence:

- `src/libs/DateTime.ts`
- `src/libs/I18n.ts`
- `src/libs/I18nRouting.ts`
- localized route structure under `src/app/[locale]`.

Observed state:

- The app has localized routes and shared date/time utilities.

Blocking gaps:

- Riyadh/UTC day-boundary sorting evidence is not complete.
- Arabic RTL date/number/currency verification is not complete across all
  dashboard and customer pages.

### Financial reconciliation

Source evidence:

- `src/libs/StripeBillingSync.ts`
- `src/libs/OrderOperations.ts`
- `src/models/Schema.ts`

Observed state:

- Stripe subscription synchronization and invoice/order models exist.

Blocking gaps:

- Order total versus invoice total reconciliation matrix is not complete.
- Cancelled/refunded/failed payment reconciliation is not certified.
- Manual platform overrides require stronger reconciliation evidence.

### Test data and demo data control

Source evidence:

- `docs/certification/test-data-inventory.md`
- `docs/certification/smoke-test-safety.md`

Observed state:

- Test data inventory and smoke safety documents exist.

Blocking gaps:

- Approved production-safe test organization/customer/store inventory is not
  fully confirmed.
- Cleanup process for test data is not certified.

### Admin human error protection

Source evidence:

- Platform and dashboard admin pages/actions.
- `src/features/admin/PlatformAdminActions.ts`
- `src/features/dashboard/*Actions.ts`

Observed state:

- Several destructive actions require explicit UI confirmation fields.
- Store/archive/subscription changes write audit logs in platform admin flows.

Blocking gaps:

- Full high-risk action confirmation matrix remains incomplete.
- Undo/restore paths are not verified for every destructive action.

### Audit log completeness

Source evidence:

- `platformAdminAuditLogsTable` in `src/models/Schema.ts`.
- `src/features/admin/PlatformAdminActions.ts`.

Observed state:

- Platform admin audit table and some audit log writes exist.

Blocking gaps:

- Mandatory audit event list is not fully defined.
- Sensitive-value exclusion is not proven for every audit event.
- Audit retention policy is not certified.

### API contract documentation

Source evidence:

- API routes under `src/app/api/**`.
- Server actions under `src/features/**`.
- `docs/repository-map.md`.

Observed state:

- Route inventory exists.

Blocking gaps:

- Request/response/error/auth/idempotency/rate-limit/side-effect contracts are
  not documented for every public route and high-risk server action.

### Dependency upgrade policy

Source evidence:

- `.github/dependabot.yml`
- `package.json`
- `package-lock.json`
- `.github/workflows/release.yml`

Observed state:

- Dependabot monthly updates are configured for npm and GitHub Actions.
- Major npm dependency updates are ignored by Dependabot and require manual
  handling.

Blocking gaps:

- Major-version test plan, rollback process, security hotfix policy, and
  provider API deprecation tracking are not complete.

### Clock and replay security

Source evidence:

- `src/libs/WebhookIdempotency.ts`
- webhook route tests.
- provider webhook routes.

Observed state:

- Provider event idempotency exists for external webhooks.

Blocking gaps:

- Provider timestamp validation and replay windows are not fully documented for
  every provider.
- Clock drift assumptions between Vercel, DB, and providers are not certified.

### Customer support operations

Source evidence:

- `docs/runbooks/index.md`
- `docs/operations/production-operations-certification.md`
- dashboard customer/order pages.

Observed state:

- Store dashboard surfaces customer, order, conversation, review, and complaint
  records.

Blocking gaps:

- Support triage steps, support access boundaries, escalation templates, and
  evidence collection rules are not fully documented.

## Verification Commands

| Command | Result |
| --- | --- |
| `npm ls --omit=dev --depth=0` | pass |
| `npm audit --omit=dev` | pass: found 0 vulnerabilities |
| `npm run check:types` | pass |
| `git diff --check` | pass |
| `npm run lint` | pass with the known 333 warnings recorded as D-0007 |

## Confirmed Findings

### D-0025: additional mandatory production gates remain incomplete

Root cause:

- Source-level controls and documents exist for several deep production areas,
  but Phase 15 requires cross-functional evidence across legal, CI settings,
  provider limits, accessibility, support operations, audit policy, data
  lifecycle, release strategy, dependency policy, and replay security.

Impact:

- Privacy, Compliance, CI/CD, Repository Protection, SBOM, License, Supply
  Chain, Kill Switch, Degraded Mode, Cost Control, Quota, Browser
  Compatibility, Accessibility, Third-Party Limits, Provider Fallback, Data
  Lifecycle, Retention, Incident Runbooks, Feature Flags, Release Strategy,
  Migration Verification, Notification Deliverability, Time Zone, Locale,
  Financial Reconciliation, Test Data, Human Error Protection, Audit Log,
  API Contract, Dependency Upgrade, Clock Security, Replay Security, and
  Customer Support Operations Gates cannot be certified.

Affected areas:

- Legal/compliance documents and owner decisions.
- GitHub repository settings and CI enforcement.
- Dependency/license/supply-chain process.
- Global kill switches and degraded-mode behavior.
- Cost/quota controls and alerts.
- Browser/accessibility testing.
- Provider limits and support paths.
- Data lifecycle and retention process.
- Incident/support runbooks.
- Release/migration/notification processes.
- Audit logs and API contract documentation.

Fix:

- Convert each blocking gap above into executable evidence, provider evidence,
  owner-confirmed policy, or focused tests.
- Prioritize gates that protect data integrity, tenant isolation, order/payment
  correctness, secret safety, and customer support before broader scale claims.

Verification:

- Production dependency listing and vulnerability audit pass.
- Source/workflow/document evidence exists for parts of the phase.
- Full Phase 15 matrix remains pending.

Regression prevention:

- Keep this phase as a required pre-certification checklist and add a dedicated
  evidence entry whenever a listed gate receives a test, provider artifact,
  policy decision, or runbook validation.

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
- D-0021: full load-test and capacity matrix remains incomplete.
- D-0022: full dead-code runtime-use proof matrix remains incomplete.
- D-0023: full regression expansion matrix remains incomplete.
- D-0024: production operations provider evidence remains incomplete.

## Exit Decision

Phase 15 cannot be certified yet. It now has a consolidated gate-by-gate
evidence and blocker map, and production dependency audit passed, but most deep
operational, legal, provider, accessibility, and support gates remain pending.
