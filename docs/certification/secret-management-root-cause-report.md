# Secret Management Root Cause Report

Date: 2026-06-14

Status: fixed in code, verified by local production gates, deployed to
production, and smoke-tested.

## Scope

This investigation traced project secrets and tokens from entry to persistence,
retrieval, and runtime use across environment variables, platform runtime
settings, store WhatsApp settings, provider webhooks, services, and operational
jobs.

## Data Flow Diagram

```text
Platform runtime keys
Admin UI password input
  -> updatePlatformRuntimeConfig
  -> encryptSecret AES-256-GCM
  -> platform_settings.value jsonb
  -> getPlatformRuntimeConfig
  -> decryptSecret
  -> WhatsApp webhook / AI employee webhook / maintenance route

Platform AI provider key
Admin UI password input
  -> updatePlatformAIProviderConfig
  -> encryptSecret AES-256-GCM
  -> platform_settings.value jsonb
  -> getPlatformAIProviderConfig
  -> decryptSecret
  -> PlatformAIClient Authorization header

Store WhatsApp access token
Store settings password input
  -> saveStoreSettings or saveWhatsAppSettings
  -> encryptSecret AES-256-GCM
  -> channel_connections.config jsonb
  -> findWhatsAppStoreConnection
  -> decryptSecret
  -> Whapi API Authorization header

Environment-only provider keys
Render environment variable
  -> Env validation
  -> runtime service module
  -> provider SDK/API request
```

## Secret Inventory

| Secret | Entry point | Storage | Encryption | Retrieval/use |
| --- | --- | --- | --- | --- |
| `PLATFORM_SECRETS_ENCRYPTION_KEY` | Render env | Environment only | Not encrypted; active root key | `getPrimaryEncryptionSecret` in `src/libs/PlatformAIProviderConfig.ts` |
| `PLATFORM_SECRETS_PREVIOUS_ENCRYPTION_KEYS` | Render env | Environment only | Not encrypted; comma-separated decrypt-only rotation keyring | `getPreviousEncryptionSecrets` in `src/libs/PlatformAIProviderConfig.ts` |
| `CLERK_SECRET_KEY` | Render env | Environment only | Not encrypted | Clerk server SDK and legacy decrypt fallback |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Render env | Public frontend env | Public by design | Clerk frontend auth |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Render env / Clerk SDK | Environment only | Not encrypted by app | Clerk webhook verification via Clerk SDK |
| Platform AI API key | Admin form | `platform_settings.value.encryptedApiKey` | AES-256-GCM reversible encryption | `getPlatformAIProviderConfig` -> `PlatformAIClient` |
| Store Whapi API token | Store settings form or managed QR connect | `channel_connections.config.encryptedApiToken` | AES-256-GCM reversible encryption | Whapi outbound send |
| `WHAPI_PARTNER_API_TOKEN` | Render env | Environment only | Not encrypted by app | Managed Whapi project/channel creation |
| `WHAPI_PROJECT_ID` | Render env | Environment only | Not encrypted by app | Managed Whapi project selection |
| `AI_EMPLOYEE_WEBHOOK_SECRET` | Admin runtime form or Render env | `platform_settings.value.internal.encryptedAIEmployeeWebhookSecret` or env | AES-256-GCM when DB-backed | `/api/ai-employee/messages` header comparison |
| `MAINTENANCE_SECRET` | Admin runtime form or Render env | `platform_settings.value.internal.encryptedMaintenanceSecret` or env | AES-256-GCM when DB-backed | `/api/maintenance/cleanup` bearer token |
| `STRIPE_SECRET_KEY` | Render env | Environment only | Not encrypted by app | Stripe SDK |
| `STRIPE_WEBHOOK_SECRET` | Render env | Environment only | Not encrypted by app | Stripe webhook signature verification |
| `MOYASAR_SECRET_KEY` | Render env | Environment only | Not encrypted by app | Moyasar Basic auth |
| `BETTER_STACK_SOURCE_TOKEN` | Render env | Environment only | Not encrypted by app | Log forwarding Authorization header |
| `SENTRY_AUTH_TOKEN` | Render env | Environment/build only | Not encrypted by app | Sentry source-map upload |
| `NEXT_PUBLIC_SENTRY_DSN` | Render env | Public frontend env | Public DSN by design | Sentry client/server initialization |

## Encryption Findings

- Algorithm: AES-256-GCM.
- Key derivation: SHA-256 hash of `PLATFORM_SECRETS_ENCRYPTION_KEY`; legacy
  fallback uses SHA-256 hash of `CLERK_SECRET_KEY`.
- Rotation: new values are encrypted only with the active root; decryption tries
  the active root, optional previous roots, and the legacy Clerk root. This
  permits staged rotation without losing existing encrypted credentials.
