import { and, eq, sql } from 'drizzle-orm';
import { channelConnectionsTable } from '@/models/Schema';
import { db } from './DB';
import { sendEvolutionText } from './EvolutionConnect';

const EVOLUTION_THREAD_PREFIX = 'ewa';
const WHATSAPP_CHANNEL = 'whatsapp';

export type EvolutionInboundMessage = {
  body: string;
  from: string;
  instanceName: string;
  messageId: string;
  profileName?: string;
};

export type EvolutionStoreConnection = {
  displayPhoneNumber?: string;
  instanceName: string;
  organizationId: string;
};

type EvolutionConnectionConfig = {
  channelId?: null | string;
  displayPhoneNumber?: null | string;
  instanceName?: null | string;
  provider?: null | string;
  webhookSecret?: null | string;
};

const getRecord = (value: unknown): Record<string, unknown> | null => {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
};

const getString = (record: null | Record<string, unknown>, keys: string[]) => {
  if (!record) {
    return '';
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
};

const getNestedRecord = (record: null | Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    const nested = getRecord(record?.[key]);

    if (nested) {
      return nested;
    }
  }

  return null;
};

const getMessageRecord = (root: Record<string, unknown>) => {
  const messages = Array.isArray(root.messages) ? root.messages : undefined;
  const data = getRecord(root.data);
  const dataMessages = Array.isArray(data?.messages) ? data.messages : undefined;

  return getRecord(messages?.[0])
    ?? getRecord(dataMessages?.[0])
    ?? getRecord(root.message)
    ?? data
    ?? root;
};

const getMessageBody = (message: Record<string, unknown>) => {
  const directText = getString(message, ['body', 'caption', 'conversation', 'text', 'message']);

  if (directText) {
    return directText;
  }

  const textRecord = getRecord(message.text) ?? getRecord(message.extendedTextMessage);
  const messageContent = getRecord(message.message);
  const extendedText = getRecord(messageContent?.extendedTextMessage);
  const image = getRecord(messageContent?.imageMessage);
  const video = getRecord(messageContent?.videoMessage);
  const document = getRecord(messageContent?.documentMessage);

  return getString(textRecord, ['body', 'text'])
    || getString(messageContent, ['conversation'])
    || getString(extendedText, ['text'])
    || getString(image, ['caption'])
    || getString(video, ['caption'])
    || getString(document, ['caption']);
};

const normalizeRemoteJid = (value: string) => {
  return value.replace(/@s\.whatsapp\.net$|@c\.us$|@g\.us$/i, '');
};

export const parseEvolutionWebhookPayload = (
  payload: unknown,
  fallbackInstanceName?: null | string,
): EvolutionInboundMessage | null => {
  const root = getRecord(payload);

  if (!root) {
    return null;
  }

  const instanceName = getString(root, ['instance', 'instanceName'])
    || fallbackInstanceName?.trim()
    || '';
  const message = getMessageRecord(root);

  if (!instanceName || !message) {
    return null;
  }

  const key = getRecord(message.key) ?? getNestedRecord(message, ['messageKey']);

  if (message.fromMe === true || message.from_me === true || key?.fromMe === true) {
    return null;
  }

  const from = normalizeRemoteJid(
    getString(message, ['from', 'remoteJid', 'chatId', 'chat_id', 'sender'])
    || getString(key, ['remoteJid', 'participant']),
  );
  const messageId = getString(message, ['id', 'messageId', 'message_id'])
    || getString(key, ['id']);
  const body = getMessageBody(message);
  const profileName = getString(message, ['pushName', 'pushname', 'profileName'])
    || getString(getRecord(root.sender), ['pushName', 'name'])
    || undefined;

  if (!body || !from || !messageId) {
    return null;
  }

  return {
    body,
    from,
    instanceName,
    messageId,
    profileName,
  };
};

