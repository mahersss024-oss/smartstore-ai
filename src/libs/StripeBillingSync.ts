import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { db } from '@/libs/DB';
import { getStripe } from '@/libs/Stripe';
import { platformAdminAuditLogsTable, storeSettingsTable } from '@/models/Schema';
import { PLAN_NAME } from '@/utils/PricingPlans';
import {
  ADD_ON_ENTITLEMENTS,
  getStripeAddOnKeyByPriceId,
  getStripePlanByPriceId,
} from '@/utils/StripeBillingPlans';

type AddOns = {
  aiOrders: number;
  products: number;
  storageMb: number;
  teamMembers: number;
};

type StoreMetadata = {
  billing?: Record<string, unknown>;
  subscription?: {
    addOns?: Partial<AddOns>;
    plan?: string;
    renewsAt?: string | null;
    status?: string;
    stripeCustomerId?: string;
    stripeEventWatermarks?: Record<string, {
      created: number;
      eventId: string;
    }>;
    stripeAddOnSubscriptions?: Record<string, {
      addOns?: Partial<AddOns>;
      renewsAt?: string | null;
      status?: string;
    }>;
    stripeBaseSubscriptionId?: string;
    stripeItems?: Record<string, {
      addOnKey?: string;
      plan?: string;
      priceId?: string;
      status?: string;
      subscriptionId?: string;
      subscriptionItemId?: string;
    }>;
    stripeSubscriptionId?: string;
  } & Record<string, unknown>;
  subscriptionPlan?: string;
};

const activeStripeStatuses = new Set(['active', 'trialing']);

export const isStripeEventNewerThanWatermark = (
  event: Pick<Stripe.Event, 'created' | 'id'>,
  watermark?: {
    created: number;
    eventId: string;
  },
) => {
  if (!watermark) {
    return true;
  }

  if (event.id === watermark.eventId) {
    return false;
  }

  return event.created >= watermark.created;
};

const zeroAddOns = (): AddOns => ({
  aiOrders: 0,
  products: 0,
  storageMb: 0,
  teamMembers: 0,
});

const addEntitlement = (addOns: AddOns, addOnKey: string) => {
  const entitlement = ADD_ON_ENTITLEMENTS[addOnKey as keyof typeof ADD_ON_ENTITLEMENTS];

  if (!entitlement) {
    return;
  }

  addOns.aiOrders += entitlement.aiOrders ?? 0;
  addOns.products += entitlement.products ?? 0;
  addOns.storageMb += entitlement.storageMb ?? 0;
  addOns.teamMembers += entitlement.teamMembers ?? 0;
};

const sumActiveAddOnSubscriptions = (
  subscriptions: NonNullable<StoreMetadata['subscription']>['stripeAddOnSubscriptions'] = {},
) => {
  const addOns = zeroAddOns();

  for (const subscription of Object.values(subscriptions)) {
    if (!activeStripeStatuses.has(subscription.status ?? '')) {
      continue;
    }

    addOns.aiOrders += subscription.addOns?.aiOrders ?? 0;
    addOns.products += subscription.addOns?.products ?? 0;
    addOns.storageMb += subscription.addOns?.storageMb ?? 0;
    addOns.teamMembers += subscription.addOns?.teamMembers ?? 0;
  }

  return addOns;
};

const getPeriodEnd = (subscription: Stripe.Subscription) => {
  const periodEnd = subscription.items.data
    .map(item => item.current_period_end)
    .filter(Boolean)
    .sort((a, b) => b - a)[0];

  return periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
};

const extractOrganizationId = (
  subscription: Stripe.Subscription,
  checkoutSession?: Stripe.Checkout.Session,
) => {
  return checkoutSession?.metadata?.organization_id
    ?? subscription.metadata.organization_id
    ?? null;
};

const getSubscription = async (
  event: Stripe.Event,
) => {
  const stripe = getStripe();

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;

    if (typeof session.subscription !== 'string') {
      return { checkoutSession: session, subscription: null };
    }

    const subscription = await stripe.subscriptions.retrieve(session.subscription, {
      expand: ['items.data.price'],
    });

    return { checkoutSession: session, subscription };
  }

  if (event.type.startsWith('customer.subscription.')) {
    return {
      checkoutSession: undefined,
      subscription: event.data.object as Stripe.Subscription,
    };
  }

  return { checkoutSession: undefined, subscription: null };
};

