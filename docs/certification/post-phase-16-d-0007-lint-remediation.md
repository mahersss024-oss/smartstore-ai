# Post Phase 16 D-0007 Lint Remediation

Date: 2026-06-13

Status: D-0007 fixed

## Root Cause

Baseline lint was allowed to pass while still emitting 333 warnings. Most warnings
were mechanical Tailwind class ordering and line-wrapping issues. Two remaining
non-mechanical categories required source changes:

- `RealtimeDashboardStatus.tsx` synchronously called `setIsOnline` inside
  `useEffect`.
- `WebOrderChat.e2e.ts` used conditional branches inside the Playwright test
  body for optional enabled-button clicks.

## Impact

The warnings did not block build or runtime behavior, but they made lint output
noisy enough to hide new warning regressions.

## Fix

- Ran `npm run lint -- --fix` for mechanical ESLint fixes.
- Initialized realtime online state from a guarded lazy `navigator.onLine` value
  and removed the synchronous effect setter.
- Added `clickEnabledButtonIfAvailable` in the web-order E2E test and replaced
  the two conditional branches in the test body.

## Verification

- `npm run lint`: passed with 0 warnings.
- `npm run check:types`: passed.
- `npm test`: passed outside the managed sandbox after sandbox `spawn EPERM`;
  67 files and 394 tests passed.
- `npm run build`: passed outside the managed sandbox after sandbox
  `spawn EPERM`; 88 static pages generated.
- `git diff --check`: exited 0.

## Regression Prevention

Lint remains part of the baseline gate. New warnings should be treated as
regressions before they accumulate.
