'use server';

import { clerkClient } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import * as z from 'zod';
import { db } from '@/libs/DB';
import { PLATFORM_PERMISSIONS, requirePlatformAdmin, requirePlatformPermission } from '@/libs/PlatformAdmin';
import {
  encryptSecret,
  maskApiKey,
  normalizePlatformAIProviderConfig,
  normalizeProviderModel,
  PLATFORM_AI_PROVIDER_SETTING_KEY,
} from '@/libs/PlatformAIProviderConfig';
import {
  normalizePlatformRuntimeConfig,
  PLATFORM_RUNTIME_CONFIG_SETTING_KEY,
} from '@/libs/PlatformRuntimeConfig';
import { getStripe } from '@/libs/Stripe';
import {
  aiActionLogsTable,
  channelConnectionsTable,
  conversationMessagesTable,
  conversationsTable,
  customerReviewsTable,
  customersTable,
  deliveryMethodsTable,
  invoicesTable,
  orderEventsTable,
  ordersTable,
  paymentMethodsTable,
  platformAdminAuditLogsTable,
  platformSettingsTable,
  productsTable,
  storeSettingsTable,
} from '@/models/Schema';
import { getI18nPath } from '@/utils/Helpers';
import { AllPlans, PLAN_NAME } from '@/utils/PricingPlans';

const storeStatusSchema = z.enum(['active', 'limited', 'paused', 'suspended']);
const storePlanSchema = z.enum([
  PLAN_NAME.FREE,
  PLAN_NAME.STARTER,
  PLAN_NAME.GROWTH,
  PLAN_NAME.PRO,
]);
const aiProviderSchema = z.enum(['openai', 'deepseek', 'openai_compatible']);

type StoreMetadata = {
  platform?: Record<string, unknown>;
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
      updatedAt?: string;
      updatedBy?: string;
    };
    plan?: string;
    status?: string;
    stripeSubscriptionId?: string;
  } & Record<string, unknown>;
};

const can = (
  permissions: string[],
  permission: string,
) => permissions.includes(permission);

const getAddOnNumber = (formData: FormData, key: string) => {
  const value = Number(String(formData.get(key) ?? '').trim());

  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
};

const readFormString = (formData: FormData, key: string) =>
  String(formData.get(key) ?? '').trim();

const getRuntimeSecretUpdate = (params: {
  clear: boolean;
  currentEncrypted?: string;
  currentPreview?: string;
  nextValue: string;
}) => {
  if (params.nextValue) {
    return {
      encrypted: encryptSecret(params.nextValue),
      preview: maskApiKey(params.nextValue),
      updated: true,
    };
  }

  if (params.clear) {
    return {
      encrypted: undefined,
      preview: undefined,
      updated: true,
    };
  }

  return {
    encrypted: params.currentEncrypted,
    preview: params.currentPreview,
    updated: false,
  };
};

const logPlatformAdminAction = async (input: {
  action: string;
  actorUserId: string;
  metadata?: Record<string, unknown>;
  organizationId: string;
  summary: string;
}) => {
  await db.insert(platformAdminAuditLogsTable).values({
    action: input.action,
    actorUserId: input.actorUserId,
    metadata: input.metadata,
    organizationId: input.organizationId,
    summary: input.summary,
  });
};

