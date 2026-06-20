'use server';

import { auth } from '@clerk/nextjs/server';
import { and, count, eq, ne } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  AI_HANDOFF_KEYS,
  AI_PERMISSION_KEYS,
  normalizeAIEmployeeSettings,
} from '@/libs/AIEmployeeSettings';
import { db } from '@/libs/DB';
import { getStoreReadiness } from '@/libs/StoreReadiness';
import { assertStoreFeatureEnabled } from '@/libs/StoreServiceControls';
import {
  deliveryMethodsTable,
  paymentMethodsTable,
  productsTable,
  storeSettingsTable,
} from '@/models/Schema';
import { getI18nPath } from '@/utils/Helpers';

type StoreSettingsMetadata = {
  aiEmployee?: unknown;
  businessType?: string;
  contactChannels?: Record<string, string | undefined>;
  location?: {
    address?: string;
    city?: string;
    mapsUrl?: string;
    pickupInstructions?: string;
  };
};

const getActiveOrganizationId = async () => {
  const { orgId } = await auth();

  if (!orgId) {
    throw new Error('No active organization selected');
  }

  return orgId;
};

const isChecked = (formData: FormData, key: string) => formData.get(key) === 'on';

export const saveAIEmployeeSettings = async (locale: string, formData: FormData) => {
  const organizationId = await getActiveOrganizationId();
  const existingSettings = await db
    .select({
      currency: storeSettingsTable.currency,
      metadata: storeSettingsTable.metadata,
      storeDescription: storeSettingsTable.storeDescription,
      storeName: storeSettingsTable.storeName,
      timezone: storeSettingsTable.timezone,
      welcomeMessage: storeSettingsTable.welcomeMessage,
    })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);
  const existingMetadata = (existingSettings[0]?.metadata ?? {}) as StoreSettingsMetadata;
  const submittedSettings = normalizeAIEmployeeSettings({
    approvalRequiredForCatalogChanges: isChecked(formData, 'approvalRequiredForCatalogChanges'),
    approvalRequiredForSetupChanges: isChecked(formData, 'approvalRequiredForSetupChanges'),
    dialect: String(formData.get('dialect') ?? ''),
    displayName: String(formData.get('displayName') ?? ''),
    enabled: isChecked(formData, 'enabled'),
    fallbackLanguage: String(formData.get('fallbackLanguage') ?? ''),
    handoffRules: Object.fromEntries(
      AI_HANDOFF_KEYS.map(key => [key, isChecked(formData, `handoff_${key}`)]),
    ),
    language: String(formData.get('language') ?? ''),
    permissions: Object.fromEntries(
      AI_PERMISSION_KEYS.map(key => [key, isChecked(formData, `permission_${key}`)]),
    ),
    salesStyle: String(formData.get('salesStyle') ?? ''),
    targetCountry: String(formData.get('targetCountry') ?? ''),
    tone: String(formData.get('tone') ?? ''),
    welcomeMessage: String(formData.get('welcomeMessage') ?? ''),
  });

  if (submittedSettings.enabled) {
    await assertStoreFeatureEnabled(organizationId, 'ai');
    const [productStats] = await db
      .select({ count: count(productsTable.id) })
      .from(productsTable)
      .where(and(
        eq(productsTable.organizationId, organizationId),
        eq(productsTable.isActive, true),
      ));
    const [paymentStats] = await db
      .select({ count: count(paymentMethodsTable.id) })
      .from(paymentMethodsTable)
      .where(and(
        eq(paymentMethodsTable.organizationId, organizationId),
        eq(paymentMethodsTable.isActive, true),
        ne(paymentMethodsTable.provider, 'bank_transfer'),
      ));
    const [deliveryStats] = await db
      .select({ count: count(deliveryMethodsTable.id) })
      .from(deliveryMethodsTable)
      .where(and(
        eq(deliveryMethodsTable.organizationId, organizationId),
        eq(deliveryMethodsTable.isActive, true),
      ));
    const readiness = getStoreReadiness({
      businessType: existingMetadata.businessType,
      contactChannels: existingMetadata.contactChannels,
      currency: existingSettings[0]?.currency,
      deliveryMethodsCount: Number(deliveryStats?.count ?? 0),
      location: existingMetadata.location,
      paymentMethodsCount: Number(paymentStats?.count ?? 0),
      productsCount: Number(productStats?.count ?? 0),
      storeDescription: existingSettings[0]?.storeDescription,
      storeName: existingSettings[0]?.storeName,
      timezone: existingSettings[0]?.timezone,
      welcomeMessage: existingSettings[0]?.welcomeMessage,
    });

    if (readiness.status !== 'ready') {
      redirect(getI18nPath('/dashboard/ai-operations?aiSettingsError=readiness', locale));
    }
  }

  await db
    .update(storeSettingsTable)
    .set({
      metadata: {
        ...existingMetadata,
        aiEmployee: submittedSettings,
      },
    })
    .where(eq(storeSettingsTable.organizationId, organizationId));

  revalidatePath(getI18nPath('/dashboard/ai-operations', locale));
  revalidatePath(getI18nPath('/dashboard/launch-readiness', locale));
  revalidatePath(getI18nPath('/dashboard', locale));
};
