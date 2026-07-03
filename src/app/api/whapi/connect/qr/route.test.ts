import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Env } from '@/libs/Env';
import { WhapiConnectError } from '@/libs/WhapiConnect';

const mocks = vi.hoisted(() => ({
  activateWhapiManagedChannel: vi.fn(),
  auth: vi.fn(),
  checkWhapiManagedChannelExists: vi.fn(),
  configureWhapiChannelWebhook: vi.fn(),
  createWhapiManagedChannel: vi.fn(),
  decryptSecret: vi.fn(),
  encryptSecret: vi.fn(),
  fetchWhapiQrCodeDataUrl: vi.fn(),
  getWhapiManagedChannel: vi.fn(),
  info: vi.fn(),
  isWhapiManagedConnectConfigured: vi.fn(),
  maskApiKey: vi.fn(),
  restartWhapiManagedChannel: vi.fn(),
  transaction: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

vi.mock('@/libs/DB', () => ({
  db: {
    select: vi.fn(),
    transaction: mocks.transaction,
  },
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    info: mocks.info,
    warn: mocks.warn,
  },
}));

vi.mock('@/libs/PlatformAIProviderConfig', () => ({
  decryptSecret: mocks.decryptSecret,
  encryptSecret: mocks.encryptSecret,
  maskApiKey: mocks.maskApiKey,
}));

vi.mock('@/libs/WhapiConnect', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/WhapiConnect')>();

  return {
    ...actual,
    activateWhapiManagedChannel: mocks.activateWhapiManagedChannel,
    checkWhapiManagedChannelExists: mocks.checkWhapiManagedChannelExists,
    configureWhapiChannelWebhook: mocks.configureWhapiChannelWebhook,
    createWhapiManagedChannel: mocks.createWhapiManagedChannel,
    fetchWhapiQrCodeDataUrl: mocks.fetchWhapiQrCodeDataUrl,
    getWhapiManagedChannel: mocks.getWhapiManagedChannel,
    isWhapiManagedConnectConfigured: mocks.isWhapiManagedConnectConfigured,
    restartWhapiManagedChannel: mocks.restartWhapiManagedChannel,
  };
});

const createSelectChain = (result: unknown[], options?: { forUpdate?: boolean }) => {
  const chain = {
    for: vi.fn().mockResolvedValue(result),
    from: vi.fn(),
    limit: vi.fn(),
    where: vi.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.limit.mockReturnValue(options?.forUpdate ? chain : Promise.resolve(result));

  return chain;
};

const createUpdateChain = () => {
  const chain = {
    set: vi.fn(),
    where: vi.fn().mockResolvedValue(undefined),
  };

  chain.set.mockReturnValue(chain);

  return chain;
};

const createInsertChain = () => {
  const chain = {
    onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
    values: vi.fn(),
  };

  chain.values.mockReturnValue(chain);

  return chain;
};

const prepareDb = async (params: {
  existingConnection?: null | Record<string, unknown>;
  lockedSettings?: null | Record<string, unknown>;
  settings?: null | Record<string, unknown>;
}) => {
  const updateChain = createUpdateChain();
  const insertChains = [createInsertChain(), createInsertChain()];
  const tx = {
    execute: vi.fn().mockResolvedValue(undefined),
    insert: vi.fn()
      .mockReturnValueOnce(insertChains[0])
      .mockReturnValueOnce(insertChains[1]),
    select: vi.fn()
      .mockReturnValueOnce(createSelectChain(params.settings ? [params.settings] : []))
      .mockReturnValueOnce(createSelectChain(params.existingConnection ? [params.existingConnection] : []))
      .mockReturnValue(createSelectChain(
        params.lockedSettings ? [params.lockedSettings] : [],
        { forUpdate: true },
      )),
    update: vi.fn().mockReturnValue(updateChain),
  };

  mocks.transaction.mockImplementation(async (handler: (transaction: unknown) => Promise<unknown>) => handler(tx));

  return {
    insertChains,
    tx,
    updateChain,
  };
};

describe('Whapi QR connect route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(Env, {
      NEXT_PUBLIC_APP_URL: 'https://smartstore-ai.com',
      WHAPI_PARTNER_API_TOKEN: 'partner_token',
      WHAPI_PROJECT_ID: 'project_123',
    });
    mocks.auth.mockResolvedValue({ orgId: 'org_1' });
    mocks.isWhapiManagedConnectConfigured.mockReturnValue(true);
    mocks.createWhapiManagedChannel.mockResolvedValue({
      apiToken: 'channel_token',
      channelId: 'channel_123',
      displayPhoneNumber: '+966500000001',
    });
    mocks.activateWhapiManagedChannel.mockResolvedValue(undefined);
    mocks.checkWhapiManagedChannelExists.mockResolvedValue(true);
    mocks.configureWhapiChannelWebhook.mockResolvedValue(undefined);
    mocks.fetchWhapiQrCodeDataUrl.mockResolvedValue('data:image/png;base64,QR');
    mocks.getWhapiManagedChannel.mockResolvedValue(null);
    mocks.restartWhapiManagedChannel.mockResolvedValue(undefined);
    mocks.encryptSecret.mockReturnValue('encrypted_channel_token');
    mocks.decryptSecret.mockReturnValue('channel_token');
    mocks.maskApiKey.mockReturnValue('chann...oken');
  });

  it('rejects unauthenticated QR connect requests', async () => {
    mocks.auth.mockResolvedValue({ orgId: null });
    const { POST } = await import('./route');

    const response = await POST();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorized' });
    expect(mocks.createWhapiManagedChannel).not.toHaveBeenCalled();
  });

  it('fails closed when managed Whapi connect is not configured', async () => {
    mocks.isWhapiManagedConnectConfigured.mockReturnValue(false);
    const { POST } = await import('./route');

    const response = await POST();

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'whapi_managed_connect_not_configured' });
    expect(mocks.createWhapiManagedChannel).not.toHaveBeenCalled();
  });

  it('creates and stores a managed Whapi channel before returning a QR code', async () => {
    const { insertChains, tx, updateChain } = await prepareDb({
      existingConnection: null,
      lockedSettings: {
        metadata: {
          contactChannels: {},
        },
      },
      settings: {
        metadata: {
          contactChannels: {},
        },
        storeName: 'Golden Chicken',
      },
    });
    const { POST } = await import('./route');

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      channelId: 'channel_123',
      qrDataUrl: 'data:image/png;base64,QR',
      webhookReady: true,
      webhookUrl: expect.stringContaining('/api/whatsapp/webhook?provider=whapi'),
    });
    expect(mocks.createWhapiManagedChannel).toHaveBeenCalledWith({
      name: 'Golden Chicken - org_1',
    });
    expect(tx.execute).toHaveBeenCalledTimes(1);
    expect(mocks.activateWhapiManagedChannel).toHaveBeenCalledWith({
      channelId: 'channel_123',
    });
    expect(mocks.configureWhapiChannelWebhook).toHaveBeenCalledWith({
      apiToken: 'channel_token',
      webhookUrl: expect.stringContaining('channelId=channel_123'),
    });
    expect(updateChain.set).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        channelIntegrations: expect.objectContaining({
          whatsapp: expect.objectContaining({
            channelId: 'channel_123',
            managedByPlatform: true,
            provider: 'whapi',
            webhookReady: true,
          }),
        }),
      }),
    });
    expect(insertChains[0]?.values).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'whatsapp',
      config: expect.objectContaining({
        channelId: 'channel_123',
        encryptedApiToken: null,
        provider: 'whapi',
      }),
      organizationId: 'org_1',
    }));
    expect(tx.insert).toHaveBeenCalledTimes(1);
    expect(mocks.fetchWhapiQrCodeDataUrl).toHaveBeenCalledWith({
      apiToken: 'channel_token',
    });
  });

  it('continues to QR when Whapi channel day extension is temporarily unavailable', async () => {
    await prepareDb({
      existingConnection: null,
      lockedSettings: {
        metadata: {},
      },
      settings: {
        metadata: {},
        storeName: 'Golden Chicken',
      },
    });
    mocks.activateWhapiManagedChannel.mockRejectedValueOnce(new WhapiConnectError('whapi_channel_extend_failed', {
      detail: '{"error":{"code":402,"message":"days limit exceeded"}}',
      status: 402,
    }));
    const { POST } = await import('./route');

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      channelId: 'channel_123',
      qrDataUrl: 'data:image/png;base64,QR',
      webhookReady: true,
    });
    expect(mocks.warn).toHaveBeenCalledWith('Whapi channel extension deferred', expect.objectContaining({
      channelId: 'channel_123',
      status: 402,
    }));
    expect(mocks.configureWhapiChannelWebhook).toHaveBeenCalledWith({
      apiToken: 'channel_token',
      webhookUrl: expect.stringContaining('channelId=channel_123'),
    });
    expect(mocks.fetchWhapiQrCodeDataUrl).toHaveBeenCalledWith({
      apiToken: 'channel_token',
    });
  });

  it('reuses an existing managed Whapi channel without creating a replacement channel', async () => {
    await prepareDb({
      existingConnection: {
        config: {
          channelId: 'existing_channel',
          displayPhoneNumber: '+966500000002',
          encryptedApiToken: 'encrypted_existing_token',
          managedChannelActivatedAt: '2026-07-01T00:00:00.000Z',
          provider: 'whapi',
          webhookSecret: 'saved_secret',
        },
      },
      lockedSettings: {
        metadata: {},
      },
      settings: {
        metadata: {},
        storeName: 'Golden Chicken',
      },
    });
    mocks.decryptSecret.mockReturnValue('existing_token');
    mocks.getWhapiManagedChannel.mockResolvedValueOnce({
      apiToken: 'fresh_existing_token',
      channelId: 'existing_channel',
      displayPhoneNumber: '+966500000002',
    });
    mocks.maskApiKey.mockReturnValue('exist...oken');
    const { POST } = await import('./route');

    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.createWhapiManagedChannel).not.toHaveBeenCalled();
    expect(mocks.activateWhapiManagedChannel).not.toHaveBeenCalled();
    expect(mocks.configureWhapiChannelWebhook).toHaveBeenCalledWith({
      apiToken: 'fresh_existing_token',
      webhookUrl: expect.stringContaining('secret=saved_secret'),
    });
    expect(mocks.fetchWhapiQrCodeDataUrl).toHaveBeenCalledWith({
      apiToken: 'fresh_existing_token',
    });
  });

  it('replaces a saved managed Whapi channel when it no longer exists upstream', async () => {
    const { insertChains } = await prepareDb({
      existingConnection: {
        config: {
          channelId: 'deleted_channel',
          displayPhoneNumber: '+966500000002',
          encryptedApiToken: 'encrypted_deleted_token',
          managedChannelActivatedAt: '2026-07-01T00:00:00.000Z',
          provider: 'whapi',
          webhookSecret: 'saved_secret',
        },
      },
      lockedSettings: {
        metadata: {},
      },
      settings: {
        metadata: {},
        storeName: 'Golden Chicken',
      },
    });
    mocks.decryptSecret.mockReturnValue('deleted_token');
    mocks.getWhapiManagedChannel.mockResolvedValueOnce({
      apiToken: 'deleted_token',
      channelId: 'deleted_channel',
      displayPhoneNumber: '+966500000002',
    });
    mocks.checkWhapiManagedChannelExists.mockResolvedValueOnce(false);
    mocks.configureWhapiChannelWebhook
      .mockRejectedValueOnce(new WhapiConnectError('whapi_webhook_configure_failed', {
        detail: '{"error":"Channel not found"}',
        status: 404,
      }))
      .mockResolvedValueOnce(undefined);
    const { POST } = await import('./route');

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      channelId: 'channel_123',
      qrDataUrl: 'data:image/png;base64,QR',
      webhookReady: true,
    });
    expect(mocks.createWhapiManagedChannel).toHaveBeenCalledWith({
      name: 'Golden Chicken - org_1',
    });
    expect(mocks.activateWhapiManagedChannel).toHaveBeenCalledWith({
      channelId: 'channel_123',
    });
    expect(mocks.configureWhapiChannelWebhook).toHaveBeenNthCalledWith(1, {
      apiToken: 'deleted_token',
      webhookUrl: expect.stringContaining('channelId=deleted_channel'),
    });
    expect(mocks.configureWhapiChannelWebhook).toHaveBeenNthCalledWith(2, {
      apiToken: 'channel_token',
      webhookUrl: expect.stringContaining('channelId=channel_123'),
    });
    expect(insertChains[0]?.values).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'whatsapp',
      config: expect.objectContaining({
        channelId: 'channel_123',
        encryptedApiToken: null,
        managedChannelActivatedAt: expect.any(String),
        provider: 'whapi',
      }),
      organizationId: 'org_1',
    }));
    expect(mocks.fetchWhapiQrCodeDataUrl).toHaveBeenCalledWith({
      apiToken: 'channel_token',
    });
    expect(mocks.warn).toHaveBeenCalledWith(
      'Whapi saved channel missing; creating replacement channel',
      expect.objectContaining({
        channelId: 'deleted_channel',
        status: 404,
      }),
    );
  });

  it('does not carry a stale phone number when replacing a deleted managed Whapi channel', async () => {
    const { insertChains, updateChain } = await prepareDb({
      existingConnection: {
        config: {
          channelId: 'deleted_channel',
          displayPhoneNumber: '+966500000002',
          encryptedApiToken: 'encrypted_deleted_token',
          managedChannelActivatedAt: '2026-07-01T00:00:00.000Z',
          provider: 'whapi',
          webhookSecret: 'saved_secret',
        },
      },
      lockedSettings: {
        metadata: {
          contactChannels: {
            whatsapp: '+966500000002',
          },
        },
      },
      settings: {
        metadata: {
          contactChannels: {
            whatsapp: '+966500000002',
          },
        },
        storeName: 'Golden Chicken',
      },
    });
    mocks.decryptSecret.mockReturnValue('deleted_token');
    mocks.getWhapiManagedChannel.mockResolvedValueOnce({
      apiToken: 'deleted_token',
      channelId: 'deleted_channel',
      displayPhoneNumber: '+966500000002',
    });
    mocks.checkWhapiManagedChannelExists.mockResolvedValueOnce(false);
    mocks.createWhapiManagedChannel.mockResolvedValueOnce({
      apiToken: 'replacement_token',
      channelId: 'replacement_channel',
    });
    mocks.encryptSecret.mockReturnValueOnce('encrypted_replacement_token');
    mocks.configureWhapiChannelWebhook
      .mockRejectedValueOnce(new WhapiConnectError('whapi_webhook_configure_failed', {
        detail: '{"error":"Channel not found"}',
        status: 404,
      }))
      .mockResolvedValueOnce(undefined);
    const { POST } = await import('./route');

    const response = await POST();

    expect(response.status).toBe(200);
    expect(updateChain.set).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        channelIntegrations: expect.objectContaining({
          whatsapp: expect.objectContaining({
            channelId: 'replacement_channel',
            displayPhoneNumber: '',
            phoneNumber: '',
          }),
        }),
        contactChannels: {},
      }),
    });
    expect(insertChains[0]?.values).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        channelId: 'replacement_channel',
        displayPhoneNumber: null,
        encryptedApiToken: null,
        phoneNumber: null,
      }),
    }));
  });

  it('still returns QR when replacement channel webhook configuration is deferred', async () => {
    await prepareDb({
      existingConnection: {
        config: {
          channelId: 'deleted_channel',
          encryptedApiToken: 'encrypted_deleted_token',
          managedChannelActivatedAt: '2026-07-01T00:00:00.000Z',
          provider: 'whapi',
          webhookSecret: 'saved_secret',
        },
      },
      lockedSettings: {
        metadata: {},
      },
      settings: {
        metadata: {},
        storeName: 'Golden Chicken',
      },
    });
    mocks.decryptSecret.mockReturnValue('deleted_token');
    mocks.getWhapiManagedChannel.mockResolvedValueOnce({
      apiToken: 'deleted_token',
      channelId: 'deleted_channel',
    });
    mocks.checkWhapiManagedChannelExists.mockResolvedValueOnce(false);
    mocks.configureWhapiChannelWebhook
      .mockRejectedValueOnce(new WhapiConnectError('whapi_webhook_configure_failed', {
        detail: '{"error":"Channel not found"}',
        status: 404,
      }))
      .mockRejectedValueOnce(new WhapiConnectError('whapi_webhook_configure_failed', {
        detail: '{"error":"Service Temporary Unavailable Error"}',
        status: 503,
      }));
    const { POST } = await import('./route');

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      channelId: 'channel_123',
      qrDataUrl: 'data:image/png;base64,QR',
      webhookReady: false,
    });
    expect(mocks.configureWhapiChannelWebhook).toHaveBeenCalledTimes(2);
    expect(mocks.fetchWhapiQrCodeDataUrl).toHaveBeenCalledWith({
      apiToken: 'channel_token',
    });
    expect(mocks.warn).toHaveBeenCalledWith('Whapi webhook configure deferred', expect.objectContaining({
      channelId: 'channel_123',
      status: 503,
    }));
  });

  it('replaces a saved managed Whapi channel when QR fetch reports it missing', async () => {
    const { insertChains } = await prepareDb({
      existingConnection: {
        config: {
          channelId: 'deleted_channel',
          encryptedApiToken: 'encrypted_deleted_token',
          managedChannelActivatedAt: '2026-07-01T00:00:00.000Z',
          provider: 'whapi',
          webhookSecret: 'saved_secret',
        },
      },
      lockedSettings: {
        metadata: {},
      },
      settings: {
        metadata: {},
        storeName: 'Golden Chicken',
      },
    });
    mocks.decryptSecret.mockReturnValue('deleted_token');
    mocks.getWhapiManagedChannel.mockResolvedValueOnce({
      apiToken: 'deleted_token',
      channelId: 'deleted_channel',
    });
    mocks.checkWhapiManagedChannelExists.mockResolvedValueOnce(false);
    mocks.fetchWhapiQrCodeDataUrl
      .mockRejectedValueOnce(new WhapiConnectError('whapi_qr_fetch_failed', {
        detail: '{"error":"Channel not found"}',
        status: 404,
      }))
      .mockResolvedValueOnce('data:image/png;base64,NEW_QR');
    const { POST } = await import('./route');

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      channelId: 'channel_123',
      qrDataUrl: 'data:image/png;base64,NEW_QR',
      webhookReady: true,
    });
    expect(mocks.createWhapiManagedChannel).toHaveBeenCalledWith({
      name: 'Golden Chicken - org_1',
    });
    expect(mocks.fetchWhapiQrCodeDataUrl).toHaveBeenNthCalledWith(1, {
      apiToken: 'deleted_token',
    });
    expect(mocks.fetchWhapiQrCodeDataUrl).toHaveBeenNthCalledWith(2, {
      apiToken: 'channel_token',
    });
    expect(insertChains[1]?.values).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'whatsapp',
      config: expect.objectContaining({
        channelId: 'channel_123',
        encryptedApiToken: null,
        provider: 'whapi',
      }),
      organizationId: 'org_1',
    }));
    expect(mocks.warn).toHaveBeenCalledWith(
      'Whapi saved channel missing during QR fetch; creating replacement channel',
      expect.objectContaining({
        channelId: 'deleted_channel',
        status: 404,
      }),
    );
  });

  it('returns pending when a replacement Whapi channel QR is still initializing', async () => {
    await prepareDb({
      existingConnection: {
        config: {
          channelId: 'deleted_channel',
          encryptedApiToken: 'encrypted_deleted_token',
          managedChannelActivatedAt: '2026-07-01T00:00:00.000Z',
          provider: 'whapi',
          webhookSecret: 'saved_secret',
        },
      },
      lockedSettings: {
        metadata: {},
      },
      settings: {
        metadata: {},
        storeName: 'Golden Chicken',
      },
    });
    mocks.decryptSecret.mockReturnValue('deleted_token');
    mocks.getWhapiManagedChannel.mockResolvedValueOnce({
      apiToken: 'deleted_token',
      channelId: 'deleted_channel',
    });
    mocks.checkWhapiManagedChannelExists.mockResolvedValueOnce(false);
    mocks.fetchWhapiQrCodeDataUrl
      .mockRejectedValueOnce(new WhapiConnectError('whapi_qr_fetch_failed', {
        detail: '{"error":"Channel not found"}',
        status: 404,
      }))
      .mockRejectedValueOnce(new WhapiConnectError('whapi_qr_fetch_failed', {
        detail: '{"error":"Channel not found"}',
        status: 404,
      }));
    const { POST } = await import('./route');

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      channelId: 'channel_123',
      error: 'whapi_channel_initializing',
      pending: true,
      retryAfterSeconds: 90,
    });
    expect(mocks.warn).toHaveBeenCalledWith('Whapi replacement QR fetch deferred', expect.objectContaining({
      channelId: 'channel_123',
      status: 404,
    }));
  });

  it('does not replace an existing Whapi channel when QR is not ready yet', async () => {
    await prepareDb({
      existingConnection: {
        config: {
          channelId: 'existing_channel',
          encryptedApiToken: 'encrypted_existing_token',
          managedChannelActivatedAt: '2026-07-01T00:00:00.000Z',
          provider: 'whapi',
          webhookSecret: 'saved_secret',
        },
      },
      lockedSettings: {
        metadata: {},
      },
      settings: {
        metadata: {},
        storeName: 'Golden Chicken',
      },
    });
    mocks.decryptSecret.mockReturnValue('existing_token');
    mocks.getWhapiManagedChannel.mockResolvedValueOnce({
      apiToken: 'existing_token',
      channelId: 'existing_channel',
    });
    mocks.fetchWhapiQrCodeDataUrl.mockRejectedValueOnce(new WhapiConnectError('whapi_qr_fetch_failed', {
      detail: '{"error":"Channel not found"}',
      status: 404,
    }));
    const { POST } = await import('./route');

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      channelId: 'existing_channel',
      error: 'whapi_channel_initializing',
      pending: true,
    });
    expect(mocks.checkWhapiManagedChannelExists).toHaveBeenCalledWith({
      channelId: 'existing_channel',
    });
    expect(mocks.createWhapiManagedChannel).not.toHaveBeenCalled();
  });

  it('returns a pending QR response when Whapi is still initializing the channel', async () => {
    await prepareDb({
      existingConnection: null,
      lockedSettings: null,
      settings: {
        metadata: {},
        storeName: 'Golden Chicken',
      },
    });
    mocks.fetchWhapiQrCodeDataUrl.mockRejectedValue(new WhapiConnectError('whapi_qr_fetch_failed', {
      detail: '{"error":"Channel not found"}',
      status: 404,
    }));
    const { POST } = await import('./route');

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      channelId: 'channel_123',
      error: 'whapi_channel_initializing',
      pending: true,
      retryAfterSeconds: 90,
    });
    expect(mocks.warn).toHaveBeenCalledWith('Whapi QR fetch deferred', expect.objectContaining({
      channelId: 'channel_123',
      status: 404,
    }));
  });

  it('preserves a newly-created channel when Whapi QR fetch is temporarily unavailable', async () => {
    const { insertChains } = await prepareDb({
      existingConnection: null,
      lockedSettings: null,
      settings: {
        metadata: {},
        storeName: 'Golden Chicken',
      },
    });
    mocks.fetchWhapiQrCodeDataUrl.mockRejectedValueOnce(new WhapiConnectError('whapi_qr_fetch_failed', {
      detail: '{"error":"Service Temporary Unavailable Error"}',
      status: 503,
    }));
    const { POST } = await import('./route');

    const response = await POST();
    const payload = await response.json();

    expect(response.status).toBe(202);
    expect(payload).toMatchObject({
      channelId: 'channel_123',
      error: 'whapi_channel_initializing',
      pending: true,
      retryAfterSeconds: 90,
    });
    expect(insertChains[0]?.values).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'whatsapp',
      config: expect.objectContaining({
        channelId: 'channel_123',
        encryptedApiToken: null,
        provider: 'whapi',
      }),
      organizationId: 'org_1',
    }));
    expect(mocks.createWhapiManagedChannel).toHaveBeenCalledTimes(1);
    expect(mocks.warn).toHaveBeenCalledWith('Whapi QR fetch deferred', expect.objectContaining({
      channelId: 'channel_123',
      status: 503,
    }));
  });

  it('fails safely when Whapi channel activation fails before QR can be prepared', async () => {
    const { tx } = await prepareDb({
      existingConnection: null,
      lockedSettings: null,
      settings: {
        metadata: {},
        storeName: 'Golden Chicken',
      },
    });
    mocks.activateWhapiManagedChannel.mockRejectedValueOnce(new WhapiConnectError('whapi_channel_mode_change_failed', {
      detail: '{"error":"unauthorized"}',
      status: 401,
    }));
    const { POST } = await import('./route');

    const response = await POST();

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'whapi_channel_mode_change_failed' });
    expect(tx.insert).not.toHaveBeenCalled();
    expect(mocks.configureWhapiChannelWebhook).not.toHaveBeenCalled();
    expect(mocks.fetchWhapiQrCodeDataUrl).not.toHaveBeenCalled();
  });

  it('does not convert non-initialization QR failures into pending state', async () => {
    await prepareDb({
      existingConnection: null,
      lockedSettings: null,
      settings: {
        metadata: {},
        storeName: 'Golden Chicken',
      },
    });
    mocks.fetchWhapiQrCodeDataUrl.mockRejectedValueOnce(new WhapiConnectError('whapi_qr_fetch_failed', {
      detail: '{"error":"Unauthorized"}',
      status: 401,
    }));
    const { POST } = await import('./route');

    const response = await POST();

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'whapi_qr_fetch_failed' });
    expect(mocks.warn).toHaveBeenCalledWith('Whapi QR connect failed', expect.objectContaining({
      error: 'whapi_qr_fetch_failed',
      status: 401,
    }));
  });
});