export const updatePlatformAIProviderConfig = async (
  locale: string,
  formData: FormData,
) => {
  const admin = await requirePlatformPermission(PLATFORM_PERMISSIONS.MANAGE_SERVICE);
  const provider = aiProviderSchema.parse(String(formData.get('provider') ?? 'openai'));
  const model = normalizeProviderModel(provider, formData.get('model'));
  const baseUrl = String(formData.get('baseUrl') ?? '').trim();
  const systemPrompt = String(formData.get('systemPrompt') ?? '').trim();
  const apiKey = String(formData.get('apiKey') ?? '').trim();
  const enabled = formData.get('enabled') === 'on';
  const clearApiKey = formData.get('clearApiKey') === 'on';
  const existingConfig = normalizePlatformAIProviderConfig(
    (await db
      .select({ value: platformSettingsTable.value })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, PLATFORM_AI_PROVIDER_SETTING_KEY))
      .limit(1))[0]?.value,
  );
  const providerChanged = existingConfig.provider !== provider;
  const updatedAt = new Date().toISOString();
  const encryptedApiKey = apiKey
    ? encryptSecret(apiKey)
    : clearApiKey || providerChanged ? undefined : existingConfig.encryptedApiKey;
  const apiKeyPreview = apiKey
    ? maskApiKey(apiKey)
    : clearApiKey || providerChanged ? undefined : existingConfig.apiKeyPreview;
  const normalizedBaseUrl = provider === 'openai_compatible'
    ? baseUrl || (
      existingConfig.provider === 'openai_compatible'
        ? existingConfig.baseUrl
        : undefined
    )
    : provider === 'deepseek'
      ? baseUrl || undefined
      : undefined;
  const value = {
    ...existingConfig,
    apiKeyPreview,
    enabled: enabled && Boolean(encryptedApiKey),
    encryptedApiKey,
    baseUrl: normalizedBaseUrl,
    model,
    provider,
    systemPrompt: systemPrompt || existingConfig.systemPrompt,
    updatedAt,
    updatedBy: admin.userId,
  };

  await db
    .insert(platformSettingsTable)
    .values({
      key: PLATFORM_AI_PROVIDER_SETTING_KEY,
      value,
    })
    .onConflictDoUpdate({
      set: {
        value,
      },
      target: platformSettingsTable.key,
    });

  await logPlatformAdminAction({
    action: 'platform_ai_provider_updated',
    actorUserId: admin.platformAccess.userId,
    metadata: {
      apiKeyUpdated: Boolean(apiKey),
      apiKeyCleared: clearApiKey,
      enabled: value.enabled,
      baseUrlUpdated: Boolean(baseUrl),
      model,
      provider,
      systemPromptUpdated: Boolean(systemPrompt),
    },
    organizationId: 'platform',
    summary: 'Platform AI provider configuration was updated',
  });

  revalidatePath(getI18nPath('/admin', locale));
  redirect(getI18nPath('/admin', locale));
};

export const updatePlatformRuntimeConfig = async (
  locale: string,
  formData: FormData,
) => {
  const admin = await requirePlatformPermission(PLATFORM_PERMISSIONS.MANAGE_SERVICE);
  const existingConfig = normalizePlatformRuntimeConfig(
    (await db
      .select({ value: platformSettingsTable.value })
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, PLATFORM_RUNTIME_CONFIG_SETTING_KEY))
      .limit(1))[0]?.value,
  );
  const existingInternal = existingConfig.internal ?? {};
  const aiEmployeeWebhookSecret = getRuntimeSecretUpdate({
    clear: formData.get('clearAIEmployeeWebhookSecret') === 'on',
    currentEncrypted: existingInternal.encryptedAIEmployeeWebhookSecret,
    currentPreview: existingInternal.aiEmployeeWebhookSecretPreview,
    nextValue: readFormString(formData, 'aiEmployeeWebhookSecret'),
  });
  const maintenanceSecret = getRuntimeSecretUpdate({
    clear: formData.get('clearMaintenanceSecret') === 'on',
    currentEncrypted: existingInternal.encryptedMaintenanceSecret,
    currentPreview: existingInternal.maintenanceSecretPreview,
    nextValue: readFormString(formData, 'maintenanceSecret'),
  });

  if (
    readFormString(formData, 'maintenanceSecret')
    && readFormString(formData, 'maintenanceSecret').length < 32
  ) {
    throw new Error('Maintenance secret must be at least 32 characters.');
  }

  if (
    readFormString(formData, 'aiEmployeeWebhookSecret')
    && readFormString(formData, 'aiEmployeeWebhookSecret').length < 32
  ) {
    throw new Error('AI employee webhook secret must be at least 32 characters.');
  }

  const value = {
    ...existingConfig,
    internal: {
      aiEmployeeWebhookSecretPreview: aiEmployeeWebhookSecret.preview,
      encryptedAIEmployeeWebhookSecret: aiEmployeeWebhookSecret.encrypted,
      encryptedMaintenanceSecret: maintenanceSecret.encrypted,
      maintenanceSecretPreview: maintenanceSecret.preview,
    },
    updatedAt: new Date().toISOString(),
    updatedBy: admin.userId,
  };

  await db
    .insert(platformSettingsTable)
    .values({
      key: PLATFORM_RUNTIME_CONFIG_SETTING_KEY,
      value,
    })
    .onConflictDoUpdate({
      set: {
        value,
      },
      target: platformSettingsTable.key,
    });

  await logPlatformAdminAction({
    action: 'platform_runtime_config_updated',
    actorUserId: admin.platformAccess.userId,
    metadata: {
      aiEmployeeWebhookSecretUpdated: aiEmployeeWebhookSecret.updated,
      maintenanceSecretUpdated: maintenanceSecret.updated,
    },
    organizationId: 'platform',
    summary: 'Platform runtime production keys were updated',
  });

  revalidatePath(getI18nPath('/admin', locale));
  redirect(getI18nPath('/admin', locale));
};

