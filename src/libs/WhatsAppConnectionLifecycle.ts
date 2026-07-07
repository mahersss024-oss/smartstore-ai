import { and, eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  channelConnectionsTable,
  storeSettingsTable,
} from '@/models/Schema';
import { buildWhatsAppChannelConfig } from '@/utils/CustomerChannels';

type ExistingWhatsappConfig = {
  apiTokenPreview?: string | null;
  channelId?: string | null;
  connectionStatus?: string | null;
  displayPhoneNumber?: string | null;
  encryptedApiToken?: string | null;
  managedByPlatform?: boolean | null;
  managedChannelActivatedAt?: string | null;
  mode?: string | null;
  provider?: string | null;
  webhookSecret?: string | null;
};

type StoreSettingsMetadata = {
  channelIntegrations?: {
    whatsapp?: Record<string, unknown>;
  };
} & Record<string, unknown>;

const shouldPreserveWhapiConnectionOnDisconnect = (config: ExistingWhatsappConfig) => {
  return (
    ['evolution', 'whapi'].includes(config.provider ?? '')
    || ['evolution', 'whapi'].includes(config.mode ?? '')
  ) && Boolean(config.channelId);
};

const getWhatsAppProvider = (config: ExistingWhatsappConfig) => {
  return config.provider === 'evolution' || config.mode === 'evolution'
    ? 'evolution'
    : 'whapi';
};

export const buildDisconnectedWhatsAppConnection = (config: ExistingWhatsappConfig) => {
  if (!shouldPreserveWhapiConnectionOnDisconnect(config)) {
    return {};
  }

  return {
    ...config,
    connectionStatus: 'disconnected',
    webhookReady: false,
  };
};

export const buildDisconnectedWhatsAppMetadata = (config: ExistingWhatsappConfig) => {
  if (!shouldPreserveWhapiConnectionOnDisconnect(config)) {
    return {};
  }

  const channel = buildWhatsAppChannelConfig({
    apiTokenPreview: config.apiTokenPreview ?? null,
    channelId: config.channelId ?? null,
    displayPhoneNumber: config.displayPhoneNumber ?? null,
    encryptedApiToken: null,
    hasApiToken: Boolean(config.channelId),
    provider: getWhatsAppProvider(config),
    status: 'disconnected',
    storeName: 'SmartStore',
    webhookSecret: config.webhookSecret ?? null,
  });

  return {
    apiTokenPreview: config.apiTokenPreview ?? null,
    channelId: config.channelId ?? null,
    connectionStatus: 'disconnected',
    displayPhoneNumber: config.displayPhoneNumber ?? null,
    managedByPlatform: config.managedByPlatform ?? undefined,
    managedChannelActivatedAt: config.managedChannelActivatedAt ?? null,
    mode: getWhatsAppProvider(config),
    phoneNumber: config.displayPhoneNumber ?? null,
    provider: getWhatsAppProvider(config),
    webhookReady: false,
    webhookSecret: config.webhookSecret ?? null,
    whatsappLink: channel.whatsappLink,
    whatsappTarget: channel.whatsappTarget,
  };
};

export const disableOrganizationWhatsAppConnection = async (organizationId: string) => {
  const [connection] = await db
    .select({ config: channelConnectionsTable.config })
    .from(channelConnectionsTable)
    .where(and(
      eq(channelConnectionsTable.organizationId, organizationId),
      eq(channelConnectionsTable.channel, 'whatsapp'),
    ))
    .limit(1);

  const existingConfig = (connection?.config ?? {}) as ExistingWhatsappConfig;
  const disconnectedConfig = buildDisconnectedWhatsAppConnection(existingConfig);

  await db
    .insert(channelConnectionsTable)
    .values({
      aiMode: 'assist',
      channel: 'whatsapp',
      config: disconnectedConfig,
      connectionStatus: 'disconnected',
      displayName: 'WhatsApp',
      isActive: false,
      organizationId,
    })
    .onConflictDoUpdate({
      set: {
        config: disconnectedConfig,
        connectionStatus: 'disconnected',
        isActive: false,
      },
      target: [
        channelConnectionsTable.organizationId,
        channelConnectionsTable.channel,
      ],
    });

  const disconnectedMetadata = buildDisconnectedWhatsAppMetadata(existingConfig);

  if (!Object.keys(disconnectedMetadata).length) {
    return;
  }

  const [settings] = await db
    .select({ metadata: storeSettingsTable.metadata })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);

  if (!settings) {
    return;
  }

  const metadata = (settings.metadata ?? {}) as StoreSettingsMetadata;

  await db
    .update(storeSettingsTable)
    .set({
      metadata: {
        ...metadata,
        channelIntegrations: {
          ...(metadata.channelIntegrations ?? {}),
          whatsapp: disconnectedMetadata,
        },
      },
    })
    .where(eq(storeSettingsTable.organizationId, organizationId));
};
