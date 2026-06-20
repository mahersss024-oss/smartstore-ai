import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PLAN_NAME } from '@/utils/PricingPlans';
import {
  assertStoreFeatureEnabled,
  isStoreFeatureEnabled,
  StoreFeatureDisabledError,
  StoreSubscriptionInactiveError,
} from './StoreServiceControls';

vi.mock('@/libs/SubscriptionAccess', async () => {
  const actual = await vi.importActual<typeof import('@/libs/SubscriptionAccess')>(
    '@/libs/SubscriptionAccess',
  );

  return {
    ...actual,
    hasActivePaidSubscription: vi.fn((metadata: {
      subscription?: {
        adminOverride?: { enabled?: boolean; plan?: string };
        renewsAt?: string | null;
        status?: string;
        stripeItems?: Record<string, { plan?: string; status?: string }>;
        stripeSubscriptionId?: string;
      };
    } | null | undefined) => {
      const subscription = metadata?.subscription;

      if (subscription?.adminOverride?.enabled) {
        return ['starter', 'growth', 'pro'].includes(subscription.adminOverride.plan ?? '');
      }

      const hasActivePaidBaseItem = Object.values(subscription?.stripeItems ?? {}).some((item) => {
        return item.status === 'active' && ['starter', 'growth', 'pro'].includes(item.plan ?? '');
      });

      return Boolean(
        subscription
        && ['active', 'trialing'].includes(subscription.status ?? '')
        && subscription.stripeSubscriptionId
        && hasActivePaidBaseItem
        && (!subscription.renewsAt || new Date(subscription.renewsAt).getTime() > Date.now()),
      );
    }),
    isSubscriptionDemoMode: vi.fn(() => false),
  };
});

type MockStoreRow = {
  metadata: unknown;
};

let mockRows: MockStoreRow[] = [];

vi.mock('@/libs/DB', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => mockRows),
        })),
      })),
    })),
  },
}));

const activeStarterSubscription = () => ({
  plan: PLAN_NAME.STARTER,
  renewsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  status: 'active',
  stripeItems: {
    base: {
      plan: PLAN_NAME.STARTER,
      status: 'active',
    },
  },
  stripeSubscriptionId: 'sub_active',
});

describe('StoreServiceControls', () => {
  beforeEach(() => {
    mockRows = [];
  });

  it('blocks feature access when the store is missing', async () => {
    await expect(assertStoreFeatureEnabled('org_missing', 'webOrders'))
      .rejects
      .toMatchObject({
        name: 'StoreSubscriptionInactiveError',
        reason: 'store_not_found',
      });

    await expect(isStoreFeatureEnabled('org_missing', 'webOrders')).resolves.toBe(false);
  });

  it('blocks all features when the subscription is inactive', async () => {
    mockRows = [{
      metadata: {
        subscription: {
          plan: PLAN_NAME.STARTER,
          renewsAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          status: 'expired',
          stripeItems: {
            base: {
              plan: PLAN_NAME.STARTER,
              status: 'active',
            },
          },
          stripeSubscriptionId: 'sub_expired',
        },
      },
    }];

    await expect(assertStoreFeatureEnabled('org_expired', 'ai'))
      .rejects
      .toBeInstanceOf(StoreSubscriptionInactiveError);
    await expect(isStoreFeatureEnabled('org_expired', 'ai')).resolves.toBe(false);
  });

  it('blocks only the partially suspended feature', async () => {
    mockRows = [{
      metadata: {
        platform: {
          partialSuspensions: {
            ai: true,
          },
        },
        subscription: activeStarterSubscription(),
      },
    }];

    await expect(assertStoreFeatureEnabled('org_limited', 'ai'))
      .rejects
      .toBeInstanceOf(StoreFeatureDisabledError);
    await expect(isStoreFeatureEnabled('org_limited', 'webOrders')).resolves.toBe(true);
  });

  it('allows feature access through a paid admin override', async () => {
    mockRows = [{
      metadata: {
        subscription: {
          adminOverride: {
            enabled: true,
            plan: PLAN_NAME.STARTER,
          },
          status: 'inactive',
        },
      },
    }];

    await expect(assertStoreFeatureEnabled('org_override', 'webOrders')).resolves.toBeUndefined();
    await expect(isStoreFeatureEnabled('org_override', 'ai')).resolves.toBe(true);
  });

  it('uses the legacy plan field consistently with active Stripe subscription data', async () => {
    const subscription = activeStarterSubscription();
    const { plan: _plan, ...subscriptionWithoutPlan } = subscription;
    mockRows = [{
      metadata: {
        subscription: subscriptionWithoutPlan,
        subscriptionPlan: PLAN_NAME.STARTER,
      },
    }];

    await expect(assertStoreFeatureEnabled('org_legacy', 'webOrders')).resolves.toBeUndefined();
    await expect(isStoreFeatureEnabled('org_legacy', 'ai')).resolves.toBe(true);
  });

  it('returns false from isStoreFeatureEnabled for the specific partially-suspended feature', async () => {
    mockRows = [{
      metadata: {
        platform: {
          partialSuspensions: {
            ai: true,
          },
        },
        subscription: activeStarterSubscription(),
      },
    }];

    await expect(isStoreFeatureEnabled('org_partial', 'ai')).resolves.toBe(false);
    await expect(isStoreFeatureEnabled('org_partial', 'webOrders')).resolves.toBe(true);
  });

  it('blocks access when the subscription status is not inactive but no paid subscription is configured', async () => {
    mockRows = [{
      metadata: {
        subscription: {
          status: 'active',
        },
      },
    }];

    await expect(assertStoreFeatureEnabled('org_nopaid', 'ai'))
      .rejects
      .toMatchObject({
        name: 'StoreSubscriptionInactiveError',
        reason: 'subscription_inactive',
      });
    await expect(isStoreFeatureEnabled('org_nopaid', 'ai')).resolves.toBe(false);
  });
});