const getClerkErrorStatus = (error: unknown) => {
  const maybeError = error as {
    errors?: Array<{ code?: string }>;
    status?: number;
    statusCode?: number;
  };

  return {
    code: maybeError.errors?.[0]?.code,
    status: maybeError.status ?? maybeError.statusCode,
  };
};

const deleteClerkOrganization = async (organizationId: string) => {
  const client = await clerkClient();

  try {
    await client.organizations.deleteOrganization(organizationId);

    return {
      deleted: true,
      notFound: false,
    };
  } catch (error) {
    const clerkError = getClerkErrorStatus(error);
    const notFound = clerkError.status === 404
      || clerkError.code === 'resource_not_found'
      || clerkError.code === 'organization_not_found';

    if (notFound) {
      return {
        deleted: false,
        notFound: true,
      };
    }

    return {
      deleted: false,
      notFound: false,
    };
  }
};

export const updatePlatformStoreControls = async (
  locale: string,
  formData: FormData,
) => {
  const admin = await requirePlatformAdmin();
  const permissions = admin.platformAccess.permissions;
  const canManageService = can(permissions, PLATFORM_PERMISSIONS.MANAGE_SERVICE)
    || can(permissions, PLATFORM_PERMISSIONS.MANAGE_STORES);
  const canManageBilling = can(permissions, PLATFORM_PERMISSIONS.MANAGE_BILLING)
    || can(permissions, PLATFORM_PERMISSIONS.MANAGE_STORES);

  if (!canManageService && !canManageBilling) {
    throw new Error('You do not have permission to update store controls');
  }

  const organizationId = String(formData.get('organizationId') ?? '').trim();

  if (!organizationId) {
    throw new Error('Missing organization id');
  }

  const [settings] = await db
    .select({ metadata: storeSettingsTable.metadata })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);

  if (!settings) {
    throw new Error('Store settings were not found');
  }

  const existingMetadata = (settings.metadata ?? {}) as StoreMetadata;
  const currentPlatform = existingMetadata.platform ?? {};
  const currentSubscription = existingMetadata.subscription ?? {};
  const actorUserId = admin.platformAccess.userId;
  const status = canManageService
    ? storeStatusSchema.parse(String(formData.get('status') ?? 'active'))
    : storeStatusSchema.parse(String(currentPlatform.status ?? 'active'));
  const storedPlan = currentSubscription.plan;
  const currentPlan = AllPlans.some(plan => plan.name === storedPlan)
    ? storedPlan!
    : PLAN_NAME.FREE;
  const plan = canManageBilling
    ? storePlanSchema.parse(String(formData.get('plan') ?? currentPlan))
    : currentPlan;
  const addOns = plan === PLAN_NAME.FREE
    ? {
        aiOrders: 0,
        products: 0,
        storageMb: 0,
        teamMembers: 0,
      }
    : {
        aiOrders: getAddOnNumber(formData, 'extraAiOrders'),
        products: getAddOnNumber(formData, 'extraCatalogItems'),
        storageMb: getAddOnNumber(formData, 'extraStorageMb'),
        teamMembers: getAddOnNumber(formData, 'extraTeamMembers'),
      };
  const serviceNotes = String(formData.get('serviceNotes') ?? '').trim();
  const updatedAt = new Date().toISOString();

  const metadata: StoreMetadata = {
    ...existingMetadata,
    platform: {
      ...currentPlatform,
      partialSuspensions: canManageService
        ? {
            ai: formData.get('pauseAi') === 'on',
            productPublishing: formData.get('pauseProductPublishing') === 'on',
            webOrders: formData.get('pauseWebOrders') === 'on',
            whatsapp: formData.get('pauseWhatsapp') === 'on',
          }
        : currentPlatform.partialSuspensions,
      serviceNotes: canManageService
        ? serviceNotes || undefined
        : currentPlatform.serviceNotes,
      status,
      updatedAt,
      updatedBy: actorUserId,
    },
    subscription: canManageBilling
      ? {
          ...currentSubscription,
          adminOverride: {
            enabled: true,
            plan,
            updatedAt,
            updatedBy: actorUserId,
          },
          addOns,
          plan,
          status: plan === PLAN_NAME.FREE ? 'free' : 'active',
          updatedAt,
          updatedBy: actorUserId,
        }
      : currentSubscription,
  };

  await db
    .update(storeSettingsTable)
    .set({ metadata })
    .where(eq(storeSettingsTable.organizationId, organizationId));

  await logPlatformAdminAction({
    action: 'store_controls_updated',
    actorUserId: admin.platformAccess.userId,
    metadata: {
      canManageBilling,
      canManageService,
      addOns,
      plan,
      status,
    },
    organizationId,
    summary: 'Store controls were updated',
  });

  revalidatePath(getI18nPath('/admin', locale));
  revalidatePath(getI18nPath('/dashboard', locale));
  revalidatePath(getI18nPath('/dashboard/subscription', locale));
  revalidatePath(getI18nPath('/dashboard/settings', locale));
};

