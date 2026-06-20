# Database Report

Generated: 2026-06-08

## Database type

PostgreSQL with Drizzle ORM and SQL migrations.

## Tables

- Tenant data: products, payment methods, delivery methods, orders, order events, store settings, customers, channel connections, conversations, conversation messages, AI action logs, customer reviews, invoices, platform admin audit logs.
- Platform/ops data: platform settings, webhook events, public endpoint rate limits.

## Strengths

- Most tenant tables include `organization_id`.
- Important tenant access indexes exist on products, orders, customers, conversations, messages, AI logs, reviews, invoices, admin audit logs.
- Webhook events have a unique provider/event id key.
- Public rate-limit buckets have a unique rate-limit key and expiry index.
- Review uniqueness is scoped by organization/order/customer.

## Risks

- Foreign keys are limited; many relationships are enforced in application code rather than database constraints.
- No RLS policy layer yet.
- Status columns are strings; there are tests and constants, but database enum/check constraints could harden invalid states.
- Cascades/soft-delete policy should be documented per table before high-scale production.

