# Phase 0: Baseline Freeze And Inventory

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`IN PROGRESS`

Phase 0 started as source-level and read-only audit work under risk decision
`R-0007`. Phase -1 remains `PHASE NOT CERTIFIED`; this file does not certify
production readiness.

## Frozen Baseline

- Branch: `main`
- Local commit at Phase 0 start: `a6adb74`
- Remote `origin/main` at Phase 0 start:
  `a6adb74f46e36d62bb968be0980ca352022b9287`
- Git worktree before Phase 0 source audit: clean.
- Production domain: `https://www.smartstore-ai.com`
- Most recent verified production app deployment before Phase 0:
  `dpl_Hj3gsyGA5B1TqdNUthoWKjWLdkWn`
- Latest verified read-only production smoke result: pass.

## Inventory Evidence Commands

Executed on 2026-06-13:

- `git ls-files | Measure-Object`
- `git ls-files src/app | Where-Object { route conventions }`
- `Select-String -Path (git ls-files src) -Pattern "use server"`
- `rg -n "^export const .*Table" src\models\Schema.ts`
- `git ls-files migrations | Where-Object { $_ -match "\.sql$" }`
- `git ls-files | Where-Object { $_ -match "\.(test|e2e)\.(ts|tsx|js|mjs)$" }`
- `node` package inventory script reading `package.json`

## File And Folder Inventory

Tracked file count: `424`.

Top-level tracked inventory:

| Path | Count |
| --- | ---: |
| `.env.example` | 1 |
| `.github` | 7 |
| `.gitignore` | 1 |
| `.storybook` | 4 |
| `.vercelignore` | 1 |
| `.vscode` | 4 |
| `docs` | 53 |
| `migrations` | 41 |
| `public` | 15 |
| `scripts` | 3 |
| `src` | 269 |
| `tests` | 6 |
| root config/docs/license/package files | 29 |

## Next.js Route Inventory

Route convention file count: `56`.

Public and marketing:

- `src/app/[locale]/(marketing)/page.tsx`
- `src/app/[locale]/(marketing)/privacy/page.tsx`
- `src/app/[locale]/(marketing)/terms/page.tsx`
- `src/app/[locale]/(marketing)/connect/[organizationId]/page.tsx`
- `src/app/[locale]/(marketing)/web-order/[organizationId]/page.tsx`
- `src/app/[locale]/(marketing)/track/[organizationId]/[orderId]/page.tsx`

Auth and onboarding:

- `src/app/[locale]/(auth)/(center)/layout.tsx`
- `src/app/[locale]/(auth)/(center)/sign-in/page.tsx`
- `src/app/[locale]/(auth)/(center)/sign-in/[...sign-in]/page.tsx`
- `src/app/[locale]/(auth)/(center)/sign-up/page.tsx`
- `src/app/[locale]/(auth)/(center)/sign-up/[...sign-up]/page.tsx`
- `src/app/[locale]/(auth)/layout.tsx`
- `src/app/[locale]/(auth)/onboarding/organization-selection/page.tsx`

Dashboard:

- `src/app/[locale]/(auth)/dashboard/layout.tsx`
- `src/app/[locale]/(auth)/dashboard/loading.tsx`
- `src/app/[locale]/(auth)/dashboard/page.tsx`
- `src/app/[locale]/(auth)/dashboard/ai-operations/page.tsx`
- `src/app/[locale]/(auth)/dashboard/archive/page.tsx`
- `src/app/[locale]/(auth)/dashboard/customers/page.tsx`
- `src/app/[locale]/(auth)/dashboard/customers/[customerId]/page.tsx`
- `src/app/[locale]/(auth)/dashboard/customers/archive/page.tsx`
- `src/app/[locale]/(auth)/dashboard/customers/archived/page.tsx`
- `src/app/[locale]/(auth)/dashboard/launch-readiness/page.tsx`
- `src/app/[locale]/(auth)/dashboard/orders/page.tsx`
- `src/app/[locale]/(auth)/dashboard/orders/archive/page.tsx`
- `src/app/[locale]/(auth)/dashboard/orders/archived/page.tsx`
- `src/app/[locale]/(auth)/dashboard/organization-profile/[[...organization-profile]]/page.tsx`
- `src/app/[locale]/(auth)/dashboard/organization-profile/organization-members/page.tsx`
- `src/app/[locale]/(auth)/dashboard/payments/page.tsx`
- `src/app/[locale]/(auth)/dashboard/products/page.tsx`
- `src/app/[locale]/(auth)/dashboard/products/[productId]/edit/page.tsx`
- `src/app/[locale]/(auth)/dashboard/products/archive/page.tsx`
- `src/app/[locale]/(auth)/dashboard/products/archived/page.tsx`
- `src/app/[locale]/(auth)/dashboard/products/new/page.tsx`
- `src/app/[locale]/(auth)/dashboard/revenue/page.tsx`
- `src/app/[locale]/(auth)/dashboard/settings/page.tsx`
- `src/app/[locale]/(auth)/dashboard/subscription/page.tsx`
- `src/app/[locale]/(auth)/dashboard/user-profile/[[...user-profile]]/page.tsx`

