import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  secretKey: undefined as string | undefined,
  stripe: vi.fn(function StripeMock(this: { key?: string }, key: string) {
    this.key = key;
  }),
}));

vi.mock('@/libs/Env', () => ({
  Env: {
    get STRIPE_SECRET_KEY() {
      return mocks.secretKey;
    },
  },
}));

vi.mock('stripe', () => ({
  default: mocks.stripe,
}));

describe('getStripe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.secretKey = undefined;
  });

  it('fails closed when Stripe is not configured', async () => {
    const { getStripe } = await import('./Stripe');

    expect(() => getStripe()).toThrow('Stripe is not configured');
    expect(mocks.stripe).not.toHaveBeenCalled();
  });

  it('creates the Stripe client with the configured secret', async () => {
    mocks.secretKey = 'stripe-secret';
    const { getStripe } = await import('./Stripe');

    expect(getStripe()).toMatchObject({ key: 'stripe-secret' });
    expect(mocks.stripe).toHaveBeenCalledWith('stripe-secret');
  });
});
