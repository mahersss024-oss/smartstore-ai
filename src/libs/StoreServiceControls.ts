import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  getConfiguredSubscriptionPlan,
  hasActivePaidSubscription,
  isSubscriptionDemoMode,
} from '@/libs/SubscriptionAccess';
import { storeSettingsTable } from '@/models/Schema';

type StoreFeature = 'ai' | 'productPublishing' | 'webOrders' | 'whatsapp';
type StoreSubscriptionInactiveReason
  = | 'platform_inactive'
    | 'store_not_found'
    | 'subscription_inactive';

type StoreControlsMetadata = {
  platform?: {
    partialSuspensions?: Partial<Record<StoreFeature, boolean>>;
    status?: 'active' | 'limited' | 'paused' | 'suspended';
  };
  subscription?: {
    addOns?: {
      aiOrders?: number;
      products?: number;
      storageMb?: number;
      teamMembers?: number;
    };
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

export class StoreFeatureDisabledError extends Error {
  constructor(public readonly feature: StoreFeature) {
    super(`Store feature is disabled: ${feature}`);
    this.name = 'StoreFeatureDisabledError';
  }
}

export class StoreSubscriptionInactiveError extends Error {
  constructor(
    public readonly reason: StoreSubscriptionInactiveReason,
    public readonly subscriptionStatus?: string,
  ) {
    super(`Store subscription is inactive: ${reason}`);
    this.name = 'StoreSubscriptionInactiveError';
  }
}

const getStoreServiceControls = async (organizationId: string) => {
  const [settings] = await db
    .select({ metadata: storeSettingsTable.metadata })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);
  const metadata = (settings?.metadata ?? {}) as StoreControlsMetadata;
  const subscription = metadata.subscription;

  return {
    exists: Boolean(settings),
    metadata,
    partialSuspensions: metadata.platform?.partialSuspensions ?? {},
    status: metadata.platform?.status ?? 'active',
    subscription,
    subscriptionStatus: subscription?.status ?? 'inactive',
  };
};

const inactiveSubscriptionStatuses = new Set([
  'canceled',
  'ended',
  'expired',
  'incomplete',
  'incomplete_expired',
  'past_due',
  'paused',
  'suspended',
  'unpaid',
]);

const hasFeatureAccess = (
  feature: StoreFeature,
  metadata: StoreControlsMetadata,
) => {
  if (!hasActivePaidSubscription(metadata)) {
    return false;
  }

  const plan = getConfiguredSubscriptionPlan(metadata);

  if (feature === 'ai') {
    return plan.features.aiAgent;
  }

  if (feature === 'productPublishing') {
    return plan.limits.products > 0;
  }

  return plan.features[feature];
};

const getSubscriptionInactiveReason = (
  controls: Awaited<ReturnType<typeof getStoreServiceControls>>,
): {
  reason: StoreSubscriptionInactiveReason;
  subscriptionStatus?: string;
} | null => {
  if (!controls.exists) {
    return { reason: 'store_not_found' };
  }

  if (controls.status === 'suspended' || controls.status === 'paused') {
    return {
      reason: 'platform_inactive',
      subscriptionStatus: controls.status,
    };
  }

  if (isSubscriptionDemoMode()) {
    return null;
  }

  if (inactiveSubscriptionStatuses.has(controls.subscriptionStatus)) {
    return {
      reason: 'subscription_inactive',
      subscriptionStatus: controls.subscriptionStatus,
    };
  }

  if (
    !hasActivePaidSubscription(controls.metadata)
  ) {
    return {
      reason: 'subscription_inactive',
      subscriptionStatus: controls.subscriptionStatus,
    };
  }

  return null;
};

export const isStoreFeatureEnabled = async (
  organizationId: string,
  feature: StoreFeature,
) => {
  const controls = await getStoreServiceControls(organizationId);
  const inactive = getSubscriptionInactiveReason(controls);

  if (inactive) {
    return false;
  }

  if (!hasFeatureAccess(feature, controls.metadata)) {
    return false;
  }

  if (controls.partialSuspensions[feature]) {
    return false;
  }

  return true;
};

export const assertStoreFeatureEnabled = async (
  organizationId: string,
  feature: StoreFeature,
) => {
  const controls = await getStoreServiceControls(organizationId);
  const inactive = getSubscriptionInactiveReason(controls);

  if (inactive) {
    throw new StoreSubscriptionInactiveError(inactive.reason, inactive.subscriptionStatus);
  }

  if (
    !hasFeatureAccess(feature, controls.metadata)
    || controls.partialSuspensions[feature]
  ) {
    throw new StoreFeatureDisabledError(feature);
  }
};