Platform admin:

- `src/app/[locale]/(auth)/admin/layout.tsx`
- `src/app/[locale]/(auth)/admin/loading.tsx`
- `src/app/[locale]/(auth)/admin/page.tsx`
- `src/app/[locale]/(auth)/admin/stores/[organizationId]/page.tsx`

App shell and metadata:

- `src/app/[locale]/layout.tsx`
- `src/app/[locale]/error.tsx`
- `src/app/[locale]/not-found.tsx`
- `src/app/[locale]/[...unmatched]/page.tsx`
- `src/app/global-error.tsx`
- `src/app/manifest.ts`
- `src/app/robots.ts`
- `src/app/sitemap.ts`

## Public/API Endpoint Inventory

API route files:

- `src/app/api/ai-employee/messages/route.ts`
- `src/app/api/clerk/webhooks/route.ts`
- `src/app/api/maintenance/cleanup/route.ts`
- `src/app/api/payments/moyasar/callback/route.ts`
- `src/app/api/stripe/webhooks/route.ts`
- `src/app/api/twilio/webhook/route.ts`

Public customer-facing route groups:

- Smart link: `/[locale]/connect/[organizationId]`
- Web ordering: `/[locale]/web-order/[organizationId]`
- Order tracking: `/[locale]/track/[organizationId]/[orderId]`
- Legal pages: `/[locale]/privacy`, `/[locale]/terms`
- Metadata: `/robots.txt`, `/sitemap.xml`, `/manifest`

## Server Action Inventory

Server action files:

- `src/features/admin/PlatformAdminActions.ts`
- `src/features/customer/WebChatActions.ts`
- `src/features/dashboard/AIEmployeeSettingsActions.ts`
- `src/features/dashboard/AISetupAssistantActions.ts`
- `src/features/dashboard/AISimulationActions.ts`
- `src/features/dashboard/CustomerActions.ts`
- `src/features/dashboard/OrderActions.ts`
- `src/features/dashboard/PaymentDeliveryActions.ts`
- `src/features/dashboard/ProductActions.ts`
- `src/features/dashboard/StoreSettingsActions.ts`

## Database Table Inventory

Schema source: `src/models/Schema.ts`.

Tables exported from schema: `17`.

- `products`
- `payment_methods`
- `delivery_methods`
- `orders`
- `order_events`
- `store_settings`
- `platform_settings`
- `webhook_events`
- `public_endpoint_rate_limits`
- `customers`
- `channel_connections`
- `conversations`
- `conversation_messages`
- `ai_action_logs`
- `customer_reviews`
- `invoices`
- `platform_admin_audit_logs`

Tenant-scoped tables must be rechecked in Phase 3 for every read and mutation.
`platform_settings`, `webhook_events`, and `public_endpoint_rate_limits` are
platform/shared tables and need separate security review.

## Migration Inventory

SQL migration count: `22`.

- `migrations/0000_init-db.sql`
- `migrations/0001_kind_scorpion.sql`
- `migrations/0002_empty_vertigo.sql`
- `migrations/0003_watery_lily_hollister.sql`
- `migrations/0004_steep_nova.sql`
- `migrations/0005_thin_cammi.sql`
- `migrations/0006_worthless_scrambler.sql`
- `migrations/0007_smooth_northstar.sql`
- `migrations/0008_slim_crusher_hogan.sql`
- `migrations/0009_dazzling_miss_america.sql`
- `migrations/0010_peaceful_smasher.sql`
- `migrations/0011_archive_orders_and_relationship_guards.sql`
- `migrations/0012_remove_bank_transfer_payment_method.sql`
- `migrations/0013_scope_cash_payment_methods.sql`
- `migrations/0014_add_card_handoff_payment_methods.sql`
- `migrations/0015_add_webhook_event_idempotency.sql`
- `migrations/0016_black_iron_man.sql`
- `migrations/0017_lonely_the_twelve.sql`
- `migrations/0018_past_blue_shield.sql`
- `migrations/0019_orange_lake.sql`
- `migrations/0020_chief_shadowcat.sql`
- `migrations/0021_backfill_whatsapp_channel_connections.sql`

## Dependency Inventory

