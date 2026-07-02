import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAuth,
  mockBuildWhatsAppChannelConfig,
  mockDbInsert,
  mockDbInsertValues,
  mockDbSelect,
  mockDbUpdate,
  mockDecryptSecret,
  mockEncryptSecret,
  mockRedirect,
  mockRevalidatePath,
  selectRows,
} = vi.hoisted(() => {
  const rows: unknown[][] = [];
  const selectLimit = vi.fn(() => {
    const result = rows.shift() ?? [];

    // Awaitable and also supports `.for('update')` (row locking inside a tx).
    return Object.assign(Promise.resolve(result), {
      for: vi.fn(async () => result),
    });
  });
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const insertOnConflictDoUpdate = vi.fn(async () => undefined);
  const insertValues = vi.fn((_values: unknown) => ({
    onConflictDoUpdate: insertOnConflictDoUpdate,
  }));
  const updateWhere = vi.fn(async () => undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));

  return {
    mockAuth: vi.fn(),
    mockBuildWhatsAppChannelConfig: vi.fn((params: Record<string, unknown>) => ({
      config: {
        ...params,
        mode: 'whapi',
        provider: 'whapi',
      },
      connectionStatus: params.hasApiToken ? 'connected' : 'pending_setup',
      isActive: Boolean(params.hasApiToken),
      mode: 'whapi',
      whatsappLink: 'https://wa.me/14155552671',
      whatsappTarget: 'https://wa.me/14155552671',
    })),
    mockDbInsert: vi.fn(() => ({ values: insertValues })),
    mockDbInsertValues: insertValues,
    mockDbSelect: vi.fn(() => ({ from: selectFrom })),
    mockDbUpdate: vi.fn(() => ({ set: updateSet })),
    mockDecryptSecret: vi.fn(() => 'b'.repeat(32)),
    mockEncryptSecret: vi.fn((value: string) => `encrypted:${value}`),
    mockRedirect: vi.fn((path: string) => {
      throw new Error(`redirect:${path}`);
    }),
    mockRevalidatePath: vi.fn(),
    selectRows: rows,
  };
});

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions, type: 'and' })),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, type: 'eq', value })),
}));

vi.mock('@/libs/DB', () => ({
  db: {
    insert: mockDbInsert,
    select: mockDbSelect,
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      insert: mockDbInsert,
      select: mockDbSelect,
      update: mockDbUpdate,
    })),
    update: mockDbUpdate,
  },
}));

vi.mock('@/libs/PlatformAIProviderConfig', () => ({
  decryptSecret: mockDecryptSecret,
  encryptSecret: mockEncryptSecret,
  maskApiKey: vi.fn(() => 'bbb...bbbb'),
}));

// WhatsApp credential validation is done locally by the action.

vi.mock('@/models/Schema', () => ({
  channelConnectionsTable: {
    channel: 'channel',
    config: 'config',
    organizationId: 'organizationId',
  },
  storeSettingsTable: {
    id: 'id',
    metadata: 'metadata',
    organizationId: 'organizationId',
    storeName: 'storeName',
  },
}));

vi.mock('@/utils/CustomerChannels', () => ({
  buildWhatsAppChannelConfig: mockBuildWhatsAppChannelConfig,
}));

vi.mock('@/utils/Helpers', () => ({
  getI18nPath: vi.fn((path: string) => path),
}));

vi.mock('@/libs/ProductImageStorage', () => ({
  isStoredImageDataUrl: vi.fn(() => false),
  isUploadedFile: vi.fn(() => false),
  saveStoreLogo: vi.fn(),
}));

vi.mock('@/libs/SubscriptionEntitlements', () => ({
  assertCanUseChannels: vi.fn(),
  isSubscriptionFeatureError: vi.fn(() => false),
  isSubscriptionLimitError: vi.fn(() => false),
}));

const validChannelId = 'CATWMN-B42ST';
const validApiToken = 'whapi_channel_token_1234567890';
const validWebhookSecret = '0123456789abcdef0123456789abcdef0123456789abcdef';

const buildWhapiFormData = () => {
  const formData = new FormData();
  formData.set('whapiChannelId', validChannelId);
  formData.set('whapiApiToken', validApiToken);
  formData.set('whapiDisplayPhoneNumber', '+14155552671');
  formData.set('whapiWebhookSecret', validWebhookSecret);

  return formData;
};

