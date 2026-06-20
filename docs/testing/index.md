# Testing

## Local Quality Gate

```powershell
npm run lint
npm run check:types
npm test
npm run check:i18n
npm run check:deps
npm run check:env:production -- --demo
npm run smoke:production -- --base-url=https://www.smartstore-ai.com --organization-id=org_3EBLVeHRaYimicJRmAZADwEprZz
npm run build
npm run test:e2e
git diff --check
npm audit --omit=dev
```

## Production Gate

The `Production Gate` GitHub workflow runs on `main` and `master` pushes and
pull requests. It installs dependencies from `package-lock.json`, validates the
production environment contract in demo mode, then runs linting, TypeScript,
unit/component tests, and a production build against a temporary local database.

Use `npm run smoke:production` after every cloud deployment to verify that the
public routes are live before sharing the link.

## Current Coverage Areas

- product matching, ambiguity, and unavailable products
- cart mutation and checkout requirements
- order lifecycle and concurrent mutation
- AI orchestration diagnostics and reply guards
- customer guest identity and chat state
- customer feedback and tenant identity checks
- merchant order/customer destructive actions
- Clerk organization lifecycle
- Stripe billing synchronization and event ordering
- webhook idempotency and retries
- public endpoint rate limits
- bounded request bodies and outbound HTTP safety
- localized routes and real browser customer chat

## Required Staging Matrix

Before large production traffic, run integration and E2E scenarios for:

- two stores attempting cross-tenant reads and mutations
- ambiguous, missing, unavailable, and similarly named products
- cart cancellation, restoration, quantity changes, and repeated submission
- delivery location, pickup, dine-in, fees, and payment combinations
- order updates before and after merchant approval
- complaint, rating, archive, and permanent deletion
- Clerk session expiry and organization switching
- duplicate, out-of-order, delayed, and failed webhooks
- AI timeout, provider rejection, malformed output, and repair failure
- database interruption and recovery

## Load Testing

Use a staging database with realistic cardinality and sanitized data. Test at
increasing concurrency, capture p50/p95/p99 latency, error rate, pool
saturation, CPU, memory, lock waits, and query plans. Target claims for 100,
500, 1,000, and 5,000 concurrent users must be accepted only from measured
results.

Do not load-test production customer data or third-party AI/payment providers
without explicit provider limits and cost controls.
