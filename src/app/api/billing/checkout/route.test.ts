import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(async (): Promise<{ orgId: null | string }> => ({ orgId: 'org_1' })),
  checkoutSessionsCreate: vi.fn(async () => ({ url: 'https://checkout.stripe.test/session' })),
  env: {
    ENABLE_STRIPE_SELF_CHECKOUT: false,
    NEXT_PUBLIC_APP_URL: 'https://smartstore-ai.com',
  },
  getStripe: vi.fn(() => ({
    checkout: {
      sessions: {
        create: mocks.checkoutSessionsCreate,
      },
    },
  })),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: mocks.auth,
}));

vi.mock('@/libs/Env', () => ({
  Env: mocks.env,
}));

vi.mock('@/libs/Stripe', () => ({
  getStripe: mocks.getStripe,
}));

vi.mock('@/utils/StripeBillingPlans', async importOriginal => ({
  ...await importOriginal<typeof import('@/utils/StripeBillingPlans')>(),
  getStripeAddOnPriceId: vi.fn(() => 'price_extra_ai'),
  getStripePlanPriceId: vi.fn(() => 'price_starter'),
}));

const buildRequest = (body: unknown) => new Request(
  'https://smartstore-ai.com/api/billing/checkout',
  {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  },
);

describe('billing checkout route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ orgId: 'org_1' });
    mocks.checkoutSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.test/session' });
    mocks.env.ENABLE_STRIPE_SELF_CHECKOUT = false;
    mocks.env.NEXT_PUBLIC_APP_URL = 'https://smartstore-ai.com';
  });

  it('stays disabled until platform self-checkout is explicitly enabled', async () => {
    const { POST } = await import('./route');

    const response = await POST(buildRequest({
      kind: 'base_plan',
      plan: 'starter',
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Stripe self-checkout is disabled',
    });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });

  it('rejects enabled checkout requests without an active organization', async () => {
    mocks.env.ENABLE_STRIPE_SELF_CHECKOUT = true;
    mocks.auth.mockResolvedValueOnce({ orgId: null });
    const { POST } = await import('./route');

    const response = await POST(buildRequest({
      kind: 'base_plan',
      plan: 'starter',
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.getStripe).not.toHaveBeenCalled();
  });

  it('creates a Stripe checkout session with organization metadata when enabled', async () => {
    mocks.env.ENABLE_STRIPE_SELF_CHECKOUT = true;
    const { POST } = await import('./route');

    const response = await POST(buildRequest({
      kind: 'base_plan',
      plan: 'starter',
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      url: 'https://checkout.stripe.test/session',
    });
    expect(mocks.checkoutSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      client_reference_id: 'org_1',
      metadata: {
        billing_kind: 'base_plan',
        organization_id: 'org_1',
        plan: 'starter',
      },
      mode: 'subscription',
      subscription_data: {
        metadata: {
          billing_kind: 'base_plan',
          organization_id: 'org_1',
          plan: 'starter',
        },
      },
    }));
  });

  it('creates add-on checkout metadata when enabled', async () => {
    mocks.env.ENABLE_STRIPE_SELF_CHECKOUT = true;
    const { POST } = await import('./route');

    const response = await POST(buildRequest({
      addOnKey: 'extra_ai_orders',
      kind: 'add_on',
    }));

    expect(response.status).toBe(200);
    expect(mocks.checkoutSessionsCreate).toHaveBeenCalledWith(expect.objectContaining({
      metadata: {
        add_on_key: 'extra_ai_orders',
        billing_kind: 'add_on',
        organization_id: 'org_1',
      },
    }));
  });
});
