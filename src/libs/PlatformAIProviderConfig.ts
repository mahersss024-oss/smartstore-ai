import { Buffer } from 'node:buffer';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { platformSettingsTable } from '@/models/Schema';
import { db } from './DB';
import { Env } from './Env';
import { isPrivateNetworkAddress } from './OutboundHttp';

export const PLATFORM_AI_PROVIDER_SETTING_KEY = 'ai_provider';

const isIPLiteral = (hostname: string) => {
  return /^[\d.]+$/.test(hostname) || hostname.includes(':');
};

const AI_PROVIDER_IDS = ['openai', 'deepseek', 'openai_compatible'] as const;

export type AIProviderId = typeof AI_PROVIDER_IDS[number];

export type PlatformAIProviderConfig = {
  apiKey?: string;
  apiKeyPreview?: string;
  baseUrl?: string;
  enabled: boolean;
  model: string;
  provider: AIProviderId;
  systemPrompt: string;
  updatedAt?: string;
  updatedBy?: string;
};

type StoredPlatformAIProviderConfig = Omit<PlatformAIProviderConfig, 'apiKey'> & {
  encryptedApiKey?: string;
};

const DEFAULT_AI_PROVIDER_CONFIG: StoredPlatformAIProviderConfig = {
  enabled: false,
  model: 'gpt-4.1-mini',
  provider: 'openai',
  systemPrompt: [
    'You are a senior store employee who sells through natural conversation.',
    'Be warm, concise, commercially smart, and precise.',
    'Confirm details without sounding like a form.',
    'Recommend from the store catalog when it helps the customer decide.',
  ].join('\n'),
};

const DEFAULT_MODEL_BY_PROVIDER: Record<AIProviderId, string> = {
  deepseek: 'deepseek-chat',
  openai_compatible: 'gpt-4.1-mini',
  openai: DEFAULT_AI_PROVIDER_CONFIG.model,
};

const getDefaultModelForProvider = (provider: AIProviderId) => {
  return DEFAULT_MODEL_BY_PROVIDER[provider];
};

export const normalizeProviderModel = (provider: AIProviderId, model: unknown) => {
  const value = typeof model === 'string' ? model.trim() : '';

  if (!value) {
    return getDefaultModelForProvider(provider);
  }

  if (provider === 'deepseek' && !value.startsWith('deepseek-')) {
    return getDefaultModelForProvider(provider);
  }

  if (provider === 'openai' && value.startsWith('deepseek-')) {
    return getDefaultModelForProvider(provider);
  }

  return value;
};

const normalizeProviderBaseUrl = (
  provider: AIProviderId,
  value: unknown,
) => {
  const baseUrl = typeof value === 'string'
    ? value.trim().replace(/\/+$/, '')
    : '';

  if (!baseUrl) {
    return provider === 'openai_compatible'
      ? undefined
      : provider === 'deepseek'
        ? 'https://api.deepseek.com'
        : undefined;
  }

  try {
    const url = new URL(baseUrl);
    const isLocalDevelopment = Env.NODE_ENV !== 'production'
      && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);

    if (url.username || url.password) {
      return undefined;
    }

    if (url.protocol !== 'https:' && !(isLocalDevelopment && url.protocol === 'http:')) {
      return undefined;
    }

    if (
      Env.NODE_ENV === 'production'
      && (
        url.hostname === 'localhost'
        || (isIPLiteral(url.hostname) && isPrivateNetworkAddress(url.hostname))
      )
    ) {
      return undefined;
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    return undefined;
  }
};

const getEncryptionKey = (secret: string) => {
  return createHash('sha256')
    .update(secret)
    .digest();
};

const getPrimaryEncryptionSecret = () => Env.PLATFORM_SECRETS_ENCRYPTION_KEY
  ?? Env.CLERK_SECRET_KEY;

const getLegacyEncryptionSecret = () => Env.CLERK_SECRET_KEY;

const getPreviousEncryptionSecrets = () => (
  Env.PLATFORM_SECRETS_PREVIOUS_ENCRYPTION_KEYS
    ?.split(',')
    .map(secret => secret.trim())
    .filter(Boolean)
    ?? []
);

export const encryptSecret = (value: string) => {
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    'aes-256-gcm',
    getEncryptionKey(getPrimaryEncryptionSecret()),
    iv,
  );
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString('base64url'),
    tag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.');
};

