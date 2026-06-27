# Repository Map

Last updated: 2026-06-20

This map is a navigational inventory for the current repository. It is not a
production certification report. Use `maximum-production-certification-plan.md`
for certification gates and evidence requirements.

## Root Files

- `README.md`: project overview, local setup, verification commands, and primary
  documentation links.
- `CHANGELOG.md`: current product changelog.
- `SECURITY.md`: security policy and security operating notes.
- `package.json`: npm scripts, dependency declarations, and verification entry
  points.
- `drizzle.config.ts`: Drizzle migration configuration.
- `next.config.ts`: Next.js configuration.
- `playwright.config.ts`: E2E test server and browser test configuration.

## Documentation

- `docs/README.md`: documentation index and current source-of-truth guidance.
- `docs/architecture/overview.md`: application architecture overview.
- `docs/architecture/database.md`: database architecture.
- `docs/operations/operations.md`: deployment, maintenance, incident, and
  rollback operations.
- `docs/operations/maintenance.md`: scheduled maintenance and cleanup guidance.
- `docs/operations/production-operations-certification.md`: production
  operations checklist, secret rotation, backup/restore, monitoring, alerts,
  and provider incident runbooks.
- `docs/operations/production-status.md`: production status reference.
- `docs/testing/index.md`: testing strategy and commands.
- `docs/planning/technical-debt.md`: active technical debt register.
- `docs/planning/development-plan.md`: development plan and remaining work.
- `docs/maximum-production-certification-plan.md`: mandatory deep production
  certification plan.
- `docs/certification/**`: active certification evidence, ledgers, phase
  status, blockers, access checklist, risk decisions, rollback readiness, and
  test data inventory. `owner-confirmations-needed.md` tracks required external
  confirmations before Phase -1 can pass.
- `docs/audits/project-audit-log.md`: project audit log.
- `docs/archive/**`: historical generated reports and old evidence. These files
  are preserved, not treated as current certification truth.

## Runtime Stack

- Framework: Next.js App Router with localized routes under
  `src/app/[locale]`.
- UI: React components under `src/features/**` and route files under
  `src/app/**`.
- Database: Drizzle ORM with PostgreSQL schema in `src/models/Schema.ts`.
- Auth: Clerk sessions and organizations.
- Billing: Stripe platform subscriptions and add-ons.
- Customer channels: public web ordering and WhatsApp (Meta) webhook.
- AI: platform-managed AI provider configuration, AI employee agent, shared
  conversation engine, guardrails, diagnostics, and action logs.
- Runtime settings: platform-managed production keys through
  `src/libs/PlatformRuntimeConfig.ts` and admin UI.

## App Routes

### Public And Marketing

- `src/app/[locale]/(marketing)/page.tsx`: public landing page.
- `src/app/[locale]/(marketing)/privacy/page.tsx`: privacy policy.
- `src/app/[locale]/(marketing)/terms/page.tsx`: terms page.
- `src/app/[locale]/(marketing)/connect/[organizationId]/page.tsx`: public
  smart link entry.
- `src/app/[locale]/(marketing)/web-order/[organizationId]/page.tsx`: customer
  web chat and ordering flow.
- `src/app/[locale]/(marketing)/track/[organizationId]/[orderId]/page.tsx`:
  public order tracking page.

### Auth And Onboarding

- `src/app/[locale]/(auth)/(center)/sign-in/**`: Clerk sign-in routes.
- `src/app/[locale]/(auth)/(center)/sign-up/**`: Clerk sign-up routes.
- `src/app/[locale]/(auth)/onboarding/organization-selection/page.tsx`:
  organization selection onboarding.

### Store Dashboard

- `src/app/[locale]/(auth)/dashboard/page.tsx`: dashboard overview.
- `src/app/[locale]/(auth)/dashboard/products/**`: product list, create, edit,
  archive, and archived views.
- `src/app/[locale]/(auth)/dashboard/orders/**`: active, archived, and archive
  order views.
- `src/app/[locale]/(auth)/dashboard/customers/**`: customer list, customer
  profile, archive, and archived views.
- `src/app/[locale]/(auth)/dashboard/settings/page.tsx`: store settings,
  service settings, and channel setup surfaces.
- `src/app/[locale]/(auth)/dashboard/ai-operations/page.tsx`: AI operations.
- `src/app/[locale]/(auth)/dashboard/launch-readiness/page.tsx`: launch
  readiness.
- `src/app/[locale]/(auth)/dashboard/payments/page.tsx`: payment settings.
- `src/app/[locale]/(auth)/dashboard/revenue/page.tsx`: revenue view.
- `src/app/[locale]/(auth)/dashboard/subscription/page.tsx`: subscription and
  add-on management.
