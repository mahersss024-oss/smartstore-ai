# Access Checklist

Date started: 2026-06-13

No passwords, tokens, secrets, or recovery codes may be stored in this file.

Status values:

- `confirmed`
- `missing`
- `needs confirmation`
- `not applicable`

| Area | Status | Evidence / note |
| --- | --- | --- |
| GitHub repository | confirmed | Remote: `https://github.com/mahersss024-oss/smartstore-ai.git`; local push was previously successful. |
| Target branch | confirmed | `main`. |
| Render service | needs confirmation | Render is the active deployment provider. Record service owner, service URL, and latest deployment evidence after each production-impacting push. |
| Render production environment access | needs confirmation | Confirm required values from the Render dashboard or safe key-only CLI output. Do not store secret values in Git. |
| Production deployment inspect access | needs confirmation | Confirm the latest Render deployment is live and points to the intended commit. |
| Production runtime logs | needs confirmation | Confirm Render logs show healthy requests and no provider-send failures after deployment. |
| Database provider | needs confirmation | Provider is PostgreSQL/Neon in current operations, but backup status, PITR status, and restore process still need external evidence. |
| Clerk | needs confirmation | Production app access and key rotation authority are not recorded in this checklist. |
| Meta WhatsApp | needs confirmation | App/WABA access exists from setup conversation, but owner/role, production access, webhook subscription, app secret, verify token, and store token freshness still require external evidence. |
| AI provider | needs confirmation | Runtime provider settings exist in platform admin, but provider account access and quota controls are not recorded. |
| Stripe | not applicable | Automated platform billing is outside the current launch scope. Provider access and live billing certification become mandatory before the feature is enabled after launch. |
| Moyasar and other online payment providers | not applicable | Customer online payments are disabled and outside the current launch scope. Existing provider foundations are retained for post-launch activation. |
| Observability provider | needs confirmation | Render runtime logs are the current baseline. Better Stack is optional and deferred; maximum certification still requires confirmed monitoring and alert ownership. |
| DNS/domain provider | needs confirmation | Needed for rollback, SSL, and incident response. |

## Environment Variable Inventory Source

Current template source: `.env.example`.

Required or recommended production ownership still needs to be mapped for:

- `DATABASE_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SIGNING_SECRET`
- `PLATFORM_ADMIN_USER_IDS`
- `PLATFORM_SECRETS_ENCRYPTION_KEY`
- `AI_EMPLOYEE_WEBHOOK_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
- `META_APP_SECRET`
- `META_GRAPH_API_VERSION`
- `MAINTENANCE_SECRET`
- Optional post-launch `STRIPE_*`
- Optional post-launch Moyasar/payment-provider and Better Stack variables.
- Optional Sentry and image host variables.

Full Render variable name ownership is still deferred to Phase 0 because a
safe key-only export has not been recorded here.

Runtime contract evidence exists in `src/libs/Env.ts` and
`src/libs/PlatformRuntimeConfig.ts`, but provider account access still requires
external confirmation.

## Approval Authorities

| Operation | Approved by | Status | Note |
| --- | --- | --- | --- |
| Code changes | Maher Alhafithi | confirmed | Current thread instruction authorizes continuing certification work. |
| Deployments | Maher Alhafithi | needs confirmation | Deployment authority needs explicit confirmation for production-impacting changes. |
| Secret rotation | Maher Alhafithi | needs confirmation | Rotation authority needs explicit confirmation. |
| Database migrations | Maher Alhafithi | needs confirmation | Migration authority needs explicit confirmation. |
| Database restore/rollback | Maher Alhafithi | needs confirmation | Restore authority and provider process need confirmation. |
| Production smoke tests | Maher Alhafithi | confirmed for read-only smoke | Current read-only smoke test was reviewed and executed successfully. Future write smoke tests still need explicit approval. |