const decryptSecretWithKey = (value: string, secret: string) => {
  const [ivValue, tagValue, encryptedValue] = value.split('.');

  if (!ivValue || !tagValue || !encryptedValue) {
    return undefined;
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(secret),
    Buffer.from(ivValue, 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

export const decryptSecret = (
  value: string,
  options?: {
    additionalSecrets?: string[];
  },
) => {
  const candidateSecrets = Array.from(new Set([
    getPrimaryEncryptionSecret(),
    ...getPreviousEncryptionSecrets(),
    ...(options?.additionalSecrets ?? []),
    getLegacyEncryptionSecret(),
  ]));

  for (const secret of candidateSecrets) {
    try {
      return decryptSecretWithKey(value, secret);
    } catch {
      // Continue through the rotation keyring without exposing which key matched.
    }
  }

  return undefined;
};

export const maskApiKey = (apiKey: string) => {
  const trimmed = apiKey.trim();

  if (trimmed.length <= 8) {
    return '********';
  }

  return `${trimmed.slice(0, 3)}...${trimmed.slice(-4)}`;
};

export const isEncryptedSecretPayload = (value: null | string | undefined) => {
  const trimmed = value?.trim();

  if (!trimmed) {
    return false;
  }

  const parts = trimmed.split('.');

  return parts.length === 3
    && parts.every(part => /^[\w-]+$/.test(part));
};

export const isMaskedSecretPreview = (value: null | string | undefined) => {
  const trimmed = value?.trim();

  if (!trimmed) {
    return false;
  }

  return /^\*+$/.test(trimmed) || trimmed.includes('...');
};

export const getReusablePlainSecret = (value: null | string | undefined) => {
  const trimmed = value?.trim();

  if (!trimmed || isMaskedSecretPreview(trimmed) || isEncryptedSecretPayload(trimmed)) {
    return undefined;
  }

  return trimmed;
};

export const normalizePlatformAIProviderConfig = (
  value: unknown,
): StoredPlatformAIProviderConfig => {
  if (!value || typeof value !== 'object') {
    return DEFAULT_AI_PROVIDER_CONFIG;
  }

  const config = value as Partial<StoredPlatformAIProviderConfig>;
  const provider = AI_PROVIDER_IDS.includes(config.provider as AIProviderId)
    ? config.provider as AIProviderId
    : DEFAULT_AI_PROVIDER_CONFIG.provider;

  return {
    apiKeyPreview: typeof config.apiKeyPreview === 'string'
      ? config.apiKeyPreview
      : undefined,
    baseUrl: normalizeProviderBaseUrl(provider, config.baseUrl),
    enabled: config.enabled === true,
    encryptedApiKey: typeof config.encryptedApiKey === 'string'
      ? config.encryptedApiKey
      : undefined,
    model: normalizeProviderModel(provider, config.model),
    provider,
    systemPrompt: typeof config.systemPrompt === 'string' && config.systemPrompt.trim()
      ? config.systemPrompt.trim()
      : DEFAULT_AI_PROVIDER_CONFIG.systemPrompt,
    updatedAt: typeof config.updatedAt === 'string' ? config.updatedAt : undefined,
    updatedBy: typeof config.updatedBy === 'string' ? config.updatedBy : undefined,
  };
};

export const getStoredPlatformAIProviderConfig = async () => {
  const [setting] = await db
    .select({ value: platformSettingsTable.value })
    .from(platformSettingsTable)
    .where(eq(platformSettingsTable.key, PLATFORM_AI_PROVIDER_SETTING_KEY))
    .limit(1);

  return normalizePlatformAIProviderConfig(setting?.value);
};

export const getPlatformAIProviderConfig = async (): Promise<PlatformAIProviderConfig> => {
  const storedConfig = await getStoredPlatformAIProviderConfig();
  const apiKey = storedConfig.encryptedApiKey
    ? decryptSecret(storedConfig.encryptedApiKey)
    : undefined;
  const providerReady = storedConfig.provider !== 'openai_compatible'
    || Boolean(storedConfig.baseUrl);

  return {
    apiKey,
    apiKeyPreview: storedConfig.apiKeyPreview,
    baseUrl: storedConfig.baseUrl,
    enabled: storedConfig.enabled && Boolean(apiKey) && providerReady,
    model: storedConfig.model,
    provider: storedConfig.provider,
    systemPrompt: storedConfig.systemPrompt,
    updatedAt: storedConfig.updatedAt,
    updatedBy: storedConfig.updatedBy,
  };
};
