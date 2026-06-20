# Rollback Plan

Generated: 2026-06-08

## Immediate rollback

1. Open Vercel project deployments.
2. Select the last known-good deployment.
3. Promote/redeploy it to production.
4. Run production smoke test.
5. Check Clerk login, smart link, web order, and dashboard.

## Database rollback

1. Stop risky writes if needed with service controls or maintenance mode.
2. Identify migration/version that introduced the issue.
3. Restore from provider backup/PITR when data corruption occurred.
4. For code-only failures, roll back application deployment first.

## Emergency flags

Current recommended flags to keep available in hosting env:

- `DEMO_MODE`
- `NEXT_PUBLIC_SENTRY_DISABLED`
- `AI_EMPLOYEE_WEBHOOK_SECRET`
- `MAINTENANCE_SECRET`

Future hardening should add explicit `DISABLE_AI`, `DISABLE_ORDER_EXECUTION`, `DISABLE_PAYMENTS`, `MAINTENANCE_MODE`, and `READ_ONLY_MODE`.

