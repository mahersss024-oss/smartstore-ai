# Production Operations Certification Runbook

Date: 2026-06-13

Scope:

- Render production deployment operation.
- Runtime environment ownership.
- Secret rotation.
- Database backup, restore, and migration rollback.
- Monitoring and alert thresholds.
- Operational cleanup and data-retention schedule.
- Provider incident response for WhatsApp, AI, and payments.

This document is operational guidance only. It must not contain real secrets,
access tokens, customer messages, or provider credentials.

## Render Production Deployment Checklist

Before deploy:

1. Confirm target branch and commit.
2. Confirm `git status --short` is clean.
3. Confirm no uncommitted migrations exist.
4. Confirm production `DATABASE_URL` points to the managed database provider,
   not localhost or PGlite.
5. Confirm Clerk production keys are configured for production traffic.
6. Confirm each active WhatsApp store has encrypted WhatsApp (Meta) credentials and a
   unique WhatsApp number in its channel connection.
7. Confirm `PLATFORM_SECRETS_ENCRYPTION_KEY` is set in Render and is not
   exposed in the admin UI.
8. Confirm `MAINTENANCE_SECRET` is set in Render or platform runtime settings.
9. Confirm database backup/PITR status before migrations or write-heavy smoke.
10. Run the required release checks:
    - `npm run check:types`
    - `npm test`
    - `npm run lint`
    - `npm run build`
    - `npm run check:deps`
    - `npm run check:i18n`
    - `npm run check:env:production -- --strict`
11. Deploy to Render.
12. Inspect the deployment and verify it is `Ready`.
13. Run safe production smoke checks.
14. Monitor errors, latency, webhook failures, and DB pool pressure.

Rollback trigger:

- Any confirmed cross-tenant data exposure.
- Any order/payment corruption.
- Any production deployment that cannot reach the production database.
- Any auth failure that blocks store admins.
- Any webhook signature failure caused by configuration drift.

## Runtime Environment Ownership Matrix

| Variable or setting | Owner | Storage | Rotation source | Notes |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | Platform operator | Render | DB provider | Must be managed PostgreSQL in production. Localhost blocks certification. |
| `DATABASE_POOL_MAX` | Platform operator | Render | Internal policy | Keep within `1..50`; update with load evidence. |
| `DATABASE_CONNECTION_TIMEOUT_MS` | Platform operator | Render | Internal policy | Must remain >= 1000. |
| `DATABASE_IDLE_TIMEOUT_MS` | Platform operator | Render | Internal policy | Must remain >= 1000. |
| `NEXT_PUBLIC_APP_URL` | Platform operator | Render | Domain/Render | Must be HTTPS production URL. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Platform operator | Render | Clerk dashboard | Use `pk_live_` for production certification. |
| `CLERK_SECRET_KEY` | Platform operator | Render | Clerk dashboard | Use `sk_live_` for production certification. |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Platform operator | Render | Clerk webhook settings | Rotate after webhook endpoint changes or suspected leak. |
| `PLATFORM_ADMIN_USER_IDS` | Platform operator | Render | Clerk user IDs | Keep least privilege. |
| `PLATFORM_SECRETS_ENCRYPTION_KEY` | Platform operator | Render only | Secure random generator | Active encryption root; do not store in DB/admin UI. |
| `PLATFORM_SECRETS_PREVIOUS_ENCRYPTION_KEYS` | Platform operator | Render only | Previous active roots | Temporary comma-separated decrypt-only keyring used during staged rotation. |
| Store WhatsApp Phone Number ID | Store/platform admin | DB channel connection | Meta WhatsApp setup | Per-store identifier; no redeploy required after save. |
| Store WhatsApp Access Token | Store/platform admin | Encrypted DB channel connection | Meta WhatsApp setup | Per-store secret used for webhook verification and outbound messages. |
| Store WhatsApp display number | Store/platform admin | DB channel connection | Meta WhatsApp setup | Must be unique among active stores and use `whatsapp:+number`. |
| Store WhatsApp Business Account ID | Store/platform admin | DB channel connection | Meta WhatsApp setup | Optional per-store MG SID. |
| `AI_EMPLOYEE_WEBHOOK_SECRET` | Platform operator | Render or platform runtime settings | Secure random generator | Protects public AI employee API. |
| Platform AI provider key | Platform operator | Encrypted DB platform settings | AI provider console | Production key belongs in platform admin runtime settings or provider secret manager. |
| `MAINTENANCE_SECRET` | Platform operator | Render or platform runtime settings | Secure random generator | Protects `/api/maintenance/cleanup`. |
| `STRIPE_SECRET_KEY` | Platform operator | Render | Stripe dashboard | Optional post-launch; required before automated platform billing is enabled. |
| `STRIPE_WEBHOOK_SECRET` | Platform operator | Render | Stripe webhook settings | Optional post-launch; required before the Stripe webhook is enabled. |
| Stripe price IDs | Platform operator | Render | Stripe dashboard | Optional post-launch; configure and verify before plans or add-ons use automated billing. |
| `MOYASAR_SECRET_KEY` | Platform operator | Render | Moyasar dashboard | Optional post-launch; customer online payments are disabled until separately certified. |
| Better Stack token/host | Platform operator | Render | Better Stack | Optional post-launch log forwarding; console/Render logging remains active when unset. |
| Sentry variables | Platform operator | Render | Sentry | Optional monitoring/release integration. |

