import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Env } from './Env';
import { createWhapiManagedChannel, parseWhapiManagedChannel, WhapiConnectError } from './WhapiConnect';

describe('WhapiConnect', () => {
  beforeEach(() => {
    Object.assign(Env, {
      WHAPI_PARTNER_API_BASE: 'https://manager.whapi.test',
      WHAPI_PARTNER_API_TOKEN: 'partner_token',
      WHAPI_PROJECT_ID: 'project_123',
    });
    vi.restoreAllMocks();
  });

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

  it('uses query token authentication for partner channel creation', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        channel: {
          id: 'channel_123',
          token: 'channel_token',
        },
      }), { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(createWhapiManagedChannel({ name: 'Store Channel' }))
      .resolves
      .toMatchObject({
        apiToken: 'channel_token',
        channelId: 'channel_123',
      });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      'https://manager.whapi.test/channels?token=partner_token',
    );
  });

  it('falls back to bearer authentication when query authentication is rejected', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        channel: {
          id: 'channel_123',
          token: 'channel_token',
        },
      }), { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(createWhapiManagedChannel({ name: 'Store Channel' }))
      .resolves
      .toMatchObject({
        apiToken: 'channel_token',
        channelId: 'channel_123',
      });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      'https://manager.whapi.test/channels?token=partner_token',
    );
    expect(fetchMock.mock.calls[1]?.[0].toString()).toBe('https://manager.whapi.test/channels');
  });
});