From `package.json`:

- Runtime dependencies: `24`
- Dev dependencies: `51`
- npm scripts: `32`

Full dependency risk, license, and supply-chain review is deferred to Phase 12
and Phase 15, but this baseline count is fixed for comparison.

## Test Inventory

Tracked test file count: `65`.

Known suites:

- Unit/source tests under `src/**/*.test.ts`.
- Browser/UI tests under `src/**/*.test.tsx`.
- E2E tests under `tests/e2e/*.e2e.ts`.
- Storybook test command exists separately in `package.json`.

Critical coverage that exists before deeper phases:

- AI orchestration, guardrails, checkout, order lifecycle, WhatsApp adapter,
  order actions, product/customer/dashboard actions, public rate limit,
  retention, Stripe sync, and web-order chat state.

Critical coverage still not certified:

- Full dashboard E2E matrix.
- Full tenant isolation matrix for every action/API.
- Full WhatsApp parity E2E/integration matrix.
- Production runtime DB check.
- Provider failure-mode matrix.

## Environment Variable Ownership Matrix

Source contract: `src/libs/Env.ts`.

| Variable | Ownership |
| --- | --- |
| `DATABASE_URL` | Vercel/provider production env |
| `DATABASE_CONNECTION_TIMEOUT_MS` | Vercel/provider production env |
| `DATABASE_IDLE_TIMEOUT_MS` | Vercel/provider production env |
| `DATABASE_POOL_MAX` | Vercel/provider production env |
| `NEXT_PUBLIC_APP_URL` | Vercel production env |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Vercel + Clerk production app |
| `CLERK_SECRET_KEY` | Vercel + Clerk production app |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Vercel + Clerk webhook |
| `PLATFORM_ADMIN_USER_IDS` | Vercel platform owner env |
| `PLATFORM_SECRETS_ENCRYPTION_KEY` | Vercel platform owner env |
| `AI_EMPLOYEE_WEBHOOK_SECRET` | Platform-admin managed runtime secret with Vercel fallback |
| `MAINTENANCE_SECRET` | Platform-admin managed runtime secret with Vercel fallback |
| `legacy Meta app secret (removed)` | Platform-admin managed runtime secret with Vercel fallback |
| `legacy Meta webhook verify token (removed)` | Platform-admin managed runtime secret with Vercel fallback |
| `legacy Meta Graph API version (removed)` | Vercel env / platform runtime default |
| `STRIPE_SECRET_KEY` | Vercel + Stripe |
| `STRIPE_WEBHOOK_SECRET` | Vercel + Stripe webhook |
| `STRIPE_PRICE_STARTER_MONTHLY` | Vercel + Stripe catalog |
| `STRIPE_PRICE_GROWTH_MONTHLY` | Vercel + Stripe catalog |
| `STRIPE_PRICE_PRO_MONTHLY` | Vercel + Stripe catalog |
| `STRIPE_PRICE_EXTRA_AI_ORDERS` | Vercel + Stripe catalog |
| `STRIPE_PRICE_EXTRA_CATALOG_ITEMS` | Vercel + Stripe catalog |
| `STRIPE_PRICE_EXTRA_IMAGE_STORAGE` | Vercel + Stripe catalog |
| `STRIPE_PRICE_EXTRA_TEAM_MEMBER` | Vercel + Stripe catalog |
| `MOYASAR_SECRET_KEY` | Vercel + Moyasar |
| `BETTER_STACK_SOURCE_TOKEN` | Vercel + Better Stack |
| `BETTER_STACK_INGESTING_HOST` | Vercel + Better Stack |
| `NEXT_PUBLIC_LOGGING_LEVEL` | Vercel env |
| `DEMO_MODE` | Vercel env / deployment mode decision |
| `NODE_ENV` | Runtime managed |

Store-admin managed values are stored in tenant-scoped database records, not in
Vercel env, including store WhatsApp phone number IDs, WhatsApp access tokens,
store profile/settings, products, payment methods, delivery methods, and AI
employee per-store settings.

## Phase 0 Blockers Carried Forward

- Phase -1 is not certified.
- Production `DATABASE_URL` still resolves to `127.0.0.1:5433` through Vercel
  env checks.
- Clerk production/live keys are not proven.
- Platform-stored runtime keys cannot be proven until DB connectivity is fixed.
- Database provider/PITR/rollback authority is not confirmed.

## Phase 0 Open Work

- Confirm every listed route has an owner and a current test strategy.
- Generate a route-to-test coverage matrix.
- Generate a server-action authorization matrix.
- Generate a DB table-to-query matrix for Phase 3.
- Re-run deployment inspection after this Phase 0 evidence commit deploys.

