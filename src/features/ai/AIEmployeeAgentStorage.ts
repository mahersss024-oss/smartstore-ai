import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { normalizeAIEmployeeSettings } from '@/libs/AIEmployeeSettings';
import { db } from '@/libs/DB';
import { ORDER_STATUS } from '@/libs/OrderWorkflow';
import {
  aiActionLogsTable,
  conversationMessagesTable,
  ordersTable,
  storeSettingsTable,
} from '@/models/Schema';
import { PLATFORM_AI_POLICY_VERSION } from './AIEmployeeAgentPrompt';

type ConversationHistoryMessage = {
  body: string;
  direction: 'inbound' | 'outbound';
  senderType: string;
};

type ConversationMessageMetadata = {
  shouldDisplayInChat?: unknown;
  [key: string]: unknown;
};

type StoreSettingsMetadata = {
  aiEmployee?: unknown;
};

export const logAIAction = async (params: {
  actionType: string;
  aiConfidence?: number;
  allowed: boolean;
  conversationId?: number;
  metadata?: Record<string, unknown>;
  orderId?: number | null;
  organizationId: string;
  requiredPermission?: string;
  summary: string;
}) => {
  await db.insert(aiActionLogsTable).values({
    actionType: params.actionType,
    aiConfidence: params.aiConfidence?.toFixed(2),
    allowed: params.allowed,
    conversationId: params.conversationId,
    metadata: params.metadata,
    orderId: params.orderId ?? null,
    organizationId: params.organizationId,
    policyVersion: PLATFORM_AI_POLICY_VERSION,
    requiredPermission: params.requiredPermission,
    summary: params.summary,
  });
};

export const loadConversationHistory = async (params: {
  conversationId: number;
  organizationId: string;
}): Promise<ConversationHistoryMessage[]> => {
  const rows = await db
    .select({
      body: conversationMessagesTable.body,
      direction: conversationMessagesTable.direction,
      id: conversationMessagesTable.id,
      metadata: conversationMessagesTable.metadata,
      senderType: conversationMessagesTable.senderType,
    })
    .from(conversationMessagesTable)
    .where(
      and(
        eq(conversationMessagesTable.organizationId, params.organizationId),
        eq(conversationMessagesTable.conversationId, params.conversationId),
      ),
    )
    .orderBy(desc(conversationMessagesTable.id))
    .limit(12);

  return rows
    .reverse()
    .filter((row) => {
      const metadata = row.metadata && typeof row.metadata === 'object'
        ? row.metadata as ConversationMessageMetadata
        : {};

      return metadata.shouldDisplayInChat !== false && row.body.trim().length > 0;
    })
    .map(row => ({
      body: row.body,
      direction: row.direction as 'inbound' | 'outbound',
      senderType: row.senderType,
    }));
};

export const getStoreAIProfile = async (organizationId: string) => {
  const [settings] = await db
    .select({
      metadata: storeSettingsTable.metadata,
      storeName: storeSettingsTable.storeName,
      welcomeMessage: storeSettingsTable.welcomeMessage,
    })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);

  return {
    aiSettings: normalizeAIEmployeeSettings((settings?.metadata as StoreSettingsMetadata | null)?.aiEmployee),
    storeName: settings?.storeName?.trim() || 'Store',
    welcomeMessage: settings?.welcomeMessage?.trim(),
  };
};

export const findReviewOrderId = async (params: {
  customerEmail?: string;
  customerPhone?: string;
  organizationId: string;
  preferredOrderId?: number;
}) => {
  const conditions = [
    params.customerEmail
      ? eq(ordersTable.customerEmail, params.customerEmail)
      : null,
    params.customerPhone
      ? eq(ordersTable.customerPhone, params.customerPhone)
      : null,
  ].filter(condition => condition !== null);

  if (conditions.length === 0) {
    return null;
  }

  const customerCondition = conditions.length === 1
    ? conditions[0]
    : or(...conditions);

  if (params.preferredOrderId) {
    const [preferredOrder] = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.organizationId, params.organizationId),
          eq(ordersTable.id, params.preferredOrderId),
          eq(ordersTable.status, ORDER_STATUS.COMPLETED),
          isNull(ordersTable.archivedAt),
          customerCondition,
        ),
      )
      .limit(1);

    if (preferredOrder?.id) {
      return preferredOrder.id;
    }
  }

  const [order] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.organizationId, params.organizationId),
        eq(ordersTable.status, ORDER_STATUS.COMPLETED),
        isNull(ordersTable.archivedAt),
        customerCondition,
      ),
    )
    .orderBy(desc(ordersTable.updatedAt))
    .limit(1);

  return order?.id ?? null;
};
