# Abuse Control Report

Generated: 2026-06-08

## Verified controls

- Public AI/chat endpoint has durable rate limiting by organization, channel, thread, and customer identity.
- Feedback/order web actions validate input and body size.
- AI conversation usage is counted against subscription limits.
- Long public AI messages are capped by schema and request body limit.

## Remaining risks

- Additional bot protection or WAF rules are needed for a large public campaign.
- Abuse analytics should surface suspicious public link behavior per tenant.

