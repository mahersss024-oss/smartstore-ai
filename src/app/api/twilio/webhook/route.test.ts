import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockAcquireWebhookProcessingLock,
  mockBuildTwilioOutboundBody,
  mockDispatchAndRecordAiInboundJob,
  mockEnqueueAiInboundJob,
  mockFindTwilioStoreConnection,
  mockLoadTwilioConversationMetadata,
  mockLoggerInfo,
  mockLoggerWarn,
  mockReleaseWebhookProcessingLock,
  mockResolveTwilioSemanticHints,
  mockRunWebhookEventOnce,
  mockSendTrustedWebhookChatMessage,
  mockSendTwilioWhatsAppMessage,
  mockValidateRequest,
} = vi.hoisted(() => ({
  mockAcquireWebhookProcessingLock: vi.fn(),
  mockBuildTwilioOutboundBody: vi.fn(),
  mockDispatchAndRecordAiInboundJob: vi.fn(),
  mockEnqueueAiInboundJob: vi.fn(),
  mockFindTwilioStoreConnection: vi.fn(),
  mockLoadTwilioConversationMetadata: vi.fn(),
  mockLoggerInfo: vi.fn(),
  mockLoggerWarn: vi.fn(),
  mockReleaseWebhookProcessingLock: vi.fn(),
  mockResolveTwilioSemanticHints: vi.fn(),
  mockRunWebhookEventOnce: vi.fn(),
  mockSendTrustedWebhookChatMessage: vi.fn(),
  mockSendTwilioWhatsAppMessage: vi.fn(),
  mockValidateRequest: vi.fn(),
}));

const mockEnv = vi.hoisted(() => ({
  AI_PROCESSING_MODE: 'sync' as 'outbox' | 'sync',
}));

vi.mock('@/libs/Env', () => ({
  Env: mockEnv,
}));

vi.mock('@/libs/AIInboundJobDispatch', () => ({
  dispatchAndRecordAiInboundJob: mockDispatchAndRecordAiInboundJob,
}));

vi.mock('@/libs/AIInboundJobQueue', () => ({
  enqueueAiInboundJob: mockEnqueueAiInboundJob,
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    info: mockLoggerInfo,
    warn: mockLoggerWarn,
  },
}));

vi.mock('twilio', () => ({
  default: {
    validateRequest: mockValidateRequest,
  },
}));

vi.mock('@/features/customer/WebChatActions', () => ({
  sendTrustedWebhookChatMessage: mockSendTrustedWebhookChatMessage,
}));

vi.mock('@/libs/TwilioWhatsApp', () => ({
  buildTwilioExternalThreadId: vi.fn(() => 'twa:14155552671:966500000001'),
  extractCustomerPhoneFromWhatsAppFrom: vi.fn(() => '+966500000001'),
  findTwilioStoreConnection: mockFindTwilioStoreConnection,
  parseTwilioWebhookBody: vi.fn((params: URLSearchParams) => ({
    body: params.get('Body') ?? '',
    from: params.get('From') ?? '',
    messageSid: params.get('MessageSid') ?? '',
    profileName: params.get('ProfileName') ?? undefined,
    to: params.get('To') ?? '',
    waId: params.get('WaId') ?? undefined,
  })),
  sendTwilioWhatsAppMessage: mockSendTwilioWhatsAppMessage,
}));

vi.mock('@/libs/TwilioConversationAdapter', () => ({
  buildTwilioOutboundBody: mockBuildTwilioOutboundBody,
  loadTwilioConversationMetadata: mockLoadTwilioConversationMetadata,
  resolveTwilioSemanticHints: mockResolveTwilioSemanticHints,
}));

vi.mock('@/libs/WebhookIdempotency', () => ({
  acquireWebhookProcessingLock: mockAcquireWebhookProcessingLock,
  runWebhookEventOnce: mockRunWebhookEventOnce,
}));

const connection = {
  accountSid: `AC${'a'.repeat(32)}`,
  authToken: 'b'.repeat(32),
  organizationId: 'org_store_1',
  twilioWhatsAppFrom: 'whatsapp:+14155552671',
};

const buildRequest = () => new Request(
  'https://www.smartstore-ai.com/api/twilio/webhook',
  {
    body: new URLSearchParams({
      Body: 'سلام',
      From: 'whatsapp:+966500000001',
      MessageSid: 'SM_message_1',
      ProfileName: 'Customer One',
      To: 'whatsapp:+14155552671',
      WaId: '966500000001',
    }),
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'x-twilio-signature': 'valid-signature',
    },
    method: 'POST',
  },
);

