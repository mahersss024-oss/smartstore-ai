'use server';

import { auth } from '@clerk/nextjs/server';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { generateCustomerReplyForSystemEvent } from '@/features/ai/AIEmployeeAgent';
import { OrderConcurrencyError } from '@/features/dashboard/OrderErrors';
import { db } from '@/libs/DB';
import { sendEvolutionConversationTextMessage } from '@/libs/EvolutionWhatsApp';
import {
  getOrderConversationReference,
  writeOrderCustomerConversationMessage,
} from '@/libs/OrderConversationWriter';
import {
  assertCanTransitionOrderStatus,
  DELIVERY_STATUS,
  ORDER_EVENT_TYPE,
  ORDER_STATUS,
} from '@/libs/OrderWorkflow';
import { sendWhapiConversationTextMessage } from '@/libs/WhapiWhatsApp';
import {
  aiActionLogsTable,
  customerReviewsTable,
  invoicesTable,
  orderEventsTable,
  ordersTable,
} from '@/models/Schema';
import { getI18nPath } from '@/utils/Helpers';

const getCustomerStatusEventType = (status: string) => {
  if (status === ORDER_STATUS.PREPARING) {
    return 'order_preparing' as const;
  }

  if (status === ORDER_STATUS.READY_FOR_PICKUP) {
    return 'order_ready_for_pickup' as const;
  }

  if (status === ORDER_STATUS.OUT_FOR_DELIVERY) {
    return 'order_out_for_delivery' as const;
  }

  if (status === ORDER_STATUS.CANCELLED) {
    return 'order_cancelled' as const;
  }

  return undefined;
};

type OrderAIAnalysisFacts = {
  customerDetails?: {
    deliveryPreference?: unknown;
    fulfillmentType?: unknown;
    paymentPreference?: unknown;
  };
  deliveryPreference?: unknown;
  fulfillment?: {
    deliveryPreference?: unknown;
    paymentPreference?: unknown;
    type?: unknown;
  };
  fulfillmentType?: unknown;
  paymentPreference?: unknown;
};

const getOrderAIAnalysisFacts = (aiAnalysis: unknown): OrderAIAnalysisFacts => {
  return aiAnalysis && typeof aiAnalysis === 'object'
    ? aiAnalysis as OrderAIAnalysisFacts
    : {};
};

const getStringFact = (value: unknown) => {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
};

const getOrderSystemEventFacts = (aiAnalysis: unknown) => {
  const facts = getOrderAIAnalysisFacts(aiAnalysis);

  return {
    deliveryPreference: getStringFact(
      facts.fulfillment?.deliveryPreference
      ?? facts.customerDetails?.deliveryPreference
      ?? facts.deliveryPreference,
    ),
    fulfillmentType: getStringFact(
      facts.fulfillment?.type
      ?? facts.customerDetails?.fulfillmentType
      ?? facts.fulfillmentType,
    ),
    paymentPreference: getStringFact(
      facts.fulfillment?.paymentPreference
      ?? facts.customerDetails?.paymentPreference
      ?? facts.paymentPreference,
    ),
  };
};

const sendWhatsAppOrderStatusNotification = async (params: {
  aiAnalysis: unknown;
  body: string;
  organizationId: string;
  reviewOrderId?: number;
  source?: null | string;
}) => {
  if (params.source !== 'whatsapp') {
    return;
  }

  const conversationReference = getOrderConversationReference(params.aiAnalysis);
  const externalThreadId = conversationReference.externalThreadId;
  const sender = externalThreadId?.startsWith('ewa:')
    ? sendEvolutionConversationTextMessage
    : sendWhapiConversationTextMessage;

  await sender({
    body: params.body,
    externalThreadId,
    organizationId: params.organizationId,
  });
};

