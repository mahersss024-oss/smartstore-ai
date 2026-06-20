# Owner Confirmations Needed For Phase -1

Date started: 2026-06-13

Phase -1 cannot become `PHASE CERTIFIED` until these confirmations are recorded.
Do not paste secrets here; only record whether access and authority exist.

## Authority

- [x] Who approves code changes? Maher Alhafithi for this certification pass.
- [ ] Who approves production deployments?
- [ ] Who approves secret rotation?
- [ ] Who approves database migrations?
- [ ] Who approves database restore/rollback?
- [ ] Who approves production smoke tests?

## Provider Access

- [ ] GitHub repository admin/write access confirmed.
- [x] Vercel project access confirmed.
- [x] Vercel production environment access confirmed.
- [x] Vercel production deployment logs access confirmed.
- [x] Database provider access confirmed.
- [x] Managed production `DATABASE_URL` configured and read-only DB connectivity
  proven.
- [ ] Database backup/PITR status confirmed.
- [x] Clerk production app access confirmed.
- [x] Clerk live keys configured or development-key limitation accepted as demo
  scope.
- [x] Clerk production webhook endpoint and signing secret configured; Clerk
  dashboard message attempts show successful `organization.created` and
  `organization.deleted` deliveries to production on 2026-06-14.
- [x] Meta developer app and WhatsApp Business Account access confirmed.
- [x] WhatsApp runtime key source confirmed: platform DB-stored values or Vercel
  env fallback values.
- [ ] AI provider account access and quota controls confirmed.
- [x] Stripe account access excluded from the current launch scope. Confirm
  access before automated platform billing is enabled after launch.
- [x] Moyasar and other customer online payment providers excluded from the
  current launch scope. Confirm provider access before enabling them.
- [x] Better Stack excluded from the current launch scope; Vercel runtime logs
  are the current logging baseline.
- [ ] Production monitoring and alert ownership confirmed for maximum
  certification.
- [x] DNS/domain provider access confirmed.

## Test Data Safety

- [x] Production smoke-test organization confirmed for read-only smoke:
  `org_3F6Bj8JwLMzWwzTuJzlyu3bgBZt`.
- [x] Production smoke-test customer identity confirmed.
- [x] WhatsApp test number confirmed.
- [ ] Test orders/reviews/complaints can be distinguished from real data.
- [ ] Local/staging tests cannot mutate production data.

## Rollback

- [x] Vercel rollback status command confirmed.
- [ ] Vercel rollback execution path approved for emergency use.
- [x] Current production deployment ID recorded.
- [ ] Database restore drill status recorded.
- [ ] Secret rollback/rotation process confirmed.
- [ ] Meta webhook rollback process confirmed.
