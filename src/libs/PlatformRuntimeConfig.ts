import { eq } from 'drizzle-orm';
import { platformSettingsTable } from '@/models/Schema';
import { db } from './DB';
import { Env } from './Env';
import { decryptSecret, maskApiKey } from './PlatformAIProviderConfig';

export const PLATFORM_RUNTIME_CONFIG_SETTING_KEY = 'runtime_config';

type StoredPlatformRuntimeConfig = {
  internal?: {
    aiEmployeeWebhookSecretPreview?: string;
    encryptedAIEmployeeWebhookSecret?: string;
    encryptedMaintenanceSecret?: string;
    maintenanceSecretPreview?: string;
  };
  updatedAt?: string;
  updatedBy?: string;
};

export type PlatformRuntimeConfig = {
  internal: {
    aiEmployeeWebhookSecret?: string;
    aiEmployeeWebhookSecretPreview?: string;
    maintenanceSecret?: string;
    maintenanceSecretPreview?: string;
  };
  updatedAt?: string;
  updatedBy?: string;
};

export type PlatformRuntimeConfigStatus = {
  internal: {
    aiEmployeeWebhookSecretPreview?: string;
    aiEmployeeWebhookSecretStored: boolean;
    aiEmployeeWebhookSecretAvailable: boolean;
    maintenanceSecretPreview?: string;
    maintenanceSecretStored: boolean;
    maintenanceSecretAvailable: boolean;
  };
  updatedAt?: string;
  updatedBy?: string;
};

export const normalizePlatformRuntimeConfig = (
  value: unknown,
): StoredPlatformRuntimeConfig => {
  if (!value || typeof value !== 'object') {
    return { internal: {} };
  }

  const config = value as StoredPlatformRuntimeConfig;
  const internal = config.internal && typeof config.internal === 'object'
    ? config.internal
    : {};

  return {
    internal: {
      aiEmployeeWebhookSecretPreview: typeof internal.aiEmployeeWebhookSecretPreview === 'string'
        ? internal.aiEmployeeWebhookSecretPreview
        : undefined,
      encryptedAIEmployeeWebhookSecret: typeof internal.encryptedAIEmployeeWebhookSecret === 'string'
        ? internal.encryptedAIEmployeeWebhookSecret
        : undefined,
      encryptedMaintenanceSecret: typeof internal.encryptedMaintenanceSecret === 'string'
        ? internal.encryptedMaintenanceSecret
        : undefined,
      maintenanceSecretPreview: typeof internal.maintenanceSecretPreview === 'string'
        ? internal.maintenanceSecretPreview
        : undefined,
    },
    updatedAt: typeof config.updatedAt === 'string' ? config.updatedAt : undefined,
    updatedBy: typeof config.updatedBy === 'string' ? config.updatedBy : undefined,
  };
};

const getStoredPlatformRuntimeConfig = async () => {
  const [setting] = await db
    .select({ value: platformSettingsTable.value })
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, PLATFORM_RUNTIME_CONFIG_SETTING_KEY))
    .limit(1);

  return normalizePlatformRuntimeConfig(setting?.value);
};

const decryptStoredValue = (value?: string) => {
  return value ? decryptSecret(value) : undefined;
};

const getPreview = (storedPreview?: string, fallbackValue?: string) => {
  return storedPreview ?? (fallbackValue ? maskApiKey(fallbackValue) : undefined);
};

export const getPlatformRuntimeConfig = async (): Promise<PlatformRuntimeConfig> => {
  const storedConfig = await getStoredPlatformRuntimeConfig();
  const storedInternal = storedConfig.internal ?? {};
  const aiEmployeeWebhookSecret = decryptStoredValue(
    storedInternal.encryptedAIEmployeeWebhookSecret,
  ) ?? Env.AI_EMPLOYEE_WEBHOOK_SECRET;
  const maintenanceSecret = decryptStoredValue(
    storedInternal.encryptedMaintenanceSecret,
  ) ?? Env.MAINTENANCE_SECRET;

  return {
    internal: {
      aiEmployeeWebhookSecret,
      aiEmployeeWebhookSecretPreview: getPreview(
        storedInternal.aiEmployeeWebhookSecretPreview,
        Env.AI_EMPLOYEE_WEBHOOK_SECRET,
      ),
      maintenanceSecret,
      maintenanceSecretPreview: getPreview(
        storedInternal.maintenanceSecretPreview,
        Env.MAINTENANCE_SECRET,
      ),
    },
    updatedAt: storedConfig.updatedAt,
    updatedBy: storedConfig.updatedBy,
  };
};

export const getPlatformRuntimeConfigStatus = async (): Promise<PlatformRuntimeConfigStatus> => {
  const storedConfig = await getStoredPlatformRuntimeConfig();
  const runtimeConfig = await getPlatformRuntimeConfig();
  const storedInternal = storedConfig.internal ?? {};

  return {
    internal: {
      aiEmployeeWebhookSecretAvailable: Boolean(runtimeConfig.internal.aiEmployeeWebhookSecret),
      aiEmployeeWebhookSecretPreview: runtimeConfig.internal.aiEmployeeWebhookSecretPreview,
      aiEmployeeWebhookSecretStored: Boolean(storedInternal.encryptedAIEmployeeWebhookSecret),
      maintenanceSecretAvailable: Boolean(runtimeConfig.internal.maintenanceSecret),
      maintenanceSecretPreview: runtimeConfig.internal.maintenanceSecretPreview,
      maintenanceSecretStored: Boolean(storedInternal.encryptedMaintenanceSecret),
    },
    updatedAt: storedConfig.updatedAt,
    updatedBy: storedConfig.updatedBy,
  };
};
