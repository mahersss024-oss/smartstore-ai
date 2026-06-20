# Phase 1: Baseline Quality Gates

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`PHASE NOT CERTIFIED`

The local baseline quality gates are now passing, but this phase is not marked
certified because Phase -1 production blockers remain open and lint still emits
333 warnings. Execution continues under `R-0007`.

## Commands And Results

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run check:types` | pass |
| Unit/UI tests | `npm test` | pass: 60 files, 355 tests |
| i18n | `npm run check:i18n` | fixed, then pass |
| Dependency/dead export check | `npm run check:deps` | fixed, then pass |
| Lint | `npm run lint` | pass with 333 warnings |
| Build | `npm run build` | pass |
| Production env validation | `npm run check:env:production -- --demo` | pass with production warnings |
| Read-only production smoke | `npm run smoke:production -- --base-url=https://www.smartstore-ai.com --organization-id=org_3EBLVeHRaYimicJRmAZADwEprZz` | pass |

## Fixed During Phase 1

### D-0005: i18n false unused-key failure

Root cause:

- `CustomersPage.review_sentiment_*` keys were used through a dynamically
  generated key string, which `i18n-check` could not prove.

Impact:

- `npm run check:i18n` failed even though runtime page behavior had labels.

Affected files:

- `src/app/[locale]/(auth)/dashboard/customers/[customerId]/page.tsx`
- `src/locales/ar.json`
- `src/locales/en.json`
- `src/locales/fr.json`

Fix:

- Changed the customer page to call each review sentiment translation key
  explicitly and map the rating to the already translated label.

Verification:

- `npm run check:i18n` passed.
- `npm run check:types` passed.
- `npm test` passed 355 tests.

Regression prevention:

- Keep dynamic translation choices backed by explicit `t('literal_key')` calls.

### D-0006: internal helpers exported as public module API

Root cause:

- `normalizeCustomerPhoneDigits`, `getStoredPlatformRuntimeConfig`, and
  `sendWhatsAppTextMessage` were exported even though source search showed only
  same-file internal usage.

Impact:

- `npm run check:deps` failed with unused export findings.

Affected files:

- `src/libs/CustomerIdentity.ts`
- `src/libs/PlatformRuntimeConfig.ts`
- `src/libs/TwilioWhatsApp.ts`

Fix:

- Removed `export` while preserving each function and its internal callers.

Verification:

- `npm run check:deps` passed.
- `npm run check:types` passed.
- `npm test -- src/libs/TwilioWhatsApp.test.ts src/libs/CustomerSummaries.test.ts src/libs/ProductionEnvValidationScript.test.ts` passed 27 tests.
- Full `npm test` passed 355 tests.

Regression prevention:

- Keep helpers private unless another module imports them or a documented public
  contract requires the export.

## Remaining Phase 1 Warnings

- `npm run lint` exits 0 with 333 warnings.
- Most warnings are Tailwind class-order and line-wrapping style issues.
- Remaining non-style warnings observed:
  - `src/features/dashboard/RealtimeDashboardStatus.tsx`: synchronous state set
    in effect.
  - `tests/e2e/WebOrderChat.e2e.ts`: conditional logic in tests.

These warnings are tracked as `D-0007` and will be cleaned in a dedicated hygiene
pass to avoid broad unrelated UI churn during baseline certification.

## Carried Production Blockers

- D-0001: production/provider authority and access confirmations incomplete.
- D-0002: Clerk production keys not proven; Vercel reports development keys.
- D-0003: WhatsApp runtime-source proof blocked by DB connectivity.
- D-0004: Vercel Production `DATABASE_URL` resolves to `127.0.0.1:5433`.

## Exit Decision

Phase 1 is useful as a passing local code baseline, but cannot be certified for
production while carried blockers remain and lint warning debt is open.

