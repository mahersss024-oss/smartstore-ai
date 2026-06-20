# Maintenance Guide

## Local Development

Start the platform:

```powershell
npm run dev
```

Run the local PostgreSQL-compatible PGlite server only:

```powershell
npm run db-server:file
```

## Validation Checklist

Before saving a major change:

```powershell
npm test
npm run lint -- --no-cache
npm run check:types
npm run check:deps
npm run check:i18n
npm run build
git diff --check
```

Run browser coverage after changes to customer, auth, routing, or checkout
flows:

```powershell
npm run test:e2e
```

For production dependency security:

```powershell
npm audit --omit=dev
```

## Git Save Flow

```powershell
git status --short
git add -A
git commit -m "Describe the change"
git status --short
```

## Deployment Notes

Required production environment variables include:

- `DATABASE_URL`
- `DATABASE_POOL_MAX`
- `DATABASE_CONNECTION_TIMEOUT_MS`
- `DATABASE_IDLE_TIMEOUT_MS`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SIGNING_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- Stripe price IDs used by active plans and add-ons
- `NEXT_PUBLIC_APP_URL`
- `MAINTENANCE_SECRET`

Optional integrations:

- `MOYASAR_SECRET_KEY`
- `AI_EMPLOYEE_WEBHOOK_SECRET`
- Sentry public DSN and flags

## Operational Rules

- Do not store API keys directly in source files.
- Do not bypass `organizationId` filters in store-owned data.
- Do not let the model execute sensitive actions directly.
- Keep customer-facing wording natural, but keep cart/order/payment/confirmation state platform-owned.
- Keep provider webhooks idempotent by event ID before mutating billing or store state.
- Keep public endpoints protected by durable rate limiting before accepting production traffic.
- Add tests when changing product matching, cart mutation, order lifecycle, or guard behavior.
- Run `POST /api/maintenance/cleanup` on a protected daily schedule.
- Apply every committed migration before routing production traffic to a new release.
- Never enable PostgreSQL RLS until requests establish transaction-scoped tenant
  context and platform jobs use a separately privileged database role.

See `operations.md` for deployment, rollback, backup, incident, and maintenance
procedures.
