import type Stripe from 'stripe';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const state = {
    settingsRows: [] as unknown[],
  };
  const selectFor = vi.fn(async () => state.settingsRows);
  const selectLimit = vi.fn(() => ({ for: selectFor }));
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const updateWhere = vi.fn().mockResolvedValue(undefined);
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const insertValues = vi.fn().mockResolvedValue(undefined);
  const tx = {
    insert: vi.fn(() => ({ values: insertValues })),
    select: vi.fn(() => ({ from: selectFrom })),
    update: vi.fn(() => ({ set: updateSet })),
  };

  return {
    getStripeAddOnKeyByPriceId: vi.fn(),
    getStripePlanByPriceId: vi.fn(),
    insertValues,
    revalidatePath: vi.fn(),
    retrieveSubscription: vi.fn(),
    state,
    transaction: vi.fn(async (callback: (value: typeof tx) => Promise<unknown>) => callback(tx)),
    tx,
    updateSet,
  };
});

vi.mock('next/cache', () => ({
  revalidatePath: mocks.revalidatePath,
}));

vi.mock('@/libs/DB', () => ({
  db: {
    transaction: mocks.transaction,
  },
}));

vi.mock('@/libs/Stripe', () => ({
  getStripe: vi.fn(() => ({
    subscriptions: {
      retrieve: mocks.retrieveSubscription,
    },
  })),
}));

vi.mock('@/models/Schema', () => ({
  platformAdminAuditLogsTable: { name: 'platformAdminAuditLogsTable' },
  storeSettingsTable: {
    metadata: 'metadata',
    organizationId: 'organizationId',
  },
}));

vi.mock('@/utils/StripeBillingPlans', () => ({
  ADD_ON_ENTITLEMENTS: {
    extra_ai_orders: { aiOrders: 100 },
    extra_catalog_items: { products: 50 },
    extra_image_storage: { storageMb: 25 },
    extra_team_member: { teamMembers: 1 },
  },
  getStripeAddOnKeyByPriceId: mocks.getStripeAddOnKeyByPriceId,
  getStripePlanByPriceId: mocks.getStripePlanByPriceId,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
}));

const subscription = (overrides: Partial<Stripe.Subscription> = {}) => ({
  customer: 'cus_1',
  id: 'sub_1',
  items: {
    data: [{
      current_period_end: 1_800_000_000,
      id: 'si_1',
      price: { id: 'price_starter' },
    }],
  },
  metadata: {
    organization_id: 'org_1',
  },
  status: 'active',
  ...overrides,
}) as unknown as Stripe.Subscription;

const subscriptionEvent = (
  object: Stripe.Subscription,
  overrides: Partial<Stripe.Event> = {},
) => ({
  created: 100,
  data: { object },
  id: 'evt_1',
  type: 'customer.subscription.updated',
  ...overrides,
}) as Stripe.Event;

describe('StripeBillingSync event ordering', () => {
  it('accepts the first event for a subscription', async () => {
    const { isStripeEventNewerThanWatermark } = await import('./StripeBillingSync');

    expect(isStripeEventNewerThanWatermark({
      created: 100,
      id: 'evt_first',
    })).toBe(true);
  });

  it('rejects the same event when Stripe retries it', async () => {
    const { isStripeEventNewerThanWatermark } = await import('./StripeBillingSync');

    expect(isStripeEventNewerThanWatermark({
      created: 100,
      id: 'evt_same',
    }, {
      created: 100,
      eventId: 'evt_same',
    })).toBe(false);
  });

  it('rejects an event older than the subscription watermark', async () => {
    const { isStripeEventNewerThanWatermark } = await import('./StripeBillingSync');

    expect(isStripeEventNewerThanWatermark({
      created: 99,
      id: 'evt_old',
    }, {
      created: 100,
      eventId: 'evt_new',
    })).toBe(false);
  });

  it('accepts a distinct event created in the same Stripe timestamp second', async () => {
    const { isStripeEventNewerThanWatermark } = await import('./StripeBillingSync');

    expect(isStripeEventNewerThanWatermark({
      created: 100,
      id: 'evt_second',
    }, {
      created: 100,
      eventId: 'evt_first',
    })).toBe(true);
  });
});

