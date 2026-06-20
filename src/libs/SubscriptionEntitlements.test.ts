import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AllPlans } from '@/utils/PricingPlans';

const mocks = vi.hoisted(() => {
  const queryRows: unknown[][] = [];
  const select = vi.fn(() => {
    const rows = queryRows.shift() ?? [];
    const limit = vi.fn(async () => rows);
    const where = vi.fn(() => ({
      limit,
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(rows).then(resolve, reject),
    }));

    return {
      from: vi.fn(() => ({ where })),
    };
  });

  return {
    clerkClient: vi.fn(),
    getConfiguredSubscriptionPlan: vi.fn(),
    hasActivePaidSubscription: vi.fn(),
    hasActiveStripePaidSubscription: vi.fn(),
    isSubscriptionDemoMode: vi.fn(),
    queryRows,
    select,
  };
});

vi.mock('@clerk/nextjs/server', () => ({
  clerkClient: mocks.clerkClient,
}));

vi.mock('@/libs/DB', () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock('@/libs/SubscriptionAccess', () => ({
  getConfiguredSubscriptionPlan: mocks.getConfiguredSubscriptionPlan,
  hasActivePaidSubscription: mocks.hasActivePaidSubscription,
  hasActiveStripePaidSubscription: mocks.hasActiveStripePaidSubscription,
  isSubscriptionDemoMode: mocks.isSubscriptionDemoMode,
}));

vi.mock('@/models/Schema', () => ({
  aiActionLogsTable: {
    actionType: 'actionType',
    allowed: 'allowed',
    conversationId: 'conversationId',
    createdAt: 'createdAt',
    organizationId: 'organizationId',
  },
  productsTable: {
    id: 'id',
    image: 'image',
    imageSizeBytes: 'imageSizeBytes',
    isActive: 'isActive',
    organizationId: 'organizationId',
  },
  storeSettingsTable: {
    metadata: 'metadata',
    organizationId: 'organizationId',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  count: vi.fn(() => 'count'),
  countDistinct: vi.fn(() => 'countDistinct'),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  gte: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  isNotNull: vi.fn((field: unknown) => ({ field })),
  sql: vi.fn(() => 'sql'),
}));

describe('SubscriptionEntitlements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryRows.length = 0;
    mocks.getConfiguredSubscriptionPlan.mockReturnValue(AllPlans[1]);
    mocks.hasActivePaidSubscription.mockReturnValue(true);
    mocks.hasActiveStripePaidSubscription.mockReturnValue(true);
    mocks.isSubscriptionDemoMode.mockReturnValue(false);
    mocks.clerkClient.mockResolvedValue({
      organizations: {
        getOrganizationMembershipList: vi.fn().mockResolvedValue({
          data: [{ id: 'membership_1' }],
          totalCount: 3,
        }),
      },
    });
  });

  it('returns paid limits, add-ons, usage, and Stripe state', async () => {
    mocks.queryRows.push(
      [{
        metadata: {
          subscription: {
            addOns: {
              aiOrders: 25,
              products: 10,
              storageMb: 5,
              teamMembers: 2,
            },
            renewsAt: '2026-07-01T00:00:00.000Z',
            status: 'active',
          },
        },
      }],
      [{ total: 12 }],
      [{ total: 8 }],
      [{ total: 10 * 1024 * 1024 }],
    );
    const { getSubscriptionEntitlements } = await import('./SubscriptionEntitlements');

    await expect(getSubscriptionEntitlements('org_1')).resolves.toMatchObject({
      isPaidSubscriptionActive: true,
      isStripePaidSubscriptionActive: true,
      limits: {
        aiOrders: 325,
        channels: 2,
        products: 110,
        storageMb: 55,
        teamMembers: 3,
      },
      plan: { name: 'starter' },
      subscription: {
        renewsAt: '2026-07-01T00:00:00.000Z',
        status: 'active',
      },
      usage: {
        aiOrders: 12,
        products: 8,
        storageMb: 10,
        teamMembers: 3,
      },
    });
  });

  it('falls back to the free plan and one team member when access is inactive', async () => {
    mocks.hasActivePaidSubscription.mockReturnValue(false);
    mocks.hasActiveStripePaidSubscription.mockReturnValue(false);
    mocks.clerkClient.mockRejectedValue(new Error('Clerk unavailable'));
    mocks.queryRows.push([], [], [], []);
    const { getSubscriptionEntitlements } = await import('./SubscriptionEntitlements');

    await expect(getSubscriptionEntitlements('org_free')).resolves.toMatchObject({
      isPaidSubscriptionActive: false,
      isStripePaidSubscriptionActive: false,
      limits: {
        aiOrders: 0,
        channels: 0,
        products: 0,
        storageMb: 0,
        teamMembers: 1,
      },
      plan: { name: 'free' },
      subscription: {
        renewsAt: null,
        status: 'inactive',
      },
      usage: {
        aiOrders: 0,
        products: 0,
        storageMb: 0,
        teamMembers: 1,
      },
    });
  });

  it('ignores invalid add-on quantities and reports demo status safely', async () => {
    mocks.isSubscriptionDemoMode.mockReturnValue(true);
    mocks.queryRows.push(
      [{
        metadata: {
          subscription: {
            addOns: {
              aiOrders: -1,
              products: Number.NaN,
              storageMb: '5',
              teamMembers: 0,
            },
            status: 'active',
          },
        },
      }],
      [{ total: null }],
      [{ total: null }],
      [{ total: null }],
    );
    const { getSubscriptionEntitlements } = await import('./SubscriptionEntitlements');

    await expect(getSubscriptionEntitlements('org_demo')).resolves.toMatchObject({
      isStripePaidSubscriptionActive: false,
      limits: {
        aiOrders: 300,
        products: 100,
        storageMb: 50,
        teamMembers: 1,
      },
      subscription: {
        status: 'demo',
      },
    });
  });

  it('enforces AI, product, storage, and channel access', async () => {
    const entitlementsModule = await import('./SubscriptionEntitlements');

    mocks.hasActivePaidSubscription.mockReturnValue(false);
    mocks.queryRows.push([], [], [], []);

    await expect(entitlementsModule.assertCanCreateAiOrder('org_1')).rejects.toMatchObject({
      feature: 'aiAgent',
      name: 'SubscriptionFeatureError',
    });

    mocks.hasActivePaidSubscription.mockReturnValue(true);
    mocks.getConfiguredSubscriptionPlan.mockReturnValue({
      ...AllPlans[1],
      features: {
        ...AllPlans[1]!.features,
        aiAgent: false,
      },
    });
    mocks.queryRows.push([], [], [], []);

    await expect(entitlementsModule.assertCanCreateAiOrder('org_1')).rejects.toMatchObject({
      feature: 'aiAgent',
    });

    mocks.getConfiguredSubscriptionPlan.mockReturnValue(AllPlans[1]);
    mocks.queryRows.push([], [{ total: 0 }], [{ total: 99 }], [{ total: 49 * 1024 * 1024 }]);

    await expect(entitlementsModule.assertCanCreateProducts('org_1', 2, 0)).rejects.toMatchObject({
      feature: 'products',
      limit: 100,
      used: 99,
    });

    mocks.queryRows.push([], [{ total: 0 }], [{ total: 99 }], [{ total: 49 * 1024 * 1024 }]);

    await expect(entitlementsModule.assertCanCreateProducts('org_1', 1, 2)).rejects.toMatchObject({
      feature: 'storageMb',
      limit: 50,
      used: 49,
    });

    mocks.queryRows.push([], [{ total: 0 }], [{ total: 0 }], [{ total: 0 }]);

    await expect(entitlementsModule.assertCanUseChannels('org_1', 3)).rejects.toMatchObject({
      feature: 'channels',
      limit: 2,
      used: 0,
    });

    await expect(entitlementsModule.assertCanUseChannels('org_1', 0)).resolves.toBeUndefined();
  });

  it('identifies only its own typed errors', async () => {
    const {
      isSubscriptionFeatureError,
      isSubscriptionLimitError,
      SubscriptionFeatureError,
      SubscriptionLimitError,
    } = await import('./SubscriptionEntitlements');
    const featureError = new SubscriptionFeatureError('whatsapp', 'starter');
    const limitError = new SubscriptionLimitError('products', 10, 10);

    expect(featureError.message).toContain('whatsapp');
    expect(limitError.message).toContain('products');
    expect(isSubscriptionFeatureError(featureError)).toBe(true);
    expect(isSubscriptionFeatureError(limitError)).toBe(false);
    expect(isSubscriptionLimitError(limitError)).toBe(true);
    expect(isSubscriptionLimitError(new Error('other'))).toBe(false);
  });
});
