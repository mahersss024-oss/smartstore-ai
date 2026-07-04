import { Buffer } from 'node:buffer';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Env } from './Env';
import {
  activateWhapiManagedChannel,
  changeWhapiManagedChannelMode,
  checkWhapiManagedChannelExists,
  configureWhapiChannelWebhook,
  createWhapiManagedChannel,
  extendWhapiManagedChannel,
  fetchWhapiQrCodeDataUrl,
  parseWhapiManagedChannel,
  restartWhapiManagedChannel,
  WhapiConnectError,
} from './WhapiConnect';

describe('WhapiConnect', () => {
  beforeEach(() => {
    Object.assign(Env, {
      WHAPI_PARTNER_API_BASE: 'https://manager.whapi.test',
      WHAPI_PARTNER_API_TOKEN: 'partner_token',
      WHAPI_PROJECT_ID: 'project_123',
      WHAPI_GATE_API_BASE: 'https://gate.whapi.test',
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

  it('uses bearer authentication for partner channel creation', async () => {
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
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe('https://manager.whapi.test/channels');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: expect.objectContaining({
        Authorization: 'Bearer partner_token',
      }),
    });
  });

  it('falls back to singular channel endpoint when plural create is unavailable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }))
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
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe('https://manager.whapi.test/channels');
    expect(fetchMock.mock.calls[1]?.[0].toString()).toBe('https://manager.whapi.test/channel');
  });

  it('falls back to query authentication when bearer authentication is rejected', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
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

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe('https://manager.whapi.test/channels');
    expect(fetchMock.mock.calls[1]?.[0].toString()).toBe('https://manager.whapi.test/channel');
    expect(fetchMock.mock.calls[2]?.[0].toString()).toBe(
      'https://manager.whapi.test/channels?token=partner_token',
    );
  });

  it('normalizes a trailing partner API base slash', async () => {
    Object.assign(Env, {
      WHAPI_PARTNER_API_BASE: 'https://manager.whapi.test/',
    });
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
        channelId: 'channel_123',
      });

    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      'https://manager.whapi.test/channels',
    );
  });

  it('adds a safe project probe summary when channel creation fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('missing channel', { status: 404 }))
      .mockResolvedValueOnce(new Response('missing channel', { status: 404 }))
      .mockResolvedValueOnce(new Response('missing channel', { status: 404 }))
      .mockResolvedValueOnce(new Response('missing channel', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        projects: [{ id: 'project_123' }],
      }), { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(createWhapiManagedChannel({ name: 'Store Channel' }))
      .rejects
      .toMatchObject({
        detail: expect.stringContaining('projectProbe=ok'),
        message: 'whapi_channel_create_failed',
      });
  });

  it('redacts Whapi tokens from failed request details', async () => {
    const exposedJwt = 'eyJabcdefghijklmnopqrstuvwxyz.eyJabcdefghijklmnopqrstuvwxyz.signatureabcdefghijklmnopqrstuvwxyz';
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(`missing Bearer ${exposedJwt} partner_token`, { status: 404 }))
      .mockResolvedValueOnce(new Response('missing channel', { status: 404 }))
      .mockResolvedValueOnce(new Response('missing channel', { status: 404 }))
      .mockResolvedValueOnce(new Response('missing channel', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        projects: [{ id: 'project_123' }],
      }), { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    try {
      await createWhapiManagedChannel({ name: 'Store Channel' });
      throw new Error('expected createWhapiManagedChannel to fail');
    } catch (error) {
      expect(error).toMatchObject({
        message: 'whapi_channel_create_failed',
      });
      expect((error as WhapiConnectError).detail).not.toContain('partner_token');
      expect((error as WhapiConnectError).detail).not.toContain(exposedJwt);
      expect((error as WhapiConnectError).detail).toContain('Bearer [redacted]');
    }
  });

  it('reports available project ids when the configured project id is wrong', async () => {
    Object.assign(Env, {
      WHAPI_PROJECT_ID: 'wrong_project',
    });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('missing channel', { status: 404 }))
      .mockResolvedValueOnce(new Response('missing channel', { status: 404 }))
      .mockResolvedValueOnce(new Response('missing channel', { status: 404 }))
      .mockResolvedValueOnce(new Response('missing channel', { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        projects: [{ id: 'project_123' }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('missing project', { status: 404 }))
      .mockResolvedValueOnce(new Response('missing project', { status: 404 }))
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(createWhapiManagedChannel({ name: 'Store Channel' }))
      .rejects
      .toMatchObject({
        detail: expect.stringContaining('availableProjectIds=project_123'),
        message: 'whapi_channel_create_failed',
      });
  });

  it('reports safe details when webhook configuration fails', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('not found', { status: 404 }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(configureWhapiChannelWebhook({
      apiToken: 'channel_token',
      webhookUrl: 'https://smartstore.test/api/whatsapp/webhook?secret=secret_123',
    }))
      .rejects
      .toMatchObject({
        detail: 'not found',
        message: 'whapi_webhook_configure_failed',
        status: 404,
      });

    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe('https://gate.whapi.test/settings');
  });

  it('fetches the QR image through the Whapi login endpoint', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ qr: 'QR_BASE64' }), {
        headers: { 'content-type': 'application/json' },
        status: 200,
      }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWhapiQrCodeDataUrl({ apiToken: 'channel_token' }))
      .resolves
      .toBe('data:image/png;base64,QR_BASE64');

    expect(fetchMock.mock.calls[0]?.[0].toString())
      .toBe('https://gate.whapi.test/users/login?wakeup=true&width=320&height=320');
  });

  it('falls back to the Whapi QR image endpoint when login output is temporarily unavailable', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('temporary unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('PNG_BYTES', {
        headers: { 'content-type': 'image/png' },
        status: 200,
      }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWhapiQrCodeDataUrl({ apiToken: 'channel_token' }))
      .resolves
      .toBe(`data:image/png;base64,${Buffer.from('PNG_BYTES').toString('base64')}`);

    expect(fetchMock.mock.calls[0]?.[0].toString())
      .toBe('https://gate.whapi.test/users/login?wakeup=true&width=320&height=320');
    expect(fetchMock.mock.calls[1]?.[0].toString()).toBe('https://gate.whapi.test/users/login/image');
  });

  it('reports safe details when QR image is not ready yet', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{"error":"Channel not found"}', { status: 404 }))
      .mockResolvedValueOnce(new Response('{"error":"Channel not found"}', { status: 404 }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchWhapiQrCodeDataUrl({ apiToken: 'channel_token' }))
      .rejects
      .toMatchObject({
        detail: '/users/login:404:{"error":"Channel not found"} | /users/login/image:404:{"error":"Channel not found"}',
        message: 'whapi_qr_fetch_failed',
        status: 404,
      });

    expect(fetchMock.mock.calls[0]?.[0].toString())
      .toBe('https://gate.whapi.test/users/login?wakeup=true&width=320&height=320');
    expect(fetchMock.mock.calls[1]?.[0].toString()).toBe('https://gate.whapi.test/users/login/image');
  });

  it('changes a managed channel to live mode through the partner API', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(changeWhapiManagedChannelMode({
      channelId: 'GAMORA-8BDZS',
      mode: 'live',
    }))
      .resolves
      .toBeUndefined();

    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe('https://manager.whapi.test/channels/GAMORA-8BDZS/mode');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ mode: 'live' }),
      method: 'PATCH',
    });
  });

  it('extends a managed channel through the partner API', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(extendWhapiManagedChannel({
      channelId: 'GAMORA-8BDZS',
      comment: '[test]',
      days: 30,
    }))
      .resolves
      .toBeUndefined();

    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe('https://manager.whapi.test/channels/GAMORA-8BDZS/extend');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({ comment: '[test]', days: 30 }),
      method: 'POST',
    });
  });

  it('checks whether a managed channel still exists through the partner API', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        channel: {
          id: 'GAMORA-8BDZS',
          token: 'channel_token',
        },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response('missing', { status: 404 }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(checkWhapiManagedChannelExists({ channelId: 'GAMORA-8BDZS' }))
      .resolves
      .toBe(true);
    await expect(checkWhapiManagedChannelExists({ channelId: 'MISSING-1' }))
      .resolves
      .toBe(false);

    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe('https://manager.whapi.test/channels/GAMORA-8BDZS');
    expect(fetchMock.mock.calls[1]?.[0].toString()).toBe('https://manager.whapi.test/channels/MISSING-1');
  });

  it('restarts a managed channel before QR retrieval', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(restartWhapiManagedChannel({ channelId: 'GAMORA-8BDZS' }))
      .resolves
      .toBeUndefined();

    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe('https://manager.whapi.test/channels/GAMORA-8BDZS/restart');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      body: JSON.stringify({}),
      method: 'POST',
    });
  });

  it('activates a managed channel by switching to live mode before extending days', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    vi.stubGlobal('fetch', fetchMock);

    await expect(activateWhapiManagedChannel({ channelId: 'GAMORA-8BDZS' }))
      .resolves
      .toBeUndefined();

    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe('https://manager.whapi.test/channels/GAMORA-8BDZS/mode');
    expect(fetchMock.mock.calls[1]?.[0].toString()).toBe('https://manager.whapi.test/channels/GAMORA-8BDZS/extend');
  });
});
