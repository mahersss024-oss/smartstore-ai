-- Durable inbound AI job queue (outbox) for asynchronous customer-message
-- processing. The inbound webhook persists a job here and returns immediately;
-- a worker claims the job with a processing lease and runs the AI reply
-- pipeline. This is the source of truth so no customer message is ever lost.
CREATE TABLE IF NOT EXISTS "ai_inbound_jobs" (
  "id" serial PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "channel" varchar(50) NOT NULL,
  "external_thread_id" text,
  "dedupe_key" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "lease_token" text,
  "locked_until" timestamp,
  "last_dispatched_at" timestamp,
  "next_attempt_at" timestamp,
  "last_error" text,
  "processed_at" timestamp,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Idempotent enqueue: the same provider message (Twilio MessageSid /
-- web clientSubmissionId) can only ever create one job per channel.
CREATE UNIQUE INDEX IF NOT EXISTS "ai_inbound_jobs_org_channel_dedupe_unique"
  ON "ai_inbound_jobs" ("organization_id", "channel", "dedupe_key");

-- Worker pickup / stuck-job sweeper.
CREATE INDEX IF NOT EXISTS "ai_inbound_jobs_status_next_attempt_idx"
  ON "ai_inbound_jobs" ("status", "next_attempt_at");

CREATE INDEX IF NOT EXISTS "ai_inbound_jobs_dispatch_recovery_idx"
  ON "ai_inbound_jobs" ("status", "last_dispatched_at");

-- Operational visibility per store.
CREATE INDEX IF NOT EXISTS "ai_inbound_jobs_organization_created_idx"
  ON "ai_inbound_jobs" ("organization_id", "created_at");
