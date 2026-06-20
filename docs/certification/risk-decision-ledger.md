# Risk Decision Ledger

Date started: 2026-06-13

No residual risk has been accepted for production certification yet.

| ID | Phase | Risk | Decision | Owner | Expiry / revisit | Rollback or mitigation |
| --- | --- | --- | --- | --- | --- | --- |
| R-0001 | Phase -1 | Starting Phase 0 without full provider access confirmation could produce unverifiable claims. | not accepted | Maher Alhafithi | Before Phase 0 | Keep Phase -1 as `PHASE NOT CERTIFIED` until access is confirmed. |
| R-0002 | Phase -1 | Running production smoke tests without a safety agreement could mutate real customer/order data. | not accepted | Maher Alhafithi | Before production smoke | Define safe smoke tests and test data inventory first. |
| R-0003 | Phase -1 | Running migrations or destructive tests without backup/PITR confirmation could increase recovery risk. | not accepted | Maher Alhafithi | Before migration/destructive test | Confirm backup, PITR, and restore path before destructive work. |
| R-0004 | Phase -1 | Production currently validates with Clerk development-key warnings. | not accepted | Maher Alhafithi | Before production certification | Configure Clerk live keys or explicitly classify the environment as demo/pilot with accepted limitations. |
| R-0005 | Phase -1 | WhatsApp Vercel env fallback keys are missing; platform-stored runtime keys may exist but are not proven by Phase -1 evidence. | not accepted | Maher Alhafithi | Before WhatsApp certification | Prove platform runtime key status or add Vercel env fallback keys, then rerun webhook checks. |
| R-0006 | Phase -1 | Vercel Production DB connectivity check attempted a local database URL. | not accepted | Maher Alhafithi | Before Phase 0 certification | Configure/prove managed production PostgreSQL connectivity before migrations, write tests, or production certification. |
| R-0007 | Phase -1 / Phase 0 | Continuing documentation and source-level audit work while Phase -1 remains not certified can be mistaken for production certification. | accepted for audit continuation only, not for production certification | Maher Alhafithi | Before any phase certification or production-ready claim | Carry Phase -1 blockers forward in every phase ledger; do not run destructive DB tests, production writes, migrations, or certify production until D-0001 through D-0004 and external confirmations are resolved. |
