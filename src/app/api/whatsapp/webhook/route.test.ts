import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findWhapiStoreConnection: vi.fn(),
  info: vi.fn(),
  parseWhapiWebhookPayload: vi.fn(),
  processWhapiInboundMessage: vi.fn(),
  runWebhookEventOnce: vi.fn(async (params: { handler: () => Promise<unknown> }) => ({
    duplicate: false,
    result: await params.handler(),
    status: 'processed',
  })),
  warn: vi.fn(),
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    info: mocks.info,
    warn: mocks.warn,
  },
}));

vi.mock('@/libs/WhapiInboundProcessor', () => ({
  processWhapiInboundMessage: mocks.processWhapiInboundMessage,
}));

vi.mock('@/libs/WhapiWhatsApp', () => ({
  findWhapiStoreConnection: mocks.findWhapiStoreConnection,
  parseWhapiWebhookPayload: mocks.parseWhapiWebhookPayload,
}));

vi.mock('@/libs/WebhookIdempotency', () => ({
  runWebhookEventOnce: mocks.runWebhookEventOnce,
}));

const buildPostRequest = (
  body = '{"messages":[{"id":"whapi.1","from":"966500000001","text":{"body":"salam"}}]}',
  headers?: HeadersInit,
) => new Request(
  'https://www.smartstore-ai.com/api/whatsapp/webhook?channelId=channel_1&secret=secret_1',
  {
    body,
    headers,
    method: 'POST',
  },
);

describe('Whapi WhatsApp webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findWhapiStoreConnection.mockResolvedValue({
      apiToken: 'whapi_token',
      channelId: 'channel_1',
      organizationId: 'org_1',
    });
    mocks.parseWhapiWebhookPayload.mockReturnValue({
      body: 'salam',
      channelId: 'channel_1',
      from: '966500000001',
      messageId: 'whapi.1',
      profileName: 'Maher',
    });
    mocks.processWhapiInboundMessage.mockResolvedValue({ aiResponseSent: true });
    mocks.runWebhookEventOnce.mockImplementation(async (params: { handler: () => Promise<unknown> }) => ({
      duplicate: false,
      result: await params.handler(),
      status: 'processed',
    }));
  });

  it('reports the active provider for health checks', async () => {
    const { GET } = await import('./route');
    const response = GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, provider: 'whapi' });
  });

  it('processes a Whapi webhook for the matching store connection', async () => {
    const { POST } = await import('./route');
    const response = await POST(buildPostRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      duplicate: false,
      ok: true,
      status: 'processed',
    });
    expect(mocks.parseWhapiWebhookPayload).toHaveBeenCalledWith(
      expect.anything(),
      'channel_1',
    );
    expect(mocks.findWhapiStoreConnection).toHaveBeenCalledWith({
      channelId: 'channel_1',
      webhookSecret: 'secret_1',
    });
    expect(mocks.runWebhookEventOnce).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'whapi.1',
      eventType: 'whapi.whatsapp.message',
      metadata: {
        channelId: 'channel_1',
        from: '966500000001',
      },
      provider: 'whapi',
    }));
    expect(mocks.processWhapiInboundMessage).toHaveBeenCalledWith({
      connection: {
        apiToken: 'whapi_token',
        channelId: 'channel_1',
        organizationId: 'org_1',
      },
      message: {
        body: 'salam',
        channelId: 'channel_1',
        from: '966500000001',
        messageId: 'whapi.1',
        profileName: 'Maher',
      },
    });
  });

  it('can read the Whapi webhook secret from the request header', async () => {
    const { POST } = await import('./route');
    await POST(new Request(
      'https://www.smartstore-ai.com/api/whatsapp/webhook?channelId=channel_1',
      {
        body: '{"messages":[]}',
        headers: {
          'x-whapi-secret': 'header_secret',
        },
        method: 'POST',
      },
    ));

    expect(mocks.findWhapiStoreConnection).toHaveBeenCalledWith({
      channelId: 'channel_1',
      webhookSecret: 'header_secret',
    });
  });

  it('acknowledges unmatched Whapi channels without invoking the AI pipeline', async () => {
    mocks.findWhapiStoreConnection.mockResolvedValueOnce(null);
    const { POST } = await import('./route');
    const response = await POST(buildPostRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      skipped: true,
    });
    expect(mocks.processWhapiInboundMessage).not.toHaveBeenCalled();
  });

  it('acknowledges unsupported Whapi payloads without invoking the AI pipeline', async () => {
    mocks.parseWhapiWebhookPayload.mockReturnValueOnce(null);
    const { POST } = await import('./route');
    const response = await POST(buildPostRequest('{"statuses":[]}'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      skipped: true,
    });
    expect(mocks.findWhapiStoreConnection).not.toHaveBeenCalled();
    expect(mocks.processWhapiInboundMessage).not.toHaveBeenCalled();
  });
});
