import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMetaStoreConnection: vi.fn(),
  parseMetaWebhookPayload: vi.fn(),
  parseMetaWebhookStatusUpdates: vi.fn(),
  processMetaInboundMessage: vi.fn(),
  runWebhookEventOnce: vi.fn(async (params: { handler: () => Promise<unknown> }) => ({
    duplicate: false,
    result: await params.handler(),
    status: 'processed',
  })),
  info: vi.fn(),
  verifyMetaSignature: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@/libs/Env', () => ({
  Env: {
    META_APP_SECRET: 'meta_app_secret',
    META_WEBHOOK_VERIFY_TOKEN: 'verify_token',
  },
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    info: mocks.info,
    warn: mocks.warn,
  },
}));

vi.mock('@/libs/MetaInboundProcessor', () => ({
  processMetaInboundMessage: mocks.processMetaInboundMessage,
}));

vi.mock('@/libs/MetaWhatsApp', () => ({
  findMetaStoreConnection: mocks.findMetaStoreConnection,
  parseMetaWebhookPayload: mocks.parseMetaWebhookPayload,
  parseMetaWebhookStatusUpdates: mocks.parseMetaWebhookStatusUpdates,
  verifyMetaSignature: mocks.verifyMetaSignature,
}));

vi.mock('@/libs/WebhookIdempotency', () => ({
  runWebhookEventOnce: mocks.runWebhookEventOnce,
}));

const buildPostRequest = (body = '{"object":"whatsapp_business_account"}', headers?: HeadersInit) => new Request(
  'https://www.smartstore-ai.com/api/whatsapp/webhook',
  {
    body,
    headers: {
      'x-hub-signature-256': 'sha256=valid',
      ...headers,
    },
    method: 'POST',
  },
);

describe('Meta WhatsApp webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findMetaStoreConnection.mockResolvedValue({
      accessToken: 'store_token',
      organizationId: 'org_1',
      phoneNumberId: '123456',
    });
    mocks.parseMetaWebhookPayload.mockReturnValue({
      body: 'salam',
      from: '966500000001',
      messageId: 'wamid.1',
      phoneNumberId: '123456',
      profileName: 'Maher',
    });
    mocks.parseMetaWebhookStatusUpdates.mockReturnValue([]);
    mocks.processMetaInboundMessage.mockResolvedValue({ aiResponseSent: true });
    mocks.runWebhookEventOnce.mockImplementation(async (params: { handler: () => Promise<unknown> }) => ({
      duplicate: false,
      result: await params.handler(),
      status: 'processed',
    }));
    mocks.verifyMetaSignature.mockReturnValue(true);
  });

  it('accepts the Meta webhook verification handshake with the configured token', async () => {
    const { GET } = await import('./route');
    const response = GET(new Request(
      'https://www.smartstore-ai.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify_token&hub.challenge=abc123',
    ));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('abc123');
  });

  it('rejects the Meta webhook verification handshake with a wrong token', async () => {
    const { GET } = await import('./route');
    const response = GET(new Request(
      'https://www.smartstore-ai.com/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123',
    ));

    expect(response.status).toBe(403);
  });

  it('rejects unsigned or incorrectly signed Meta webhook requests before processing', async () => {
    mocks.verifyMetaSignature.mockReturnValueOnce(false);
    const { POST } = await import('./route');
    const response = await POST(buildPostRequest());

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.parseMetaWebhookPayload).not.toHaveBeenCalled();
    expect(mocks.runWebhookEventOnce).not.toHaveBeenCalled();
    expect(mocks.processMetaInboundMessage).not.toHaveBeenCalled();
  });

  it('processes a signed Meta text message for the matching store connection', async () => {
    const { POST } = await import('./route');
    const response = await POST(buildPostRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      duplicate: false,
      ok: true,
      status: 'processed',
    });
    expect(mocks.verifyMetaSignature).toHaveBeenCalledWith(
      '{"object":"whatsapp_business_account"}',
      'sha256=valid',
      'meta_app_secret',
    );
    expect(mocks.findMetaStoreConnection).toHaveBeenCalledWith('123456');
    expect(mocks.runWebhookEventOnce).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'wamid.1',
      eventType: 'meta.whatsapp.message',
      metadata: {
        from: '966500000001',
        phoneNumberId: '123456',
      },
      provider: 'meta',
    }));
    expect(mocks.processMetaInboundMessage).toHaveBeenCalledWith({
      connection: {
        accessToken: 'store_token',
        organizationId: 'org_1',
        phoneNumberId: '123456',
      },
      message: {
        body: 'salam',
        from: '966500000001',
        messageId: 'wamid.1',
        phoneNumberId: '123456',
        profileName: 'Maher',
      },
    });
  });

  it('acknowledges unmatched Meta phone numbers without invoking the AI pipeline', async () => {
    mocks.findMetaStoreConnection.mockResolvedValueOnce(null);
    const { POST } = await import('./route');
    const response = await POST(buildPostRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      skipped: true,
    });
    expect(mocks.processMetaInboundMessage).not.toHaveBeenCalled();
  });

  it('logs Meta delivery status updates without invoking the AI pipeline', async () => {
    mocks.parseMetaWebhookPayload.mockReturnValueOnce(null);
    mocks.parseMetaWebhookStatusUpdates.mockReturnValueOnce([{
      errors: [{ code: 131026, message: 'Message undeliverable' }],
      messageId: 'wamid.outbound',
      phoneNumberId: '123456',
      recipientId: '966500000001',
      status: 'failed',
      timestamp: '1780000000',
    }]);

    const { POST } = await import('./route');
    const response = await POST(buildPostRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      skipped: true,
      statusUpdates: 1,
    });
    expect(mocks.warn).toHaveBeenCalledWith('Meta WhatsApp delivery status failed', {
      errors: [{ code: 131026, message: 'Message undeliverable' }],
      messageId: 'wamid.outbound',
      phoneNumberId: '123456',
      recipientId: '966500000001',
      status: 'failed',
      timestamp: '1780000000',
    });
    expect(mocks.findMetaStoreConnection).not.toHaveBeenCalled();
    expect(mocks.processMetaInboundMessage).not.toHaveBeenCalled();
  });
});
