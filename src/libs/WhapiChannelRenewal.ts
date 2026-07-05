import { and, eq, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { isStoreFeatureEnabled } from '@/libs/StoreServiceControls';
import {
  extendWhapiManagedChannel,
  getWhapiManagedChannel,
  WhapiConnectError,
} from '@/libs/WhapiConnect';
import { channelConnectionsTable } from '@/models/Schema';

type WhapiConnectionConfig = {
  apiToken?: null | string;
  apiTokenPreview?: null | string;
  channelId?: null | string;
  displayPhoneNumber?: null | string;
  managedByPlatform?: boolean | null;
  provider?: null | string;
  webhookReady?: boolean | null;
  whapiAutoRenew?: {
    activeUntilAt?: null | string;
    lastCheckedAt?: null | string;
    lastError?: null | string;
    lastErrorAt?: null | string;
    lastExtendedAt?: null | string;
  };
};

type WhapiRenewalCandidate = {
  config: unknown;
  id: number;
  organizationId: string;
};

type WhapiRenewalDeps = {
  extendChannel: typeof extendWhapiManagedChannel;
  getChannel: typeof getWhapiManagedChannel;
  isWhatsappEnabled: typeof isStoreFeatureEnabled;
  loadCandidates: (limit: number) => Promise<WhapiRenewalCandidate[]>;
  saveConnectionConfig: (params: {
    config: WhapiConnectionConfig;
    connectionStatus?: string;
    id: number;
    isActive?: boolean;
  }) => Promise<void>;
};

export type WhapiChannelRenewalResult = {
  checked: number;
  extended: number;
  failed: number;
  missing: number;
  skippedInactiveStore: number;
  skippedNotDue: number;
  skippedRecentlyExtended: number;
};

const emptyResult = (): WhapiChannelRenewalResult => ({
  checked: 0,
  extended: 0,
  failed: 0,
  missing: 0,
  skippedInactiveStore: 0,
  skippedNotDue: 0,
  skippedRecentlyExtended: 0,
});

const msPerHour = 60 * 60 * 1000;
const msPerDay = 24 * msPerHour;

const parseTimestamp = (value: null | string | undefined) => {
  if (!value) {
    return null;
  }

  const timestamp = Date.parse(value);

  return Number.isNaN(timestamp) ? null : timestamp;
};

const normalizeWhapiConfig = (value: unknown): WhapiConnectionConfig | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const config = value as WhapiConnectionConfig;

  return config.provider === 'whapi' && config.channelId ? config : null;
};

const getRenewalActiveUntil = (
  config: WhapiConnectionConfig,
  remoteActiveUntil?: string,
) => {
  return parseTimestamp(remoteActiveUntil)
    ?? parseTimestamp(config.whapiAutoRenew?.activeUntilAt);
};

const isDueForRenewal = (params: {
  activeUntil: null | number;
  nowMs: number;
}) => {
  if (!params.activeUntil) {
    return true;
  }

  return params.activeUntil - params.nowMs <= Env.WHAPI_CHANNEL_RENEW_LOOKAHEAD_HOURS * msPerHour;
};

const wasRecentlyExtended = (params: {
  config: WhapiConnectionConfig;
  nowMs: number;
}) => {
  const lastExtendedAt = parseTimestamp(params.config.whapiAutoRenew?.lastExtendedAt);

  return Boolean(
    lastExtendedAt
    && params.nowMs - lastExtendedAt < Env.WHAPI_CHANNEL_RENEW_COOLDOWN_HOURS * msPerHour,
  );
};

const buildSuccessfulRenewalConfig = (params: {
  activeUntil: null | number;
  config: WhapiConnectionConfig;
  now: Date;
}) => {
  const baseTime = params.activeUntil && params.activeUntil > params.now.getTime()
    ? params.activeUntil
    : params.now.getTime();
  const estimatedActiveUntil = new Date(
    baseTime + Env.WHAPI_MANAGED_CHANNEL_EXTEND_DAYS * msPerDay,
  ).toISOString();

  return {
    ...params.config,
    whapiAutoRenew: {
      ...(params.config.whapiAutoRenew ?? {}),
      activeUntilAt: estimatedActiveUntil,
      lastCheckedAt: params.now.toISOString(),
      lastError: null,
      lastErrorAt: null,
      lastExtendedAt: params.now.toISOString(),
    },
  };
};

