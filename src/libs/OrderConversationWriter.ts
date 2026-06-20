import type { db } from './DB';
import { and, eq, sql } from 'drizzle-orm';
import {
  conversationMessagesTable,
  conversationsTable,
} from '@/models/Schema';

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const getOrderConversationReference = (aiAnalysis: unknown) => {
  if (!aiAnalysis || typeof aiAnalysis !== 'object') {
    return {};
  }

  const data = aiAnalysis as {
    conversationId?: null | number;
    externalThreadId?: null | string;
  };

  return {
    conversationId: typeof data.conversationId === 'number' ? data.conversationId : undefined,
    externalThreadId: data.externalThreadId || undefined,
  };
};

type CustomerConversationWriteResult = {
  channel: string;
  notificationKey?: string;
  reason?: string;
  status: 'failed' | 'sent' | 'skipped';
};

const getStringMetadataValue = (
  metadata: Record<string, unknown> | undefined,
  key: string,
) => {
  const value = metadata?.[key];

  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
};

export const buildOrderCustomerNotificationKey = (params: {
  conversationIntent: string;
  messageMetadata?: Record<string, unknown>;
  orderId: number;
  status: string;
}) => {
  const eventType = getStringMetadataValue(params.messageMetadata, 'eventType')
    ?? params.conversationIntent;

  return `order:${params.orderId}:${eventType}:${params.status}`;
};

export const writeOrderCustomerConversationMessage = async (params: {
  aiAnalysis: unknown;
  body: string;
  channel: string;
  conversationIntent: string;
  conversationMetadata?: Record<string, unknown>;
  fallbackThreadId: string;
  messageMetadata?: Record<string, unknown>;
  notificationKey?: string;
  orderId: number;
  organizationId: string;
  status: string;
  tx: DatabaseTransaction;
}): Promise<CustomerConversationWriteResult> => {
  const conversationReference = getOrderConversationReference(params.aiAnalysis);
  const notificationKey = params.notificationKey ?? buildOrderCustomerNotificationKey({
    conversationIntent: params.conversationIntent,
    messageMetadata: params.messageMetadata,
    orderId: params.orderId,
    status: params.status,
  });
  const providedLastOrder = params.conversationMetadata?.lastOrder;
  const conversationMetadata = {
    ...params.conversationMetadata,
    currentIntent: params.conversationIntent,
    lastOrder: {
      ...(providedLastOrder && typeof providedLastOrder === 'object'
        ? providedLastOrder
        : {}),
      id: params.orderId,
      status: params.status,
    },
    orderId: params.orderId,
    status: params.status,
  };
  let conversationId = conversationReference.conversationId;

  if (conversationId) {
    const [updatedConversation] = await params.tx
      .update(conversationsTable)
      .set({
        aiStatus: 'reply_ready',
        lastMessageAt: sql`localtimestamp`,
        lastMessagePreview: params.body.slice(0, 180),
        metadata: conversationMetadata,
        status: 'open',
      })
      .where(
        and(
          eq(conversationsTable.id, conversationId),
          eq(conversationsTable.organizationId, params.organizationId),
        ),
      )
      .returning({ id: conversationsTable.id });

    conversationId = updatedConversation?.id;
  }

  if (!conversationId) {
    const [conversation] = await params.tx
      .insert(conversationsTable)
      .values({
        aiStatus: 'reply_ready',
        channel: params.channel,
        externalThreadId: conversationReference.externalThreadId ?? params.fallbackThreadId,
        lastMessageAt: sql`localtimestamp`,
        lastMessagePreview: params.body.slice(0, 180),
        metadata: conversationMetadata,
        organizationId: params.organizationId,
        status: 'open',
      })
      .onConflictDoUpdate({
        set: {
          aiStatus: 'reply_ready',
          lastMessageAt: sql`localtimestamp`,
          lastMessagePreview: params.body.slice(0, 180),
          metadata: conversationMetadata,
          status: 'open',
        },
        target: [
          conversationsTable.organizationId,
          conversationsTable.channel,
          conversationsTable.externalThreadId,
        ],
      })
      .returning({ id: conversationsTable.id });

    conversationId = conversation?.id;
  }

  if (!conversationId) {
    return {
      channel: params.channel,
      notificationKey,
      reason: 'conversation_unavailable',
      status: 'failed',
    };
  }

  const [existingMessage] = await params.tx
    .select({ id: conversationMessagesTable.id })
    .from(conversationMessagesTable)
    .where(
      and(
        eq(conversationMessagesTable.organizationId, params.organizationId),
        eq(conversationMessagesTable.conversationId, conversationId),
        sql`${conversationMessagesTable.metadata}->>'notificationKey' = ${notificationKey}`,
      ),
    )
    .limit(1);

  if (existingMessage) {
    return {
      channel: params.channel,
      notificationKey,
      reason: 'duplicate_notification',
      status: 'skipped',
    };
  }

  await params.tx.insert(conversationMessagesTable).values({
    aiConfidence: '0.95',
    aiIntent: params.conversationIntent,
    body: params.body,
    conversationId,
    direction: 'outbound',
    metadata: {
      ...params.messageMetadata,
      lastOrder: {
        id: params.orderId,
        status: params.status,
      },
      notificationKey,
      notificationStatus: 'sent',
      orderId: params.orderId,
      shouldSendToCustomer: true,
      status: params.status,
    },
    organizationId: params.organizationId,
    senderType: 'ai_employee',
  });

  return {
    channel: params.channel,
    notificationKey,
    status: 'sent',
  };
};
