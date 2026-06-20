import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCreateTwilioClient,
  mockMessageCreate,
} = vi.hoisted(() => ({
  mockCreateTwilioClient: vi.fn(),
  mockMessageCreate: vi.fn(),
}));

vi.mock('./TwilioClient', () => ({
  createTwilioClient: mockCreateTwilioClient,
}));

describe('TwilioWhatsApp outbound adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMessageCreate.mockResolvedValue({ sid: 'SM_reply_1' });
    mockCreateTwilioClient.mockReturnValue({
      messages: {
        create: mockMessageCreate,
      },
    });
  });

  it('uses the store account credentials and explicit WhatsApp sender', async () => {
    const { sendTwilioWhatsAppMessage } = await import('./TwilioWhatsApp');
    const accountSid = `AC${'a'.repeat(32)}`;
    const authToken = 'b'.repeat(32);

    await expect(sendTwilioWhatsAppMessage({
      body: 'Hello',
      connection: {
        accountSid,
        authToken,
        twilioWhatsAppFrom: 'whatsapp:+14155552671',
      },
      to: '+966500000001',
    })).resolves.toBe('SM_reply_1');

    expect(mockCreateTwilioClient).toHaveBeenCalledWith(accountSid, authToken);
    expect(mockMessageCreate).toHaveBeenCalledWith({
      body: 'Hello',
      from: 'whatsapp:+14155552671',
      to: 'whatsapp:+966500000001',
    });
  }, 20000);

  it('uses the store Messaging Service SID when configured', async () => {
    const { sendTwilioWhatsAppMessage } = await import('./TwilioWhatsApp');

    await sendTwilioWhatsAppMessage({
      body: 'Hello',
      connection: {
        accountSid: `AC${'a'.repeat(32)}`,
        authToken: 'b'.repeat(32),
        messagingServiceSid: `MG${'c'.repeat(32)}`,
        twilioWhatsAppFrom: 'whatsapp:+14155552671',
      },
      to: 'whatsapp:+966500000001',
    });

    expect(mockMessageCreate).toHaveBeenCalledWith({
      body: 'Hello',
      messagingServiceSid: `MG${'c'.repeat(32)}`,
      to: 'whatsapp:+966500000001',
    });
  });
});
