# Operational Runbooks

Generated: 2026-06-08

## AI provider outage

- Symptoms: AI replies fail or fallback messages increase.
- Immediate action: disable AI feature for affected store or switch provider config.
- Diagnose: check provider status, AI action logs, platform settings.
- Recover: restore key/provider, run web-order smoke test.

## Database outage

- Symptoms: dashboard/chat returns 500 or timeouts.
- Immediate action: pause demos and avoid repeated writes.
- Diagnose: provider status, connection string, migration state.
- Recover: restore DB service, run `npm run smoke:production`.

## Clerk outage

- Symptoms: login, sessions, or dashboard auth fail.
- Immediate action: customer public chat may still load, dashboard operations are limited.
- Diagnose: Clerk status, keys, redirect URLs.
- Recover: verify auth routes and organization access.

## Stripe outage

- Symptoms: subscription/add-on checkout or webhooks fail.
- Immediate action: keep demo mode/offline store payment flow where appropriate.
- Diagnose: Stripe dashboard events and webhook logs.
- Recover: replay failed webhooks after provider recovery.

## Webhook failure

- Symptoms: webhook event row remains failed or retries repeatedly.
- Immediate action: inspect `webhook_events` by provider/event id.
- Diagnose: signature, env secret, handler exception.
- Recover: fix root cause and replay from provider if safe.

## Tenant isolation alert

- Symptoms: data from a different organization appears.
- Immediate action: take app read-only/maintenance, preserve logs, stop public links.
- Diagnose: route/action query and `organization_id` filters.
- Recover: patch, test with cross-tenant scenario, redeploy.

## High AI cost

- Symptoms: AI action logs spike or subscription counters grow unexpectedly.
- Immediate action: throttle public chat or disable AI for abused tenant.
- Diagnose: rate-limit records, guest ids, conversation count.
- Recover: add stricter limit or block abusive source.

## Migration failure

- Symptoms: build/deploy fails during migration or app errors after migration.
- Immediate action: do not rerun blindly.
- Diagnose: migration journal, DB logs.
- Recover: restore backup/PITR or apply corrected forward migration.

## Secret rotation

- Symptoms: leaked or suspected leaked key.
- Immediate action: revoke at provider.
- Recover: create new key, update hosting env, redeploy, verify smoke test.

