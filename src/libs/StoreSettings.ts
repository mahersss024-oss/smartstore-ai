import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { storeSettingsTable } from '@/models/Schema';

export const ensureStoreSettings = async (organizationId: string) => {
  const [settings] = await db
    .select({ id: storeSettingsTable.id })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);

  if (settings) {
    return;
  }

  await db.insert(storeSettingsTable).values({
    organizationId,
    currency: 'SAR',
    metadata: {
      platform: {
        status: 'active',
      },
      subscription: {
        plan: 'free',
        status: 'active',
      },
    },
    timezone: 'Asia/Riyadh',
  });
};
