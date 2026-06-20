'use server';

import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { simulateAIEmployeeReply } from '@/libs/AISimulation';
import { db } from '@/libs/DB';
import { loadStoreAIContext } from '@/libs/StoreAIContext';
import { assertStoreFeatureEnabled } from '@/libs/StoreServiceControls';
import { storeSettingsTable } from '@/models/Schema';
import { getI18nPath } from '@/utils/Helpers';

type StoreSettingsMetadata = {
  aiSimulation?: {
    lastResult?: {
      createdAt: string;
      message: string;
      missingDetails: string[];
      recommendedProducts: {
        category: null | string;
        id: number;
        image: null | string;
        name: string;
        price: string;
      }[];
      reply: string;
    };
  };
};

const getActiveOrganizationId = async () => {
  const { orgId } = await auth();

  if (!orgId) {
    throw new Error('No active organization selected');
  }

  return orgId;
};

export const runAIEmployeeSimulation = async (locale: string, formData: FormData) => {
  const organizationId = await getActiveOrganizationId();
  const message = String(formData.get('simulationMessage') ?? '').trim();

  if (!message) {
    redirect(getI18nPath('/dashboard/ai-operations?simulation=empty', locale));
  }

  await assertStoreFeatureEnabled(organizationId, 'ai');
  const context = await loadStoreAIContext({ organizationId });
  const result = simulateAIEmployeeReply(context, message);
  const [settings] = await db
    .select({ metadata: storeSettingsTable.metadata })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);
  const metadata = (settings?.metadata ?? {}) as StoreSettingsMetadata;

  await db
    .update(storeSettingsTable)
    .set({
      metadata: {
        ...metadata,
        aiSimulation: {
          ...(metadata.aiSimulation ?? {}),
          lastResult: {
            createdAt: new Date().toISOString(),
            message,
            missingDetails: result.missingDetails,
            recommendedProducts: result.recommendedProducts.map(product => ({
              category: product.category,
              id: product.id,
              image: product.image,
              name: product.name,
              price: product.price,
            })),
            reply: result.reply,
          },
        },
      },
    })
    .where(eq(storeSettingsTable.organizationId, organizationId));

  revalidatePath(getI18nPath('/dashboard/ai-operations', locale));
};
