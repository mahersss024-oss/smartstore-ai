# Observability Report

Generated: 2026-06-08

## Current instrumentation

- Structured logger in `src/libs/Logger.ts`.
- Platform admin audit log table.
- AI action logs.
- Order event history.
- Webhook event processing table.
- Public endpoint rate-limit table.
- AI orchestration diagnostics include visible system actions, missing
  checkout details, guard findings, and model repair metadata.

## Remaining risks

- Production alerting is not fully wired to a verified external provider.
- No dashboard for guard decisions, model repair attempts, conversion funnel, or AI cost trend yet.

## Recommended next instrumentation

- Dashboard AI guard and repair rates by store and channel.
- Checkout step conversion from product choice through final confirmation.
- Empty or ignored system-action rate.
- Webhook failure and retry status.
- AI provider latency, error rate, and cost trend.
