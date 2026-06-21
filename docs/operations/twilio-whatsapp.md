# Twilio WhatsApp Operations

Date: 2026-06-20

Twilio is the only WhatsApp provider supported by the application.

## Activation Checklist

Use this checklist for each merchant store before enabling WhatsApp traffic.

### 1. Twilio Console

Collect the following values from the merchant's Twilio account or subaccount:

- Account SID: starts with `AC`.
- Auth Token: the matching secret for the Account SID.
- WhatsApp sender: must be written as `whatsapp:+15551234567`.
- Messaging Service SID: optional, starts with `MG`.

Configure the sender inbound webhook in Twilio:

```text
Method: POST
URL: https://www.smartstore-ai.com/api/twilio/webhook
```

If a Messaging Service is used, configure the same webhook on the Messaging
Service sender or inbound settings, depending on the Twilio console screen.

### 2. SmartStore Store Dashboard

Open:

```text
Dashboard -> Settings -> WhatsApp / Customer Channels
```

Enter:

- Twilio Account SID.
- Twilio Auth Token.
- Twilio WhatsApp sender in `whatsapp:+number` format.
- Optional Messaging Service SID.

Then save the WhatsApp settings. The save action verifies the submitted Account
SID and Auth Token against Twilio before marking the store connection active.

### 3. Required Platform Environment

WhatsApp messaging itself does not require platform-wide Twilio credentials,
because each store stores its own encrypted Twilio connection.

The platform still requires:

- `PLATFORM_SECRETS_ENCRYPTION_KEY`: encrypts merchant Twilio Auth Tokens.
- `NEXT_PUBLIC_APP_URL`: used to render stable absolute webhook and customer
  links.

Optional variables for web customer phone OTP only:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`

Optional variables for the durable async AI worker mode:

- `AI_PROCESSING_MODE=outbox`
- `QSTASH_TOKEN`
- `QSTASH_CURRENT_SIGNING_KEY`
- `QSTASH_NEXT_SIGNING_KEY`
- `CRON_SECRET`

Leave `AI_PROCESSING_MODE` unset or set to `sync` until the async worker
variables are available.

### 4. Database Requirements

Apply all migrations before production traffic. WhatsApp activation depends on:

- `channel_connections` containing one `whatsapp` row per organization.
- `channel_connections.config.provider = "twilio"`.
- Encrypted store Auth Token saved under the connection config.
- Active sender numbers remaining unique across active stores.

For async AI mode, also apply the `ai_inbound_jobs` migration.

### 5. Smoke Test

After saving the settings:

1. Send a WhatsApp message to the Twilio sender from a customer phone.
2. Confirm Twilio logs show a successful webhook request to
   `/api/twilio/webhook`.
3. Confirm the SmartStore customer conversation receives the inbound message.
4. Confirm the AI response is sent back through Twilio.
5. Confirm order status notifications are sent to the same WhatsApp thread.

## Store Configuration

Each store configures:

- Twilio Account SID (`AC...`).
- Twilio Auth Token, encrypted with AES-256-GCM before database storage.
- Twilio WhatsApp sender in `whatsapp:+number` format.
- Optional Messaging Service SID (`MG...`).

The store settings action verifies newly submitted credentials against Twilio
before activating the channel. Leaving the Auth Token field blank preserves the
existing encrypted token.

## Incoming Messages

Configure the Twilio sender's incoming-message webhook as:

```text
POST https://www.smartstore-ai.com/api/twilio/webhook
```

The route:

1. Reads the Twilio recipient number.
2. Resolves exactly one active store by `twilioWhatsAppFrom`.
3. Verifies `X-Twilio-Signature` with that store's decrypted Auth Token.
4. Passes the message to the existing conversation engine.
5. Sends the generated response through the same store's Twilio account.

## Isolation And Safety

- Active Twilio WhatsApp sender numbers are unique across stores.
- A store without complete Twilio credentials remains inactive.
- Auth Tokens are never returned to the browser or written to logs.
- Provider failures return HTTP 503 for retryable processing without exposing
  provider details.
- Conversation, guardrail, catalog, pricing, and order logic are provider
  independent and unchanged.

## Environment Variables

No platform-wide environment variable is required for WhatsApp messaging.

The following variables remain optional for Twilio Verify OTP used by web
customer phone verification:

- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_VERIFY_SERVICE_SID`