export const approveOrderForCustomer = async (locale: string, orderId: number) => {
  const { orgId, userId } = await auth();

  if (!orgId) {
    throw new Error('No active organization selected');
  }

  const organizationId = orgId;
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, orderId),
        eq(ordersTable.organizationId, organizationId),
        isNull(ordersTable.archivedAt),
      ),
    )
    .limit(1);

  if (!order) {
    throw new Error('Order not found');
  }

  const nextOrderStatus = ORDER_STATUS.APPROVED_BY_STORE;

  assertCanTransitionOrderStatus(order.status, nextOrderStatus);
  const customerMessage = await generateCustomerReplyForSystemEvent({
    eventType: 'order_approved',
    locale,
    order: {
      customerAddress: order.customerAddress,
      customerPhone: order.customerPhone,
      ...getOrderSystemEventFacts(order.aiAnalysis),
      id: order.id,
      items: order.items,
      paymentStatus: order.paymentStatus,
      status: nextOrderStatus,
      totalPrice: order.totalPrice,
    },
    organizationId,
  });
  const conversationWriteResult = await db.transaction(async (tx) => {
    const updated = await tx
      .update(ordersTable)
      .set({
        status: nextOrderStatus,
        storeApprovedAt: new Date(),
      })
      .where(
        and(
          eq(ordersTable.id, orderId),
          eq(ordersTable.organizationId, organizationId),
          eq(ordersTable.status, order.status),
        ),
      )
      .returning({ id: ordersTable.id });

    if (updated.length === 0) {
      throw new OrderConcurrencyError();
    }

    await tx.insert(orderEventsTable).values({
      actorId: userId,
      actorType: 'store_user',
      eventType: ORDER_EVENT_TYPE.ORDER_APPROVED,
      fromStatus: order.status,
      metadata: {
        customerPaymentMode: 'manual_or_offline',
        onlinePaymentDeferred: true,
      },
      orderId: order.id,
      organizationId,
      summary: 'Order approved by store. Customer payment is handled by the active store payment method.',
      toStatus: nextOrderStatus,
    });

    if (customerMessage) {
      return writeOrderCustomerConversationMessage({
        aiAnalysis: order.aiAnalysis,
        body: customerMessage,
        channel: order.source ?? 'web',
        conversationIntent: 'order_status_update',
        fallbackThreadId: `order-${order.id}-updates`,
        orderId: order.id,
        organizationId,
        status: nextOrderStatus,
        tx,
      });
    }

    return undefined;
  });

  if (customerMessage && conversationWriteResult?.status === 'sent') {
    await sendWhatsAppOrderStatusNotification({
      aiAnalysis: order.aiAnalysis,
      body: customerMessage,
      organizationId,
      source: order.source,
    });
  }

  revalidatePath(getI18nPath('/dashboard/orders', locale));
};

export const updateOrderStatusFromDashboard = async (
  locale: string,
  orderId: number,
  nextOrderStatus: string,
) => {
  const { orgId, userId } = await auth();

  if (!orgId) {
    throw new Error('No active organization selected');
  }

  const organizationId = orgId;
  const changedAt = new Date();
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, orderId),
        eq(ordersTable.organizationId, organizationId),
        isNull(ordersTable.archivedAt),
      ),
    )
    .limit(1);

  if (!order) {
    throw new Error('Order not found');
  }

  assertCanTransitionOrderStatus(order.status, nextOrderStatus);
  const customerStatusEventType = getCustomerStatusEventType(nextOrderStatus);
  let customerStatusMessage: string | undefined;

  if (customerStatusEventType) {
    customerStatusMessage = await generateCustomerReplyForSystemEvent({
      eventType: customerStatusEventType,
      locale,
      order: {
        customerAddress: order.customerAddress,
        customerPhone: order.customerPhone,
        ...getOrderSystemEventFacts(order.aiAnalysis),
        id: order.id,
        items: order.items,
        paymentStatus: order.paymentStatus,
        status: nextOrderStatus,
        totalPrice: order.totalPrice,
      },
      organizationId,
    });
  }
  const conversationWriteResult = await db.transaction(async (tx) => {
    const updated = await tx
      .update(ordersTable)
      .set({
        deliveryStatus: nextOrderStatus === ORDER_STATUS.OUT_FOR_DELIVERY
          ? DELIVERY_STATUS.OUT_FOR_DELIVERY
          : nextOrderStatus === ORDER_STATUS.READY_FOR_PICKUP
            ? DELIVERY_STATUS.READY_FOR_PICKUP
            : nextOrderStatus === ORDER_STATUS.PREPARING
              ? DELIVERY_STATUS.PREPARING
              : order.deliveryStatus,
        status: nextOrderStatus,
      })
      .where(
        and(
          eq(ordersTable.id, orderId),
          eq(ordersTable.organizationId, organizationId),
          eq(ordersTable.status, order.status),
        ),
      )
      .returning({ id: ordersTable.id });

    if (updated.length === 0) {
      throw new OrderConcurrencyError();
    }

    await tx.insert(orderEventsTable).values({
      actorId: userId,
      actorType: 'store_user',
      eventType: ORDER_EVENT_TYPE.STATUS_CHANGED,
      fromStatus: order.status,
      metadata: {
        changedAt: changedAt.toISOString(),
      },
      orderId: order.id,
      organizationId,
      summary: 'Order status changed from dashboard.',
      toStatus: nextOrderStatus,
    });

    if (customerStatusEventType && customerStatusMessage) {
      return writeOrderCustomerConversationMessage({
        aiAnalysis: order.aiAnalysis,
        body: customerStatusMessage,
        channel: order.source ?? 'web',
        conversationIntent: 'order_status_update',
        fallbackThreadId: `order-${order.id}-updates`,
        messageMetadata: {
          eventType: customerStatusEventType,
        },
        orderId: order.id,
        organizationId,
        status: nextOrderStatus,
        tx,
      });
    }

    return undefined;
  });

  if (customerStatusMessage && conversationWriteResult?.status === 'sent') {
    await sendWhatsAppOrderStatusNotification({
      aiAnalysis: order.aiAnalysis,
      body: customerStatusMessage,
      organizationId,
      source: order.source,
    });
  }

  revalidatePath(getI18nPath('/dashboard/orders', locale));
};

