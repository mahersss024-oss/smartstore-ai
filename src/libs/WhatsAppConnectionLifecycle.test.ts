import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const selectRows: unknown[][] = [];
  const selectLimit = vi.fn(async () => selectRows.shift() ?? []);
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const insertOnConflictDoUpdate = vi.fn();
  const insertValues = vi.fn(() => ({
    onConflictDoUpdate: insertOnConflictDoUpdate,
  }));
  const updateWhere = vi.fn();
  const updateSet = vi.fn(() => ({ where: updateWhere }));

  return {
    insertOnConflictDoUpdate,
    insertValues,
    select,
    selectRows,
    updateSet,
  };
});

vi.mock('@/libs/DB', () => ({
  db: {
    insert: vi.fn(() => ({ values: mocks.insertValues })),
    select: mocks.select,
    update: vi.fn(() => ({ set: mocks.updateSet })),
  },
}));

vi.mock('@/models/Schema', () => ({
  channelConnectionsTable: {
    channel: 'channel',
    config: 'config',
    organizationId: 'organizationId',
  },
  storeSettingsTable: {
    metadata: 'metadata',
    organizationId: 'organizationId',
  },
}));

vi.mock('@/utils/CustomerChannels', () => ({
  buildWhatsAppChannelConfig: vi.fn(() => ({
    whatsappLink: 'https://wa.me/966500000001',
    whatsappTarget: '966500000001',
  })),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions })),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
}));

describe('WhatsAppConnectionLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectRows.length = 0;
  });

  it('disables an organization WhatsApp channel while preserving managed Whapi credentials', async () => {
    mocks.selectRows.push(
      [{
        config: {
          apiTokenPreview: 'abc...xyz',
          channelId: 'CATWMN-B42ST',
          displayPhoneNumber: '+1 555 664 3746',
          encryptedApiToken: 'encrypted_token',
          managedByPlatform: true,
          managedChannelActivatedAt: '2026-07-01T15:00:00.000Z',
          provider: 'whapi',
          webhookSecret: 'a'.repeat(48),
        },
      }],
      [{ metadata: { channelIntegrations: {}, storeName: 'Store' } }],
    );
    const { disableOrganizationWhatsAppConnection } = await import('./WhatsAppConnectionLifecycle');

    await disableOrganizationWhatsAppConnection('org_1');

    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      config: expect.objectContaining({
        channelId: 'CATWMN-B42ST',
        connectionStatus: 'disconnected',
        encryptedApiToken: 'encrypted_token',
        provider: 'whapi',
        webhookReady: false,
      }),
      connectionStatus: 'disconnected',
      isActive: false,
      organizationId: 'org_1',
    }));
    expect(mocks.insertOnConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({
      set: expect.objectContaining({
        config: expect.objectContaining({
          channelId: 'CATWMN-B42ST',
          encryptedApiToken: 'encrypted_token',
        }),
        connectionStatus: 'disconnected',
        isActive: false,
      }),
    }));
    expect(mocks.updateSet).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        channelIntegrations: {
          whatsapp: expect.objectContaining({
            channelId: 'CATWMN-B42ST',
            connectionStatus: 'disconnected',
            provider: 'whapi',
            webhookReady: false,
          }),
        },
      }),
    });
  });
});