## Secret Rotation Runbook

General rotation steps:

1. Identify the secret, owner, storage location, and dependent routes.
2. Create the new secret in the provider console or with a secure random
   generator.
3. Add the new value in Render or platform runtime settings.
4. Redeploy only when the secret is Render-managed and read at runtime from the
   environment.
5. For platform/runtime DB-managed values, save from platform admin and verify
   runtime status without exposing the value.
6. Run the smallest safe smoke path for the affected provider.
7. Revoke the old value after the new value is proven.
8. Record the rotation date, actor, affected provider, verification command,
   and rollback path in the operational log.

Provider-specific checks:

- Clerk: verify sign-in, dashboard access, organization selection, and Clerk
  webhook.
- WhatsApp (Meta): verify signed webhook delivery, inbound test message,
  outbound reply, and per-store credential status.
- AI provider: verify platform AI provider settings, safe simulation, and
  customer chat reply.
- Stripe: verify webhook signature, subscription sync, and checkout link
  creation in non-destructive mode.
- Maintenance secret: verify unauthorized cleanup returns 401 and authorized
  cleanup returns a JSON cleanup summary.

`PLATFORM_SECRETS_ENCRYPTION_KEY` rotation:

1. Add the current active root to
   `PLATFORM_SECRETS_PREVIOUS_ENCRYPTION_KEYS`.
2. Set the new random root as `PLATFORM_SECRETS_ENCRYPTION_KEY`.
3. Redeploy and verify platform AI, runtime, and per-store WhatsApp credentials.
4. Re-save or migrate encrypted values so new ciphertext uses the active root.
5. Remove a previous root only after proving no stored value depends on it.
6. Never log, export, or place root keys in the database or admin UI.

## Database Backup And Restore Requirements

Production certification requires provider evidence for:

- Automated encrypted backups enabled.
- Point-in-time recovery enabled.
- Backup retention period.
- Restore permission owner.
- Last successful backup timestamp.
- Last restore drill timestamp.
- RPO and RTO targets.

Minimum restore drill:

1. Restore latest backup or PITR snapshot into a staging database.
2. Point a staging/preview deployment to the restored database.
3. Run smoke checks against staging only.
4. Verify orders, customers, conversations, reviews, complaints, webhook events,
   platform settings, and channel connections are present.
5. Record restore duration and data timestamp.

Certification blocker:

- If backup/PITR provider evidence is missing, Operations Gate and Disaster
  Recovery Gate remain not certified.

## Migration Rollback Plan

Before migration:

1. Confirm backup/PITR.
2. Confirm migration list and target commit.
3. Confirm backward compatibility between current and previous deployment.
4. Confirm a forward-fix plan for non-reversible data changes.
5. Confirm owner approval.

If migration fails before data mutation:

- Stop deployment promotion.
- Fix migration and rerun in staging.
- Redeploy only after checks pass.

If migration fails after partial mutation:

- Do not rerun blindly.
- Freeze risky writes with service controls or maintenance mode.
- Inspect migration journal and DB logs.
- Prefer forward-fix if data can be corrected safely.
- Use PITR restore only when corruption is confirmed or forward-fix is unsafe.

## Monitoring Dashboards And Alert Thresholds

Required dashboards:

- Render service error rate, duration, cold starts, and deployment health.
- Database connections, query latency, locks, storage, CPU, and failed
  connections.
- Public endpoint 4xx/5xx/429 rates.
- WhatsApp webhook accepted/skipped/failed/outbound-failed counts.
- AI provider latency, failure rate, and guardrail repair/block counts.
- Stripe/Clerk webhook verification and processing failures.
- Order creation and status transition failures.
- Maintenance cleanup success/failure.

Initial alert thresholds:

| Signal | Warning | Critical |
| --- | --- | --- |
| HTTP 5xx rate | > 1% for 5 minutes | > 5% for 5 minutes |
| Public endpoint 429 rate | > 10% for 10 minutes | > 25% for 10 minutes |
| WhatsApp outbound failures | >= 3 in 10 minutes | >= 10 in 10 minutes |
| AI provider failures | > 5% for 10 minutes | > 15% for 10 minutes |
| DB connection usage | > 70% for 10 minutes | > 90% for 5 minutes |
| DB query p95 | > 1000 ms for 10 minutes | > 3000 ms for 5 minutes |
| Stripe webhook failures | >= 1 production failure | >= 3 in 15 minutes |
| Clerk webhook failures | >= 1 production failure | >= 3 in 15 minutes |
| Maintenance cleanup failure | one missed daily success | two missed daily successes |

