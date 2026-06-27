# Disaster Recovery

Generated: 2026-06-08

## Critical data

- Store settings and subscription state.
- Products and images/logo paths.
- Orders, invoices, order events.
- Customers, conversations, messages, reviews.
- Platform settings and encrypted AI provider key.
- Webhook event table.

## Backup strategy

- Use managed PostgreSQL backups/PITR from the database provider.
- Keep application deployments reversible through Render.
- Keep uploaded media in tenant-scoped storage; move to durable object storage before large production.

## Target objectives for demo

- RPO: provider backup interval.
- RTO: redeploy last good Render deployment plus DB restore if needed.

## Restore drill

Run a restore rehearsal before onboarding real paying stores at scale.