export const archivePlatformStore = async (
  locale: string,
  organizationId: string,
) => {
  const admin = await requirePlatformPermission(PLATFORM_PERMISSIONS.MANAGE_STORES);
  const normalizedOrganizationId = organizationId.trim();

  if (!normalizedOrganizationId) {
    throw new Error('Missing organization id');
  }

  const [settings] = await db
    .select({ metadata: storeSettingsTable.metadata })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, normalizedOrganizationId))
    .limit(1);

  if (!settings) {
    throw new Error('Store settings were not found');
  }

  const existingMetadata = (settings.metadata ?? {}) as StoreMetadata;
  const metadata: StoreMetadata = {
    ...existingMetadata,
    platform: {
      ...(existingMetadata.platform ?? {}),
      archivedAt: new Date().toISOString(),
      archivedBy: admin.userId,
      status: 'suspended',
    },
    subscription: {
      ...(existingMetadata.subscription ?? {}),
      status: 'suspended',
      updatedAt: new Date().toISOString(),
      updatedBy: admin.userId,
    },
  };

  await db
    .update(storeSettingsTable)
    .set({ metadata })
    .where(eq(storeSettingsTable.organizationId, normalizedOrganizationId));

  await logPlatformAdminAction({
    action: 'store_archived',
    actorUserId: admin.platformAccess.userId,
    metadata: {
      status: 'suspended',
    },
    organizationId: normalizedOrganizationId,
    summary: 'Store was archived and suspended',
  });

  revalidatePath(getI18nPath('/admin', locale));
  revalidatePath(getI18nPath(`/admin/stores/${normalizedOrganizationId}`, locale));
  revalidatePath(getI18nPath('/dashboard', locale));
};

export const cancelPlatformStoreSubscription = async (
  locale: string,
  organizationId: string,
  formData: FormData,
) => {
  const admin = await requirePlatformAdmin();
  const permissions = admin.platformAccess.permissions;

  if (
    !can(permissions, PLATFORM_PERMISSIONS.MANAGE_BILLING)
    && !can(permissions, PLATFORM_PERMISSIONS.MANAGE_STORES)
  ) {
    throw new Error('You do not have permission to cancel subscriptions');
  }

  const normalizedOrganizationId = organizationId.trim();
  const confirmOrganizationId = String(formData.get('confirmOrganizationId') ?? '').trim();
  const cancelNow = formData.get('cancelNow') === 'on';

  if (!normalizedOrganizationId) {
    throw new Error('Missing organization id');
  }

  if (confirmOrganizationId !== normalizedOrganizationId) {
    throw new Error('Organization id confirmation does not match');
  }

  const [settings] = await db
    .select({ metadata: storeSettingsTable.metadata })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, normalizedOrganizationId))
    .limit(1);

  if (!settings) {
    throw new Error('Store settings were not found');
  }

  const metadata = (settings.metadata ?? {}) as StoreMetadata;
  const existingSubscription = metadata.subscription ?? {};
  const existingPlatform = metadata.platform ?? {};
  const stripeSubscriptionId = existingSubscription.stripeSubscriptionId;
  let cancelledStatus: string | undefined;

  if (stripeSubscriptionId) {
    const stripe = getStripe();
    const cancelledSubscription = cancelNow
      ? await stripe.subscriptions.cancel(stripeSubscriptionId)
      : await stripe.subscriptions.update(stripeSubscriptionId, {
          cancel_at_period_end: true,
        });
    cancelledStatus = cancelledSubscription.status;
  }

  await db
    .update(storeSettingsTable)
    .set({
      metadata: {
        ...metadata,
        platform: {
          ...existingPlatform,
          status: cancelNow ? 'suspended' : existingPlatform.status ?? 'active',
          updatedAt: new Date().toISOString(),
          updatedBy: admin.userId,
        },
        subscription: {
          ...existingSubscription,
          cancelledAt: new Date().toISOString(),
          cancelledBy: admin.userId,
          stripeCancelEndNow: cancelNow,
          status: cancelNow ? 'suspended' : 'canceled',
        },
      },
    })
    .where(eq(storeSettingsTable.organizationId, normalizedOrganizationId));

  await logPlatformAdminAction({
    action: 'store_subscription_cancelled',
    actorUserId: admin.platformAccess.userId,
    metadata: {
      cancelNow,
      status: cancelledStatus ?? 'not_found',
      stripeSubscriptionId,
    },
    organizationId: normalizedOrganizationId,
    summary: stripeSubscriptionId
      ? (cancelNow
          ? 'Store subscription was cancelled immediately'
          : 'Store subscription was scheduled for cancellation')
      : (cancelNow
          ? 'Store was suspended without an active Stripe subscription'
          : 'Store subscription was marked as canceled without an active Stripe subscription'),
  });

  revalidatePath(getI18nPath('/admin', locale));
  revalidatePath(getI18nPath(`/admin/stores/${normalizedOrganizationId}`, locale));
  revalidatePath(getI18nPath('/dashboard', locale));
  revalidatePath(getI18nPath('/dashboard/subscription', locale));
};

