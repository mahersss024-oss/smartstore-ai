# Phase 12: Dead Code And Dependency Forensics

Date started: 2026-06-13

Plan reference:

- `docs/maximum-production-certification-plan.md`

## Phase Result

`PHASE NOT CERTIFIED`

This phase did not delete source code. The automated dependency and unused
export check currently passes, and the route inventory was re-collected, but
the full runtime-use proof required before safe deletion is not complete.
The deletion-candidate process is now recorded in
`docs/certification/deletion-candidate-register.md`.

## Source And Tool Evidence

### Dependency and dead export check

Command evidence:

- `npm run check:deps`

Result:

- pass
- `knip` produced no findings in this run.

Impact:

- No currently proven unused exports, files, or dependencies were identified by
  the configured static dependency checker.

### Route convention inventory

Command evidence:

- `Get-ChildItem -Path src\app -Recurse -File | Where-Object { $_.Name -match '^(page|layout|route|loading|error|not-found)\.(ts|tsx)$' }`

Result:

- 52 route convention files were found under `src/app`.

Inventory:

- `src/app/api/ai-employee/messages/route.ts`
- `src/app/api/clerk/webhooks/route.ts`
- `src/app/api/maintenance/cleanup/route.ts`
- `src/app/api/payments/moyasar/callback/route.ts`
- `src/app/api/stripe/webhooks/route.ts`
- `src/app/api/twilio/webhook/route.ts`
- `src/app/[locale]/error.tsx`
- `src/app/[locale]/layout.tsx`
- `src/app/[locale]/not-found.tsx`
- `src/app/[locale]/(auth)/layout.tsx`
- `src/app/[locale]/(auth)/(center)/layout.tsx`
- `src/app/[locale]/(auth)/(center)/sign-in/page.tsx`
- `src/app/[locale]/(auth)/(center)/sign-in/[...sign-in]/page.tsx`
- `src/app/[locale]/(auth)/(center)/sign-up/page.tsx`
- `src/app/[locale]/(auth)/(center)/sign-up/[...sign-up]/page.tsx`
- `src/app/[locale]/(auth)/admin/layout.tsx`
- `src/app/[locale]/(auth)/admin/loading.tsx`
- `src/app/[locale]/(auth)/admin/page.tsx`
- `src/app/[locale]/(auth)/admin/stores/[organizationId]/page.tsx`
- `src/app/[locale]/(auth)/dashboard/layout.tsx`
- `src/app/[locale]/(auth)/dashboard/loading.tsx`
- `src/app/[locale]/(auth)/dashboard/page.tsx`
- `src/app/[locale]/(auth)/dashboard/ai-operations/page.tsx`
- `src/app/[locale]/(auth)/dashboard/archive/page.tsx`
- `src/app/[locale]/(auth)/dashboard/customers/page.tsx`
- `src/app/[locale]/(auth)/dashboard/customers/archive/page.tsx`
- `src/app/[locale]/(auth)/dashboard/customers/archived/page.tsx`
- `src/app/[locale]/(auth)/dashboard/customers/[customerId]/page.tsx`
- `src/app/[locale]/(auth)/dashboard/launch-readiness/page.tsx`
- `src/app/[locale]/(auth)/dashboard/orders/page.tsx`
- `src/app/[locale]/(auth)/dashboard/orders/archive/page.tsx`
- `src/app/[locale]/(auth)/dashboard/orders/archived/page.tsx`
- `src/app/[locale]/(auth)/dashboard/organization-profile/organization-members/page.tsx`
- `src/app/[locale]/(auth)/dashboard/organization-profile/[[...organization-profile]]/page.tsx`
- `src/app/[locale]/(auth)/dashboard/payments/page.tsx`
- `src/app/[locale]/(auth)/dashboard/products/page.tsx`
- `src/app/[locale]/(auth)/dashboard/products/archive/page.tsx`
- `src/app/[locale]/(auth)/dashboard/products/archived/page.tsx`
- `src/app/[locale]/(auth)/dashboard/products/new/page.tsx`
- `src/app/[locale]/(auth)/dashboard/products/[productId]/edit/page.tsx`
- `src/app/[locale]/(auth)/dashboard/revenue/page.tsx`
- `src/app/[locale]/(auth)/dashboard/settings/page.tsx`
- `src/app/[locale]/(auth)/dashboard/subscription/page.tsx`
- `src/app/[locale]/(auth)/dashboard/user-profile/[[...user-profile]]/page.tsx`
- `src/app/[locale]/(auth)/onboarding/organization-selection/page.tsx`
- `src/app/[locale]/(marketing)/page.tsx`
- `src/app/[locale]/(marketing)/connect/[organizationId]/page.tsx`
- `src/app/[locale]/(marketing)/privacy/page.tsx`
- `src/app/[locale]/(marketing)/terms/page.tsx`
- `src/app/[locale]/(marketing)/track/[organizationId]/[orderId]/page.tsx`
- `src/app/[locale]/(marketing)/web-order/[organizationId]/page.tsx`
- `src/app/[locale]/[...unmatched]/page.tsx`

