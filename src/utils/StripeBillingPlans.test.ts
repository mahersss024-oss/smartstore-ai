import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    STRIPE_PRICE_EXTRA_AI_ORDERS: 'price_ai',
    STRIPE_PRICE_EXTRA_CATALOG_ITEMS: 'price_catalog',
    STRIPE_PRICE_EXTRA_IMAGE_STORAGE: 'price_storage',
    STRIPE_PRICE_EXTRA_TEAM_MEMBER: 'price_team',
    STRIPE_PRICE_GROWTH_MONTHLY: 'price_growth',
    STRIPE_PRICE_PRO_MONTHLY: 'price_pro',
    STRIPE_PRICE_STARTER_MONTHLY: 'price_starter',
  },
}));

vi.mock('@/libs/Env', () => ({
  Env: mocks.env,
}));

describe('StripeBillingPlans', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('normalizes public plan names and slugs', async () => {
    const { normalizeBillingPlanKey } = await import('./StripeBillingPlans');

    expect(normalizeBillingPlanKey(' SmartStore-Growth Plan ')).toBe('growth_plan');
    expect(normalizeBillingPlanKey('smartstore_pro')).toBe('pro');
    expect(normalizeBillingPlanKey(null)).toBe('');
  });

  it('maps configured plan and add-on price ids', async () => {
    const {
      getStripeAddOnKeyByPriceId,
      getStripePlanByPriceId,
      STRIPE_ADD_ON_PRICE,
    } = await import('./StripeBillingPlans');

    expect(getStripePlanByPriceId('price_starter')).toBe('starter');
    expect(getStripePlanByPriceId('missing')).toBeUndefined();
    expect(getStripeAddOnKeyByPriceId('price_team')).toBe(
      STRIPE_ADD_ON_PRICE.EXTRA_TEAM_MEMBER,
    );
    expect(getStripeAddOnKeyByPriceId()).toBeUndefined();
  });
});
