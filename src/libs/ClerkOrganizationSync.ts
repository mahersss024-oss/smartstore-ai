import type { OrganizationWebhookEvent } from '@clerk/nextjs/webhooks';
import { eq } from 'drizzle-orm';
import { db } from '@/libs/DB';
import { disableOrganizationWhatsAppConnection } from '@/libs/WhatsAppConnectionLifecycle';
import {
  platformAdminAuditLogsTable,
  storeSettingsTable,
} from '@/models/Schema';
import { PLAN_NAME } from '@/utils/PricingPlans';

type StoreMetadata = {
  platform?: Record<string, unknown>;
  subscription?: Record<string, unknown>;
} & Record<string, unknown>;

const ensureStoreSettingsForWebhook = async (
  organizationId: string,
  storeName?: string | null,
) => {
  const [settings] = await db
    .select({
      id: storeSettingsTable.id,
      metadata: storeSettingsTable.metadata,
      storeName: storeSettingsTable.storeName,
    })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);

  if (settings) {
    return settings;
  }

  const [created] = await db
    .insert(storeSettingsTable)
    .values({
      currency: 'SAR',
      metadata: {
        platform: {
          status: 'active',
        },
        subscription: {
          plan: PLAN_NAME.FREE,
          status: 'active',
        },
        subscriptionPlan: PLAN_NAME.FREE,
      },
      organizationId,
      storeName: storeName || null,
      timezone: 'Asia/Riyadh',
    })
    .onConflictDoNothing({
      target: storeSettingsTable.organizationId,
    })
    .returning({
      id: storeSettingsTable.id,
      metadata: storeSettingsTable.metadata,
      storeName: storeSettingsTable.storeName,
    });

  if (created) {
    return created;
  }

  return (await db
    .select({
      id: storeSettingsTable.id,
      metadata: storeSettingsTable.metadata,
      storeName: storeSettingsTable.storeName,
    })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1))[0];
};

export const syncOrganizationFromClerk = async (event: OrganizationWebhookEvent) => {
  const organizationId = event.data.id;

  if (!organizationId) {
    return;
  }

  if (event.type === 'organization.deleted') {
    const [settings] = await db
      .select({ metadata: storeSettingsTable.metadata })
      .from(storeSettingsTable)
      .where(eq(storeSettingsTable.organizationId, organizationId))
      .limit(1);

    if (!settings) {
      return;
    }

    const metadata = (settings.metadata ?? {}) as StoreMetadata;
    const deletedAt = new Date().toISOString();

    await db.transaction(async (tx) => {
      await tx
        .update(storeSettingsTable)
        .set({
          metadata: {
            ...metadata,
            platform: {
              ...(metadata.platform ?? {}),
              archivedAt: deletedAt,
              archivedBy: 'clerk_webhook',
              status: 'suspended',
              updatedAt: deletedAt,
              updatedBy: 'clerk_webhook',
            },
            subscription: {
              ...(metadata.subscription ?? {}),
              status: 'suspended',
              updatedAt: deletedAt,
              updatedBy: 'clerk_webhook',
            },
          },
        })
        .where(eq(storeSettingsTable.organizationId, organizationId));

      await tx.insert(platformAdminAuditLogsTable).values({
        action: 'clerk_organization_deleted',
        actorUserId: 'clerk_webhook',
        metadata: {
          clerkOrganizationId: organizationId,
        },
        organizationId,
        summary: 'Store was suspended after its Clerk organization was deleted',
      });
    });

    await disableOrganizationWhatsAppConnection(organizationId);

    return;
  }

  const settings = await ensureStoreSettingsForWebhook(organizationId, event.data.name);

  if (!settings?.storeName && event.data.name) {
    await db
      .update(storeSettingsTable)
      .set({ storeName: event.data.name })
      .where(eq(storeSettingsTable.organizationId, organizationId));
  }
};
