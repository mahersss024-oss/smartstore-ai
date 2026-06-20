# Auth Report

Generated: 2026-06-08

## Verified controls

- ClerkProvider wraps authenticated locale routes.
- Dashboard pages and actions call `auth()` and use active `orgId`.
- Platform admin checks are centralized in `src/libs/PlatformAdmin.ts`.
- Clerk organization webhooks sync organization lifecycle changes to store settings and admin audit logs.

## Remaining risks

- Role granularity beyond platform admin/store active organization should be reviewed when adding multi-staff permissions.
- Production Clerk keys and redirect URLs must be verified in the cloud provider before a wider demo.

