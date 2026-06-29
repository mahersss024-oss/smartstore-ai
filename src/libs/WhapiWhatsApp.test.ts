import { describe, expect, it } from 'vitest';
import { parseWhapiWebhookPayload } from './WhapiWhatsApp';

describe('WhapiWhatsApp', () => {
  it('parses an inbound text message from a Whapi-style payload', () => {
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

  it('uses the URL channel fallback and skips outgoing echoes', () => {
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
});
