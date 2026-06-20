'use server';

import type { AIApprovalQueue } from '@/libs/AIApprovalQueue';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  approveLatestPendingApproval,
  createAIApprovalRequest,
  normalizeAIApprovalQueue,
} from '@/libs/AIApprovalQueue';
import {
  parseAIProductDrafts,
  productDraftToInsertMetadata,
} from '@/libs/AISetupAssistant';
import { db } from '@/libs/DB';
import { loadStoreAIContext } from '@/libs/StoreAIContext';
import {
  buildStoreProductInsertValues,
  findStoreProductDuplicate,
} from '@/libs/StoreProductCreation';
import { assertStoreFeatureEnabled } from '@/libs/StoreServiceControls';
import {
  assertCanCreateProducts,
  isSubscriptionFeatureError,
  isSubscriptionLimitError,
} from '@/libs/SubscriptionEntitlements';
import { productsTable, storeSettingsTable } from '@/models/Schema';
import { getI18nPath } from '@/utils/Helpers';

type StoreSettingsMetadata = {
  aiApprovalQueue?: AIApprovalQueue;
  aiSetupAssistant?: {
    productDrafts?: ReturnType<typeof parseAIProductDrafts>;
  };
};

const getActiveOrganizationId = async () => {
  const { orgId } = await auth();

  if (!orgId) {
    throw new Error('No active organization selected');
  }

  return orgId;
};

const redirectSetupAssistantError = (locale: string, code: string) => {
  redirect(getI18nPath(`/dashboard/ai-operations?setupAssistant=${code}`, locale));
};

export const generateAIProductDrafts = async (locale: string, formData: FormData) => {
  const organizationId = await getActiveOrganizationId();
  await assertStoreFeatureEnabled(organizationId, 'ai');
  await assertStoreFeatureEnabled(organizationId, 'productPublishing');
  const input = String(formData.get('productDraftInput') ?? '').trim();
  let drafts: ReturnType<typeof parseAIProductDrafts>;

  try {
    drafts = parseAIProductDrafts(input);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof Error) {
      redirectSetupAssistantError(locale, 'invalid');
    }

    throw error;
  }

  if (drafts.length === 0) {
    redirectSetupAssistantError(locale, 'empty');
  }

  await loadStoreAIContext({ organizationId });

  const [settings] = await db
    .select({ metadata: storeSettingsTable.metadata })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);
  const metadata = (settings?.metadata ?? {}) as StoreSettingsMetadata;
  const approvalQueue = normalizeAIApprovalQueue(metadata.aiApprovalQueue);
  const createdAt = new Date().toISOString();

  await db
    .update(storeSettingsTable)
    .set({
      metadata: {
        ...metadata,
        aiApprovalQueue: {
          items: [
            createAIApprovalRequest({
              createdAt,
              id: `approval-${createdAt}`,
              payload: { productDrafts: drafts },
              summary: `${drafts.length} product drafts`,
              title: 'AI product drafts',
              type: 'product_drafts',
            }),
            ...approvalQueue.items,
          ].slice(0, 50),
        },
        aiSetupAssistant: {
          ...(metadata.aiSetupAssistant ?? {}),
          productDrafts: drafts,
        },
      },
    })
    .where(eq(storeSettingsTable.organizationId, organizationId));

  revalidatePath(getI18nPath('/dashboard/ai-operations', locale));
};

export const approveAIProductDrafts = async (locale: string) => {
  const organizationId = await getActiveOrganizationId();
  await assertStoreFeatureEnabled(organizationId, 'productPublishing');
  const [settings] = await db
    .select({ metadata: storeSettingsTable.metadata })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);
  const metadata = (settings?.metadata ?? {}) as StoreSettingsMetadata;
  const drafts = metadata.aiSetupAssistant?.productDrafts ?? [];
  const approvalQueue = normalizeAIApprovalQueue(metadata.aiApprovalQueue);

  if (drafts.length === 0) {
    redirectSetupAssistantError(locale, 'empty');
  }

  await assertCanCreateProducts(organizationId, drafts.length).catch((error: unknown) => {
    if (isSubscriptionLimitError(error)) {
      redirectSetupAssistantError(locale, 'limit');
    }

    if (isSubscriptionFeatureError(error)) {
      redirect(getI18nPath('/dashboard/subscription?required=paid', locale));
    }

    throw error;
  });

  const productsToCreate = drafts.map(draft => ({
    category: draft.category,
    description: draft.description,
    image: draft.image,
    metadata: productDraftToInsertMetadata(draft),
    name: draft.name,
    price: draft.price,
  }));
  const duplicate = await findStoreProductDuplicate({
    candidates: productsToCreate,
    organizationId,
  });

  if (duplicate) {
    redirectSetupAssistantError(locale, 'duplicate');
  }

  await db.transaction(async (tx) => {
    await tx
      .insert(productsTable)
      .values(buildStoreProductInsertValues(organizationId, productsToCreate));

    await tx
      .update(storeSettingsTable)
      .set({
        metadata: {
          ...metadata,
          aiApprovalQueue: approveLatestPendingApproval(
            approvalQueue,
            'product_drafts',
            new Date().toISOString(),
          ),
          aiSetupAssistant: {
            ...(metadata.aiSetupAssistant ?? {}),
            productDrafts: [],
          },
        },
      })
      .where(eq(storeSettingsTable.organizationId, organizationId));
  });

  revalidatePath(getI18nPath('/dashboard/products', locale));
  revalidatePath(getI18nPath('/dashboard/ai-operations', locale));
  revalidatePath(getI18nPath('/dashboard/launch-readiness', locale));
};
