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
| Vercel project | confirmed | `npx --yes vercel project inspect martstore-ai` found project `maher-s-smartstore-ai/martstore-ai`, project ID `prj_mZxF3h6vOYGgnBm2OT9xqqbEciql`, Node.js 24.x. |
| Vercel production environment access | confirmed | `npx --yes vercel env pull <temp> --environment=production` reached and downloaded the production environment file; no values were stored in Git. |
| Vercel production env validation | warning | `npx --yes vercel env run --environment=production -- node scripts/validate-production-env.mjs --demo` completed without required-variable failure but warned about Clerk development keys and missing WhatsApp Vercel env vars. |
| Production deployment inspect access | confirmed | `npx --yes vercel inspect https://www.smartstore-ai.com --timeout 10s` returned deployment `dpl_4JwJ1V73ZjBjijNuGXMtcDh8ie4E` with status Ready. |
| Production runtime logs | confirmed | `npx --yes vercel logs https://www.smartstore-ai.com --since 10m` returned recent runtime requests for the production project. |
| Database provider | blocked | Provider, backup status, PITR status, and restore process are not recorded. A read-only DB check under Vercel Production env failed against `127.0.0.1:5433`. |
| Clerk | needs confirmation | Production app access and key rotation authority are not recorded. Vercel env validation warns the current keys are Clerk development keys. |
| Meta WhatsApp | needs confirmation | App/WABA access exists from setup conversation, but owner/role and production access are not documented here. Vercel env validation warns WhatsApp app secret and verify token are missing from Vercel env; platform DB-stored runtime values still require separate runtime evidence. |
| AI provider | needs confirmation | Runtime provider settings exist in platform admin, but provider account access and quota controls are not recorded. |
| Stripe | not applicable | Automated platform billing is outside the current launch scope. Provider access and live billing certification become mandatory before the feature is enabled after launch. |
| Moyasar and other online payment providers | not applicable | Customer online payments are disabled and outside the current launch scope. Existing provider foundations are retained for post-launch activation. |
| Observability provider | needs confirmation | Vercel runtime logs are the current baseline. Better Stack is optional and deferred; maximum certification still requires confirmed monitoring and alert ownership. |
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
- `legacy Meta webhook verify token (removed)`
- `legacy Meta app secret (removed)`
- `legacy Meta Graph API version (removed)`
- `MAINTENANCE_SECRET`
- Optional post-launch `STRIPE_*`
- Optional post-launch Moyasar/payment-provider and Better Stack variables.
- Optional Sentry and image host variables.

Full Vercel variable name ownership is still deferred to Phase 0 because the
safe CLI output did not produce a reliable key-only list.

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
