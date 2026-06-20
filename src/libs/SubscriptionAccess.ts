import { AllPlans, PaidPlans, PLAN_NAME } from '@/utils/PricingPlans';
import { normalizeBillingPlanKey } from '@/utils/StripeBillingPlans';
import { Env } from './Env';

export type SubscriptionAccessMetadata = {
  subscription?: {
    adminOverride?: {
      enabled?: boolean;
      plan?: string;
    };
    plan?: string;
    renewsAt?: string | null;
    status?: string;
    stripeItems?: Record<string, {
      plan?: string;
      status?: string;
    }>;
    stripeSubscriptionId?: string;
  };
  subscriptionPlan?: string;
};

const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);
const paidPlanNames = new Set(PaidPlans.map(plan => plan.name));

export const isSubscriptionDemoMode = () => {
  return Env.DEMO_MODE && Env.NODE_ENV !== 'production';
};

const normalizeSubscriptionPlanName = (planName?: null | string) => {
  const normalized = normalizeBillingPlanKey(planName);

  if (normalized === 'basic' || normalized === 'default') {
    return PLAN_NAME.STARTER;
  }

  return normalized || PLAN_NAME.FREE;
};

const getConfiguredSubscriptionPlanName = (
  metadata: SubscriptionAccessMetadata | null | undefined,
) => {
  if (isSubscriptionDemoMode()) {
    return PLAN_NAME.PRO;
  }

  const overridePlan = metadata?.subscription?.adminOverride?.enabled
    ? metadata.subscription.adminOverride.plan
    : undefined;

  return normalizeSubscriptionPlanName(
    overridePlan
    ?? metadata?.subscription?.plan
    ?? metadata?.subscriptionPlan,
  );
};

const hasNotExpired = (renewsAt: null | string | undefined) => {
  return !renewsAt || new Date(renewsAt).getTime() > Date.now();
};

export const hasActiveStripePaidSubscription = (
  metadata: SubscriptionAccessMetadata | null | undefined,
  planName = getConfiguredSubscriptionPlanName(metadata),
) => {
  const subscription = metadata?.subscription;

  if (!subscription || !paidPlanNames.has(planName as typeof PaidPlans[number]['name'])) {
    return false;
  }

  const hasActiveStripeBaseItem = Object.values(subscription.stripeItems ?? {}).some((item) => {
    return item.status === 'active'
      && paidPlanNames.has(
        normalizeSubscriptionPlanName(item.plan) as typeof PaidPlans[number]['name'],
      );
  });

  return ACTIVE_SUBSCRIPTION_STATUSES.has(subscription.status ?? '')
    && hasNotExpired(subscription.renewsAt)
    && Boolean(subscription.stripeSubscriptionId)
    && hasActiveStripeBaseItem;
};

const hasActiveAdminPaidOverride = (
  metadata: SubscriptionAccessMetadata | null | undefined,
) => {
  const override = metadata?.subscription?.adminOverride;

  return Boolean(
    override?.enabled
    && paidPlanNames.has(
      normalizeSubscriptionPlanName(override.plan) as typeof PaidPlans[number]['name'],
    ),
  );
};

export const hasActivePaidSubscription = (
  metadata: SubscriptionAccessMetadata | null | undefined,
) => {
  if (isSubscriptionDemoMode()) {
    return true;
  }

  return hasActiveStripePaidSubscription(metadata)
    || hasActiveAdminPaidOverride(metadata);
};

export const getConfiguredSubscriptionPlan = (
  metadata: SubscriptionAccessMetadata | null | undefined,
) => {
  const planName = getConfiguredSubscriptionPlanName(metadata);

  return AllPlans.find(plan => plan.name === planName) ?? AllPlans[0]!;
};
