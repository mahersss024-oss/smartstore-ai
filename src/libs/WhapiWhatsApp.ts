import { and, eq, sql } from 'drizzle-orm';
import { channelConnectionsTable } from '@/models/Schema';
import { db } from './DB';
import { decryptSecret } from './PlatformAIProviderConfig';

const WHAPI_API_BASE = 'https://gate.whapi.cloud';
const WHATSAPP_CHANNEL = 'whatsapp';

export type WhapiInboundMessage = {
  body: string;
  channelId: string;
  from: string;
  messageId: string;
  profileName?: string;
};

export type WhapiStoreConnection = {
  apiToken: string;
  channelId: string;
  displayPhoneNumber?: string;
  organizationId: string;
};

type WhapiConnectionConfig = {
  channelId?: null | string;
  displayPhoneNumber?: null | string;
  encryptedApiToken?: null | string;
  provider?: null | string;
  webhookSecret?: null | string;
};

export class WhapiSendError extends Error {
  status: number;

  constructor(params: {
    message?: string;
    status: number;
  }) {
    super(`Whapi send failed: status=${params.status}${params.message ? ` message="${params.message}"` : ''}`);
    this.name = 'WhapiSendError';
    this.status = params.status;
  }
}

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

const getMessageRecord = (payload: Record<string, unknown>) => {
  const messages = Array.isArray(payload.messages) ? payload.messages : undefined;
  const firstMessage = getRecord(messages?.[0]);

  return firstMessage
    ?? getRecord(payload.message)
    ?? getRecord(payload.data)
    ?? payload;
};

const getBody = (message: Record<string, unknown>) => {
  const text = message.text;

  if (typeof text === 'string') {
    return text.trim();
  }

  const textRecord = getRecord(text);

  return getString(textRecord, ['body', 'text'])
    || getString(message, ['body', 'caption', 'message']);
};

export const parseWhapiWebhookPayload = (
  payload: unknown,
  fallbackChannelId?: null | string,
): WhapiInboundMessage | null => {
  const root = getRecord(payload);

  if (!root) {
    return null;
  }

  const channel = getRecord(root.channel);
  const channelId = getString(root, ['channel_id', 'channelId'])
    || getString(channel, ['id'])
    || fallbackChannelId?.trim()
    || '';
  const message = getMessageRecord(root);

  if (!channelId || !message) {
    return null;
  }

  if (message.from_me === true || message.fromMe === true) {
    return null;
  }

  const body = getBody(message);
  const from = getString(message, ['from', 'chat_id', 'chatId', 'contact_id', 'sender']);
  const messageId = getString(message, ['id', 'message_id', 'messageId']);
  const contact = getRecord(message.contact) ?? getRecord(root.contact);
  const profileName = getString(contact, ['name', 'pushname', 'profile_name']) || undefined;

  if (!body || !from || !messageId) {
    return null;
  }

  return {
    body,
    channelId,
    from,
    messageId,
    profileName,
  };
};

export const sendWhapiText = async (params: {
  apiToken: string;
  body: string;
  to: string;
}) => {
  const response = await fetch(`${WHAPI_API_BASE}/messages/text`, {
    body: JSON.stringify({
      body: params.body,
      to: params.to,
    }),
    headers: {
      'Authorization': `Bearer ${params.apiToken}`,
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  const responseText = await response.text().catch(() => '');

  if (!response.ok) {
    let message = responseText ? 'unparseable_whapi_error' : undefined;

    try {
      const parsed = JSON.parse(responseText) as { error?: { message?: string }; message?: string };
      message = parsed.error?.message ?? parsed.message ?? message;
    } catch {}

    throw new WhapiSendError({
      message,
      status: response.status,
    });
  }

  if (!responseText) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(responseText) as {
      id?: string;
      message?: { id?: string };
      messages?: Array<{ id?: string }>;
    };

    return parsed.message?.id ?? parsed.messages?.[0]?.id ?? parsed.id;
  } catch {
    return undefined;
  }
};

export const findWhapiStoreConnection = async (params: {
  channelId: string;
  webhookSecret?: null | string;
}): Promise<WhapiStoreConnection | null> => {
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
        sql`${channelConnectionsTable.config}->>'provider' = 'whapi'`,
        sql`${channelConnectionsTable.config}->>'channelId' = ${params.channelId}`,
      ),
    );

  for (const row of rows) {
    const config = row.config as WhapiConnectionConfig | null;
    const apiToken = config?.encryptedApiToken
      ? decryptSecret(config.encryptedApiToken)
      : undefined;
    const configuredSecret = config?.webhookSecret?.trim();

    if (
      config
      && config.provider === 'whapi'
      && typeof config.channelId === 'string'
      && apiToken
      && configuredSecret
      && configuredSecret === params.webhookSecret?.trim()
      && row.connectionStatus === 'connected'
      && row.isActive
    ) {
      return {
        apiToken,
        channelId: config.channelId,
        displayPhoneNumber: typeof config.displayPhoneNumber === 'string'
          ? config.displayPhoneNumber
          : undefined,
        organizationId: row.organizationId,
      };
    }
  }

  return null;
};
