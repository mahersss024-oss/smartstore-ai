import { randomUUID } from 'node:crypto';
import { and, eq, gte, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { aiInboundJobsTable } from '@/models/Schema';
import { db } from './DB';

type AiInboundJobChannel = 'web_chat' | 'whatsapp';
export type AiInboundJobStatus = 'dead' | 'done' | 'failed' | 'pending' | 'processing';

// How long a worker holds a claimed job before it is considered stuck and may be
// reclaimed by the sweeper. Mirrors the lease idiom in WebhookIdempotency.
const AI_INBOUND_JOB_LEASE_MS = 5 * 60_000;
export const AI_INBOUND_JOB_MAX_ATTEMPTS = 5;
const RETRY_BACKOFF_BASE_MS = 30_000;
const RETRY_BACKOFF_MAX_MS = 10 * 60_000;
const REDISPATCH_AFTER_MS = 60_000;

const computeBackoffMs = (attempts: number) => {
  const exponent = Math.max(0, attempts - 1);

  return Math.min(RETRY_BACKOFF_BASE_MS * 2 ** exponent, RETRY_BACKOFF_MAX_MS);
};

export type AiInboundJob = typeof aiInboundJobsTable.$inferSelect;

export type EnqueueAiInboundJobParams = {
  channel: AiInboundJobChannel;
  dedupeKey: string;
  externalThreadId?: null | string;
  organizationId: string;
  payload: Record<string, unknown>;
};

/**
 * Persists an inbound customer message as a durable job. Idempotent on
 * (channel, dedupeKey): a redelivered provider message never creates a second
 * job. Returns the job id and whether this call created it.
 */
export const enqueueAiInboundJob = async (
  params: EnqueueAiInboundJobParams,
): Promise<{ enqueued: boolean; jobId: number }> => {
  const inserted = await db
    .insert(aiInboundJobsTable)
    .values({
      channel: params.channel,
      dedupeKey: params.dedupeKey,
      externalThreadId: params.externalThreadId ?? null,
      organizationId: params.organizationId,
      payload: params.payload,
      status: 'pending',
    })
    .onConflictDoNothing({
      target: [
        aiInboundJobsTable.organizationId,
        aiInboundJobsTable.channel,
        aiInboundJobsTable.dedupeKey,
      ],
    })
    .returning({ id: aiInboundJobsTable.id });

  if (inserted[0]?.id) {
    return { enqueued: true, jobId: inserted[0].id };
  }

  const [existing] = await db
    .select({ id: aiInboundJobsTable.id })
    .from(aiInboundJobsTable)
    .where(
      and(
        eq(aiInboundJobsTable.channel, params.channel),
        eq(aiInboundJobsTable.dedupeKey, params.dedupeKey),
        eq(aiInboundJobsTable.organizationId, params.organizationId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error('AI inbound job was not created.');
  }

  return { enqueued: false, jobId: existing.id };
};

/**
 * Atomically claims a specific job for processing using an optimistic update.
 * Only a pending/failed job, or a processing job whose lease has expired, can be
 * claimed. Concurrent workers racing on the same job: at most one wins. Returns
 * the claimed job (with the incremented attempt count) or null if not claimable.
 */
export const claimAiInboundJob = async (params: {
  jobId: number;
  now?: Date;
}): Promise<AiInboundJob | null> => {
  const now = params.now ?? new Date();
  const leaseToken = randomUUID();
  const lockedUntil = new Date(now.getTime() + AI_INBOUND_JOB_LEASE_MS);

  const [claimed] = await db
    .update(aiInboundJobsTable)
    .set({
      attempts: sql`${aiInboundJobsTable.attempts} + 1`,
      leaseToken,
      lockedUntil,
      status: 'processing',
      updatedAt: now,
    })
    .where(
      and(
        eq(aiInboundJobsTable.id, params.jobId),
        lt(aiInboundJobsTable.attempts, AI_INBOUND_JOB_MAX_ATTEMPTS),
        or(
          eq(aiInboundJobsTable.status, 'pending'),
          and(
            eq(aiInboundJobsTable.status, 'failed'),
            or(
              isNull(aiInboundJobsTable.nextAttemptAt),
              lte(aiInboundJobsTable.nextAttemptAt, now),
            ),
          ),
          and(
            eq(aiInboundJobsTable.status, 'processing'),
            lt(aiInboundJobsTable.lockedUntil, now),
          ),
        ),
        sql`NOT EXISTS (
          SELECT 1
          FROM ai_inbound_jobs AS older
          WHERE older.organization_id = ${aiInboundJobsTable.organizationId}
            AND older.channel = ${aiInboundJobsTable.channel}
            AND older.external_thread_id IS NOT DISTINCT FROM ${aiInboundJobsTable.externalThreadId}
            AND older.id < ${aiInboundJobsTable.id}
            AND older.status NOT IN ('done', 'dead')
        )`,
      ),
    )
    .returning();

  return claimed ?? null;
};

/** Marks a successfully processed job as done and releases its lease. */
export const completeAiInboundJob = async (params: {
  jobId: number;
  leaseToken: string;
  now?: Date;
}): Promise<boolean> => {
  const now = params.now ?? new Date();

  const updated = await db
    .update(aiInboundJobsTable)
    .set({
      lastError: null,
      leaseToken: null,
      lockedUntil: null,
      processedAt: now,
      status: 'done',
      updatedAt: now,
    })
    .where(
      and(
        eq(aiInboundJobsTable.id, params.jobId),
        eq(aiInboundJobsTable.leaseToken, params.leaseToken),
        eq(aiInboundJobsTable.status, 'processing'),
      ),
    )
    .returning({ id: aiInboundJobsTable.id });

  return updated.length === 1;
};

export const renewAiInboundJobLease = async (params: {
  jobId: number;
  leaseToken: string;
  now?: Date;
}): Promise<boolean> => {
  const now = params.now ?? new Date();
  const updated = await db
    .update(aiInboundJobsTable)
    .set({
      lockedUntil: new Date(now.getTime() + AI_INBOUND_JOB_LEASE_MS),
      updatedAt: now,
    })
    .where(
      and(
        eq(aiInboundJobsTable.id, params.jobId),
        eq(aiInboundJobsTable.leaseToken, params.leaseToken),
        eq(aiInboundJobsTable.status, 'processing'),
      ),
    )
    .returning({ id: aiInboundJobsTable.id });

  return updated.length === 1;
};

/**
 * Records a processing failure, classified by `kind`:
 * - `terminal` — deterministic error that cannot succeed on retry (unsupported
 *   channel, malformed payload): dead-lettered immediately instead of wasting
 *   the full attempt budget.
 * - `transient` — contention/lease loss that is expected to clear soon: returns
 *   to a retryable state on a short fixed backoff and ROLLS BACK the attempt
 *   consumed at claim time, so transient contention never depletes the ceiling.
 * - `retryable` (default) — genuine processing failure: exponential backoff and
 *   dead-letter once the attempt ceiling is reached.
 * `attempts` is the post-claim attempt count of the job.
 */
export const failAiInboundJob = async (params: {
  attempts: number;
  error: unknown;
  jobId: number;
  kind?: 'retryable' | 'terminal' | 'transient';
  leaseToken: string;
  now?: Date;
}): Promise<{
  status: Extract<AiInboundJobStatus, 'dead' | 'failed'>;
  updated: boolean;
}> => {
  const now = params.now ?? new Date();
  const kind = params.kind ?? 'retryable';
  const exhausted = kind === 'terminal'
    || (kind === 'retryable' && params.attempts >= AI_INBOUND_JOB_MAX_ATTEMPTS);
  const status = exhausted ? 'dead' as const : 'failed' as const;
  const lastError = (params.error instanceof Error
    ? params.error.message
    : 'unknown_ai_inbound_job_error').slice(0, 1000);
  const backoffMs = kind === 'transient'
    ? RETRY_BACKOFF_BASE_MS
    : computeBackoffMs(params.attempts);

  const updated = await db
    .update(aiInboundJobsTable)
    .set({
      // Transient failures must not count toward the dead-letter ceiling.
      ...(kind === 'transient'
        ? { attempts: sql`GREATEST(${aiInboundJobsTable.attempts} - 1, 0)` }
        : {}),
      lastDispatchedAt: null,
      lastError,
      leaseToken: null,
      lockedUntil: null,
      nextAttemptAt: exhausted
        ? null
        : new Date(now.getTime() + backoffMs),
      status,
      updatedAt: now,
    })
    .where(
      and(
        eq(aiInboundJobsTable.id, params.jobId),
        eq(aiInboundJobsTable.leaseToken, params.leaseToken),
        eq(aiInboundJobsTable.status, 'processing'),
      ),
    )
    .returning({ id: aiInboundJobsTable.id });

  return { status, updated: updated.length === 1 };
};

export const getAiInboundJob = async (jobId: number): Promise<AiInboundJob | null> => {
  const [job] = await db
    .select()
    .from(aiInboundJobsTable)
    .where(eq(aiInboundJobsTable.id, jobId))
    .limit(1);

  return job ?? null;
};

export const markAiInboundJobDispatched = async (params: {
  jobId: number;
  now?: Date;
}): Promise<void> => {
  const now = params.now ?? new Date();

  await db
    .update(aiInboundJobsTable)
    .set({
      lastDispatchedAt: now,
      updatedAt: now,
    })
    .where(eq(aiInboundJobsTable.id, params.jobId));
};

export const findDispatchableAiInboundJobs = async (params?: {
  limit?: number;
  now?: Date;
}): Promise<AiInboundJob[]> => {
  const now = params?.now ?? new Date();
  const redispatchBefore = new Date(now.getTime() - REDISPATCH_AFTER_MS);
  const limit = Math.min(Math.max(params?.limit ?? 50, 1), 200);

  return db
    .select()
    .from(aiInboundJobsTable)
    .where(
      and(
        lt(aiInboundJobsTable.attempts, AI_INBOUND_JOB_MAX_ATTEMPTS),
        or(
          and(
            eq(aiInboundJobsTable.status, 'pending'),
            or(
              isNull(aiInboundJobsTable.lastDispatchedAt),
              lte(aiInboundJobsTable.lastDispatchedAt, redispatchBefore),
            ),
          ),
          and(
            eq(aiInboundJobsTable.status, 'failed'),
            or(
              isNull(aiInboundJobsTable.nextAttemptAt),
              lte(aiInboundJobsTable.nextAttemptAt, now),
            ),
            or(
              isNull(aiInboundJobsTable.lastDispatchedAt),
              lte(aiInboundJobsTable.lastDispatchedAt, redispatchBefore),
            ),
          ),
          and(
            eq(aiInboundJobsTable.status, 'processing'),
            lt(aiInboundJobsTable.lockedUntil, now),
            or(
              isNull(aiInboundJobsTable.lastDispatchedAt),
              lte(aiInboundJobsTable.lastDispatchedAt, redispatchBefore),
            ),
          ),
        ),
      ),
    )
    .orderBy(aiInboundJobsTable.id)
    .limit(limit);
};

/**
 * Dead-letters jobs whose worker died on their final attempt: status='processing'
 * with attempts at the ceiling and an expired lease. Such jobs are otherwise
 * stranded forever — neither `claimAiInboundJob` nor `findDispatchableAiInboundJobs`
 * can recover them (both require attempts < MAX), `failAiInboundJob` never runs so
 * they never reach `dead`, and the claim ordering guard treats `processing` as
 * non-terminal, permanently blocking every later message in the same conversation.
 * The sweeper calls this so the thread is freed and the dead job is purgeable.
 */
export const reapStuckAiInboundJobs = async (params?: {
  now?: Date;
}): Promise<number> => {
  const now = params?.now ?? new Date();

  const reaped = await db
    .update(aiInboundJobsTable)
    .set({
      lastError: 'reaped_stuck_processing_job',
      leaseToken: null,
      lockedUntil: null,
      nextAttemptAt: null,
      processedAt: now,
      status: 'dead',
      updatedAt: now,
    })
    .where(
      and(
        eq(aiInboundJobsTable.status, 'processing'),
        gte(aiInboundJobsTable.attempts, AI_INBOUND_JOB_MAX_ATTEMPTS),
        lt(aiInboundJobsTable.lockedUntil, now),
      ),
    )
    .returning({ id: aiInboundJobsTable.id });

  return reaped.length;
};
