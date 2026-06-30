import { describe, expect, it } from 'vitest';
import { parseWhapiManagedChannel, WhapiConnectError } from './WhapiConnect';

describe('WhapiConnect', () => {
  it('parses managed channel credentials from common response shapes', () => {
    expect(parseWhapiManagedChannel({
      channel: {
        id: 'channel_123',
        phoneNumber: '+966500000000',
        token: 'token_123',
      },
    })).toEqual({
      apiToken: 'token_123',
      channelId: 'channel_123',
      displayPhoneNumber: '+966500000000',
    });

    expect(parseWhapiManagedChannel({
      data: {
        api_token: 'token_456',
        channel_id: 'channel_456',
      },
    })).toMatchObject({
      apiToken: 'token_456',
      channelId: 'channel_456',
    });
  });

  it('fails closed when the managed channel response omits credentials', () => {
    expect(() => parseWhapiManagedChannel({ channel: { id: 'channel_123' } }))
      .toThrow(WhapiConnectError);
  });
});
