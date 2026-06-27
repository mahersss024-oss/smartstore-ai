# Production Certification Evidence

This folder contains the active certification evidence for SmartStore AI.

Certification source plan:

- `../maximum-production-certification-plan.md`

Current certification state:

- Current phase: `Phase -1: Pre-Audit Readiness Gate`
- Current phase result: `PHASE NOT CERTIFIED`
- Reason: external access, authority, production DB connectivity,
  provider/runtime-source proof, safe test data, and backup/PITR confirmations
  are not yet fully recorded.

Current executable checks:

- `npm run check:env:production -- --strict`: strict production environment
  gate. It must fail local DB URLs and Clerk development keys.
- `npm run check:runtime:production`: read-only database/runtime-settings gate.
  Run through the Render production environment to prove DB connectivity and platform
  runtime key status without printing secret values.

Active ledgers:

- `current-completion-status.md`
- `phase--1-pre-audit-readiness.md`
- `phase-0-baseline-inventory.md`
- `phase-1-baseline-quality-gates.md`
- `access-checklist.md`
- `evidence-ledger.md`
- `defect-ledger.md`
- `risk-decision-ledger.md`
- `test-data-inventory.md`
- `smoke-test-safety.md`
- `rollback-readiness.md`
- `gate-status-ledger.md`
- `owner-confirmations-needed.md`
- `review-ledger.md`

Rules:

- Do not paste secrets into these files.
- Do not include screenshots with exposed keys, tokens, customer private data,
  or provider credentials.
- Each claim must cite source, runtime, build, test, log, database, or deployment
  evidence.
- Keep the code target commit separate from later documentation evidence commits.
