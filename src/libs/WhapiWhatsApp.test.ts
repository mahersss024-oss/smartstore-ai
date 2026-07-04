import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getWhapiManagedChannel: vi.fn(),
  select: vi.fn(),
}));

vi.mock('./DB', () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock('./WhapiConnect', () => ({
  getWhapiManagedChannel: mocks.getWhapiManagedChannel,
}));

const createSelectChain = (rows: unknown[]) => {
  const chain = {
    from: vi.fn(),
    limit: vi.fn().mockResolvedValue(rows),
    then: vi.fn((resolve: (value: unknown[]) => unknown, reject?: (reason: unknown) => unknown) => {
      return Promise.resolve(rows).then(resolve, reject);
    }),
    where: vi.fn(),
  };

  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);

  return chain;
};

const mockConnectionRows = (rows: unknown[]) => {
  mocks.select.mockReturnValueOnce(createSelectChain(rows));
};

describe('WhapiWhatsApp', () => {
  let whapiModule: typeof import('./WhapiWhatsApp');

  beforeAll(async () => {
    whapiModule = await import('./WhapiWhatsApp');
  }, 15000);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mocks.getWhapiManagedChannel.mockResolvedValue({
      apiToken: 'live_channel_token',
      channelId: 'channel_1',
      displayPhoneNumber: '+966500000001',
    });
  });

  it('parses an inbound text message from a Whapi-style payload', async () => {
    const { parseWhapiWebhookPayload } = whapiModule;

    expect(parseWhapiWebhookPayload({
      channel_id: 'channel_1',
      messages: [{
        contact: { name: 'Maher' },
        from: '966500000001',
        id: 'message_1',
        text: { body: 'سلام' },
      }],
    })).toEqual({
      body: 'سلام',
      channelId: 'channel_1',
      from: '966500000001',
      messageId: 'message_1',
      profileName: 'Maher',
    });
  });

  it('uses the URL channel fallback and skips outgoing echoes', async () => {
    const { parseWhapiWebhookPayload } = whapiModule;

    expect(parseWhapiWebhookPayload({
      message: {
        body: 'hello',
        from: '966500000001',
        from_me: true,
        id: 'message_1',
      },
    }, 'channel_1')).toBeNull();

    expect(parseWhapiWebhookPayload({
      message: {
        body: 'hello',
        chat_id: '966500000001',
        id: 'message_2',
      },
    }, 'channel_1')).toEqual({
      body: 'hello',
      channelId: 'channel_1',
      from: '966500000001',
      messageId: 'message_2',
      profileName: undefined,
    });
  });

  it('sends outbound WhatsApp replies with the live Whapi channel token', async () => {
    mockConnectionRows([{
      config: {
        channelId: 'channel_1',
        provider: 'whapi',
        webhookSecret: 'secret',
      },
      connectionStatus: 'connected',
      isActive: true,
      organizationId: 'org_1',
    }]);
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ id: 'whapi_message_1' }),
      { status: 200 },
    ));
    vi.stubGlobal('fetch', fetchMock);
    const { sendWhapiConversationTextMessage } = whapiModule;

    const result = await sendWhapiConversationTextMessage({
      body: 'جاهز',
      externalThreadId: 'wwa:channel_1:966500000001',
      organizationId: 'org_1',
    });

    expect(result).toEqual({
      outboundMessageId: 'whapi_message_1',
      status: 'sent',
    });
    expect(mocks.getWhapiManagedChannel).toHaveBeenCalledWith({ channelId: 'channel_1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://gate.whapi.cloud/messages/text',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer live_channel_token',
        }),
      }),
    );
  });

  it('resolves inbound webhook ownership with the live Whapi channel token', async () => {
    mockConnectionRows([{
      config: {
        channelId: 'channel_1',
        provider: 'whapi',
        webhookSecret: 'secret',
      },
      connectionStatus: 'connected',
      isActive: true,
      organizationId: 'org_1',
    }]);
    const { findWhapiStoreConnection } = whapiModule;

    await expect(findWhapiStoreConnection({
      channelId: 'channel_1',
      webhookSecret: 'secret',
    })).resolves.toEqual({
      apiToken: 'live_channel_token',
      channelId: 'channel_1',
      displayPhoneNumber: '+966500000001',
      organizationId: 'org_1',
    });
  });
});
