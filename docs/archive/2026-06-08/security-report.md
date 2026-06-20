# Security Report

Generated: 2026-06-08

## Verified controls

- Clerk guards protected dashboard/admin routes.
- Platform admin access uses `requirePlatformAdmin`.
- Public AI endpoint validates schema, body size, shared secret when configured, feature flags, subscription state, and rate limits.
- Stripe webhook uses raw body verification and Stripe signature validation.
- Clerk webhook uses Clerk/Svix verification.
- Request body helpers enforce size limits.
- Secret scan of source files found only placeholders and test stubs, not real committed provider tokens.
- Store logo and product uploads are processed server-side and tenant-scoped.

## Medium risks

- No full production WAF/DDoS policy is documented or tested yet.
- PostgreSQL RLS is not implemented.
- Dev-only dependency audit reports moderate findings through `drizzle-kit`/`esbuild`; these are not production dependencies but should be revisited periodically.
- External monitoring and alerting tokens need production setup.

## Required next actions

- Add cross-tenant E2E attack tests.
- Add production Sentry/Better Stack alerts.
- Evaluate RLS implementation plan before serving many stores.

