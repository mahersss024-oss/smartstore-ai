import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const mockConstructEvent = vi.fn();

  return {
    mockConstructEvent,
    mockEnv: { STRIPE_WEBHOOK_SECRET: ['whsec', 'test'].join('_') as string | undefined },
    mockLoggerError: vi.fn(),
    mockLoggerWarn: vi.fn(),
    mockRunWebhookEventOnce: vi.fn(async (params: { handler: () => Promise<unknown> }) => ({
      duplicate: false,
      result: await params.handler(),
      status: 'processed',
    })),
    mockSyncBillingFromStripe: vi.fn(async () => undefined),
  };
});

vi.mock('@/libs/Env', () => ({
  Env: mocks.mockEnv,
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    error: mocks.mockLoggerError,
    warn: mocks.mockLoggerWarn,
  },
}));

vi.mock('@/libs/Stripe', () => ({
  getStripe: vi.fn(() => ({
    webhooks: {
      constructEvent: mocks.mockConstructEvent,
    },
  })),
}));

vi.mock('@/libs/StripeBillingSync', () => ({
  syncBillingFromStripe: mocks.mockSyncBillingFromStripe,
}));

vi.mock('@/libs/WebhookIdempotency', () => ({
  runWebhookEventOnce: mocks.mockRunWebhookEventOnce,
}));

const stripeEvent = {
  id: 'evt_123',
  livemode: false,
  pending_webhooks: 1,
  type: 'customer.subscription.updated',
};

const buildRequest = (body = '{}', headers?: HeadersInit) => new Request(
  'https://www.smartstore-ai.com/api/stripe/webhooks',
  {
    body,
    headers: {
      'stripe-signature': 'valid-signature',
      ...headers,
    },
    method: 'POST',
  },
) as NextRequest;

describe('Stripe webhook route reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockEnv.STRIPE_WEBHOOK_SECRET = ['whsec', 'test'].join('_');
    mocks.mockConstructEvent.mockReturnValue(stripeEvent);
    mocks.mockRunWebhookEventOnce.mockImplementation(async (params: { handler: () => Promise<unknown> }) => ({
      duplicate: false,
      result: await params.handler(),
      status: 'processed',
    }));
    mocks.mockSyncBillingFromStripe.mockResolvedValue(undefined);
  });

  it('rejects a Stripe webhook request sent without a signature header', async () => {
    const { POST } = await import('./route');

    const request = new Request(
      'https://www.smartstore-ai.com/api/stripe/webhooks',
      { body: '{}', method: 'POST' },
    ) as Parameters<typeof POST>[0];

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('Missing Stripe signature');
    expect(mocks.mockConstructEvent).not.toHaveBeenCalled();
    expect(mocks.mockRunWebhookEventOnce).not.toHaveBeenCalled();
  });

  it('fails closed when the Stripe webhook secret is missing', async () => {
    mocks.mockEnv.STRIPE_WEBHOOK_SECRET = undefined;
    const { POST } = await import('./route');

    const response = await POST(buildRequest());

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Stripe webhook secret is not configured');
    expect(mocks.mockConstructEvent).not.toHaveBeenCalled();
    expect(mocks.mockRunWebhookEventOnce).not.toHaveBeenCalled();
  });

  it('rejects oversized Stripe webhook payloads before signature construction', async () => {
    const { POST } = await import('./route');

    const response = await POST(buildRequest('{}', {
      'content-length': String((1024 * 1024) + 1),
    }));

    expect(response.status).toBe(413);
    expect(await response.text()).toBe('Webhook payload is too large');
    expect(mocks.mockConstructEvent).not.toHaveBeenCalled();
    expect(mocks.mockRunWebhookEventOnce).not.toHaveBeenCalled();
  });

  it('returns retry instructions when a Stripe event is already processing', async () => {
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
    expect(mocks.mockSyncBillingFromStripe).not.toHaveBeenCalled();
  });

  it('runs Stripe billing sync through webhook idempotency for valid events', async () => {
    const { POST } = await import('./route');

    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      duplicate: false,
      received: true,
    });
    expect(mocks.mockRunWebhookEventOnce).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'evt_123',
      eventType: 'customer.subscription.updated',
      metadata: {
        livemode: false,
        pendingWebhooks: 1,
      },
      provider: 'stripe',
    }));
    expect(mocks.mockSyncBillingFromStripe).toHaveBeenCalledWith(stripeEvent);
  });

  it('returns a non-secret processing failure when Stripe sync throws', async () => {
    mocks.mockSyncBillingFromStripe.mockRejectedValueOnce(
      new Error(`database connection failed with token ${['sk', 'live', 'hidden'].join('_')}`),
    );
    const { POST } = await import('./route');

    const response = await POST(buildRequest());

    expect(response.status).toBe(500);
    expect(await response.text()).toBe('Webhook processing failed');
    expect(mocks.mockLoggerError).toHaveBeenCalledWith(
      'Stripe webhook processing failed',
      expect.objectContaining({
        eventId: 'evt_123',
        eventType: 'customer.subscription.updated',
      }),
    );
  });
});