export const syncBillingFromStripe = async (event: Stripe.Event) => {
  const { checkoutSession, subscription } = await getSubscription(event);

  if (!subscription) {
    return;
  }

  const organizationId = extractOrganizationId(subscription, checkoutSession);

  if (!organizationId) {
    return;
  }

  const eventKind = checkoutSession?.metadata?.billing_kind
    ?? subscription.metadata.billing_kind
    ?? 'base_plan';
  const subscriptionAddOns = zeroAddOns();
  const stripeItems: NonNullable<StoreMetadata['subscription']>['stripeItems'] = {};
  let plan: string = PLAN_NAME.FREE;
  const status = subscription.status;
  const isActive = activeStripeStatuses.has(status);

  for (const item of subscription.items.data) {
    const priceId = item.price.id;
    const planFromPrice = getStripePlanByPriceId(priceId);
    const addOnKey = getStripeAddOnKeyByPriceId(priceId);

    if (planFromPrice) {
      plan = planFromPrice;
    }

    if (addOnKey && isActive) {
      addEntitlement(subscriptionAddOns, addOnKey);
    }

    stripeItems[item.id] = {
      addOnKey,
      plan: planFromPrice,
      priceId,
      status,
      subscriptionId: subscription.id,
      subscriptionItemId: item.id,
    };
  }

  const synced = await db.transaction(async (tx) => {
    const [settings] = await tx
      .select({ metadata: storeSettingsTable.metadata })
      .from(storeSettingsTable)
      .where(eq(storeSettingsTable.organizationId, organizationId))
      .limit(1)
      .for('update');

    if (!settings) {
      return false;
    }

    const metadata = (settings.metadata ?? {}) as StoreMetadata;
    const currentSubscription = metadata.subscription ?? {};
    const currentWatermark = currentSubscription.stripeEventWatermarks?.[subscription.id];

    if (!isStripeEventNewerThanWatermark(event, currentWatermark)) {
      return false;
    }

    const isAddOnSubscription = eventKind === 'add_on';
    const stripeAddOnSubscriptions = {
      ...(currentSubscription.stripeAddOnSubscriptions ?? {}),
    };

    if (isAddOnSubscription) {
      stripeAddOnSubscriptions[subscription.id] = {
        addOns: subscriptionAddOns,
        renewsAt: getPeriodEnd(subscription),
        status,
      };
    }

    const nextPlan = isAddOnSubscription
      ? currentSubscription.plan ?? PLAN_NAME.FREE
      : (isActive ? plan : PLAN_NAME.FREE);
    const nextBaseSubscriptionId = isAddOnSubscription
      ? currentSubscription.stripeBaseSubscriptionId
      : (isActive ? subscription.id : undefined);
    const nextStatus = isAddOnSubscription
      ? currentSubscription.status ?? 'free'
      : (isActive ? status : 'free');
    const nextRenewsAt = isAddOnSubscription
      ? currentSubscription.renewsAt ?? null
      : getPeriodEnd(subscription);
    const nextAddOns = sumActiveAddOnSubscriptions(stripeAddOnSubscriptions);

    await tx
      .update(storeSettingsTable)
      .set({
        metadata: {
          ...metadata,
          billing: {
            ...(metadata.billing ?? {}),
            provider: 'stripe',
          },
          subscription: {
            ...currentSubscription,
            addOns: nextAddOns,
            plan: nextPlan,
            provider: 'stripe',
            renewsAt: nextRenewsAt,
            status: nextStatus,
            stripeAddOnSubscriptions,
            stripeBaseSubscriptionId: nextBaseSubscriptionId,
            stripeCustomerId: typeof subscription.customer === 'string'
              ? subscription.customer
              : subscription.customer.id,
            stripeEventWatermarks: {
              ...(currentSubscription.stripeEventWatermarks ?? {}),
              [subscription.id]: {
                created: event.created,
                eventId: event.id,
              },
            },
            stripeItems: {
              ...(currentSubscription.stripeItems ?? {}),
              ...stripeItems,
            },
            stripeSubscriptionId: nextBaseSubscriptionId,
            updatedAt: new Date().toISOString(),
          },
          subscriptionPlan: nextPlan,
        },
      })
      .where(eq(storeSettingsTable.organizationId, organizationId));

    await tx.insert(platformAdminAuditLogsTable).values({
      action: 'stripe_billing_synced',
      actorUserId: 'stripe_webhook',
      metadata: {
        eventCreated: event.created,
        eventId: event.id,
        eventType: event.type,
        plan: nextPlan,
        status,
        stripeSubscriptionId: subscription.id,
      },
      organizationId,
      summary: `Stripe billing synced: ${event.type}`,
    });

    return true;
  });

  if (!synced) {
    return;
  }

  revalidatePath('/dashboard/subscription');
  revalidatePath('/admin');
  revalidatePath(`/admin/stores/${organizationId}`);
};
