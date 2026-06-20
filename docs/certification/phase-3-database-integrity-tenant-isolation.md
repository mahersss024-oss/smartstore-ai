# Phase 3: Database Integrity And Tenant Isolation

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`PHASE NOT CERTIFIED`

Phase 3 has started under `R-0007`. Source-level tenant scoping evidence and a
new schema regression test are now recorded, but the full Store A / Store B
isolation scenario suite is not complete. Phase -1 production DB connectivity
also remains blocked by D-0004, so runtime database integrity cannot be
certified.

## Schema Review Evidence

Command evidence:

- `rg -n "export const .*Table|organizationId|uniqueIndex|index\(" src\models\Schema.ts`

Tables reviewed:

| Table | Tenant scope |
| --- | --- |
| `productsTable` | `organizationId` |
| `paymentMethodsTable` | `organizationId` |
| `deliveryMethodsTable` | `organizationId` |
| `ordersTable` | `organizationId` |
| `orderEventsTable` | `organizationId` |
| `storeSettingsTable` | `organizationId` |
| `customersTable` | `organizationId` |
| `channelConnectionsTable` | `organizationId` |
| `conversationsTable` | `organizationId` |
| `conversationMessagesTable` | `organizationId` |
| `aiActionLogsTable` | `organizationId` |
| `customerReviewsTable` | `organizationId` |
| `invoicesTable` | `organizationId` |
| `platformAdminAuditLogsTable` | `organizationId` |

Platform or operational tables without `organizationId`:

- `platformSettingsTable`: platform-wide runtime/provider settings.
- `webhookEventsTable`: provider event idempotency.
- `publicEndpointRateLimitsTable`: public endpoint rate-limit buckets.

Critical tenant-scoped constraints confirmed in source:

- `orders_organization_id_unique`
- `customers_organization_id_unique`
- `customers_organization_channel_external_unique`
- `conversations_organization_id_unique`
- `conversations_organization_channel_thread_unique`
- `channel_connections_organization_channel_unique`
- `customer_reviews_organization_order_customer_unique`

## Migration Inventory

Command evidence:

- `git ls-files migrations | Sort-Object`

Migration SQL files observed:

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

Migration status:

- Inventory complete.
- Runtime production migration status is not certified because D-0004 prevents
  production DB connectivity checks.

## Query And Mutation Scope Evidence

Command evidence:

- `rg -n "\b(db|database)\.(select|insert|update|delete)|\.from\(|\.where\(|eq\(|and\(" src\app src\features src\libs --glob '!*.test.ts' --glob '!*.test.tsx'`
- `rg -n "eq\([^,]+\.organizationId|inArray\([^,]+\.organizationId|organizationId" src\features\dashboard src\features\customer src\app\api src\app\[locale] --glob '!*.test.ts' --glob '!*.test.tsx'`

Observed organization-scope evidence:

- 349 source matches reference `organizationId` or organization-scoped query
  predicates in dashboard, customer, API, and localized app routes.
- Dashboard product, order, customer, payment/delivery, store settings, and
  admin actions use active organization context or explicit organization ID
  predicates.
- Public tracking route reads orders with both `ordersTable.organizationId` and
  `ordersTable.id`, then requires a phone match before exposing timeline events.
- Customer detail page scopes customer, order, review, feedback, conversation,
  and message reads to `orgId`.
- WhatsApp webhook resolves tenant from `channelConnectionsTable` by active
  WhatsApp phone-number connection, then passes `connection.organizationId` into
  customer, conversation, AI, and outbound reply processing.

## Regression Test Added

File:

- `src/models/SchemaTenantIsolation.test.ts`

Coverage:

- Every store-owned schema table must expose `organizationId`.
- Critical customer, order, conversation, channel, and review uniqueness
  constraints must remain organization-scoped.

Verification:

- `npm test -- src/models/SchemaTenantIsolation.test.ts` passed 2 tests.
- `npm run check:types` passed after adding the test.

## Existing Relevant Test Evidence

Existing tests found during Phase 3:

- `src/features/dashboard/CustomerActions.test.ts` checks customer deletion and
  conversation deletion are scoped to the active organization.
- `src/features/dashboard/OrderActions.test.ts` checks order action scoping.
- `src/features/customer/WebChatActions.test.ts` checks public web-chat message
  and feedback behavior.
- `src/features/admin/PlatformAdminActions.test.ts` checks platform delete
  paths scope deletes to the selected organization.
- `src/libs/AIEmployeeOrderLifecycleConcurrency.test.ts` checks order lifecycle
  concurrency behavior.

## Confirmed Findings

### D-0009: full multi-tenant scenario suite is incomplete

Root cause:

- The project has focused unit/static tests for several scoped paths, but the
  complete Store A / Store B scenario matrix required by Phase 3 is not yet
  implemented as an executable suite.

Impact:

- Database Integrity Gate and Multi-Tenant Isolation Gate cannot be certified.

Affected areas:

- Dashboard reads and mutations.
- Public tracking links.
- Customer web-order links.
- WhatsApp customer identity and conversation isolation.
- Platform-admin broad access paths.

Fix:

- Add executable tenant-isolation tests for Store A cannot read or mutate Store
  B orders, customers, products, settings, and public links; add concurrent
  customer/store isolation scenarios.

Verification:

- New `SchemaTenantIsolation.test.ts` passed.
- Full scenario suite remains pending.

Regression prevention:

- Keep schema contract tests and add Store A / Store B scenario tests before
  certifying Phase 3.

## Carried Blockers

- D-0001: production/provider authority and access confirmations incomplete.
- D-0002: Clerk production keys not proven; Vercel reports development keys.
- D-0003: WhatsApp runtime-source proof blocked by DB connectivity.
- D-0004: Vercel Production `DATABASE_URL` resolves to `127.0.0.1:5433`.
- D-0007: lint still reports 333 warnings.
- D-0008: large cross-channel orchestration hotspots remain.

## Exit Decision

Phase 3 cannot be certified yet. Source-level tenant scoping is materially
stronger after the new regression test, but runtime DB proof and the complete
multi-tenant scenario suite are still required.