const parseEvolutionExternalThreadId = (externalThreadId?: null | string) => {
  if (!externalThreadId) {
    return null;
  }

  const [prefix, instanceName, ...recipientParts] = externalThreadId.split(':');
  const recipient = recipientParts.join(':').trim();

  if (prefix !== EVOLUTION_THREAD_PREFIX || !instanceName?.trim() || !recipient) {
    return null;
  }

  return {
    instanceName: instanceName.trim(),
    recipient,
  };
};

export const findEvolutionStoreConnection = async (params: {
  instanceName: string;
  webhookSecret?: null | string;
}): Promise<EvolutionStoreConnection | null> => {
  const rows = await db
    .select({
      config: channelConnectionsTable.config,
      connectionStatus: channelConnectionsTable.connectionStatus,
      isActive: channelConnectionsTable.isActive,
      organizationId: channelConnectionsTable.organizationId,
    })
    .from(channelConnectionsTable)
    .where(
      and(
        eq(channelConnectionsTable.channel, WHATSAPP_CHANNEL),
        eq(channelConnectionsTable.isActive, true),
        sql`${channelConnectionsTable.config}->>'provider' = 'evolution'`,
        sql`${channelConnectionsTable.config}->>'channelId' = ${params.instanceName}`,
      ),
    );

  for (const row of rows) {
    const config = row.config as EvolutionConnectionConfig | null;
    const configuredSecret = config?.webhookSecret?.trim();

    if (
      config
      && config.provider === 'evolution'
      && configuredSecret
      && configuredSecret === params.webhookSecret?.trim()
      && row.connectionStatus === 'connected'
      && row.isActive
    ) {
      return {
        displayPhoneNumber: config.displayPhoneNumber ?? undefined,
        instanceName: params.instanceName,
        organizationId: row.organizationId,
      };
    }
  }

  return null;
};

const findEvolutionOutboundStoreConnection = async (params: {
  instanceName: string;
  organizationId: string;
}): Promise<EvolutionStoreConnection | null> => {
  const rows = await db
    .select({
      config: channelConnectionsTable.config,
      connectionStatus: channelConnectionsTable.connectionStatus,
      isActive: channelConnectionsTable.isActive,
      organizationId: channelConnectionsTable.organizationId,
    })
    .from(channelConnectionsTable)
    .where(
      and(
        eq(channelConnectionsTable.organizationId, params.organizationId),
        eq(channelConnectionsTable.channel, WHATSAPP_CHANNEL),
        eq(channelConnectionsTable.isActive, true),
        sql`${channelConnectionsTable.config}->>'provider' = 'evolution'`,
        sql`${channelConnectionsTable.config}->>'channelId' = ${params.instanceName}`,
      ),
    )
    .limit(1);

  const row = rows[0];
  const config = row?.config as EvolutionConnectionConfig | null;

  if (
    row
    && config?.provider === 'evolution'
    && row.connectionStatus === 'connected'
    && row.isActive
  ) {
    return {
      displayPhoneNumber: config.displayPhoneNumber ?? undefined,
      instanceName: params.instanceName,
      organizationId: row.organizationId,
    };
  }

  return null;
};

export const sendEvolutionConversationTextMessage = async (params: {
  body: string;
  externalThreadId?: null | string;
  organizationId: string;
}) => {
  const thread = parseEvolutionExternalThreadId(params.externalThreadId);

  if (!thread) {
    return {
      reason: 'missing_evolution_thread',
      status: 'skipped' as const,
    };
  }

  const connection = await findEvolutionOutboundStoreConnection({
    instanceName: thread.instanceName,
    organizationId: params.organizationId,
  });

  if (!connection) {
    return {
      reason: 'evolution_connection_not_found',
      status: 'skipped' as const,
    };
  }

  const outboundMessageId = await sendEvolutionText({
    body: params.body,
    instanceName: connection.instanceName,
    to: thread.recipient,
  });

  return {
    outboundMessageId,
    status: 'sent' as const,
  };
};

export const buildEvolutionExternalThreadId = (params: {
  customerFrom: string;
  instanceName: string;
}) => {
  return `${EVOLUTION_THREAD_PREFIX}:${params.instanceName}:${params.customerFrom.replace(/\D/g, '')}`;
};
