# Tenant Isolation Report

Generated: 2026-06-08

## Current status

Tenant isolation is primarily application-enforced through `organization_id` filters and Clerk active organization context.

## Verified examples

- Products, orders, customers, invoices, conversations, messages, and reviews are queried with `organizationId`.
- Deletion/archive server actions verify the active organization before deleting related rows.
- Admin-only cross-store views require platform admin checks.
- Public chat links cannot use dashboard auth context and are limited by store feature flags and rate limits.

## Remaining risks

- Lack of database-level RLS means a future unscoped query could become a security defect.
- Not all tenant isolation attack scenarios are covered by automated E2E tests.

## Recommendation

Keep current application checks, then add RLS in a controlled migration plan with transaction-scoped tenant settings and dedicated test coverage.

