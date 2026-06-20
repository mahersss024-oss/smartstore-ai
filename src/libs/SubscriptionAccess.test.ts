import { afterEach, describe, expect, it, vi } from 'vitest';
import { PLAN_NAME } from '@/utils/PricingPlans';

const loadSubscriptionAccess = async (
  demoMode: boolean,
  nodeEnv: 'development' | 'production' | 'test' = 'test',
) => {
  vi.resetModules();
  vi.stubEnv('CLERK_SECRET_KEY', ['sk', 'test', 'unit'].join('_'));
  vi.stubEnv('DATABASE_URL', 'postgresql://unit.test/db');
  vi.stubEnv('DEMO_MODE', demoMode ? 'true' : 'false');
  vi.stubEnv('NODE_ENV', nodeEnv);
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', ['pk', 'test', 'unit'].join('_'));

  return import('./SubscriptionAccess');
};

describe('SubscriptionAccess demo mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('grants pro access without Stripe metadata when demo mode is enabled outside production', async () => {
    const access = await loadSubscriptionAccess(true);

    expect(access.hasActivePaidSubscription({})).toBe(true);
    expect(access.getConfiguredSubscriptionPlan({}).name).toBe(PLAN_NAME.PRO);
    expect(access.hasActiveStripePaidSubscription({})).toBe(false);
  });

  it('keeps normal free access when demo mode is disabled', async () => {
    const access = await loadSubscriptionAccess(false);

    expect(access.hasActivePaidSubscription({})).toBe(false);
    expect(access.getConfiguredSubscriptionPlan({}).name).toBe(PLAN_NAME.FREE);
  });

  it('keeps production stores free until platform admin activates a paid plan', async () => {
    const access = await loadSubscriptionAccess(true, 'production');

    expect(access.hasActivePaidSubscription({})).toBe(false);
    expect(access.getConfiguredSubscriptionPlan({}).name).toBe(PLAN_NAME.FREE);
  });
});