describe('Twilio WhatsApp webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindTwilioStoreConnection.mockResolvedValue(connection);
    mockBuildTwilioOutboundBody.mockImplementation(
      (result: { replyToCustomer: string }) => result.replyToCustomer.trim(),
    );
    mockLoadTwilioConversationMetadata.mockResolvedValue(undefined);
    mockResolveTwilioSemanticHints.mockReturnValue(undefined);
    mockEnv.AI_PROCESSING_MODE = 'sync';
    mockEnqueueAiInboundJob.mockResolvedValue({ enqueued: true, jobId: 7 });
    mockDispatchAndRecordAiInboundJob.mockResolvedValue({ dispatched: true });
    mockValidateRequest.mockReturnValue(true);
    mockAcquireWebhookProcessingLock.mockResolvedValue({
      acquired: true,
      release: mockReleaseWebhookProcessingLock,
      status: 'acquired',
    });
    mockRunWebhookEventOnce.mockImplementation(
      async (params: { handler: () => Promise<unknown> }) => ({
        duplicate: false,
        result: await params.handler(),
        status: 'processed',
      }),
    );
    mockSendTrustedWebhookChatMessage.mockResolvedValue({
      data: {
        conversationId: 77,
        replyToCustomer: 'وعليكم السلام',
        responseMessageId: 101,
      },
      ok: true,
    });
    mockSendTwilioWhatsAppMessage.mockResolvedValue('SM_reply_1');
  });

  it('validates with the matched store token, routes to that store, and sends through Twilio', async () => {
    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: 'processed',
    });
    expect(mockFindTwilioStoreConnection).toHaveBeenCalledWith(
      'whatsapp:+14155552671',
    );
    expect(mockValidateRequest).toHaveBeenCalledWith(
      connection.authToken,
      'valid-signature',
      'https://www.smartstore-ai.com/api/twilio/webhook',
      expect.objectContaining({
        From: 'whatsapp:+966500000001',
        To: 'whatsapp:+14155552671',
      }),
    );
    expect(mockSendTrustedWebhookChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_store_1',
        source: 'whatsapp',
      }),
    );
    expect(mockSendTwilioWhatsAppMessage).toHaveBeenCalledWith({
      body: 'وعليكم السلام',
      connection,
      to: 'whatsapp:+966500000001',
    });
  });

  it('rejects a webhook whose signature does not match the store Auth Token', async () => {
    mockValidateRequest.mockReturnValue(false);
    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
    expect(mockSendTrustedWebhookChatMessage).not.toHaveBeenCalled();
    expect(mockSendTwilioWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('passes a trusted Twilio text selection into the shared conversation engine', async () => {
    const semanticHints = {
      selectedProductId: 15,
      systemEvent: {
        source: 'web_order_ui',
        type: 'product_selected',
      },
    };
    mockLoadTwilioConversationMetadata.mockResolvedValue({
      lastSuggestedProducts: [{ id: 15, name: 'نص مضغوط دجاج' }],
    });
    mockResolveTwilioSemanticHints.mockReturnValue(semanticHints);

    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(mockResolveTwilioSemanticHints).toHaveBeenCalledWith({
      message: 'سلام',
      metadata: {
        lastSuggestedProducts: [{ id: 15, name: 'نص مضغوط دجاج' }],
      },
    });
    expect(mockSendTrustedWebhookChatMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        semanticHints,
      }),
    );
  });

  it('does not process or send when no active Twilio store matches the recipient', async () => {
    mockFindTwilioStoreConnection.mockResolvedValue(null);
    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, skipped: true });
    expect(mockValidateRequest).not.toHaveBeenCalled();
    expect(mockSendTrustedWebhookChatMessage).not.toHaveBeenCalled();
    expect(mockSendTwilioWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('returns a retryable safe error when Twilio cannot deliver the generated reply', async () => {
    mockSendTwilioWhatsAppMessage.mockRejectedValue(
      new Error('provider credential details must stay private'),
    );
    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('2');

    const body = JSON.stringify(await response.json());

    expect(body).toContain('Message processing is incomplete');
    expect(body).not.toContain('provider credential details');
    expect(mockLoggerWarn).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        error: 'provider credential details must stay private',
      }),
    );
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'Twilio inbound message processed but outbound reply failed',
      expect.objectContaining({
        error: 'twilio_provider_error',
      }),
    );
  });

  it('sends a readable Arabic fallback for non-retryable AI failures', async () => {
    mockSendTrustedWebhookChatMessage.mockResolvedValueOnce({
      error: 'invalid_message',
      ok: false,
    });

    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      status: 'processed',
    });
    expect(mockSendTwilioWhatsAppMessage).toHaveBeenCalledWith({
      body: 'لم أستطع قراءة الرسالة بشكل صحيح. فضلاً أعد إرسال طلبك بصيغة أوضح.',
      connection,
      to: 'whatsapp:+966500000001',
    });
  });

  it('persists and dispatches the message without running AI in outbox mode', async () => {
    mockEnv.AI_PROCESSING_MODE = 'outbox';
    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(mockEnqueueAiInboundJob).toHaveBeenCalledWith({
      channel: 'whatsapp',
      dedupeKey: 'SM_message_1',
      externalThreadId: 'twa:14155552671:966500000001',
      organizationId: 'org_store_1',
      payload: {
        message: expect.objectContaining({
          messageSid: 'SM_message_1',
        }),
      },
    });
    expect(mockDispatchAndRecordAiInboundJob).toHaveBeenCalledWith({ jobId: 7 });
    expect(mockSendTrustedWebhookChatMessage).not.toHaveBeenCalled();
    expect(mockSendTwilioWhatsAppMessage).not.toHaveBeenCalled();
  });
});