const saveWhatsApp = async (formData: FormData) => {
  const { saveWhatsAppSettings } = await import('./StoreSettingsActions');

  return saveWhatsAppSettings('ar', { status: 'idle' }, formData);
};

describe('saveWhatsAppSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectRows.length = 0;
    mockAuth.mockResolvedValue({ orgId: 'org_1', userId: 'user_1' });
  });

  it('rejects settings before database access when no organization is active', async () => {
    mockAuth.mockResolvedValue({ orgId: null, userId: 'user_1' });

    await expect(saveWhatsApp(new FormData()))
      .rejects
      .toThrow('No active organization selected');

    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('encrypts per-store Whapi credentials and activates only the authenticated store', async () => {
    selectRows.push(
      [{ id: 1, metadata: {}, storeName: 'Store One' }],
      [],
    );

    const result = await saveWhatsApp(buildWhapiFormData());

    expect(result).toEqual({
      message: 'whatsapp_settings_saved',
      status: 'success',
    });
    expect(mockEncryptSecret).toHaveBeenCalledWith(validApiToken);
    expect(mockBuildWhatsAppChannelConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        apiTokenPreview: 'bbb...bbbb',
        channelId: validChannelId,
        displayPhoneNumber: '+14155552671',
        encryptedApiToken: `encrypted:${validApiToken}`,
        hasApiToken: true,
        provider: 'whapi',
        webhookSecret: validWebhookSecret,
      }),
    );
    expect(mockDbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
      }),
    );
  });

  it('keeps an existing encrypted Whapi token when the token input is blank', async () => {
    selectRows.push(
      [{ id: 1, metadata: {}, storeName: 'Store One' }],
      [{
        config: {
          apiTokenPreview: 'whp...bbbb',
          channelId: validChannelId,
          displayPhoneNumber: '+14155552671',
          encryptedApiToken: 'encrypted:stored-token',
          provider: 'whapi',
          webhookSecret: validWebhookSecret,
        },
      }],
    );
    const formData = new FormData();
    formData.set('whapiChannelId', validChannelId);
    formData.set('whapiDisplayPhoneNumber', '+14155552671');
    formData.set('whapiWebhookSecret', validWebhookSecret);

    const result = await saveWhatsApp(formData);

    expect(result.status).toBe('success');
    expect(mockEncryptSecret).not.toHaveBeenCalled();
    expect(mockBuildWhatsAppChannelConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        encryptedApiToken: 'encrypted:stored-token',
        hasApiToken: true,
      }),
    );
  });

  it('does not write an invalid Whapi configuration', async () => {
    selectRows.push(
      [{ id: 1, metadata: {}, storeName: 'Store One' }],
      [],
    );
    const formData = new FormData();
    formData.set('whapiChannelId', 'invalid channel id');
    formData.set('whapiApiToken', validApiToken);
    formData.set('whapiWebhookSecret', validWebhookSecret);

    const result = await saveWhatsApp(formData);

    expect(result).toEqual({
      message: 'invalid_whatsapp_credentials',
      status: 'error',
    });
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});

describe('disconnectWhatsApp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectRows.length = 0;
    mockAuth.mockResolvedValue({ orgId: 'org_1', userId: 'user_1' });
  });

  it('disconnects Whapi without deleting the managed channel credentials', async () => {
    selectRows.push([{
      config: {
        apiTokenPreview: 'whp...token',
        channelId: 'CATWMN-B42ST',
        displayPhoneNumber: '+966500000000',
        encryptedApiToken: 'encrypted_whapi_token',
        managedByPlatform: true,
        managedChannelActivatedAt: '2026-07-01T15:00:00.000Z',
        provider: 'whapi',
        webhookSecret: 'a'.repeat(48),
      },
    }]);
    selectRows.push([{
      metadata: {
        channelIntegrations: {
          whatsapp: {
            channelId: 'CATWMN-B42ST',
            displayPhoneNumber: '+966500000000',
            provider: 'whapi',
          },
        },
      },
    }]);
    const { disconnectWhatsApp } = await import('./StoreSettingsActions');

    await expect(disconnectWhatsApp('ar')).rejects.toThrow('redirect:');

    expect(mockDbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'whatsapp',
      config: expect.objectContaining({
        channelId: 'CATWMN-B42ST',
        encryptedApiToken: 'encrypted_whapi_token',
        provider: 'whapi',
        webhookReady: false,
      }),
      connectionStatus: 'disconnected',
      isActive: false,
      organizationId: 'org_1',
    }));
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/settings');
  });
});
