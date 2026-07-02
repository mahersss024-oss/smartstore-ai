# Phase 8: Platform Admin And Store Admin Audit

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`PHASE NOT CERTIFIED`

This phase added focused regression coverage for store WhatsApp credential
handling and recorded existing platform-admin coverage. It is not certified yet
because the complete admin authorization and secrets matrix is not executable.

## Source Trace

### Platform admin runtime and AI provider keys

Source evidence:

- `src/features/admin/PlatformAdminActions.ts`
- `src/libs/PlatformRuntimeConfig.ts`
- `src/libs/PlatformAIProviderConfig.ts`
- `src/libs/PlatformAdmin.ts`

Behavior:

- Platform runtime secrets and AI provider keys require platform service
  permission.
- Saved platform runtime secrets are encrypted before persistence.
- Saved platform AI provider API keys are encrypted before persistence.
- Empty platform AI provider key updates keep the existing encrypted key.
- Switching provider types does not silently reuse incompatible endpoints or
  stale keys.
- Platform admin mutations write audit logs for store control operations.

Test evidence:

- `src/features/admin/PlatformAdminActions.test.ts`

### Store admin WhatsApp credentials

Source evidence:

- `src/features/dashboard/StoreSettingsActions.ts`
- `src/libs/TwilioWhatsApp.ts`
- `src/utils/CustomerChannels.ts`

Behavior:

- Store admin saves WhatsApp phone number, phone number ID, business account ID,
  display number, mode, and access token through `saveWhatsAppSettings`.
- New access tokens are encrypted before they reach the saved channel config.
- Leaving the access-token field blank keeps the existing encrypted token.
- Runtime WhatsApp sending decrypts legacy encrypted access token from the store channel
  connection.
- The channel connection is scoped by active organization and channel.

Test evidence:

- `src/features/dashboard/StoreSettingsActions.test.ts`

## Verification Commands

| Command | Result |
| --- | --- |
| `npm test -- src/features/dashboard/StoreSettingsActions.test.ts src/features/admin/PlatformAdminActions.test.ts` | pass: 2 files, 16 tests |
| `npm run check:types` | pass |

## Confirmed Findings

### D-0016: full admin and secrets matrix remains incomplete

Root cause:

- Focused platform-admin and WhatsApp credential tests exist, but the complete
  Phase 8 matrix is not executable across every admin route and mutation.

Impact:

- Platform Admin Gate, Store Admin Gate, and Secrets Gate cannot be certified.

Affected areas:

- Store admin cannot edit platform runtime keys.
- Platform service permission required for every platform key mutation.
- Store admin cannot access another store's settings.
- WhatsApp store credentials are encrypted across every save path.
- Empty credential update does not erase existing secret across full settings
  save and focused WhatsApp save.
- Clear credential checkbox behavior is not implemented as a tested explicit
  operation.

Fix:

- Add executable authorization and credential-preservation tests around all
  platform admin actions and store settings actions; implement explicit clear
  behavior only if product requirements require it.

Verification:

- Focused tests pass for platform key encryption, platform key preservation,
  WhatsApp token encryption, and WhatsApp token preservation.
- Full matrix remains pending.

Regression prevention:

- Keep the new `StoreSettingsActions.test.ts` in the Store Admin Gate and extend
  it before modifying store settings forms or WhatsApp credential handling.

## Carried Blockers

- D-0001: production/provider authority and access confirmations incomplete.
- D-0002: Clerk production keys not proven; Vercel reports development keys.
- D-0003: WhatsApp runtime-source proof blocked by DB connectivity.
- D-0004: Vercel Production `DATABASE_URL` resolves to `127.0.0.1:5433`.
- D-0007: lint still reports 333 warnings.
- D-0008: large cross-channel orchestration hotspots remain.
- D-0009: full multi-tenant scenario suite remains incomplete.
- D-0010: WhatsApp live production parity is not certified.
- D-0011: full web customer journey coverage is incomplete.
- D-0013: full order integrity matrix remains incomplete.
- D-0015: full adversarial AI matrix remains incomplete.

## Exit Decision

Phase 8 cannot be certified yet. The most important WhatsApp credential
preservation behavior is now covered, and platform key encryption coverage
already exists, but the full admin authorization and secrets matrix is not
complete.