- `src/app/[locale]/(auth)/dashboard/user-profile/**`: Clerk user profile.
- `src/app/[locale]/(auth)/dashboard/organization-profile/**`: Clerk
  organization profile and member pages.

### Platform Admin

- `src/app/[locale]/(auth)/admin/page.tsx`: platform administration, including
  runtime keys and provider controls.
- `src/app/[locale]/(auth)/admin/stores/[organizationId]/page.tsx`: per-store
  platform admin view.

## API Routes

- `src/app/api/ai-employee/messages/route.ts`: AI employee message endpoint.
- `src/app/api/whatsapp/webhook/route.ts`: signed WhatsApp (Meta) inbound event
  handling and tenant routing.
- `src/app/api/clerk/webhooks/route.ts`: Clerk webhook handler.
- `src/app/api/stripe/webhooks/route.ts`: Stripe webhook handler.
- `src/app/api/payments/moyasar/callback/route.ts`: Moyasar callback endpoint.
- `src/app/api/maintenance/cleanup/route.ts`: scheduled maintenance cleanup.

## Feature Modules

- `src/features/admin/**`: platform admin screens and actions.
- `src/features/ai/**`: AI employee agent and AI-facing orchestration surfaces.
- `src/features/billing/**`: subscription and billing UI/actions.
- `src/features/customer/**`: public web order chat, customer actions, cart
  state, and guest identity.
- `src/features/dashboard/**`: dashboard products, orders, customers, settings,
  and operational actions.
- `src/features/landing/**`: public landing components.
- `src/features/marketing/**`: marketing and public information components.

## Core Libraries

- AI employee orchestration: `AIEmployeeCart`, `AIEmployeeCheckout`,
  `AIEmployeeOrderLifecycle`, `AIEmployeeOrchestration`,
  `AIEmployeeSemanticAnalysis`, `AIEmployeeReplyGuardPipeline`.
- AI safety and diagnostics: `AIReplySafetyGuards`,
  `AIOrchestrationDiagnostics`, `AIOrchestrationReport`,
  `AIEmployeeSystemEventBridge`, `AIEmployeeSystemEventReply`.
- Conversation and ordering: `ConversationEngine`, `ConversationMetadata`,
  `OrderWorkflow`, `OrderOperations`, `OrderConversationWriter`,
  `OrderDataNormalization`.
- Store and catalog: `StoreSettings`, `StoreReadiness`,
  `StoreServiceControls`, `StoreAIContext`, `ProductDuplicateDetection`,
  `ProductCatalogMetadata`, `ProductImageStorage`.
- Integrations: `Stripe`, `WebhookIdempotency`, `MetaWhatsApp`,
  `ClerkOrganizationSync`, `OutboundHttp`.
- Platform controls: `PlatformAdmin`, `PlatformAIClient`,
  `PlatformAIProviderConfig`, `PlatformRuntimeConfig`, `PlatformAIPolicy`.
- Infrastructure utilities: `DB`, `Env`, `Logger`, `DateTime`, `I18n`,
  `I18nNavigation`, `I18nRouting`, `SecureTokens`, `RequestBody`,
  `PublicEndpointRateLimit`.

## Database Model

Schema source: `src/models/Schema.ts`.

Tenant-owned tables use `organization_id`:

- `products`
- `payment_methods`
- `delivery_methods`
- `orders`
- `order_events`
- `store_settings`
- `customers`
- `channel_connections`
- `conversations`
- `conversation_messages`
- `ai_action_logs`
- `customer_reviews`
- `invoices`
- `platform_admin_audit_logs`

Platform/shared tables:

- `platform_settings`
- `webhook_events`
- `public_endpoint_rate_limits`

## Migrations

- Migration output directory: `migrations/`.
- Generate migrations: `npm run db:generate`.
- Apply migrations: `npm run db:migrate`.
- Production build with migration: `npm run build:with-migrate`.

## Scripts And Verification

- Environment validation: `scripts/validate-production-env.mjs`.
- Production smoke test: `scripts/smoke-test-production.mjs`.
- Main verification commands are listed in `README.md` and
  `docs/testing/index.md`.

## CI And Release Workflows

- `.github/workflows/production-gate.yml`: production gate.
- `.github/workflows/CI.yml`: CI workflow.
- `.github/workflows/release.yml`: release workflow.
- `.github/workflows/checkly.yml`: Checkly-related workflow.
- `.github/workflows/crowdin.yml`: Crowdin localization workflow.

## Known Map Maintenance Rules

- Update this file when routes, API endpoints, database tables, or major
  feature folders are added, removed, or renamed.
- Do not use this file as certification evidence by itself.
- Keep archived reports under `docs/archive/**` out of the active source of
  truth unless a fresh audit explicitly cites them as historical context.
