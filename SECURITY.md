# Security

## Trust Boundaries

- Customer input is untrusted.
- Model output is untrusted until validated.
- Webhooks are untrusted until provider verification succeeds.
- Merchant actions require an authenticated active organization.
- Platform administration requires explicit platform-admin authorization.
- Database records are authoritative only after tenant and relationship checks.

## Implemented Controls

- Clerk-protected merchant and platform routes.
- Organization-scoped reads and writes.
- Composite tenant foreign keys on critical relationships.
- Durable public endpoint rate limiting with hashed keys.
- Stripe signature and Clerk webhook verification.
- Durable webhook idempotency, retry state, and processing leases.
- Bounded request bodies on public AI and payment callback endpoints.
- Timing-safe comparison for shared secrets.
- HTTPS-only outbound integrations with private-network blocking and timeouts.
- Encrypted AI provider credentials.
- Optimistic concurrency on order and billing mutations.
- No customer-side permanent deletion of merchant conversation records.
- Production HSTS plus frame, MIME, referrer, and browser permission headers.
- No committed credential patterns found in the repository audit.

## AI Safety Model

The AI model may converse freely but cannot execute sensitive actions directly.
Product names, availability, prices, totals, order state, fulfillment, and
payment facts come from platform data. Guards return structured findings and a
separate model pass rewrites unsafe or contradictory text.

## Remaining Production Work

### Content Security Policy

A nonce-based CSP should be validated on the final production domains with
Clerk, Sentry, uploaded images, and payment providers. A broad untested CSP can
break authentication and checkout, so it is intentionally not guessed.

### PostgreSQL RLS

RLS is not enabled. Current isolation uses application authorization,
organization predicates, and composite tenant constraints. Safe RLS requires
transaction-scoped tenant context and separate privileged database roles.

### Infrastructure Controls

Production must provide:

- HTTPS-only ingress and secure DNS
- secret manager and key rotation
- managed database encryption, backups, and PITR
- WAF/DDoS controls appropriate to traffic
- alerting for auth, webhook, database, and AI failures
- restricted CI/CD and deployment identities

## Secret Response

If a credential is exposed:

1. Revoke it at the provider immediately.
2. Rotate dependent secrets and webhook signatures.
3. Inspect provider and platform audit logs.
4. Redeploy with the new secret through the deployment secret manager.
5. Never rely on deleting a leaked value from a later Git commit.
