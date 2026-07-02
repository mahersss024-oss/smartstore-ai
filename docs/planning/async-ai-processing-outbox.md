# Async AI Processing - Outbox + Queue

Status: **Implemented behind `AI_PROCESSING_MODE`; default remains `sync`.**

## Context

The AI customer-service reply path for WhatsApp via Whapi and web chat can run
synchronously inside the inbound HTTP request: message receipt -> model reply
generation -> deterministic guards -> semantic safety review -> bounded repair
and re-guard -> send reply.

At higher message volume, synchronous model execution fails during peaks. The
outbox mode decouples receipt from processing and gives the platform controlled
concurrency, retries, and recovery.

## Decision

Use the outbox + queue pattern when production volume requires it:

- Durable `ai_inbound_jobs` table as the source of truth.
- QStash as the managed queue and retry engine.
- A sweeper endpoint for stuck or undispatched jobs.

## Architecture

```text
WhatsApp (Whapi) -> /api/whatsapp/webhook
   1. parse payload and verify the per-store webhook secret
   2. resolve the store by Whapi channelId
   3. insert ai_inbound_jobs when outbox mode is enabled
   4. publish the job id to QStash
   5. return quickly to the provider

QStash -> POST /api/ai/worker
   1. verify QStash signature
   2. claim job with a lease
   3. run AIEmployeeAgent + guards
   4. send reply through Whapi
   5. mark job done
```

## Activation Requirements

Configure `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`,
`QSTASH_NEXT_SIGNING_KEY`, and `CRON_SECRET`. Set
`AI_PROCESSING_MODE=outbox` only after migrations are applied and the QStash
credentials are present. Roll back by setting the mode to `sync`.