These thresholds are starting points. They must be tuned after real traffic and
load-test evidence.

## Log Retention And Redaction Rules

Required log retention:

- Application runtime logs: at least 14 days.
- Security/provider webhook failure logs: at least 30 days.
- Platform admin audit logs: retained according to business/legal policy.
- Order/customer operational records: retained according to the data lifecycle
  policy.

Redaction rules:

- Never log WhatsApp access tokens.
- Never log AI provider keys.
- Never log Clerk or Stripe secrets.
- Never log `PLATFORM_SECRETS_ENCRYPTION_KEY`.
- Never log full customer message bodies in provider-error logs unless a
  customer-support policy explicitly allows redacted excerpts.
- Prefer safe identifiers: organization id, conversation id, order id, provider
  event id, message id, and error code.

## Data Retention Cleanup Schedule

Source evidence:

- `src/app/api/maintenance/cleanup/route.ts`
- `src/libs/OperationalDataRetention.ts`

Protected endpoint:

```text
POST /api/maintenance/cleanup
Authorization: Bearer <MAINTENANCE_SECRET>
```

Current cleanup behavior:

- Expired public rate-limit buckets after 1 grace day.
- Processed webhook records after 90 days.
- Failed webhook records after 30 days.

The cleanup endpoint must be scheduled daily by the hosting provider or an
approved scheduler. It must not delete active customer, order, conversation,
review, complaint, product, or merchant audit data.

## Provider Incident Runbooks

### WhatsApp Receives Messages But Does Not Reply

Symptoms:

- Customer messages appear in the platform chat but no WhatsApp reply is
  delivered.

Immediate containment:

- Do not rotate the store Auth Token repeatedly until the failure source is
  identified.
- Confirm the Meta webhook points to
  `/api/whatsapp/webhook`.
- Confirm store channel connection is active.

Diagnosis:

1. Check WhatsApp webhook route logs for signature, idempotency, connection,
   AI, and outbound send outcomes.
2. Check the incoming `To` number matches the store `phoneNumberId`.
3. Check the store Account SID and encrypted Auth Token are valid.
4. Check AI route result and empty-reply behavior.
5. Check the Meta message delivery response.

Recovery:

- Fix the WhatsApp webhook, store credentials, sender assignment, or AI provider
  issue.
- Send a safe test message.
- Verify the customer chat and order state did not duplicate.

### AI Provider Failure

Symptoms:

- Customer receives fallback/retry messages.
- AI simulation or public chat fails.
- AI latency or provider errors spike.

Immediate containment:

- Disable AI for affected store or switch provider if available.
- Keep order state platform-owned; do not manually force model actions.

Diagnosis:

1. Check platform AI provider settings.
2. Check provider status page.
3. Check AI action logs and guardrail failures.
4. Verify provider key, base URL, model, and quota.

Recovery:

- Restore key/provider configuration.
- Run safe AI simulation.
- Run one customer web-order or WhatsApp smoke flow.

### Payment Provider Failure

Symptoms:

- Stripe subscription checkout fails.
- Stripe webhook processing fails.
- Moyasar callback fails or payment status is inconsistent.

Immediate containment:

- Do not manually mark paid orders without audit trail.
- Preserve provider event IDs.

Diagnosis:

1. Check provider dashboard events.
2. Check webhook signature configuration.
3. Check idempotency event status.
4. Check order/invoice/payment status reconciliation.

Recovery:

- Fix endpoint secret or handler issue.
- Replay provider webhook only when idempotency behavior is confirmed.
- Reconcile affected orders/subscriptions.

## Operations Certification Evidence Checklist

Required before Phase 14 can be certified:

- Render Production Deployment Checklist completed with deployment ID.
- Environment ownership matrix confirmed.
- Secret rotation dry run completed for at least one non-critical secret.
- Database backup/PITR evidence recorded.
- Restore drill completed and timed.
- Migration rollback/forward-fix drill documented.
- Incident contacts recorded.
- Monitoring dashboards created.
- Alert thresholds configured in provider.
- Log retention configured.
- Maintenance cleanup scheduled and last successful run recorded.
- WhatsApp incident runbook validated with safe test data.
- AI incident runbook validated with safe test data.
- Payment incident runbook validated with provider test mode or safe event.

Until these are proven with provider/runtime evidence, Operations Gate,
Rollback Gate, and Disaster Recovery Gate remain not certified.
