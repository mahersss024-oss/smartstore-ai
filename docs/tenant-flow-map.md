# Tenant Flow Map

Generated: 2026-06-08

## Trusted tenant sources

- Dashboard and admin store operations use Clerk `auth().orgId` or platform admin permission checks.
- Public customer links use `organizationId` from the URL, then validate store existence and enabled service flags.
- Public customer data is scoped by `organizationId`, channel, and external guest/customer identifiers.

## Tenant scoping patterns verified

- Store dashboard pages query with `eq(table.organizationId, orgId)`.
- Product, order, customer, payment, delivery, AI settings, and setup server actions resolve active organization server-side.
- Public chat requires `organizationId`, validates store feature access, and writes conversation/customer/order rows with that organization.
- Admin store detail pages require platform admin and then scope all store metrics to the requested organization id.
- Storage paths for images and logos are tenant-scoped under organization-specific directories.

## Remaining hardening

- Application-level tenant checks are strong, but PostgreSQL RLS is not yet implemented as a second line of defense.
- A formal cross-tenant attack E2E suite should be added before high-scale commercial production.

