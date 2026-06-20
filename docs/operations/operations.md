# Operations

## Deployment Order

1. Create a database backup or verified restore point.
2. Configure production secrets and provider production keys.
3. Apply committed migrations once.
4. Run the quality gate in CI.
5. Deploy the application without routing traffic.
6. Run `npm run smoke:production -- --base-url=<production-url>` plus health,
   auth, tenant-isolation, webhook, and customer-order smoke tests.
7. Route traffic gradually and monitor errors, latency, and database pools.

## Required Configuration

Use `.env.example` as the variable inventory. Production values belong in the
hosting provider's secret manager, never in source control.

Before deployment, run:

```text
npm run check:env:production
```

For a non-billing technical demo, run:

```text
npm run check:env:production -- --demo
```

For a non-billing technical demo, `DEMO_MODE=true` may be enabled in the host
environment. This keeps the product operational without Stripe checkout by
granting the workspace active Pro entitlements. It is still not a replacement
for required runtime services: configure Clerk, `DATABASE_URL`, the public app
URL, and the AI provider settings before sharing the demo link.

Use a long random `MAINTENANCE_SECRET`. Schedule:

```text
POST /api/maintenance/cleanup
Authorization: Bearer <MAINTENANCE_SECRET>
```

Run daily. The job deletes only expired rate-limit buckets and old webhook
execution records according to documented retention. It does not delete
customers, orders, conversations, reviews, or merchant audit records.

## Monitoring

Alert on:

- elevated HTTP 5xx and 429 rates
- database connection or lock saturation
- failed/stuck webhooks
- Clerk/Stripe verification failures
- AI provider latency, failure, and repair rate
- order confirmation or billing concurrency errors
- maintenance job failure

Correlate logs with organization, conversation, order, and provider event IDs,
but never log raw credentials or unnecessary customer secrets.

## Backups

- Enable encrypted automated backups and point-in-time recovery.
- Test restore procedures in staging on a schedule.
- Record recovery point and recovery time objectives.
- Back up uploaded assets independently if they are not stored by the managed
  object-storage provider.

## Failure Behavior

- Database unavailable: fail closed on mutations; do not claim success.
- AI unavailable: preserve platform state and show a neutral retry response.
- Clerk unavailable: protected routes remain inaccessible.
- Stripe/Clerk webhook failure: provider retries are idempotent.
- Network timeout: outbound calls abort and may be retried only where the
  operation is idempotent.

## Rollback

Application rollback is safe only when the previous version understands the
current database schema. Prefer backward-compatible expand/migrate/contract
migrations. Never automatically reverse a data migration without a tested
recovery plan.