const buildCheckedConfig = (params: {
  activeUntil?: string;
  config: WhapiConnectionConfig;
  now: Date;
}) => ({
  ...params.config,
  whapiAutoRenew: {
    ...(params.config.whapiAutoRenew ?? {}),
    activeUntilAt: params.activeUntil ?? params.config.whapiAutoRenew?.activeUntilAt ?? null,
    lastCheckedAt: params.now.toISOString(),
  },
});

const buildFailedConfig = (params: {
  config: WhapiConnectionConfig;
  error: unknown;
  now: Date;
}) => ({
  ...params.config,
  whapiAutoRenew: {
    ...(params.config.whapiAutoRenew ?? {}),
    lastCheckedAt: params.now.toISOString(),
    lastError: params.error instanceof Error ? params.error.message : 'unknown_error',
    lastErrorAt: params.now.toISOString(),
  },
});

const loadWhapiRenewalCandidates = async (limit: number) => {
  return await db
    .select({
      config: channelConnectionsTable.config,
      id: channelConnectionsTable.id,
      organizationId: channelConnectionsTable.organizationId,
    })
    .from(channelConnectionsTable)
    .where(and(
      eq(channelConnectionsTable.channel, 'whatsapp'),
      eq(channelConnectionsTable.isActive, true),
      sql`${channelConnectionsTable.config}->>'provider' = 'whapi'`,
      sql`${channelConnectionsTable.config}->>'channelId' is not null`,
    ))
    .limit(limit);
};

const saveWhapiConnectionConfig = async (params: {
  config: WhapiConnectionConfig;
  connectionStatus?: string;
  id: number;
  isActive?: boolean;
}) => {
  await db
    .update(channelConnectionsTable)
    .set({
      config: params.config,
      ...(params.connectionStatus ? { connectionStatus: params.connectionStatus } : {}),
      ...(typeof params.isActive === 'boolean' ? { isActive: params.isActive } : {}),
    })
    .where(eq(channelConnectionsTable.id, params.id));
};

const defaultDeps: WhapiRenewalDeps = {
  extendChannel: extendWhapiManagedChannel,
  getChannel: getWhapiManagedChannel,
  isWhatsappEnabled: isStoreFeatureEnabled,
  loadCandidates: loadWhapiRenewalCandidates,
  saveConnectionConfig: saveWhapiConnectionConfig,
};

export const renewWhapiManagedChannels = async (
  params: {
    limit?: number;
    now?: Date;
  } = {},
  deps: WhapiRenewalDeps = defaultDeps,
) => {
  const now = params.now ?? new Date();
  const nowMs = now.getTime();
  const result = emptyResult();
  const candidates = await deps.loadCandidates(params.limit ?? 100);

  for (const candidate of candidates) {
    result.checked += 1;

    const config = normalizeWhapiConfig(candidate.config);

    if (!config?.channelId) {
      result.failed += 1;
      continue;
    }

    if (!await deps.isWhatsappEnabled(candidate.organizationId, 'whatsapp')) {
      result.skippedInactiveStore += 1;
      continue;
    }

    if (wasRecentlyExtended({ config, nowMs })) {
      result.skippedRecentlyExtended += 1;
      continue;
    }

    try {
      const remoteChannel = await deps.getChannel({ channelId: config.channelId });

      if (!remoteChannel) {
        result.missing += 1;
        await deps.saveConnectionConfig({
          config: buildFailedConfig({
            config,
            error: new WhapiConnectError('whapi_channel_missing', { status: 404 }),
            now,
          }),
          connectionStatus: 'disconnected',
          id: candidate.id,
          isActive: false,
        });
        continue;
      }

      const activeUntil = getRenewalActiveUntil(config, remoteChannel.activeUntil);

      if (!isDueForRenewal({ activeUntil, nowMs })) {
        result.skippedNotDue += 1;
        await deps.saveConnectionConfig({
          config: buildCheckedConfig({
            activeUntil: remoteChannel.activeUntil,
            config,
            now,
          }),
          id: candidate.id,
        });
        continue;
      }

      await deps.extendChannel({
        channelId: config.channelId,
        comment: '[SmartStore AI] Automatic active store renewal',
        days: Env.WHAPI_MANAGED_CHANNEL_EXTEND_DAYS,
      });
      await deps.saveConnectionConfig({
        config: buildSuccessfulRenewalConfig({
          activeUntil,
          config,
          now,
        }),
        connectionStatus: 'connected',
        id: candidate.id,
        isActive: true,
      });
      result.extended += 1;
    } catch (error) {
      result.failed += 1;
      await deps.saveConnectionConfig({
        config: buildFailedConfig({ config, error, now }),
        id: candidate.id,
      });
    }
  }

  return result;
};
