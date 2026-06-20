import { clerkClient } from '@clerk/nextjs/server';
import { and, count, countDistinct, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { db } from '@/libs/DB';
import {
  getConfiguredSubscriptionPlan,
  hasActivePaidSubscription,
  hasActiveStripePaidSubscription,
  isSubscriptionDemoMode,
} from '@/libs/SubscriptionAccess';
import { aiActionLogsTable, productsTable, storeSettingsTable } from '@/models/Schema';
import { AllPlans, PLAN_NAME } from '@/utils/PricingPlans';

type SubscriptionMetadata = {
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

export class SubscriptionLimitError extends Error {
  constructor(
    public readonly feature:
      | 'aiOrders'
      | 'channels'
      | 'products'
      | 'storageMb'
      | 'teamMembers',
    public readonly limit: number,
    public readonly used: number,
  ) {
    super(`Subscription limit reached: ${feature}`);
    this.name = 'SubscriptionLimitError';
  }
}

export class SubscriptionFeatureError extends Error {
  constructor(
    public readonly feature:
      | 'advancedReports'
      | 'aiAgent'
      | 'invoices'
      | 'onlinePayments'
      | 'webOrders'
      | 'whatsapp',
    public readonly requiredPlan: string,
  ) {
    super(`Subscription feature is not available: ${feature}`);
    this.name = 'SubscriptionFeatureError';
  }
}

const monthStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const toPositiveNumber = (value: unknown) => {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
};

const getTeamMembersUsed = async (organizationId: string) => {
  try {
    const client = await clerkClient();
    const memberships = await client.organizations.getOrganizationMembershipList({
      limit: 1,
      organizationId,
    });

    return Math.max(memberships.totalCount ?? memberships.data.length, 1);
  } catch {
    return 1;
  }
};

export const getSubscriptionEntitlements = async (organizationId: string) => {
  const [settings] = await db
    .select({ metadata: storeSettingsTable.metadata })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);
  const metadata = (settings?.metadata ?? {}) as SubscriptionMetadata;
  const configuredPlan = getConfiguredSubscriptionPlan(metadata);
  const isPaidSubscriptionActive = hasActivePaidSubscription(metadata);
  const hasPaidStripeSubscription = hasActiveStripePaidSubscription(metadata, configuredPlan.name);

  const plan = isPaidSubscriptionActive ? configuredPlan : AllPlans[0]!;
  const addOns = isPaidSubscriptionActive ? (metadata.subscription?.addOns ?? {}) : {};

  const [aiConversations] = await db
    .select({ total: countDistinct(aiActionLogsTable.conversationId) })
    .from(aiActionLogsTable)
    .where(
      and(
        eq(aiActionLogsTable.organizationId, organizationId),
        eq(aiActionLogsTable.actionType, 'reply'),
        eq(aiActionLogsTable.allowed, true),
        gte(aiActionLogsTable.createdAt, monthStart()),
        isNotNull(aiActionLogsTable.conversationId),
      ),
    );
  const [products] = await db
    .select({ total: count(productsTable.id) })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.organizationId, organizationId),
        eq(productsTable.isActive, true),
      ),
    );
  const [productImageStorage] = await db
    .select({
      total: sql<number>`coalesce(sum(${productsTable.imageSizeBytes}), 0)`,
    })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.organizationId, organizationId),
        isNotNull(productsTable.image),
      ),
    );
  const teamMembersUsed = await getTeamMembersUsed(organizationId);

  const limits = {
    aiOrders: plan.limits.aiOrders + toPositiveNumber(addOns.aiOrders),
    channels: plan.limits.channels,
    products: plan.limits.products + toPositiveNumber(addOns.products),
    storageMb: plan.limits.storage + toPositiveNumber(addOns.storageMb),
    teamMembers: plan.limits.teamMember + toPositiveNumber(addOns.teamMembers),
  };

  return {
    isPaidSubscriptionActive,
    isStripePaidSubscriptionActive: isSubscriptionDemoMode()
      ? false
      : hasPaidStripeSubscription,
    limits,
    plan,
    subscription: {
      renewsAt: metadata.subscription?.renewsAt ?? null,
      status: isSubscriptionDemoMode()
        ? 'demo'
        : (metadata.subscription?.status ?? 'inactive'),
    },
    usage: {
      aiOrders: aiConversations?.total ?? 0,
      products: products?.total ?? 0,
      storageMb: Number(productImageStorage?.total ?? 0) / 1024 / 1024,
      teamMembers: teamMembersUsed,
    },
  };
};

const assertWithinLimit = (
  feature: SubscriptionLimitError['feature'],
  limit: number,
  used: number,
  increment: number,
) => {
  if (used + increment > limit) {
    throw new SubscriptionLimitError(feature, limit, used);
  }
};

export const assertCanCreateAiOrder = async (organizationId: string) => {
  const entitlements = await getSubscriptionEntitlements(organizationId);

  if (!entitlements.isPaidSubscriptionActive || !entitlements.plan.features.aiAgent) {
    throw new SubscriptionFeatureError('aiAgent', PLAN_NAME.STARTER);
  }
};

export const assertCanCreateProducts = async (
  organizationId: string,
  productCount: number,
  imageStorageMb = 0,
) => {
  const entitlements = await getSubscriptionEntitlements(organizationId);

  if (!entitlements.isPaidSubscriptionActive) {
    throw new SubscriptionFeatureError('webOrders', PLAN_NAME.STARTER);
  }

  assertWithinLimit(
    'products',
    entitlements.limits.products,
    entitlements.usage.products,
    productCount,
  );
  assertWithinLimit(
    'storageMb',
    entitlements.limits.storageMb,
    entitlements.usage.storageMb,
    imageStorageMb,
  );
};

export const assertCanUseChannels = async (
  organizationId: string,
  channelCount: number,
) => {
  if (channelCount <= 0) {
    return;
  }

  const entitlements = await getSubscriptionEntitlements(organizationId);

  if (!entitlements.isPaidSubscriptionActive) {
    throw new SubscriptionFeatureError('whatsapp', PLAN_NAME.STARTER);
  }

  assertWithinLimit(
    'channels',
    entitlements.limits.channels,
    0,
    channelCount,
  );
};

export const isSubscriptionLimitError = (error: unknown): error is SubscriptionLimitError => {
  return error instanceof SubscriptionLimitError;
};

export const isSubscriptionFeatureError = (error: unknown): error is SubscriptionFeatureError => {
  return error instanceof SubscriptionFeatureError;
};
