import { and, inArray, lt } from 'drizzle-orm';
import {
  publicEndpointRateLimitsTable,
  webhookEventsTable,
} from '@/models/Schema';
import { db } from './DB';

const DAY_MS = 24 * 60 * 60 * 1000;

export const OPERATIONAL_RETENTION = {
  failedWebhookDays: 30,
  finishedWebhookDays: 90,
  rateLimitGraceDays: 1,
} as const;

export const getOperationalRetentionCutoffs = (now = new Date()) => ({
  failedWebhooksBefore: new Date(
    now.getTime() - OPERATIONAL_RETENTION.failedWebhookDays * DAY_MS,
  ),
  finishedWebhooksBefore: new Date(
    now.getTime() - OPERATIONAL_RETENTION.finishedWebhookDays * DAY_MS,
  ),
  rateLimitsBefore: new Date(
    now.getTime() - OPERATIONAL_RETENTION.rateLimitGraceDays * DAY_MS,
  ),
});

export const cleanupExpiredOperationalData = async (now = new Date()) => {
  const cutoffs = getOperationalRetentionCutoffs(now);

  return db.transaction(async (tx) => {
    const expiredRateLimits = await tx
      .delete(publicEndpointRateLimitsTable)
      .where(lt(publicEndpointRateLimitsTable.expiresAt, cutoffs.rateLimitsBefore))
      .returning({ id: publicEndpointRateLimitsTable.id });

    const finishedWebhooks = await tx
      .delete(webhookEventsTable)
      .where(
        and(
          inArray(webhookEventsTable.status, ['processed']),
          lt(webhookEventsTable.updatedAt, cutoffs.finishedWebhooksBefore),
        ),
      )
      .returning({ id: webhookEventsTable.id });

    const failedWebhooks = await tx
      .delete(webhookEventsTable)
      .where(
        and(
          inArray(webhookEventsTable.status, ['failed']),
          lt(webhookEventsTable.updatedAt, cutoffs.failedWebhooksBefore),
        ),
      )
      .returning({ id: webhookEventsTable.id });

    return {
      failedWebhooksDeleted: failedWebhooks.length,
      finishedWebhooksDeleted: finishedWebhooks.length,
      rateLimitsDeleted: expiredRateLimits.length,
    };
  });
};
