# Database Architecture

## Engine

The project uses PostgreSQL through Drizzle ORM.

Local development can use PGlite through the `db-server:file` script.

## Connection

Database connections are created in:

```text
src/utils/DBConnection.ts
```

The connection uses `pg.Pool` and `DATABASE_URL`.

Pool size and timeouts are controlled by:

- `DATABASE_POOL_MAX`
- `DATABASE_CONNECTION_TIMEOUT_MS`
- `DATABASE_IDLE_TIMEOUT_MS`

For horizontally scaled or serverless production, use a managed connection
pooler and calculate the total connection budget across all instances.

## Schema

The schema is defined in:

```text
src/models/Schema.ts
```

Migrations are stored in:

```text
migrations/
```

## Store-Owned Tables

Most store-owned tables include `organizationId`, including:

- products
- payment methods
- delivery methods
- orders
- order events
- store settings
- customers
- channel connections
- conversations
- conversation messages
- AI action logs
- customer reviews
- invoices
- webhook events
- public endpoint rate limits

## Important Constraints

Unique constraints exist for:

- payment method provider per organization
- delivery method type per organization
- customer source channel and external ID per organization
- channel connection per organization and channel
- conversation channel and external thread per organization
- webhook provider and event ID
- public endpoint rate limit key
- customer review per organization, order, and customer

Composite tenant foreign keys are installed by migration `0018` so a child row
cannot reference a parent row from another organization. Migration `0019`
enforces one review per order/customer/store. Migration `0020` adds operational
indexes used by pagination, usage reporting, webhook cleanup, and rate-limit
cleanup.

## Operational Indexes

The schema includes organization-scoped indexes for high-traffic reads:

- active product catalog sorting
- active, archived, and status-filtered orders
- order lookup by customer phone or email
- order events by order and event type
- customers by last contact time
- conversations by customer and last message time
- conversation messages by conversation and creation time
- AI logs by conversation or order
- customer reviews by customer or order
- invoices by order

## Delete and Archive Behavior

- Orders can be archived before permanent deletion.
- Products can be archived and restored.
- Customer deletion removes related conversations, messages, reviews, orders, invoices, events, and AI logs.
- Store deletion removes organization-scoped data in an explicit order.
- Clearing chat in the customer browser starts a new local thread and does not
  delete merchant records. Only an authenticated merchant action can permanently
  delete persisted conversation history.

## Tenant Isolation

Current enforcement is layered:

1. Clerk organization authorization at protected route/action boundaries.
2. Mandatory `organizationId` predicates in store-owned queries.
3. Composite tenant foreign keys for relational integrity.
4. Organization-aware uniqueness constraints.

PostgreSQL Row Level Security is not currently enabled. Enabling RLS safely
requires every request to set tenant context inside the same database
transaction (`SET LOCAL`) and separate privileged roles for migrations,
platform administration, and verified provider webhooks. Turning it on without
that architecture would break pooled requests and is not a safe quick change.

## Retention

- Expired public rate-limit buckets are removable after a one-day grace period.
- Failed webhook records are retained for 30 days.
- Processed webhook records are retained for 90 days.
- Orders, customers, conversations, reviews, and audit records are not removed
  by operational cleanup.

The protected maintenance route performs this cleanup and should run daily.

## Recommended Production Hardening

- Add load tests for customers, orders, conversations, and admin pages.
- Recheck query plans when production data reaches large scale.
- Keep permanent deletion paths restricted and audited.
- Validate backup restoration and point-in-time recovery in staging.
- Evaluate transaction-scoped RLS before introducing untrusted direct database
  access or additional independently deployed services.
