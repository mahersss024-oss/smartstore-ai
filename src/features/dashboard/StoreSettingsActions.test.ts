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
  mockValidateTwilioCredentials,
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
        mode: 'twilio',
        provider: 'twilio',
      },
      connectionStatus: params.hasTwilioAuthToken ? 'connected' : 'pending_setup',
      isActive: Boolean(params.hasTwilioAuthToken),
      mode: 'twilio',
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
    mockValidateTwilioCredentials: vi.fn(async () => true),
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

vi.mock('@/libs/TwilioWhatsApp', () => ({
  validateTwilioWhatsAppCredentials: mockValidateTwilioCredentials,
}));

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

const validAccountSid = `AC${'a'.repeat(32)}`;
const validAuthToken = 'b'.repeat(32);

const buildTwilioFormData = () => {
  const formData = new FormData();
  formData.set('twilioAccountSid', validAccountSid);
  formData.set('twilioAuthToken', validAuthToken);
  formData.set('twilioWhatsAppFrom', 'whatsapp:+14155552671');

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
    mockValidateTwilioCredentials.mockResolvedValue(true);
  });

  it('rejects settings before database access when no organization is active', async () => {
    mockAuth.mockResolvedValue({ orgId: null, userId: 'user_1' });

    await expect(saveWhatsApp(new FormData()))
      .rejects
      .toThrow('No active organization selected');

    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('encrypts per-store Twilio credentials and activates only the authenticated store', async () => {
    selectRows.push(
      [{ id: 1, metadata: {}, storeName: 'Store One' }],
      [],
    );

    const result = await saveWhatsApp(buildTwilioFormData());

    expect(result).toEqual({
      message: 'twilio_settings_saved',
      status: 'success',
    });
    expect(mockValidateTwilioCredentials).toHaveBeenCalledWith({
      accountSid: validAccountSid,
      authToken: validAuthToken,
    });
    expect(mockEncryptSecret).toHaveBeenCalledWith(validAuthToken);
    expect(mockBuildWhatsAppChannelConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        encryptedTwilioAuthToken: `encrypted:${validAuthToken}`,
        hasTwilioAuthToken: true,
        twilioAccountSid: validAccountSid,
        twilioWhatsAppFrom: 'whatsapp:+14155552671',
      }),
    );
    expect(mockDbInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
      }),
    );
  });

  it('keeps an existing encrypted auth token when the token input is blank', async () => {
    selectRows.push(
      [{ id: 1, metadata: {}, storeName: 'Store One' }],
      [{
        config: {
          encryptedTwilioAuthToken: 'encrypted:stored-token',
          provider: 'twilio',
          twilioAccountSid: validAccountSid,
          twilioAuthTokenPreview: 'bbb...bbbb',
          twilioWhatsAppFrom: 'whatsapp:+14155552671',
        },
      }],
    );
    const formData = new FormData();
    formData.set('twilioAccountSid', validAccountSid);
    formData.set('twilioWhatsAppFrom', 'whatsapp:+14155552671');

    const result = await saveWhatsApp(formData);

    expect(result.status).toBe('success');
    expect(mockEncryptSecret).not.toHaveBeenCalled();
    expect(mockValidateTwilioCredentials).toHaveBeenCalledWith({
      accountSid: validAccountSid,
      authToken: validAuthToken,
    });
    expect(mockBuildWhatsAppChannelConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        encryptedTwilioAuthToken: 'encrypted:stored-token',
      }),
    );
  });

  it('does not write an invalid or rejected Twilio configuration', async () => {
    selectRows.push(
      [{ id: 1, metadata: {}, storeName: 'Store One' }],
      [],
    );
    mockValidateTwilioCredentials.mockResolvedValue(false);

    const result = await saveWhatsApp(buildTwilioFormData());

    expect(result).toEqual({
      message: 'invalid_twilio_credentials',
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

  it('resets the store Twilio channel and clears its metadata', async () => {
    selectRows.push([{
      metadata: {
        channelIntegrations: {
          whatsapp: {
            twilioAccountSid: validAccountSid,
            twilioWhatsAppFrom: 'whatsapp:+14155552671',
          },
        },
      },
    }]);
    const { disconnectWhatsApp } = await import('./StoreSettingsActions');

    await expect(disconnectWhatsApp('ar')).rejects.toThrow('redirect:');

    expect(mockDbInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'whatsapp',
      config: {},
      connectionStatus: 'not_connected',
      isActive: false,
      organizationId: 'org_1',
    }));
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/settings');
  });
});
