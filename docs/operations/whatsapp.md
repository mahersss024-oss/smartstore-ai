# WhatsApp Operations

SmartStore AI uses **Whapi.cloud** as the only active WhatsApp provider.

The conversation engine, guardrails, catalog, pricing, cart, and order workflows
remain provider-independent. Only the WhatsApp transport layer is Whapi.

## Activation Checklist

Use this checklist for each merchant store before enabling WhatsApp traffic.

1. In Render, configure the platform Whapi managed-connect variables:
   - `WHAPI_PARTNER_API_TOKEN`
   - `WHAPI_PROJECT_ID`
   - `WHAPI_PARTNER_API_BASE=https://manager.whapi.cloud`
   - `WHAPI_GATE_API_BASE=https://gate.whapi.cloud`
   - `WHAPI_MANAGED_CHANNEL_EXTEND_DAYS=5` (or any value that is covered by the available Whapi partner day balance)
   - `WHAPI_CHANNEL_RENEW_LOOKAHEAD_HOURS=24`
   - `WHAPI_CHANNEL_RENEW_COOLDOWN_HOURS=20`
2. In the store dashboard, open Settings -> WhatsApp.
3. Click **Show QR**.
4. The platform creates or reuses the store's Whapi channel, switches it to live
   mode, extends it from the partner day balance, configures the webhook,
   encrypts the channel token, and shows the QR for the merchant to scan.
5. After scanning, click **Refresh after scanning** and verify the channel status
   is connected.

## Store Dashboard

```text
Dashboard -> Settings -> WhatsApp / Customer Channels
```

The merchant does not need to enter provider credentials manually. Platform
admins can still inspect the stored channel metadata in the database/admin tools
when debugging.

Provider secrets are encrypted with AES-256-GCM before storage. Existing secret
fields are never returned to the browser as plaintext.

## Required Platform Environment

Platform-level WhatsApp environment values:

- `PLATFORM_SECRETS_ENCRYPTION_KEY`: encrypts per-store Whapi tokens.
- `NEXT_PUBLIC_APP_URL`: stable absolute webhook/customer links.
- `WHAPI_PARTNER_API_TOKEN`: Whapi partner manager API token.
- `WHAPI_PROJECT_ID`: Whapi project id used for managed channels.
- `WHAPI_PARTNER_API_BASE`: defaults to `https://manager.whapi.cloud`.
- `WHAPI_GATE_API_BASE`: defaults to `https://gate.whapi.cloud`.
- `WHAPI_MANAGED_CHANNEL_EXTEND_DAYS`: defaults to `5`; raise it only when the Whapi partner balance can cover the requested days for each new channel.
- `WHAPI_CHANNEL_RENEW_LOOKAHEAD_HOURS`: defaults to `24`; renew existing active store channels before expiry.
- `WHAPI_CHANNEL_RENEW_COOLDOWN_HOURS`: defaults to `20`; prevents repeated renewal attempts for the same channel.

Optional, for durable async AI worker mode:

- `AI_PROCESSING_MODE=outbox`
- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`
- `CRON_SECRET`

Leave `AI_PROCESSING_MODE` unset (`sync`) until the worker is provisioned.

## Automatic Channel Renewal

Render Blueprint defines the hourly `smartstore-ai-whapi-renewals` Cron Job. If
you configure it manually, schedule this protected endpoint hourly:

```text
POST https://smartstore-ai.com/api/maintenance/whapi-renewals
Authorization: Bearer <MAINTENANCE_SECRET or CRON_SECRET>
```

It extends only existing Whapi channels whose store subscription and WhatsApp
feature are active. If Whapi reports the channel is missing, the local connection
is marked disconnected instead of creating a replacement channel.

## Database Requirements

Apply all migrations before production traffic. WhatsApp activation depends on:

- `channel_connections` containing one active `whatsapp` row per organization.
- `channel_connections.config.provider = 'whapi'`.
- `channel_connections.config.channelId` matching the Whapi channel id.
- `channel_connections.config.encryptedApiToken` storing the encrypted Whapi
  channel token.
- `channel_connections.config.webhookSecret` matching the secret in the webhook
  URL.

## Smoke Test

1. Use the store dashboard QR flow.
2. Send a WhatsApp message from the customer phone to the connected Whapi number.
3. Confirm `/api/whatsapp/webhook` logs `Whapi WhatsApp webhook received`.
4. Confirm `Whapi outbound reply sent` appears and the customer receives it.
5. Change an order status in the dashboard and confirm the customer receives the
   WhatsApp notification through the same conversation.

## Incoming Messages

The shared route `/api/whatsapp/webhook`:

1. Parses Whapi inbound events.
2. Verifies the per-store webhook secret.
3. Resolves exactly one active store by Whapi `channelId`.
4. Passes the message to the shared conversation engine.
5. Sends the reply through Whapi.

## Isolation And Safety

- Each store is resolved by its Whapi channel id.
- API tokens are encrypted and never returned to the browser.
- Secrets are not written to logs.
- A store without valid Whapi credentials remains inactive.
- Retryable processing returns HTTP 503 without exposing provider details.
- Conversation, guardrail, catalog, pricing, and order logic are independent
  from the provider implementation.