export const permanentlyDeletePlatformStore = async (
  locale: string,
  organizationId: string,
  formData: FormData,
) => {
  const admin = await requirePlatformPermission(PLATFORM_PERMISSIONS.MANAGE_STORES);
  const normalizedOrganizationId = organizationId.trim();
  const confirmOrganizationId = String(formData.get('confirmOrganizationId') ?? '').trim();
  const confirmDeleteText = String(formData.get('confirmDeleteText') ?? '').trim();

  if (!normalizedOrganizationId) {
    throw new Error('Missing organization id');
  }

  if (confirmOrganizationId !== normalizedOrganizationId) {
    throw new Error('Organization id confirmation does not match');
  }

  if (confirmDeleteText !== 'DELETE STORE') {
    throw new Error('Delete confirmation phrase does not match');
  }

  const [settings] = await db
    .select({ id: storeSettingsTable.id })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, normalizedOrganizationId))
    .limit(1);

  if (!settings) {
    throw new Error('Store settings were not found');
  }

  const clerkDelete = await deleteClerkOrganization(normalizedOrganizationId);

  if (!clerkDelete.deleted && !clerkDelete.notFound) {
    revalidatePath(getI18nPath(`/admin/stores/${normalizedOrganizationId}`, locale));
    redirect(getI18nPath(
      `/admin/stores/${normalizedOrganizationId}?deleteError=clerk`,
      locale,
    ));
  }

  await db.transaction(async (tx) => {
    await tx.insert(platformAdminAuditLogsTable).values({
      action: 'store_permanently_deleted',
      actorUserId: admin.platformAccess.userId,
      metadata: {
        confirmedAt: new Date().toISOString(),
        clerkOrganizationDeleted: clerkDelete.deleted,
        clerkOrganizationNotFound: clerkDelete.notFound,
      },
      organizationId: normalizedOrganizationId,
      summary: clerkDelete.deleted
        ? 'Store was permanently deleted from the platform'
        : 'Store was permanently deleted from the platform; external account was already missing',
    });
    await tx
      .delete(aiActionLogsTable)
      .where(eq(aiActionLogsTable.organizationId, normalizedOrganizationId));
    await tx
      .delete(conversationMessagesTable)
      .where(eq(conversationMessagesTable.organizationId, normalizedOrganizationId));
    await tx
      .delete(conversationsTable)
      .where(eq(conversationsTable.organizationId, normalizedOrganizationId));
    await tx
      .delete(customerReviewsTable)
      .where(eq(customerReviewsTable.organizationId, normalizedOrganizationId));
    await tx
      .delete(invoicesTable)
      .where(eq(invoicesTable.organizationId, normalizedOrganizationId));
    await tx
      .delete(orderEventsTable)
      .where(eq(orderEventsTable.organizationId, normalizedOrganizationId));
    await tx
      .delete(ordersTable)
      .where(eq(ordersTable.organizationId, normalizedOrganizationId));
    await tx
      .delete(productsTable)
      .where(eq(productsTable.organizationId, normalizedOrganizationId));
    await tx
      .delete(customersTable)
      .where(eq(customersTable.organizationId, normalizedOrganizationId));
    await tx
      .delete(channelConnectionsTable)
      .where(eq(channelConnectionsTable.organizationId, normalizedOrganizationId));
    await tx
      .delete(paymentMethodsTable)
      .where(eq(paymentMethodsTable.organizationId, normalizedOrganizationId));
    await tx
      .delete(deliveryMethodsTable)
      .where(eq(deliveryMethodsTable.organizationId, normalizedOrganizationId));
    await tx
      .delete(storeSettingsTable)
      .where(eq(storeSettingsTable.organizationId, normalizedOrganizationId));
  });

  revalidatePath(getI18nPath('/admin', locale));
  redirect(getI18nPath('/admin', locale));
};
