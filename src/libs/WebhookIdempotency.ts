import { and, eq } from 'drizzle-orm';
import { webhookEventsTable } from '@/models/Schema';
import { db } from './DB';

export type WebhookEventProvider = 'clerk' | 'meta' | 'meta_thread_lock' | 'stripe';
export const WEBHOOK_PROCESSING_LEASE_MS = 5 * 60_000;

export type WebhookEventExecutionResult<T> = {
  duplicate: boolean;
  result?: T;
  status: 'failed' | 'in_progress' | 'processed' | 'processing';
};

export type WebhookProcessingLockResult = {
  acquired: boolean;
  release: () => Promise<void>;
  status: 'acquired' | 'in_progress';
};

const formatWebhookError = (error: unknown) => {
  return error instanceof Error
    ? error.message.slice(0, 1000)
    : 'unknown_webhook_error';
};

export const acquireWebhookProcessingLock = async (params: {
  eventId: string;
  eventType: string;
  metadata?: Record<string, unknown>;
  now?: Date;
  provider: WebhookEventProvider;
}): Promise<WebhookProcessingLockResult> => {
  const now = params.now ?? new Date();
  const inserted = await db
    .insert(webhookEventsTable)
    .values({
      eventId: params.eventId,
      eventType: params.eventType,
      metadata: params.metadata,
      provider: params.provider,
      status: 'processing',
    })
    .onConflictDoNothing({
      target: [webhookEventsTable.provider, webhookEventsTable.eventId],
    })
    .returning({
      id: webhookEventsTable.id,
    });

  let lockRowId = inserted[0]?.id;

  if (!lockRowId) {
    const [existing] = await db
      .select({
        attempts: webhookEventsTable.attempts,
        id: webhookEventsTable.id,
        status: webhookEventsTable.status,
        updatedAt: webhookEventsTable.updatedAt,
      })
      .from(webhookEventsTable)
      .where(
        and(
          eq(webhookEventsTable.provider, params.provider),
          eq(webhookEventsTable.eventId, params.eventId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error('Webhook processing lock record was not created.');
    }

    const processingLeaseIsActive = existing.status === 'processing'
      && now.getTime() - existing.updatedAt.getTime() < WEBHOOK_PROCESSING_LEASE_MS;

    if (processingLeaseIsActive) {
      return {
        acquired: false,
        release: async () => {},
        status: 'in_progress',
      };
    }

    const claimed = await db
      .update(webhookEventsTable)
      .set({
        attempts: existing.attempts + 1,
        eventType: params.eventType,
        lastError: null,
        metadata: params.metadata,
        processedAt: null,
        status: 'processing',
        updatedAt: now,
      })
      .where(
        and(
          eq(webhookEventsTable.id, existing.id),
          eq(webhookEventsTable.status, existing.status),
          eq(webhookEventsTable.updatedAt, existing.updatedAt),
        ),
      )
      .returning({
        id: webhookEventsTable.id,
      });

    lockRowId = claimed[0]?.id;

    if (!lockRowId) {
      return {
        acquired: false,
        release: async () => {},
        status: 'in_progress',
      };
    }
  }

  return {
    acquired: true,
    release: async () => {
      await db
        .delete(webhookEventsTable)
        .where(eq(webhookEventsTable.id, lockRowId));
    },
    status: 'acquired',
  };
};

export const runWebhookEventOnce = async <T>(params: {
  eventId: string;
  eventType: string;
  handler: () => Promise<T>;
  metadata?: Record<string, unknown>;
  now?: Date;
  provider: WebhookEventProvider;
}): Promise<WebhookEventExecutionResult<T>> => {
  const now = params.now ?? new Date();
  const inserted = await db
    .insert(webhookEventsTable)
    .values({
      eventId: params.eventId,
      eventType: params.eventType,
      metadata: params.metadata,
      provider: params.provider,
      status: 'processing',
    })
    .onConflictDoNothing({
      target: [webhookEventsTable.provider, webhookEventsTable.eventId],
    })
    .returning({
      id: webhookEventsTable.id,
    });

  let eventRowId = inserted[0]?.id;

  if (!eventRowId) {
    const [existing] = await db
      .select({
        attempts: webhookEventsTable.attempts,
        id: webhookEventsTable.id,
        status: webhookEventsTable.status,
        updatedAt: webhookEventsTable.updatedAt,
      })
      .from(webhookEventsTable)
      .where(
        and(
          eq(webhookEventsTable.provider, params.provider),
          eq(webhookEventsTable.eventId, params.eventId),
        ),
      )
      .limit(1);

    if (!existing) {
      throw new Error('Webhook idempotency record was not created.');
    }

    if (existing.status === 'processed') {
      return {
        duplicate: true,
        status: 'processed',
      };
    }

    const processingLeaseIsActive = existing.status === 'processing'
      && now.getTime() - existing.updatedAt.getTime() < WEBHOOK_PROCESSING_LEASE_MS;

    if (processingLeaseIsActive) {
      return {
        duplicate: true,
        status: 'in_progress',
      };
    }

    const claimed = await db
      .update(webhookEventsTable)
      .set({
        attempts: existing.attempts + 1,
        eventType: params.eventType,
        lastError: null,
        metadata: params.metadata,
        status: 'processing',
        updatedAt: now,
      })
      .where(
        and(
          eq(webhookEventsTable.id, existing.id),
          eq(webhookEventsTable.status, existing.status),
          eq(webhookEventsTable.updatedAt, existing.updatedAt),
        ),
      )
      .returning({
        id: webhookEventsTable.id,
      });

    eventRowId = claimed[0]?.id;

    if (!eventRowId) {
      return {
        duplicate: true,
        status: 'in_progress',
      };
    }
  }

  try {
    const result = await params.handler();

    await db
      .update(webhookEventsTable)
      .set({
        lastError: null,
        processedAt: new Date(),
        status: 'processed',
      })
      .where(eq(webhookEventsTable.id, eventRowId));

    return {
      duplicate: false,
      result,
      status: 'processed',
    };
  } catch (error) {
    await db
      .update(webhookEventsTable)
      .set({
        lastError: formatWebhookError(error),
        status: 'failed',
      })
      .where(eq(webhookEventsTable.id, eventRowId));

    throw error;
  }
};
