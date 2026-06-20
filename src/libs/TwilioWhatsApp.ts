import { and, eq, sql } from 'drizzle-orm';
import { channelConnectionsTable } from '@/models/Schema';
import { db } from './DB';
import { logger } from './Logger';
import { decryptSecret } from './PlatformAIProviderConfig';
import { createTwilioClient } from './TwilioClient';

const TWILIO_CHANNEL = 'whatsapp';
const THREAD_PREFIX = 'twa';

const digitsOnly = (value: string) => value.replace(/\D/g, '');

export type TwilioInboundMessage = {
  body: string;
  from: string;
  messageSid: string;
  profileName?: string;
  to: string;
  waId?: string;
};

export const parseTwilioWebhookBody = (params: URLSearchParams): TwilioInboundMessage => {
  return {
    body: params.get('Body') ?? '',
    from: params.get('From') ?? '',
    messageSid: params.get('MessageSid') ?? '',
    profileName: params.get('ProfileName') ?? undefined,
    to: params.get('To') ?? '',
    waId: params.get('WaId') ?? undefined,
  };
};

export const extractCustomerPhoneFromWhatsAppFrom = (from: string) => {
  return from.replace(/^whatsapp:/, '').trim();
};

export const buildTwilioExternalThreadId = (params: {
  customerFrom: string;
  storeTo: string;
}) => {
  return `${THREAD_PREFIX}:${digitsOnly(params.storeTo)}:${digitsOnly(params.customerFrom)}`;
};

const parseTwilioExternalThreadId = (value?: null | string) => {
  const match = /^twa:(\d+):(\d+)$/.exec(value ?? '');

  if (!match?.[1] || !match[2]) {
    return undefined;
  }

  return {
    customerPhone: `+${match[2]}`,
    storeTwilioFrom: `whatsapp:+${match[1]}`,
  };
};

export type TwilioStoreConnection = {
  accountSid: string;
  authToken: string;
  messagingServiceSid?: string;
  organizationId: string;
  twilioWhatsAppFrom: string;
};

type TwilioConnectionConfig = {
  encryptedTwilioAuthToken?: null | string;
  provider?: null | string;
  twilioAccountSid?: null | string;
  twilioMessagingServiceSid?: null | string;
  twilioWhatsAppFrom?: null | string;
};

export const findTwilioStoreConnection = async (
  twilioWhatsAppTo: string,
): Promise<null | TwilioStoreConnection> => {
  const normalizedTo = twilioWhatsAppTo.startsWith('whatsapp:')
    ? twilioWhatsAppTo
    : `whatsapp:${twilioWhatsAppTo}`;

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
        eq(channelConnectionsTable.channel, TWILIO_CHANNEL),
        eq(channelConnectionsTable.isActive, true),
        sql`${channelConnectionsTable.config}->>'provider' = 'twilio'`,
        sql`${channelConnectionsTable.config}->>'twilioWhatsAppFrom' = ${normalizedTo}`,
      ),
    );

  for (const row of rows) {
    const config = row.config as Record<string, unknown> | null;
    const typedConfig = config as TwilioConnectionConfig | null;
    const authToken = typedConfig?.encryptedTwilioAuthToken
      ? decryptSecret(typedConfig.encryptedTwilioAuthToken)
      : undefined;

    if (
      typedConfig
      && typedConfig.provider === 'twilio'
      && typeof typedConfig.twilioAccountSid === 'string'
      && /^AC[a-f\d]{32}$/i.test(typedConfig.twilioAccountSid)
      && authToken
      && typeof typedConfig.twilioWhatsAppFrom === 'string'
      && row.connectionStatus === 'connected'
      && row.isActive
    ) {
      return {
        accountSid: typedConfig.twilioAccountSid,
        authToken,
        messagingServiceSid: typeof typedConfig.twilioMessagingServiceSid === 'string'
          ? typedConfig.twilioMessagingServiceSid
          : undefined,
        organizationId: row.organizationId,
        twilioWhatsAppFrom: typedConfig.twilioWhatsAppFrom,
      };
    }
  }

  return null;
};

export const sendTwilioWhatsAppMessage = async (params: {
  body: string;
  connection: Pick<
    TwilioStoreConnection,
    'accountSid' | 'authToken' | 'messagingServiceSid' | 'twilioWhatsAppFrom'
  >;
  to: string;
}) => {
  const client = createTwilioClient(
    params.connection.accountSid,
    params.connection.authToken,
  );
  const normalizedFrom = params.connection.twilioWhatsAppFrom.startsWith('whatsapp:')
    ? params.connection.twilioWhatsAppFrom
    : `whatsapp:${params.connection.twilioWhatsAppFrom}`;
  const normalizedTo = params.to.startsWith('whatsapp:') ? params.to : `whatsapp:${params.to}`;

  const message = await client.messages.create({
    body: params.body,
    ...(params.connection.messagingServiceSid
      ? { messagingServiceSid: params.connection.messagingServiceSid }
      : { from: normalizedFrom }),
    to: normalizedTo,
  });

  return message.sid;
};

export const sendTwilioConversationTextMessage = async (params: {
  body: string;
  externalThreadId?: null | string;
  organizationId: string;
}) => {
  const thread = parseTwilioExternalThreadId(params.externalThreadId);

  if (!thread) {
    return {
      reason: 'not_twilio_thread',
      status: 'skipped' as const,
    };
  }

  const connection = await findTwilioStoreConnection(thread.storeTwilioFrom);

  if (!connection || connection.organizationId !== params.organizationId) {
    return {
      reason: 'store_connection_not_found',
      status: 'skipped' as const,
    };
  }

  try {
    await sendTwilioWhatsAppMessage({
      body: params.body,
      connection,
      to: thread.customerPhone,
    });

    return {
      status: 'sent' as const,
    };
  } catch (error) {
    logger.warn('Twilio WhatsApp order notification send failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
      organizationId: params.organizationId,
    });

    return {
      reason: 'twilio_send_failed',
      status: 'failed' as const,
    };
  }
};

export const validateTwilioWhatsAppCredentials = async (params: {
  accountSid: string;
  authToken: string;
}) => {
  if (!/^AC[a-f\d]{32}$/i.test(params.accountSid)) {
    return false;
  }

  try {
    const client = createTwilioClient(params.accountSid, params.authToken);
    const account = await client.api.accounts(params.accountSid).fetch();

    return account.sid === params.accountSid;
  } catch {
    return false;
  }
};