- Stored payload format: `base64url(iv).base64url(authTag).base64url(ciphertext)`.
- IV is present in the stored payload.
- Auth tag is present in the stored payload.
- Encryption is reversible, not a hash.
- Database fields are `jsonb`, so the inspected secret payloads are not subject
  to `varchar` truncation.

## Root Cause

Confirmed issue from the earlier provider implementation: legacy store WhatsApp
access-token handling could treat an old plain-token field as usable without
proving that it was a raw token. The current Whapi-only implementation uses
`encryptedApiToken` and does not reuse legacy provider token fields.

The risky paths were:

- `src/features/dashboard/StoreSettingsActions.ts:522`
- `src/features/dashboard/StoreSettingsActions.ts:714`
- legacy provider send path
- `src/app/[locale]/(auth)/dashboard/settings/page.tsx:290`

Before the fix, when a store saved WhatsApp settings with the token field blank,
the code preserved an encrypted credential correctly when present. If the
encrypted credential was absent, it encrypted any non-empty legacy plain-token
field. That was safe only for real legacy raw tokens. It was unsafe for masked
previews, all-star placeholders, or already encrypted payloads accidentally
stored under the legacy key.

Impact:

- A masked preview could be encrypted and stored as if it were a valid provider
  access token.
- A masked preview could mark WhatsApp as configured in the store UI.
- A masked preview could be returned by the connection lookup and sent to the
  provider as an Authorization bearer token.
- This would cause outbound WhatsApp sends to fail even while the UI looked
  configured.

## Fix

Implemented strict secret classification:

- `isEncryptedSecretPayload`
- `isMaskedSecretPreview`
- `getReusablePlainSecret`

Store save paths now:

- Keep a real encrypted credential as-is.
- Preserve an encrypted payload found in the old plain-token slot without
  double-encrypting it.
- Encrypt only a reusable legacy plain token.
- Reject masked/all-star previews as unusable credentials.

Runtime lookup now:

- Decrypts the encrypted credential first.
- Falls back only to a reusable legacy plain token.
- Ignores masked previews and encrypted-looking legacy values.

Store UI readiness now uses the same usable-token rules.

## Runtime Verification Logging

Added `src/libs/SecretDiagnostics.ts`.

It is disabled by default. When `SECRET_DIAGNOSTICS_ENABLED=true`, it logs only:

- `inputLength`
- `storedLength`
- `retrievedLength`
- `decryptedLength`

It never logs secret values.

Instrumented lifecycle points:

- `whatsapp.access_token.save_full_settings`
- `whatsapp.access_token.save_whatsapp_settings`
- `whatsapp.access_token.retrieve_encrypted`
- `whatsapp.access_token.retrieve_legacy_plain`
- `whatsapp.access_token.retrieve_missing`

## Production Safety

Source review evidence:

- Platform runtime and AI forms use password inputs and display only previews.
- Store WhatsApp token input is password-only and not prefilled.
- `NEXT_PUBLIC_*` variables are the only secrets intentionally exposed to the
  frontend, and the Clerk publishable key plus Sentry DSN are public by design.
- No provider access token is written to `localStorage` or `sessionStorage`;
  those stores are used only for UI visibility/recovery and guest/thread ids.
- Webhook and maintenance routes compare secrets with `secureTokenEquals`.
- Provider request logs redact the exact configured AI provider key regardless
  of prefix, also redact residual `sk-*` patterns, and do not log Authorization
  headers.

## Verification

Focused verification passed:

```text
npm test -- src/libs/PlatformAIProviderConfig.test.ts src/features/dashboard/StoreSettingsActions.test.ts src/libs/TwilioWhatsApp.test.ts

3 files passed
11 tests passed
```

Full verification passed:

```text
npm run check:types
npm run lint
npm test
npm run check:deps
npm run check:i18n
npm run build
npm run test:e2e
git diff --check
```

Results:

- 76 unit/integration test files passed.
- 463 unit/integration tests passed.
- 18 Chromium E2E tests passed.
- Production build compiled successfully and generated 88 static pages.
- Dependency and i18n gates passed.
- `git diff --check` returned only Windows line-ending notices.
- Production deployment `dpl_C1Eb5HowT7GvH9yXzVjw5QEJFJNX` is Ready.
- Production smoke passed for `https://www.smartstore-ai.com`.
- Vercel error-log sample returned no error logs.

## Regression Prevention

Added tests proving:

- AES-GCM roundtrip works.
- Ciphertext encrypted with a previous root remains readable through the
  decrypt-only rotation keyring.
- Invalid ciphertext returns undefined instead of crashing.
- Encrypted payloads and masked previews are identified before reuse.
- Blank WhatsApp token fields preserve existing encrypted tokens.
- New WhatsApp tokens are encrypted and raw values are not stored.
- Legacy raw tokens are migrated to encrypted storage.
- Masked legacy WhatsApp tokens are not treated as usable.
- Connection lookup decrypts stored encrypted tokens.
- Connection lookup rejects masked legacy tokens.
