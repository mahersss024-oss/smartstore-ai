# Safe Production Smoke-Test Agreement

Date started: 2026-06-13

Status: current script reviewed as read-only and executed successfully against
production. Future write smoke tests still need explicit approval.

Production smoke tests must be explicitly safe before they run.

## Allowed Before Approval

- Read-only checks against public pages.
- Read-only checks against metadata endpoints such as robots and sitemap.
- Local or staging tests that do not use production customer/order data.

## Current Script Safety Evidence

`scripts/smoke-test-production.mjs` currently checks:

- `/<locale>`
- `/<locale>/sign-in`
- `/robots.txt`
- `/sitemap.xml`
- Optional `/<locale>/connect/<organizationId>`
- Optional `/<locale>/web-order/<organizationId>`

It uses `fetch` with `redirect: 'manual'`. It does not submit forms, create
orders, write customer data, send WhatsApp messages, or trigger payments.

## Not Allowed Before Approval

- Creating real customer orders in production.
- Sending real WhatsApp messages to non-test customers.
- Triggering payment provider charges.
- Running destructive cleanup against production without backup/PITR
  confirmation.
- Running migrations without rollback and backup confirmation.

## Approval Checklist

- [ ] Production base URL confirmed.
- [ ] Test organization confirmed.
- [ ] Test customer identity confirmed.
- [ ] Test WhatsApp number confirmed.
- [x] Current script classified as read-only.
- [x] Current script executed successfully against
  `https://www.smartstore-ai.com`.
- [ ] Any future write smoke tests classified as explicitly safe writes.
- [ ] Rollback owner confirmed.
- [ ] Production logs available for review.
- [ ] Database backup/PITR confirmed before any write-heavy or destructive test.
