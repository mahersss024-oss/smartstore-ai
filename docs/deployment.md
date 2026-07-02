# Deployment on Render

SmartStore AI is a standard **Next.js** app running on Node **24.x** with
PostgreSQL hosted by Neon. The supported production deployment provider is
**Render**.

## Build And Run

| Step | Command |
|------|---------|
| Install | `npm ci --include=dev` |
| Build | `npm run build` |
| Start | `npm start` |
| Migrate DB | `npx drizzle-kit migrate` |

The Render blueprint in `render.yaml` uses the same commands.

## Required Render Environment Variables

Add these in the Render service Environment page. Values marked as secrets must
stay in Render and must not be committed.

- `NODE_ENV=production`
- `NEXT_PUBLIC_APP_URL=https://smartstore-ai.com`
- `DATABASE_URL`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SIGNING_SECRET`
- `PLATFORM_ADMIN_USER_IDS`
- `PLATFORM_SECRETS_ENCRYPTION_KEY`
- `WHAPI_PARTNER_API_TOKEN`
- `WHAPI_PROJECT_ID`
- `WHAPI_PARTNER_API_BASE=https://manager.whapi.cloud`
- `WHAPI_GATE_API_BASE=https://gate.whapi.cloud`
- `WHAPI_MANAGED_CHANNEL_EXTEND_DAYS=30`
- `MAINTENANCE_SECRET`

Optional variables:

- `AI_PROCESSING_MODE=outbox`
- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`
- `CRON_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_*`
- `MOYASAR_SECRET_KEY`
- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORGANIZATION`
- `SENTRY_PROJECT`
- `BETTER_STACK_SOURCE_TOKEN`
- `BETTER_STACK_INGESTING_HOST`
- `NEXT_IMAGE_REMOTE_HOSTS`

## WhatsApp Provider

WhatsApp uses **Whapi.cloud** only.

The store dashboard QR flow creates or reuses the store channel, switches it to
live mode, extends it from the partner day balance, configures the webhook,
encrypts the channel token in the database, and displays the QR without
merchant-side manual credential entry.

The inbound webhook route is:

```text
https://smartstore-ai.com/api/whatsapp/webhook
```

Per-store Whapi values are saved encrypted in `channel_connections.config`:

- Whapi Channel ID
- Whapi API Token
- Display phone number
- Whapi webhook secret

## DNS

In the DNS provider:

- Point the apex domain to Render's provided target.
- Point `www` to the same Render target.
- Keep Clerk DNS records such as `clerk.smartstore-ai.com` and
  `accounts.smartstore-ai.com` unchanged.

## Async Outbox Sweeper

Only when `AI_PROCESSING_MODE=outbox`, schedule a one-minute POST:

```text
POST https://smartstore-ai.com/api/maintenance/ai-inbound-jobs
Authorization: Bearer <MAINTENANCE_SECRET or CRON_SECRET>
```

Use Render Cron Jobs or QStash Schedules.

## Smoke Test After Deployment

1. Open `/robots.txt` and confirm a 200 response.
2. Open `/sign-in` and confirm Clerk renders.
3. Open a public web-order link and confirm the page renders.
4. Connect WhatsApp from store settings using the Whapi QR flow.
5. Send a WhatsApp test message.
6. Confirm the message maps to the correct store and an AI reply is sent.
