# Async AI Processing — Outbox + Queue

Status: **Implemented behind `AI_PROCESSING_MODE`; default remains `sync`.**

## Context

The AI customer-service reply path (WhatsApp via Meta Cloud API, and web chat) currently
runs **synchronously inside the inbound HTTP request**: model reply generation →
deterministic guards → semantic safety review → bounded repair + re-guard → send
reply. At the current/target volume of **~10,000 messages/day** with realistic
peaks of **10–20× the average (~70–140 msg/min)**, the synchronous model fails
exactly during peaks — the worst possible time for a store.

Interim hardening already shipped (independent of this plan):

- `maxDuration = 60` on the AI routes (whatsapp webhook, ai-employee messages) and
  the web-order page.
- Reply is persisted to the DB **before** the request returns; the web client
  polls every 5s; Meta retries + webhook idempotency cover redelivery.

These protect the *individual* message but do **not** solve **mass concurrency**
(no backpressure against the AI provider) or decouple *receipt* from *processing*.

## Decision

At 10k/day with peaks, **implement the outbox + queue pattern.** Recommended
shape: **durable outbox table (source of truth) + QStash (Upstash) as the managed
queue** providing controlled concurrency, retries, and backoff.

Why both (not QStash alone): the outbox table is the **source of truth** so no
customer message is lost even if the queue provider blips; QStash is the
**scheduling / parallelism / retry engine**. This mirrors the existing
`webhookEventsTable` lease/idempotency pattern already in the codebase.

Why not Vercel Cron alone: a once-per-minute batch cannot drain a 140 msg/min
peak without minutes of reply latency. A push queue with a concurrency cap fits
the volume far better. (Vercel Cron remains a fine fallback sweeper for stuck
jobs — see Phase 5.)

## Architecture

```
WhatsApp → /api/whatsapp/webhook
   1. verify signature (unchanged)
   2. INSERT ai_inbound_jobs (status=pending)        ~50ms
   3. publish job id to QStash
   4. return 200 to Meta immediately               ✅ no timeout pressure

QStash (managed queue, concurrency cap = 15)
   → POST /api/ai/worker  (signed by QStash)
        1. verify QStash signature
        2. claim job (lease, like webhookEventsTable)
        3. run AIEmployeeAgent + guards (full time budget)
        4. send reply via Meta
        5. mark job done
        on failure → DB backoff → sweeper redispatch → dead-letter after 5 attempts
```

The single most important setting for this volume is the **concurrency cap**
(currently 15 in-flight). It keeps processing below the configured worker limit and
processing flows at a steady rate regardless of peak size; the queue absorbs the
surge and drains it.

## Schema (`ai_inbound_jobs`)

Extends the existing lease/idempotency idiom (`webhookEventsTable`):

```
id                serial pk
organization_id   text not null
channel           varchar(50) not null         -- whatsapp | web_chat
external_thread_id text
dedupe_key        text not null                -- e.g. provider message id / clientSubmissionId
payload           jsonb not null               -- the inbound message + customer
status            varchar(20) not null default 'pending'  -- pending|processing|done|failed|dead
attempts          integer not null default 0
locked_until      timestamp                    -- processing lease (TOCTOU-safe claim)
next_attempt_at   timestamp
last_error        text
created_at        timestamp default now()
processed_at      timestamp

lease_token         text                        -- fencing token for the current worker
last_dispatched_at  timestamp                   -- sweeper duplicate suppression
unique (organization_id, channel, dedupe_key)  -- tenant-safe idempotent enqueue
index (status, next_attempt_at)                 -- worker pickup / sweeper
index (organization_id, created_at)             -- ops visibility
```

Idempotent enqueue = `onConflictDoNothing` on `(channel, dedupe_key)`; claim =
optimistic update guarded by `status` + `locked_until` (same technique as
`acquireWebhookProcessingLock`).

## Implemented components

1. Schema and migrations for durable jobs and tenant-safe deduplication.
2. WhatsApp webhook enqueue and immediate QStash dispatch in `outbox` mode.
3. Signed worker endpoint at `/api/ai/worker`.
4. Shared WhatsApp processor used by synchronous and asynchronous paths.
5. Lease fencing, renewal before outbound delivery, strict conversation ordering,
   exponential backoff, and dead-lettering after five attempts.
6. Vercel Cron sweeper at `/api/maintenance/ai-inbound-jobs`.
7. Operational retention for completed and dead jobs.
8. Unit, route, migration, PostgreSQL concurrency, build, and E2E verification.

## Activation requirements

Configure `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`,
`QSTASH_NEXT_SIGNING_KEY`, and `CRON_SECRET` in Vercel. Keep web chat
synchronous. Set `AI_PROCESSING_MODE=outbox` only after migration `0026` is
applied and the QStash credentials are present. Roll back instantly by setting
the mode to `sync`.

## Costs / risks (honest)

- Added operational complexity: a distributed system has new failure modes (is
  the worker alive? stuck jobs?) — the sweeper + a monitoring endpoint are
  mandatory, not optional.
- Perceived latency shifts from "in-request" to "a few seconds later" — natural
  and acceptable for WhatsApp; web chat should stay synchronous to feel live.
- Idempotency must be exact so the worker never processes a job twice — the
  existing `WebhookIdempotency` pattern covers this.
- Real engineering effort: table + migration + worker + route changes +
  concurrency tests + monitoring.

## Relationship to shipped interim fixes

`maxDuration` **migrates** to the worker endpoint (the new home of heavy
processing); it stays on the web-order page if web chat remains synchronous. The
Arabic-digit privacy guard fix is architecture-independent and applies wherever
the guards run. Nothing shipped is wasted by this plan.