describe('syncBillingFromStripe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.state.settingsRows = [{ metadata: {} }];
    mocks.getStripePlanByPriceId.mockImplementation((priceId: string) =>
      priceId === 'price_starter' ? 'starter' : undefined);
    mocks.getStripeAddOnKeyByPriceId.mockImplementation((priceId: string) =>
      priceId === 'price_ai' ? 'extra_ai_orders' : undefined);
  });

  it('ignores unrelated events and checkout sessions without a subscription id', async () => {
    const { syncBillingFromStripe } = await import('./StripeBillingSync');

    await syncBillingFromStripe({
      created: 1,
      data: { object: {} },
      id: 'evt_unrelated',
      type: 'invoice.paid',
    } as Stripe.Event);
    await syncBillingFromStripe({
      created: 2,
      data: {
        object: {
          metadata: { organization_id: 'org_1' },
          subscription: null,
        },
      },
      id: 'evt_checkout',
      type: 'checkout.session.completed',
    } as unknown as Stripe.Event);

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('retrieves checkout subscriptions and prefers checkout organization metadata', async () => {
    const { syncBillingFromStripe } = await import('./StripeBillingSync');
    mocks.retrieveSubscription.mockResolvedValue(subscription({
      metadata: {},
    }));

    await syncBillingFromStripe({
      created: 100,
      data: {
        object: {
          metadata: {
            billing_kind: 'base_plan',
            organization_id: 'org_checkout',
          },
          subscription: 'sub_1',
        },
      },
      id: 'evt_checkout',
      type: 'checkout.session.completed',
    } as unknown as Stripe.Event);

    expect(mocks.retrieveSubscription).toHaveBeenCalledWith('sub_1', {
      expand: ['items.data.price'],
    });
    expect(mocks.updateSet).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        subscriptionPlan: 'starter',
      }),
    }));
  });

  it('ignores subscriptions without an organization or matching store settings', async () => {
    const { syncBillingFromStripe } = await import('./StripeBillingSync');

    await syncBillingFromStripe(subscriptionEvent(subscription({
      metadata: {},
    })));

    expect(mocks.transaction).not.toHaveBeenCalled();

    mocks.state.settingsRows = [];
    await syncBillingFromStripe(subscriptionEvent(subscription()));

    expect(mocks.updateSet).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('persists an active base plan, audit record, watermark, and cache invalidation', async () => {
    const { syncBillingFromStripe } = await import('./StripeBillingSync');

    await syncBillingFromStripe(subscriptionEvent(subscription()));

    expect(mocks.updateSet).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        billing: { provider: 'stripe' },
        subscription: expect.objectContaining({
          addOns: {
            aiOrders: 0,
            products: 0,
            storageMb: 0,
            teamMembers: 0,
          },
          plan: 'starter',
          provider: 'stripe',
          status: 'active',
          stripeBaseSubscriptionId: 'sub_1',
          stripeCustomerId: 'cus_1',
          stripeEventWatermarks: {
            sub_1: {
              created: 100,
              eventId: 'evt_1',
            },
          },
          stripeSubscriptionId: 'sub_1',
        }),
        subscriptionPlan: 'starter',
      }),
    });
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      action: 'stripe_billing_synced',
      actorUserId: 'stripe_webhook',
      organizationId: 'org_1',
    }));
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(3);
  });

  it('does not apply or revalidate duplicate and older events', async () => {
    const { syncBillingFromStripe } = await import('./StripeBillingSync');
    mocks.state.settingsRows = [{
      metadata: {
        subscription: {
          stripeEventWatermarks: {
            sub_1: {
              created: 100,
              eventId: 'evt_1',
            },
          },
        },
      },
    }];

    await syncBillingFromStripe(subscriptionEvent(subscription()));

    expect(mocks.updateSet).not.toHaveBeenCalled();
    expect(mocks.insertValues).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('adds active add-on entitlements without replacing the base plan', async () => {
    const { syncBillingFromStripe } = await import('./StripeBillingSync');
    mocks.state.settingsRows = [{
      metadata: {
        subscription: {
          plan: 'growth',
          renewsAt: '2027-01-01T00:00:00.000Z',
          status: 'active',
          stripeBaseSubscriptionId: 'sub_base',
        },
        subscriptionPlan: 'growth',
      },
    }];
    const addOn = subscription({
      id: 'sub_addon',
      items: {
        data: [{
          current_period_end: 1_900_000_000,
          id: 'si_ai',
          price: { id: 'price_ai' },
        }],
      } as Stripe.ApiList<Stripe.SubscriptionItem>,
      metadata: {
        billing_kind: 'add_on',
        organization_id: 'org_1',
      },
    });

    await syncBillingFromStripe(subscriptionEvent(addOn, {
      id: 'evt_addon',
    }));

    expect(mocks.updateSet).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        subscription: expect.objectContaining({
          addOns: {
            aiOrders: 100,
            products: 0,
            storageMb: 0,
            teamMembers: 0,
          },
          plan: 'growth',
          status: 'active',
          stripeBaseSubscriptionId: 'sub_base',
          stripeSubscriptionId: 'sub_base',
        }),
        subscriptionPlan: 'growth',
      }),
    });
  });

  it('removes inactive base access and tolerates object-shaped customers', async () => {
    const { syncBillingFromStripe } = await import('./StripeBillingSync');
    const canceled = subscription({
      customer: { id: 'cus_object' } as Stripe.Customer,
      items: {
        data: [{
          current_period_end: 0,
          id: 'si_unknown',
          price: { id: 'price_unknown' },
        }],
      } as Stripe.ApiList<Stripe.SubscriptionItem>,
      status: 'canceled',
    });

    await syncBillingFromStripe(subscriptionEvent(canceled));

    expect(mocks.updateSet).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        subscription: expect.objectContaining({
          plan: 'free',
          renewsAt: null,
          status: 'free',
          stripeBaseSubscriptionId: undefined,
          stripeCustomerId: 'cus_object',
          stripeSubscriptionId: undefined,
        }),
        subscriptionPlan: 'free',
      }),
    });
  });
});