export const deleteOrderFromDashboard = async (locale: string, orderId: number) => {
  const { orgId, userId } = await auth();

  if (!orgId) {
    throw new Error('No active organization selected');
  }

  const organizationId = orgId;
  const [order] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, orderId),
        eq(ordersTable.organizationId, organizationId),
        isNull(ordersTable.archivedAt),
      ),
    )
    .limit(1);

  if (!order) {
    throw new Error('Order not found');
  }

  const archivedAt = new Date();

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(ordersTable)
      .set({
        archivedAt: new Date(),
      })
      .where(
        and(
          eq(ordersTable.id, orderId),
          eq(ordersTable.organizationId, organizationId),
          isNull(ordersTable.archivedAt),
        ),
      )
      .returning({ id: ordersTable.id });

    if (updated.length === 0) {
      throw new OrderConcurrencyError();
    }

    await tx.insert(orderEventsTable).values({
      actorId: userId,
      actorType: 'store_user',
      eventType: ORDER_EVENT_TYPE.STATUS_CHANGED,
      fromStatus: null,
      metadata: {
        archivedAt: archivedAt.toISOString(),
      },
      orderId,
      organizationId,
      summary: 'Order archived from dashboard.',
      toStatus: null,
    });
  });

  revalidatePath(getI18nPath('/dashboard/orders', locale));
  revalidatePath(getI18nPath('/dashboard/revenue', locale));
  revalidatePath(getI18nPath('/dashboard/customers', locale));
};

export const restoreArchivedOrderFromDashboard = async (locale: string, orderId: number) => {
  const { orgId, userId } = await auth();

  if (!orgId) {
    throw new Error('No active organization selected');
  }

  const organizationId = orgId;
  const [order] = await db
    .select({ archivedAt: ordersTable.archivedAt, id: ordersTable.id })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, orderId),
        eq(ordersTable.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!order?.archivedAt) {
    throw new Error('Archived order not found');
  }

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(ordersTable)
      .set({
        archivedAt: null,
      })
      .where(
        and(
          eq(ordersTable.id, orderId),
          eq(ordersTable.organizationId, organizationId),
          isNotNull(ordersTable.archivedAt),
        ),
      )
      .returning({ id: ordersTable.id });

    if (updated.length === 0) {
      throw new OrderConcurrencyError();
    }

    await tx.insert(orderEventsTable).values({
      actorId: userId,
      actorType: 'store_user',
      eventType: ORDER_EVENT_TYPE.STATUS_CHANGED,
      fromStatus: null,
      metadata: {
        restoredAt: new Date().toISOString(),
      },
      orderId,
      organizationId,
      summary: 'Order restored from archive.',
      toStatus: null,
    });
  });

  revalidatePath(getI18nPath('/dashboard/orders', locale));
  revalidatePath(getI18nPath('/dashboard/orders/archive', locale));
  revalidatePath(getI18nPath('/dashboard/revenue', locale));
  revalidatePath(getI18nPath('/dashboard/customers', locale));
};

export const permanentlyDeleteArchivedOrderFromDashboard = async (
  locale: string,
  orderId: number,
) => {
  const { orgId } = await auth();

  if (!orgId) {
    throw new Error('No active organization selected');
  }

  const organizationId = orgId;
  const [order] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, orderId),
        eq(ordersTable.organizationId, organizationId),
        isNotNull(ordersTable.archivedAt),
      ),
    )
    .limit(1);

  if (!order) {
    throw new Error('Archived order not found');
  }

  await db.transaction(async (tx) => {
    await tx
      .delete(aiActionLogsTable)
      .where(
        and(
          eq(aiActionLogsTable.organizationId, organizationId),
          eq(aiActionLogsTable.orderId, orderId),
        ),
      );

    await tx
      .delete(customerReviewsTable)
      .where(
        and(
          eq(customerReviewsTable.organizationId, organizationId),
          eq(customerReviewsTable.orderId, orderId),
        ),
      );

    await tx
      .delete(invoicesTable)
      .where(
        and(
          eq(invoicesTable.organizationId, organizationId),
          eq(invoicesTable.orderId, orderId),
        ),
      );

    await tx
      .delete(orderEventsTable)
      .where(
        and(
          eq(orderEventsTable.organizationId, organizationId),
          eq(orderEventsTable.orderId, orderId),
        ),
      );

    await tx
      .delete(ordersTable)
      .where(
        and(
          eq(ordersTable.id, orderId),
          eq(ordersTable.organizationId, organizationId),
          isNotNull(ordersTable.archivedAt),
        ),
      );
  });

  revalidatePath(getI18nPath('/dashboard/orders', locale));
  revalidatePath(getI18nPath('/dashboard/orders/archive', locale));
  revalidatePath(getI18nPath('/dashboard/revenue', locale));
  revalidatePath(getI18nPath('/dashboard/customers', locale));
};

