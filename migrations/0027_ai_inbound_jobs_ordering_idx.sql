-- Index supporting the per-claim conversation-ordering NOT EXISTS guard in
-- `claimAiInboundJob` and the stuck-job reaper, both of which filter
-- ai_inbound_jobs by (organization_id, channel, external_thread_id, status).
-- Without it those queries fall back to a scan as `done` rows accumulate.
CREATE INDEX IF NOT EXISTS "ai_inbound_jobs_ordering_guard_idx"
  ON "ai_inbound_jobs" ("organization_id", "channel", "external_thread_id", "status");
