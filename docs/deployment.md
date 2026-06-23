# Deployment (off Vercel)

SmartStore AI is a standard **Next.js** app (Node **24.x**, npm) backed by **Neon
Postgres**. It runs anywhere that can build a Next.js app and run a long-lived
Node server — Render, Railway, Fly.io, or any VPS/Docker host. Nothing in the app
is Vercel-specific.

## Build & run

| Step | Command |
|------|---------|
| Install | `npm ci` |
| Build | `npm run build` |
| Start | `npm start` (`next start`, serves on `$PORT`/3000) |
| Migrate DB | `npm run db:migrate` (or `npx drizzle-kit migrate` with `DATABASE_URL` set) |

Run migrations once per deploy after the DB env is set (or use
`npm run build:with-migrate`).

## Environment variables

Copy these from the local backup `\.env.production.local` (pulled via
`vercel env pull`). **Do NOT copy the Vercel build-system vars**
(`VERCEL`, `VERCEL_*`, `VERCEL_OIDC_TOKEN`, `NX_*`, `TURBO_*`) — those are
injected by Vercel only and must not be set elsewhere.

### Required (build fails without them)
- `DATABASE_URL` — reuse the **Neon pooled** connection string (the one with
  `-pooler`); SSL is enforced automatically (`sslmode=verify-full`).
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

### Critical (not build-required, but data-critical — never lose)
- `PLATFORM_SECRETS_ENCRYPTION_KEY` — AES-256-GCM key that decrypts stored Twilio
  secrets in the DB. Losing it makes those secrets unrecoverable.
- `PLATFORM_SECRETS_PREVIOUS_ENCRYPTION_KEYS` — if key rotation was used.

### Must set/change on the new host
- `NEXT_PUBLIC_APP_URL=https://smartstore-ai.com` — was **empty** on Vercel.
  Required for correct absolute URLs and for the async outbox worker dispatch.

### Feature vars (set the ones you use)
- Clerk: `CLERK_WEBHOOK_SIGNING_SECRET`, `PLATFORM_ADMIN_USER_IDS`
- WhatsApp (Twilio): `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_VERIFY_SERVICE_SID`
- Billing (Stripe): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`
  (⚠️ these were NOT set on Vercel production — add them if billing must work in prod)
- Online payments: `MOYASAR_SECRET_KEY` (callback is currently feature-flagged off)
- Async outbox: `AI_PROCESSING_MODE=outbox`, `QSTASH_TOKEN`,
  `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`, `CRON_SECRET` —
  leave `AI_PROCESSING_MODE` unset (=`sync`) until Upstash/QStash is provisioned.
- Maintenance: `MAINTENANCE_SECRET` (Bearer for the sweeper endpoint)
- Observability: `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`,
  `SENTRY_ORGANIZATION`, `SENTRY_PROJECT`, `BETTER_STACK_*`
- Misc: `NODE_OPTIONS`, `NEXT_IMAGE_REMOTE_HOSTS`, `DEMO_MODE` (inert in prod)

Vars with defaults can be omitted: `DATABASE_POOL_MAX`, `DATABASE_*_TIMEOUT_MS`,
`NODE_ENV`, `NEXT_PUBLIC_LOGGING_LEVEL`.

## DNS — repoint `smartstore-ai.com` (registrar/DNS: **Porkbun**)

1. Stand up the new host first and add `smartstore-ai.com` as a custom domain
   there; it will give you a DNS target.
2. In Porkbun → Domain Management → `smartstore-ai.com` → DNS Records:
   - Apex `A` `76.76.21.21` (old Vercel IP) → the new host's IP, **or** replace
     with an `ALIAS`/`CNAME` to the host's domain (Porkbun supports apex `ALIAS`).
   - `www` → same target.
3. **Do not touch** `clerk.smartstore-ai.com` / `accounts.smartstore-ai.com` —
   those point to Clerk and must stay.
4. Enable automatic HTTPS on the new host; wait for propagation (minutes).

## Webhooks to update to the new domain

- Clerk: webhook endpoint + allowed origins.
- Stripe: webhook endpoint (if billing enabled).
- Twilio WhatsApp: inbound webhook → `https://smartstore-ai.com/api/twilio/webhook`.

## Async outbox sweeper (only if `AI_PROCESSING_MODE=outbox`)

Vercel Cron was removed. Schedule an external call every minute:

```
POST https://smartstore-ai.com/api/maintenance/ai-inbound-jobs
Authorization: Bearer <MAINTENANCE_SECRET or CRON_SECRET>
```

Use QStash Schedules, Render Cron Jobs, cron-job.org, or GitHub Actions.

## Provider quick notes

- **Render** — New → Web Service from GitHub. Build `npm run build`, Start
  `npm start`, Node 24. Add env vars. Use a **Render Cron Job** for the sweeper.
  No Dockerfile needed.
- **Railway** — Deploy from GitHub; it auto-detects Next.js. Add env vars and a
  Postgres plugin (or reuse Neon). Schedule the sweeper via QStash/external cron.
  No Dockerfile needed.
- **Fly.io / VPS / any Docker host** — use the repo `Dockerfile`
  (`fly launch` / `docker build`). Provide the same env vars at runtime.
