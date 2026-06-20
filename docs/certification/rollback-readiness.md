# Rollback Readiness Note

Date started: 2026-06-13

Status: incomplete.

## Current Known Rollback References

- Operational rollback guidance: `docs/operations/operations.md`.
- Dedicated rollback plan: `docs/rollback-plan.md`.
- Current target code commit for first audit pass: `880c252`.
- Current branch: `main`.
- Current inspected production deployment ID:
  `dpl_4JwJ1V73ZjBjijNuGXMtcDh8ie4E`.
- Current inspected production deployment URL:
  `https://martstore-hofr1qzmk-maher-s-smartstore-ai.vercel.app`.
- Current production alias: `https://www.smartstore-ai.com`.

## Required Confirmations

- [ ] Vercel deployment rollback process confirmed.
- [x] Current production deployment ID recorded.
- [x] Vercel rollback status command available and showed no rollback in
  progress.
- [ ] Database backup/PITR status confirmed.
- [ ] Restore drill status confirmed.
- [ ] Owner authorized to trigger rollback.
- [ ] Previous deploy compatibility with current database schema confirmed.
- [ ] Secret rotation rollback process confirmed.
- [ ] Meta WhatsApp webhook rollback process confirmed.
- [ ] Clerk/Stripe webhook rollback impact understood.

## Current Rollback Blocker

Rollback authority and provider-level rollback path are not fully documented.
Phase -1 remains `PHASE NOT CERTIFIED` until this is resolved or explicitly
accepted as a risk with owner and mitigation.
