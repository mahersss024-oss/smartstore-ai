# WhatsApp Operations (Meta Cloud API)

WhatsApp runs on the **Meta WhatsApp Cloud API**. Each store connects its own
phone number; the platform sends and receives on the store's behalf using the
store's encrypted access token.

## Activation Checklist

Use this checklist for each merchant store before enabling WhatsApp traffic.

### 1. Meta WhatsApp setup

From the store's Meta app (developers.facebook.com → WhatsApp → API Setup),
collect:

- **Phone Number ID**: numeric id of the WhatsApp sender number.
- **Access Token**: a temporary token works for testing; use a **System User
  token** for production (temporary tokens expire in 24h).
- **WhatsApp Business Account ID (WABA)**: optional, for reference.
- **Display phone number**: the human-readable number (e.g. `+9665…`), used for
  the public `wa.me` link.

### 2. Platform webhook (one-time, per Meta app)

In the Meta app → WhatsApp → Configuration → Webhook:

```text
Callback URL: https://smartstore-ai.com/api/whatsapp/webhook
Verify token: the value of META_WEBHOOK_VERIFY_TOKEN
```

Then subscribe to the **`messages`** field. The platform must already be
deployed with `META_WEBHOOK_VERIFY_TOKEN` set, or verification fails.

### 3. SmartStore store dashboard

```text
Dashboard -> Settings -> WhatsApp / Customer Channels
```

Enter the Phone Number ID, Access Token, display phone number, and optional WABA
id, then save. The access token is encrypted (AES-256-GCM) before storage;
leaving it blank preserves the existing encrypted token.

### 4. Required platform environment

WhatsApp messaging does not require platform-wide store credentials (each store
holds its own encrypted token). The platform requires:

- `PLATFORM_SECRETS_ENCRYPTION_KEY`: encrypts per-store access tokens.
- `META_APP_SECRET`: verifies the `X-Hub-Signature-256` on inbound webhooks.
- `META_WEBHOOK_VERIFY_TOKEN`: the webhook verification handshake token.
- `NEXT_PUBLIC_APP_URL`: stable absolute webhook/customer links.

Optional, for the durable async AI worker mode: `AI_PROCESSING_MODE=outbox`,
`QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`,
`CRON_SECRET`. Leave `AI_PROCESSING_MODE` unset (`sync`) until provisioned.

### 5. Database requirements

Apply all migrations before production traffic. WhatsApp activation depends on:

- `channel_connections` containing one `whatsapp` row per organization.
- `channel_connections.config.provider = "meta"`.
- Encrypted store access token + `phoneNumberId` under the connection config.

### 6. Smoke test

1. Verify the customer phone as a recipient (Cloud API test numbers only allow
   verified recipients).
2. Send a WhatsApp message from the customer phone to the store's number.
3. Confirm `/api/whatsapp/webhook` logs `Meta WhatsApp webhook received`.
4. Confirm the AI reply is delivered (`Meta outbound reply sent`).
5. Confirm order status notifications reach the same WhatsApp thread.

## Incoming messages

The route `/api/whatsapp/webhook`:

1. Verifies `X-Hub-Signature-256` with `META_APP_SECRET`.
2. Parses the message (text or tapped interactive button/list reply).
3. Resolves exactly one active store by the webhook's `phone_number_id`.
4. Passes the message to the shared conversation engine.
5. Delivers the reply via the store's token — as interactive reply buttons /
   list picker where applicable, falling back to text.

## Isolation and safety

- Each store is resolved by its own `phoneNumberId`; access tokens are never
  returned to the browser or written to logs.
- A store without a phone number id + access token remains inactive.
- Signature verification uses the platform app secret; failures return 401.
- Retryable processing returns HTTP 503 without exposing provider details.
- Conversation, guardrail, catalog, pricing, and order logic are
  provider-independent.

## Roadmap

The store dashboard form is a manual connect surface. The low-friction
**Embedded Signup** popup (store taps once, connects its own number) is the
intended production onboarding and requires platform Business Verification.
