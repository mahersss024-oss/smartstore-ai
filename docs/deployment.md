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
- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`
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

## WhatsApp Providers

WhatsApp supports two store-level providers:

- **Meta WhatsApp Cloud API**
- **Whapi.cloud**

Platform-level values for Meta:

- `META_APP_SECRET`
- `META_WEBHOOK_VERIFY_TOKEN`

Per-store Meta values are saved encrypted from the store dashboard:

- Phone Number ID
- Access Token
- Display phone number
- Optional WhatsApp Business Account ID

The Meta inbound webhook URL is:

```text
https://smartstore-ai.com/api/whatsapp/webhook
```

Subscribe the Meta app to the `messages` webhook field.

Per-store Whapi values are also saved encrypted from the store dashboard:

- Whapi Channel ID
- Whapi API Token
- Display phone number
- Whapi webhook secret

Whapi does not require global Render environment variables. Configure Whapi with
the store-specific webhook URL shown in the dashboard:

```text
https://smartstore-ai.com/api/whatsapp/webhook?provider=whapi&channelId=<channelId>&secret=<webhookSecret>
```

For one-click QR connection, set these platform-level Render variables:

- `WHAPI_PARTNER_API_TOKEN`
- `WHAPI_PROJECT_ID`

Optional overrides:

- `WHAPI_PARTNER_API_BASE=https://manager.whapi.cloud`
- `WHAPI_GATE_API_BASE=https://gate.whapi.cloud`
- `WHAPI_MANAGED_CHANNEL_EXTEND_DAYS=30`

When these are present, the store can click "Show QR" in the dashboard. The
platform creates/reuses the Whapi channel, switches it to live mode, extends it
from the partner day balance once, configures the webhook, encrypts the channel
token in the database, and displays the QR without merchant-side manual
credential entry.

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
4. Send a WhatsApp test message through the provider configured for the store.
5. Confirm the message maps to the correct store and an AI reply is sent.
