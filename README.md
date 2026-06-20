# SmartStore AI

SmartStore AI is a store operations platform owned by Maher Alhafithi.

The system helps stores manage products, orders, customers, subscriptions, add-on capacity, delivery settings, team access, and AI-assisted order workflows from one dashboard.

## Owner

Maher Alhafithi

## Core Areas

- Store dashboard and organization workspace
- Products and catalog capacity
- Customer orders and review flow
- AI-assisted order handling
- Subscription plans and add-ons through Stripe
- User and organization access through Clerk
- Platform administration for store controls

## Product Roadmap

The AI store employee roadmap is documented in:

```text
docs/ai-store-employee-roadmap.md
```

## Engineering Documentation

- [Documentation index](docs/README.md)
- [Architecture](docs/architecture/overview.md)
- [Security](SECURITY.md)
- [Database architecture](docs/architecture/database.md)
- [Testing](docs/testing/index.md)
- [Operations](docs/operations/operations.md)
- [Maintenance](docs/operations/maintenance.md)
- [Production status](docs/operations/production-status.md)
- [Audit log](docs/audits/project-audit-log.md)
- [Technical debt](docs/planning/technical-debt.md)
- [Development plan](docs/planning/development-plan.md)

## Local Development

```bash
npm install
npm run dev
```

Open:

```text
http://localhost:3000
```

## Verification

```bash
npm run check:types
npm run lint
npm test
npm run check:i18n
npm run check:deps
npm run check:env:production -- --demo
npm run smoke:production -- --base-url=https://www.smartstore-ai.com --organization-id=org_3EBLVeHRaYimicJRmAZADwEprZz
npm run test:e2e
npm run build
git diff --check
```

## Environment

Copy `.env.example` to `.env.local`, then replace placeholders with local
credentials. Never commit local environment files or generated build folders.

Required services:

- Clerk for authentication and organizations
- Stripe for platform plans, subscriptions, add-ons, and webhook activation
- PGLite/PostgreSQL-compatible database for local development

For technical demos where payment collection is not needed, set
`DEMO_MODE=true`. Demo mode grants an internal Pro entitlement and bypasses
Stripe checkout actions, while authentication, database access, tenant
isolation, orders, catalog management, and AI provider configuration still run
through the normal application paths.

Production also requires a managed PostgreSQL service or connection pooler,
production Clerk keys, HTTPS, monitoring, backups, and the scheduled
maintenance endpoint described in `docs/operations/operations.md`.

## Notes

Store-customer electronic payments are intentionally kept as coming soon in store settings. Platform subscriptions and add-ons are handled separately through Stripe.
