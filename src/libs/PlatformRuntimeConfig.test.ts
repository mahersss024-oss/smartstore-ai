import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return {
    decryptSecret: vi.fn((value?: string) => value ? `plain:${value}` : undefined),
    env: {
      AI_EMPLOYEE_WEBHOOK_SECRET: 'env-ai-secret',
      MAINTENANCE_SECRET: 'env-maintenance-secret',
    },
    limit,
    maskApiKey: vi.fn((value: string) => `masked:${value}`),
    select,
  };
});

vi.mock('./DB', () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock('./Env', () => ({
  Env: mocks.env,
}));

vi.mock('./PlatformAIProviderConfig', () => ({
  decryptSecret: mocks.decryptSecret,
  maskApiKey: mocks.maskApiKey,
}));

vi.mock('@/models/Schema', () => ({
  platformSettingsTable: {
    key: 'key',
    value: 'value',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
}));

describe('PlatformRuntimeConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.limit.mockResolvedValue([]);
  });

  it('normalizePlatformRuntimeConfig handles null and partial values safely', async () => {
    const { normalizePlatformRuntimeConfig } = await import('./PlatformRuntimeConfig');

    expect(normalizePlatformRuntimeConfig(null)).toEqual({ internal: {} });

    expect(normalizePlatformRuntimeConfig({
      internal: {
        encryptedMaintenanceSecret: 123,
        maintenanceSecretPreview: 'preview',
      },
      updatedAt: 123,
      updatedBy: 'user_1',
      whatsapp: {
        encryptedAppSecret: 'enc-app',
        graphApiVersion: 'v24.0',
      },
    })).toEqual({
      internal: {
        aiEmployeeWebhookSecretPreview: undefined,
        encryptedAIEmployeeWebhookSecret: undefined,
        encryptedMaintenanceSecret: undefined,
        maintenanceSecretPreview: 'preview',
      },
      updatedAt: undefined,
      updatedBy: 'user_1',
    });
  });

  it('uses environment fallbacks for internal runtime secrets', async () => {
    const { getPlatformRuntimeConfig } = await import('./PlatformRuntimeConfig');

    await expect(getPlatformRuntimeConfig()).resolves.toEqual({
      internal: {
        aiEmployeeWebhookSecret: 'env-ai-secret',
        aiEmployeeWebhookSecretPreview: 'masked:env-ai-secret',
        maintenanceSecret: 'env-maintenance-secret',
        maintenanceSecretPreview: 'masked:env-maintenance-secret',
      },
      updatedAt: undefined,
      updatedBy: undefined,
    });
  });

  it('prefers decrypted stored internal secrets over environment fallbacks', async () => {
    mocks.limit.mockResolvedValue([{
      value: {
        internal: {
          aiEmployeeWebhookSecretPreview: 'ai-preview',
          encryptedAIEmployeeWebhookSecret: 'enc-ai',
          encryptedMaintenanceSecret: 'enc-maintenance',
          maintenanceSecretPreview: 'maintenance-preview',
        },
        updatedAt: '2026-06-15T00:00:00.000Z',
        updatedBy: 'user_1',
      },
    }]);
    const { getPlatformRuntimeConfig } = await import('./PlatformRuntimeConfig');

    await expect(getPlatformRuntimeConfig()).resolves.toMatchObject({
      internal: {
        aiEmployeeWebhookSecret: 'plain:enc-ai',
        aiEmployeeWebhookSecretPreview: 'ai-preview',
        maintenanceSecret: 'plain:enc-maintenance',
        maintenanceSecretPreview: 'maintenance-preview',
      },
      updatedBy: 'user_1',
    });
  });

  it('reports internal secret state', async () => {
    mocks.limit
      .mockResolvedValueOnce([{
        value: {
          internal: {
            encryptedAIEmployeeWebhookSecret: 'enc-ai',
          },
        },
      }])
      .mockResolvedValueOnce([{
        value: {
          internal: {
            encryptedAIEmployeeWebhookSecret: 'enc-ai',
          },
        },
      }]);
    const { getPlatformRuntimeConfigStatus } = await import('./PlatformRuntimeConfig');

    await expect(getPlatformRuntimeConfigStatus()).resolves.toMatchObject({
      internal: {
        aiEmployeeWebhookSecretAvailable: true,
        aiEmployeeWebhookSecretStored: true,
        maintenanceSecretAvailable: true,
        maintenanceSecretStored: false,
      },
    });
  });
});
