import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const organizationEvent = {
    data: { id: 'org_123' },
    type: 'organization.updated',
  };

  return {
    mockLoggerError: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockRunWebhookEventOnce: vi.fn(async (params: { handler: () => Promise<unknown> }) => ({
      duplicate: false,
      result: await params.handler(),
      status: 'processed',
    })),
    mockSyncOrganizationFromClerk: vi.fn(async () => undefined),
    mockVerifyWebhook: vi.fn(async () => organizationEvent),
    organizationEvent,
  };
});

vi.mock('@clerk/nextjs/webhooks', () => ({
  verifyWebhook: mocks.mockVerifyWebhook,
}));

vi.mock('@/libs/ClerkOrganizationSync', () => ({
  syncOrganizationFromClerk: mocks.mockSyncOrganizationFromClerk,
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    error: mocks.mockLoggerError,
    warn: mocks.mockLoggerWarn,
  },
}));

vi.mock('@/libs/WebhookIdempotency', () => ({
  runWebhookEventOnce: mocks.mockRunWebhookEventOnce,
}));

const buildRequest = (headers?: HeadersInit, body = '{}') => new Request(
  'https://www.smartstore-ai.com/api/clerk/webhooks',
  {
    body,
    headers: {
      'svix-id': 'msg_123',
      ...headers,
    },
    method: 'POST',
  },
) as NextRequest;

describe('Clerk webhook route reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockVerifyWebhook.mockResolvedValue(mocks.organizationEvent);
    mocks.mockRunWebhookEventOnce.mockImplementation(async (params: { handler: () => Promise<unknown> }) => ({
      duplicate: false,
      result: await params.handler(),
      status: 'processed',
    }));
    mocks.mockSyncOrganizationFromClerk.mockResolvedValue(undefined);
  });

  it('rejects unverifiable Clerk webhook requests before idempotency processing', async () => {
    mocks.mockVerifyWebhook.mockRejectedValueOnce(new Error('bad signature'));
    const { POST } = await import('./route');

    const response = await POST(buildRequest());

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Webhook verification failed');
    expect(mocks.mockRunWebhookEventOnce).not.toHaveBeenCalled();
    expect(mocks.mockSyncOrganizationFromClerk).not.toHaveBeenCalled();
  });

  it('rejects oversized requests before Clerk signature verification', async () => {
    const { POST } = await import('./route');
    const response = await POST(buildRequest(
      { 'content-length': String(1024 * 1024 + 1) },
      '{}',
    ));

    expect(response.status).toBe(413);
    expect(await response.text()).toBe('Webhook payload is too large');
    expect(mocks.mockVerifyWebhook).not.toHaveBeenCalled();
    expect(mocks.mockRunWebhookEventOnce).not.toHaveBeenCalled();
  });

  it('returns retry instructions when a Clerk event is already processing', async () => {
    mocks.mockRunWebhookEventOnce.mockResolvedValueOnce({
      duplicate: false,
      result: undefined,
      status: 'in_progress',
    });
    const { POST } = await import('./route');

    const response = await POST(buildRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get('Retry-After')).toBe('5');
    expect(await response.json()).toEqual({
      received: false,
      retry: true,
    });
    expect(mocks.mockSyncOrganizationFromClerk).not.toHaveBeenCalled();
  });

  it('syncs organization events through webhook idempotency', async () => {
    const { POST } = await import('./route');

    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      duplicate: false,
      received: true,
    });
    expect(mocks.mockRunWebhookEventOnce).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'msg_123',
      eventType: 'organization.updated',
      metadata: {
        clerkObjectId: 'org_123',
        hasSvixId: true,
      },
      provider: 'clerk',
    }));
    expect(mocks.mockSyncOrganizationFromClerk).toHaveBeenCalledWith(
      mocks.organizationEvent,
    );
  });

  it('uses a deterministic fallback event id when Svix id is absent', async () => {
    const { POST } = await import('./route');

    const response = await POST(buildRequest({ 'svix-id': '' }));

    expect(response.status).toBe(200);
    expect(mocks.mockRunWebhookEventOnce).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'organization.updated:org_123',
      metadata: {
        clerkObjectId: 'org_123',
        hasSvixId: false,
      },
    }));
  });

  it('returns a non-secret processing failure when Clerk sync throws', async () => {
    mocks.mockSyncOrganizationFromClerk.mockRejectedValueOnce(
      new Error(`sync failed with token ${['sk', 'live', 'hidden'].join('_')}`),
    );
    const { POST } = await import('./route');

    const response = await POST(buildRequest());

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Webhook processing failed');
    expect(mocks.mockLoggerError).toHaveBeenCalledWith(
      'Clerk webhook processing failed',
      expect.objectContaining({
        eventId: 'msg_123',
        eventType: 'organization.updated',
      }),
    );
  });
});
