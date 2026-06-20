# Twilio WhatsApp Operations

Date: 2026-06-20

Twilio is the only WhatsApp provider supported by the application.

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