export const completeOrderAndRequestReview = async (locale: string, orderId: number) => {
  const { orgId, userId } = await auth();

  if (!orgId) {
    throw new Error('No active organization selected');
  }

  const organizationId = orgId;
  const completedAt = new Date();
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, orderId),
        eq(ordersTable.organizationId, organizationId),
        isNull(ordersTable.archivedAt),
      ),
    )
    .limit(1);

  if (!order) {
    throw new Error('Order not found');
  }

  assertCanTransitionOrderStatus(order.status, ORDER_STATUS.COMPLETED);

  const reviewRequest = await generateCustomerReplyForSystemEvent({
    eventType: 'review_requested',
    locale,
    order: {
      customerAddress: order.customerAddress,
      customerPhone: order.customerPhone,
      id: order.id,
      items: order.items,
      paymentStatus: order.paymentStatus,
      status: ORDER_STATUS.COMPLETED,
      totalPrice: order.totalPrice,
    },
    organizationId,
  });
  const conversationReference = getOrderConversationReference(order.aiAnalysis);
  const threadId = conversationReference.externalThreadId ?? `order-${order.id}-review`;
  const conversationChannel = order.source ?? 'web';
  const reviewConversationMetadata = {
    lastOrder: {
      completedAt: completedAt.toISOString(),
      id: order.id,
      status: ORDER_STATUS.COMPLETED,
    },
    orderId: order.id,
  };

  const reviewWriteResult = await db.transaction(async (tx) => {
    const updated = await tx
      .update(ordersTable)
      .set({
        deliveryStatus: DELIVERY_STATUS.COMPLETED,
        status: ORDER_STATUS.COMPLETED,
      })
      .where(
        and(
          eq(ordersTable.id, orderId),
          eq(ordersTable.organizationId, organizationId),
          eq(ordersTable.status, order.status),
        ),
      )
      .returning({ id: ordersTable.id });

    if (updated.length === 0) {
      throw new OrderConcurrencyError();
    }

    await tx.insert(orderEventsTable).values({
      actorId: userId,
      actorType: 'store_user',
      eventType: ORDER_EVENT_TYPE.ORDER_COMPLETED,
      fromStatus: order.status,
      metadata: {
        reviewConversationThreadId: threadId,
      },
      orderId: order.id,
      organizationId,
      summary: 'Order completed by store.',
      toStatus: ORDER_STATUS.COMPLETED,
    });

    if (reviewRequest) {
      const writeResult = await writeOrderCustomerConversationMessage({
        aiAnalysis: order.aiAnalysis,
        body: reviewRequest,
        channel: conversationChannel,
        conversationIntent: 'review_request',
        conversationMetadata: reviewConversationMetadata,
        fallbackThreadId: `order-${order.id}-review`,
        orderId: order.id,
        organizationId,
        status: ORDER_STATUS.COMPLETED,
        tx,
      });

      await tx.insert(orderEventsTable).values({
        actorId: userId,
        actorType: 'ai_employee',
        eventType: ORDER_EVENT_TYPE.REVIEW_REQUESTED,
        fromStatus: ORDER_STATUS.COMPLETED,
        metadata: {
          channel: order.source ?? 'web',
          reviewConversationThreadId: threadId,
        },
        orderId: order.id,
        organizationId,
        summary: 'Review request prepared for customer.',
        toStatus: ORDER_STATUS.COMPLETED,
      });

      return writeResult;
    }

    return undefined;
  });

  if (reviewRequest && reviewWriteResult?.status === 'sent') {
    await sendWhatsAppOrderStatusNotification({
      aiAnalysis: order.aiAnalysis,
      body: reviewRequest,
      organizationId,
      reviewOrderId: order.id,
      source: order.source,
    });
  }

  revalidatePath(getI18nPath('/dashboard/orders', locale));
  revalidatePath(getI18nPath('/dashboard/ai-operations', locale));
};
