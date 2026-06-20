'use server';

import type { SQL } from 'drizzle-orm';
import { auth } from '@clerk/nextjs/server';
import { and, eq, inArray, or } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCustomerPhoneIdentityVariants } from '@/libs/CustomerIdentity';
import { db } from '@/libs/DB';
import {
  aiActionLogsTable,
  conversationMessagesTable,
  conversationsTable,
  customerReviewsTable,
  customersTable,
  invoicesTable,
  orderEventsTable,
  ordersTable,
} from '@/models/Schema';
import { getI18nPath } from '@/utils/Helpers';

type CustomerMetadata = {
  archivedAt?: unknown;
  archivedBy?: unknown;
};

const getActiveOrganizationId = async () => {
  const { orgId, userId } = await auth();

  if (!orgId) {
    throw new Error('No active organization selected');
  }

  return { organizationId: orgId, userId };
};

const normalizeCustomerMetadata = (metadata: unknown): CustomerMetadata => {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }

  return metadata as CustomerMetadata;
};

export const archiveCustomerRecord = async (
  locale: string,
  customerId: number,
) => {
  const { organizationId, userId } = await getActiveOrganizationId();
  const [customer] = await db
    .select({ metadata: customersTable.metadata })
    .from(customersTable)
    .where(
      and(
        eq(customersTable.id, customerId),
        eq(customersTable.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!customer) {
    redirect(getI18nPath('/dashboard/customers', locale));
  }

  await db
    .update(customersTable)
    .set({
      metadata: {
        ...normalizeCustomerMetadata(customer.metadata),
        archivedAt: new Date().toISOString(),
        archivedBy: userId,
      },
    })
    .where(
      and(
        eq(customersTable.id, customerId),
        eq(customersTable.organizationId, organizationId),
      ),
    );

  revalidatePath(getI18nPath('/dashboard/customers', locale));
  revalidatePath(getI18nPath(`/dashboard/customers/${customerId}`, locale));
  redirect(getI18nPath('/dashboard/customers', locale));
};

export const restoreCustomerRecord = async (
  locale: string,
  customerId: number,
) => {
  const { organizationId } = await getActiveOrganizationId();
  const [customer] = await db
    .select({ metadata: customersTable.metadata })
    .from(customersTable)
    .where(
      and(
        eq(customersTable.id, customerId),
        eq(customersTable.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!customer) {
    redirect(getI18nPath('/dashboard/customers', locale));
  }

  const {
    archivedAt: _archivedAt,
    archivedBy: _archivedBy,
    ...metadata
  } = normalizeCustomerMetadata(customer.metadata);

  await db
    .update(customersTable)
    .set({ metadata })
    .where(
      and(
        eq(customersTable.id, customerId),
        eq(customersTable.organizationId, organizationId),
      ),
    );

  revalidatePath(getI18nPath('/dashboard/customers', locale));
  revalidatePath(getI18nPath(`/dashboard/customers/${customerId}`, locale));
};

export const deleteCustomerConversation = async (
  locale: string,
  customerId: number,
  conversationId: number,
) => {
  if (!Number.isInteger(customerId) || !Number.isInteger(conversationId)) {
    throw new TypeError('Invalid conversation deletion target');
  }

  const { organizationId } = await getActiveOrganizationId();

  await db.transaction(async (tx) => {
    const [conversation] = await tx
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, conversationId),
          eq(conversationsTable.customerId, customerId),
          eq(conversationsTable.organizationId, organizationId),
        ),
      )
      .limit(1);

    if (!conversation) {
      return;
    }

    await tx
      .delete(aiActionLogsTable)
      .where(
        and(
          eq(aiActionLogsTable.organizationId, organizationId),
          eq(aiActionLogsTable.conversationId, conversationId),
        ),
      );

    await tx
      .delete(conversationMessagesTable)
      .where(
        and(
          eq(conversationMessagesTable.organizationId, organizationId),
          eq(conversationMessagesTable.conversationId, conversationId),
        ),
      );

    await tx
      .delete(conversationsTable)
      .where(
        and(
          eq(conversationsTable.id, conversationId),
          eq(conversationsTable.customerId, customerId),
          eq(conversationsTable.organizationId, organizationId),
        ),
      );
  });

  revalidatePath(getI18nPath(`/dashboard/customers/${customerId}`, locale));
};

export const deleteCustomerRecord = async (
  locale: string,
  customerId: number,
) => {
  const { organizationId } = await getActiveOrganizationId();

  await db.transaction(async (tx) => {
    const [customer] = await tx
      .select({
        email: customersTable.email,
        phone: customersTable.phone,
      })
      .from(customersTable)
      .where(
        and(
          eq(customersTable.id, customerId),
          eq(customersTable.organizationId, organizationId),
        ),
      )
      .limit(1);

    const phoneIdentityVariants = customer?.phone?.trim()
      ? getCustomerPhoneIdentityVariants(customer.phone)
      : [];
    const orderIdentityConditions = [
      phoneIdentityVariants.length > 0
        ? inArray(ordersTable.customerPhone, phoneIdentityVariants)
        : undefined,
      customer?.email?.trim()
        ? eq(ordersTable.customerEmail, customer.email.trim())
        : undefined,
    ].filter((condition): condition is SQL => Boolean(condition));
    const relatedOrders = orderIdentityConditions.length > 0
      ? await tx
          .select({ id: ordersTable.id })
          .from(ordersTable)
          .where(
            and(
              eq(ordersTable.organizationId, organizationId),
              orderIdentityConditions.length === 1
                ? orderIdentityConditions[0]
                : or(...orderIdentityConditions),
            ),
          )
      : [];
    const conversations = await tx
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.organizationId, organizationId),
          eq(conversationsTable.customerId, customerId),
        ),
      );

    for (const conversation of conversations) {
      await tx
        .delete(aiActionLogsTable)
        .where(
          and(
            eq(aiActionLogsTable.organizationId, organizationId),
            eq(aiActionLogsTable.conversationId, conversation.id),
          ),
        );

      await tx
        .delete(conversationMessagesTable)
        .where(
          and(
            eq(conversationMessagesTable.organizationId, organizationId),
            eq(conversationMessagesTable.conversationId, conversation.id),
          ),
        );
    }

    await tx
      .delete(customerReviewsTable)
      .where(
        and(
          eq(customerReviewsTable.organizationId, organizationId),
          eq(customerReviewsTable.customerId, customerId),
        ),
      );

    for (const order of relatedOrders) {
      await tx
        .delete(aiActionLogsTable)
        .where(
          and(
            eq(aiActionLogsTable.organizationId, organizationId),
            eq(aiActionLogsTable.orderId, order.id),
          ),
        );

      await tx
        .delete(customerReviewsTable)
        .where(
          and(
            eq(customerReviewsTable.organizationId, organizationId),
            eq(customerReviewsTable.orderId, order.id),
          ),
        );

      await tx
        .delete(orderEventsTable)
        .where(
          and(
            eq(orderEventsTable.organizationId, organizationId),
            eq(orderEventsTable.orderId, order.id),
          ),
        );

      await tx
        .delete(invoicesTable)
        .where(
          and(
            eq(invoicesTable.organizationId, organizationId),
            eq(invoicesTable.orderId, order.id),
          ),
        );

      await tx
        .delete(ordersTable)
        .where(
          and(
            eq(ordersTable.organizationId, organizationId),
            eq(ordersTable.id, order.id),
          ),
        );
    }

    await tx
      .delete(conversationsTable)
      .where(
        and(
          eq(conversationsTable.organizationId, organizationId),
          eq(conversationsTable.customerId, customerId),
        ),
      );

    await tx
      .delete(customersTable)
      .where(
        and(
          eq(customersTable.id, customerId),
          eq(customersTable.organizationId, organizationId),
        ),
      );
  });

  revalidatePath(getI18nPath('/dashboard/customers', locale));
  redirect(getI18nPath('/dashboard/customers', locale));
};