### Dynamic import and runtime-use scan

Command evidence:

- `rg -n "import\(|require\(|process\.env|eval\(|new Function|TODO|FIXME|deprecated|unused|dead code|placeholder" src scripts tests docs\certification -g "*.ts" -g "*.tsx" -g "*.mjs" -g "*.md"`

Findings:

- Dynamic imports are used primarily in tests to load modules after mocks are
  configured.
- `src/libs/I18n.ts` intentionally uses dynamic locale JSON imports.
- `process.env` usage is concentrated in environment validation scripts,
  E2E/test bootstrap, `src/libs/Env.ts`, instrumentation, and public URL helper
  code.
- No `eval(` or `new Function` usage was found in the scanned source.
- The only direct deprecation finding is the compatibility field comment in
  `src/types/Subscription.ts`.

### Suppression scan

Command evidence:

- `rg -n "@ts-ignore|@ts-expect-error|eslint-disable|knipignore|c8 ignore|istanbul ignore|noqa" src scripts tests -g "*.ts" -g "*.tsx" -g "*.mjs"`

Findings:

- No `@ts-ignore`, `@ts-expect-error`, coverage ignore, or `knipignore`
  markers were found.
- Existing `eslint-disable-next-line next/no-img-element` suppressions are
  documented inline for merchant-provided image URLs, generated QR data URIs,
  and admin previews.
- Type-definition files contain narrowly scoped ESLint suppressions for
  interface style.

## Deletion Decision

No deletion was performed.

Reason:

- A deletion requires proof of no direct references, no dynamic references, no
  runtime use, no production dependency, and no documented future dependency.
- The current static tool evidence is clean, but the full runtime proof matrix
  has not been completed for every route, server action, integration, and
  deferred UI path.

## Verification Commands

| Command | Result |
| --- | --- |
| `npm run check:deps` | pass |
| `npm run check:types` | pass |
| `git diff --check` | pass |
| `npm run lint` | pass with the known 333 warnings recorded as D-0007 |

## Confirmed Findings

### D-0022: full dead-code runtime-use proof matrix remains incomplete

Root cause:

- `knip` and source scans provide static evidence, but the project still needs a
  route-by-route and function-by-function runtime-use matrix before any file,
  component, hook, route, dependency, or helper can be certified as dead.

Impact:

- Dead Code Gate cannot be certified.
- Removing code now could break dynamic imports, Next.js convention files,
  server actions, localized routes, provider callbacks, or operational scripts.

Affected areas:

- Next.js route convention files.
- Server actions.
- Provider webhooks.
- AI, guardrail, and WhatsApp orchestration.
- Dashboard and customer UI components.
- Operational scripts and production config.

Fix:

- Build a deletion-candidate register that records direct references, dynamic
  references, runtime entrypoints, production dependency, and future dependency
  status for each candidate.
- Only delete code after the register proves all five deletion conditions and
  after the affected test/build gates pass.

Verification:

- `npm run check:deps` passes with no current findings.
- `npm run check:types` passes.
- `docs/certification/deletion-candidate-register.md` records the required
  deletion conditions and reviews current `knip.config.ts` ignore entries.
- No deletion candidates are certified yet.

Regression prevention:

- Keep `npm run check:deps` in the baseline gate.
- Require a documented deletion-candidate register before any future cleanup
  commit removes code.

## Carried Blockers

- D-0001: production/provider authority and access confirmations incomplete.
- D-0008: large cross-channel orchestration hotspots remain.
- D-0009: full multi-tenant scenario suite remains incomplete.
- D-0010: WhatsApp live production parity is not certified.
- D-0011: full web customer journey coverage is incomplete.
- D-0013: full order integrity matrix remains incomplete.
- D-0015: full adversarial AI matrix remains incomplete.
- D-0016: full admin authorization and secrets matrix remains incomplete.
- D-0017: full security and abuse matrix remains incomplete.
- D-0019: full reliability and observability matrix remains incomplete.
- D-0021: full load-test and capacity matrix remains incomplete.
- D-0022: full runtime-use proof matrix remains incomplete.
- D-0023: full cross-cutting regression matrix remains incomplete.
- D-0024: external production operations evidence remains incomplete.
- D-0025: additional mandatory production gates remain incomplete.

## Exit Decision

Phase 12 cannot be certified yet. Static dependency and unused export evidence
is clean, but safe dead-code certification requires a complete runtime-use proof
matrix before any deletion.
