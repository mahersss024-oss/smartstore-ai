# SmartStore AI Documentation Index

This folder separates current operating documentation from historical audit
evidence. Use this index to avoid treating old generated reports as the current
source of truth.

## Canonical Production Readiness

- `maximum-production-certification-plan.md` is the mandatory certification
  plan before claiming full production readiness.
- `certification/README.md` is the active evidence folder for executing the
  certification plan phase by phase.
- `certification/owner-confirmations-needed.md` lists the external confirmations
  required before Phase -1 can be certified.
- `repository-map.md` is the repository inventory and should be refreshed during
  Phase 0 of certification.
- `runbooks/index.md` is the current runbook entry point.

## Current Operational References

- `architecture/overview.md`
- `architecture/database.md`
- `operations/operations.md`
- `operations/maintenance.md`
- `operations/production-operations-certification.md`
- `operations/twilio-whatsapp.md`
- `operations/production-status.md`
- `testing/index.md`
- `planning/technical-debt.md`
- `planning/development-plan.md`
- `audits/project-audit-log.md`
- `certification/README.md`
- `architecture-map.md`
- `ai-store-employee-roadmap.md`
- `brand-identity.md`
- `data-flow-map.md`
- `disaster-recovery.md`
- `local-acceptance-checklist.md`
- `post-deployment-validation.md`
- `rollback-plan.md`
- `tenant-flow-map.md`

## Historical Audit Evidence

Generated reports from 2026-06-08 are archived in:

- `archive/2026-06-08/`

The detailed project changelog from 2026-06-07 is archived in:

- `archive/2026-06-07/project-changelog.md`

These reports are useful as historical evidence, but they should not override
the current certification plan or fresh audit results.

## Documentation Hygiene

- Keep one current source of truth per topic.
- Archive old generated reports instead of deleting them.
- Update this index when adding, moving, or retiring documentation.
- Do not store secrets, private customer data, or screenshots with exposed
  credentials in documentation.
