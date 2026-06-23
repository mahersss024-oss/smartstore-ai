import type { AIEmployeeConversationCart } from './AIEmployeeCart';
import type { AIEmployeeCustomerDetails } from './AIEmployeeCheckout';
import type {
  AIEmployeeDialogueState,
  AIEmployeeSemanticUnderstanding,
} from './AIEmployeeOrchestration';
import type {
  ConversationDecision,
  ConversationOrderItem,
} from './ConversationEngine';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import {
  orderEventsTable,
  ordersTable,
} from '@/models/Schema';
import {
  calculateAIEmployeeCartSubtotal,
  mergeAIEmployeeCartItems,
  toMoneyNumberOrZero,
} from './AIEmployeeCart';
import {
  calculateAIEmployeeOrderPricing,
  normalizeAIEmployeeFulfillmentType,
  resolveAIEmployeeOrderServiceMethodIds,
} from './AIEmployeeCheckout';
import { customerPhonesMatch } from './CustomerIdentity';
import { db } from './DB';
import { DELIVERY_STATUS, ORDER_EVENT_TYPE, ORDER_STATUS } from './OrderWorkflow';
import { assertCanCreateAiOrder } from './SubscriptionEntitlements';

export type AIEmployeeCustomerOrderSnapshot = {
  completed: AIEmployeeOrderSnapshot[];
  open: AIEmployeeOrderSnapshot[];
};

type AIEmployeeOrderSnapshot = {
  customerAddress?: null | string;
  customerPhone?: null | string;
  createdAt: string;
  deliveryStatus?: null | string;
  id: number;
  items: unknown;
  matchReasons: string[];
  status: string;
  totalPrice: string;
  updatedAt: string;
};

export type AIEmployeeSupportEscalationResult = {
  created: boolean;
  orderId?: number;
};

export type AIEmployeeCustomerFeedbackCaptureResult = {
  created: boolean;
  orderId?: number;
};

export type AIEmployeeOrderModificationResult = {
  created: boolean;
  deliveryFee?: number;
  items?: ConversationOrderItem[];
  orderId?: number;
  status?: string;
  subtotal?: number;
  totalPrice?: string;
};

export type AIEmployeeOrderCancellationResult = {
  applied: boolean;
  orderId?: number;
  reason?:
    | 'already_cancelled'
    | 'before_store_approval'
    | 'completed'
    | 'no_matching_order'
    | 'out_for_delivery'
    | 'preparing_or_approved'
    | 'ready_for_pickup'
    | 'state_changed';
  requested: boolean;
  requiresStoreReview: boolean;
  status?: string;
};

export type AIEmployeeAddOnOrderSnapshot = {
  customerDetails?: AIEmployeeCustomerDetails;
  items: ConversationOrderItem[];
  subtotal: number;
  updatedAt: string;
};

type OrderReference = {
  id: number;
};

const normalize = (value: string) => value.trim().toLowerCase();

const normalizeSearchText = (value?: null | string) => {
  return normalize(value ?? '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizePhoneDigits = (value?: null | string) => {
  return (value ?? '').replace(/\D/g, '');
};

const textHasOverlap = (first?: null | string, second?: null | string) => {
  const firstTokens = normalizeSearchText(first)
    .split(' ')
    .filter(token => token.length >= 3);
  const secondText = normalizeSearchText(second);

  if (firstTokens.length === 0 || !secondText) {
    return false;
  }

  return firstTokens.some(token => secondText.includes(token));
};

const readAIAnalysisExternalThreadId = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const data = value as { externalThreadId?: unknown };

  return typeof data.externalThreadId === 'string'
    ? data.externalThreadId
    : undefined;
};

export const canAIEmployeeModifyOrderBeforeStoreApproval = (status: string) => {
  return status === ORDER_STATUS.PENDING_STORE_REVIEW
    || status === ORDER_STATUS.DRAFT
    || status === ORDER_STATUS.SENT_TO_CUSTOMER
    || status === ORDER_STATUS.WAITING_PAYMENT;
};

export const isAIEmployeeOrderInDeliveryStage = (order: {
  deliveryStatus?: null | string;
  status: string;
}) => {
  return order.status === ORDER_STATUS.OUT_FOR_DELIVERY
    || order.deliveryStatus === DELIVERY_STATUS.OUT_FOR_DELIVERY;
};

export const canAIEmployeeAddItemsToExistingOrder = (order: {
  deliveryStatus?: null | string;
  status: string;
}) => {
  return !isAIEmployeeOrderInDeliveryStage(order)
    && order.status !== ORDER_STATUS.COMPLETED
    && order.status !== ORDER_STATUS.CANCELLED;
};

export const getMostRelevantAIEmployeeDeliveryStageOpenOrder = (
  customerOrders: AIEmployeeCustomerOrderSnapshot,
) => {
  return customerOrders.open.find((order) => {
    return isAIEmployeeOrderInDeliveryStage(order);
  });
};

export const buildAIEmployeeAddOnOrderSnapshot = (
  items: ConversationOrderItem[],
  customerDetails?: AIEmployeeCustomerDetails,
): AIEmployeeAddOnOrderSnapshot => ({
  customerDetails,
  items: items.map(item => ({ ...item })),
  subtotal: calculateAIEmployeeCartSubtotal(items),
  updatedAt: new Date().toISOString(),
});

export const loadAIEmployeeOrderLifecycleState = async (params: {
  orderId: number;
  organizationId: string;
}) => {
  const [order] = await db
    .select({
      deliveryStatus: ordersTable.deliveryStatus,
      id: ordersTable.id,
      status: ordersTable.status,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, params.orderId),
        eq(ordersTable.organizationId, params.organizationId),
        isNull(ordersTable.archivedAt),
      ),
    )
    .limit(1);

  return order ?? null;
};

export const getAIEmployeeOrderCancellationPolicy = (order: {
  deliveryStatus?: null | string;
  status: string;
}) => {
  if (canAIEmployeeModifyOrderBeforeStoreApproval(order.status)) {
    return {
      canCancelAutomatically: true,
      reason: 'before_store_approval' as const,
      requiresStoreReview: false,
    };
  }

  if (isAIEmployeeOrderInDeliveryStage(order)) {
    return {
      canCancelAutomatically: false,
      reason: 'out_for_delivery' as const,
      requiresStoreReview: true,
    };
  }

  if (order.status === ORDER_STATUS.READY_FOR_PICKUP) {
    return {
      canCancelAutomatically: false,
      reason: 'ready_for_pickup' as const,
      requiresStoreReview: true,
    };
  }

  if (
    order.status === ORDER_STATUS.APPROVED_BY_STORE
    || order.status === ORDER_STATUS.CONFIRMED
    || order.status === ORDER_STATUS.PREPARING
  ) {
    return {
      canCancelAutomatically: false,
      reason: 'preparing_or_approved' as const,
      requiresStoreReview: true,
    };
  }

  if (order.status === ORDER_STATUS.COMPLETED) {
    return {
      canCancelAutomatically: false,
      reason: 'completed' as const,
      requiresStoreReview: false,
    };
  }

  return {
    canCancelAutomatically: false,
    reason: 'already_cancelled' as const,
    requiresStoreReview: false,
  };
};

const orderItemsMatchCart = (
  orderItems: unknown,
  cart?: AIEmployeeConversationCart,
) => {
  if (!cart?.items.length || !Array.isArray(orderItems)) {
    return false;
  }

  return cart.items.some((cartItem) => {
    return orderItems.some((orderItem) => {
      if (!orderItem || typeof orderItem !== 'object') {
        return false;
      }

      const item = orderItem as {
        name?: unknown;
        productId?: unknown;
      };

      return item.productId === cartItem.productId
        || (
          typeof item.name === 'string'
          && normalizeSearchText(item.name) === normalizeSearchText(cartItem.name)
        );
    });
  });
};

const scoreOrderMatch = (params: {
  currentCart?: AIEmployeeConversationCart;
  customerAddress?: string;
  customerEmail?: string;
  customerPhone?: string;
  externalThreadId: string;
  lastOrder?: OrderReference;
  order: {
    aiAnalysis: unknown;
    customerAddress: null | string;
    customerEmail: null | string;
    customerPhone: null | string;
    id: number;
    items: unknown;
  };
  referencedOrderId?: null | number;
}) => {
  const reasons: string[] = [];
  let score = 0;

  if (
    params.order.id === params.currentCart?.orderId
    || params.order.id === params.lastOrder?.id
  ) {
    score += 100;
    reasons.push('order_reference');
  }

  const orderPhone = normalizePhoneDigits(params.order.customerPhone);
  const customerPhone = normalizePhoneDigits(params.customerPhone);
  if (orderPhone && customerPhone && customerPhonesMatch(orderPhone, customerPhone)) {
    score += orderPhone === customerPhone ? 80 : 65;
    reasons.push(orderPhone === customerPhone ? 'phone_exact' : 'phone_equivalent');
  }

  if (
    params.customerEmail
    && params.order.customerEmail
    && normalize(params.customerEmail) === normalize(params.order.customerEmail)
  ) {
    score += 80;
    reasons.push('email');
  }

  const orderThreadId = readAIAnalysisExternalThreadId(params.order.aiAnalysis);
  if (orderThreadId && orderThreadId === params.externalThreadId) {
    score += 90;
    reasons.push('conversation');
  }

  if (textHasOverlap(params.customerAddress, params.order.customerAddress)) {
    score += 35;
    reasons.push('address');
  }

  if (orderItemsMatchCart(params.order.items, params.currentCart)) {
    score += 25;
    reasons.push('items');
  }

  // referencedOrderId boosts priority only among already-verified customer orders
  if (params.order.id === params.referencedOrderId && score > 0) {
    score += 20;
    reasons.push('order_reference_hint');
  }

  return { reasons, score };
};

export const loadAIEmployeeCustomerOrderSnapshot = async (params: {
  currentCart?: AIEmployeeConversationCart;
  customerAddress?: string;
  customerEmail?: string;
  customerPhone?: string;
  externalThreadId: string;
  lastOrder?: OrderReference;
  organizationId: string;
  referencedOrderId?: null | number;
}): Promise<AIEmployeeCustomerOrderSnapshot> => {
  const conditions = [
    params.customerEmail ? eq(ordersTable.customerEmail, params.customerEmail) : null,
    params.customerPhone ? eq(ordersTable.customerPhone, params.customerPhone) : null,
    params.currentCart?.orderId ? eq(ordersTable.id, params.currentCart.orderId) : null,
    params.lastOrder?.id ? eq(ordersTable.id, params.lastOrder.id) : null,
  ].filter(condition => condition !== null);

  const customerCondition = conditions.length === 1
    ? conditions[0]
    : conditions.length > 1
      ? or(...conditions)
      : undefined;
  const orderSelect = {
    aiAnalysis: ordersTable.aiAnalysis,
    createdAt: ordersTable.createdAt,
    customerAddress: ordersTable.customerAddress,
    customerEmail: ordersTable.customerEmail,
    customerPhone: ordersTable.customerPhone,
    deliveryStatus: ordersTable.deliveryStatus,
    id: ordersTable.id,
    items: ordersTable.items,
    status: ordersTable.status,
    totalPrice: ordersTable.totalPrice,
    updatedAt: ordersTable.updatedAt,
  };
  const rows = customerCondition
    ? await db
        .select(orderSelect)
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.organizationId, params.organizationId),
            isNull(ordersTable.archivedAt),
            customerCondition,
          ),
        )
        .orderBy(desc(ordersTable.updatedAt))
        .limit(20)
    : await db
        .select(orderSelect)
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.organizationId, params.organizationId),
            isNull(ordersTable.archivedAt),
          ),
        )
        .orderBy(desc(ordersTable.updatedAt))
        .limit(40);
  const normalizedRows = rows
    .map((row) => {
      const match = scoreOrderMatch({
        currentCart: params.currentCart,
        customerAddress: params.customerAddress,
        customerEmail: params.customerEmail,
        customerPhone: params.customerPhone,
        externalThreadId: params.externalThreadId,
        lastOrder: params.lastOrder,
        order: row,
        referencedOrderId: params.referencedOrderId,
      });

      return {
        createdAt: row.createdAt.toISOString(),
        customerAddress: row.customerAddress,
        customerPhone: row.customerPhone,
        deliveryStatus: row.deliveryStatus,
        id: row.id,
        items: row.items,
        matchReasons: match.reasons,
        matchScore: match.score,
        status: row.status,
        totalPrice: row.totalPrice,
        updatedAt: row.updatedAt.toISOString(),
      };
    })
    .filter(row => row.matchScore > 0)
    .sort((first, second) => {
      return second.matchScore - first.matchScore
        || new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime();
    })
    .slice(0, 10)
    .map(({ matchScore: _matchScore, ...row }) => row);

  return {
    completed: normalizedRows.filter(row => row.status === ORDER_STATUS.COMPLETED),
    open: normalizedRows.filter((row) => {
      return row.status !== ORDER_STATUS.COMPLETED
        && row.status !== ORDER_STATUS.CANCELLED;
    }),
  };
};

const findSupportEscalationOrder = async (params: {
  currentCart?: AIEmployeeConversationCart;
  customerEmail?: string;
  customerPhone?: string;
  lastOrder?: OrderReference;
  organizationId: string;
  referencedOrderId?: null | number;
}) => {
  const explicitOrderId = params.currentCart?.orderId
    ?? params.lastOrder?.id;

  if (explicitOrderId) {
    const [order] = await db
      .select({
        id: ordersTable.id,
        status: ordersTable.status,
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.id, explicitOrderId),
          eq(ordersTable.organizationId, params.organizationId),
          isNull(ordersTable.archivedAt),
        ),
      )
      .limit(1);

    if (order) {
      return order;
    }
  }

  const conditions = [
    params.customerEmail ? eq(ordersTable.customerEmail, params.customerEmail) : null,
    params.customerPhone ? eq(ordersTable.customerPhone, params.customerPhone) : null,
  ].filter(condition => condition !== null);

  if (conditions.length === 0) {
    return null;
  }

  const customerCondition = conditions.length === 1
    ? conditions[0]
    : or(...conditions);
  const [order] = await db
    .select({
      id: ordersTable.id,
      status: ordersTable.status,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.organizationId, params.organizationId),
        isNull(ordersTable.archivedAt),
        customerCondition,
      ),
    )
    .orderBy(desc(ordersTable.updatedAt))
    .limit(1);

  return order ?? null;
};

const shouldCreateSupportEscalation = (params: {
  previousDialogueState?: AIEmployeeDialogueState;
  semanticUnderstanding: AIEmployeeSemanticUnderstanding;
}) => {
  return params.semanticUnderstanding.supportEscalationConfirmed === true
    || (
      params.semanticUnderstanding.customerConfirmedOrder === true
      && (
        params.previousDialogueState === 'complaint'
        || params.previousDialogueState === 'order_followup'
        || params.previousDialogueState === 'post_purchase_support'
      )
    );
};

export const createAIEmployeeSupportEscalationEvent = async (params: {
  conversationId: number;
  currentCart?: AIEmployeeConversationCart;
  customerEmail?: string;
  customerPhone?: string;
  lastOrder?: OrderReference;
  message: string;
  organizationId: string;
  previousDialogueState?: AIEmployeeDialogueState;
  referencedOrderId?: null | number;
  semanticUnderstanding: AIEmployeeSemanticUnderstanding;
  supportIssue?: {
    capturedAt: string;
    message: string;
    referencedOrderId?: null | number;
  } | null;
}): Promise<AIEmployeeSupportEscalationResult> => {
  if (!shouldCreateSupportEscalation({
    previousDialogueState: params.previousDialogueState,
    semanticUnderstanding: params.semanticUnderstanding,
  })) {
    return { created: false };
  }

  const order = await findSupportEscalationOrder({
    currentCart: params.currentCart,
    customerEmail: params.customerEmail,
    customerPhone: params.customerPhone,
    lastOrder: params.lastOrder,
    organizationId: params.organizationId,
    referencedOrderId: params.referencedOrderId,
  });

  if (!order) {
    return { created: false };
  }

  const complaintMessage = params.supportIssue?.message?.trim() || params.message;

  await db.insert(orderEventsTable).values({
    actorType: 'ai_employee',
    eventType: ORDER_EVENT_TYPE.CUSTOMER_COMPLAINT,
    fromStatus: order.status,
    metadata: {
      conversationId: params.conversationId,
      confirmationMessage: params.message,
      customerMessage: complaintMessage,
      source: 'ai_employee_chat',
      supportIssueCapturedAt: params.supportIssue?.capturedAt ?? null,
    },
    orderId: order.id,
    organizationId: params.organizationId,
    summary: 'Customer support issue escalated from AI chat.',
    toStatus: order.status,
  });

  return {
    created: true,
    orderId: order.id,
  };
};

export const createAIEmployeeCustomerFeedbackEvent = async (params: {
  conversationId: number;
  customerOrders: AIEmployeeCustomerOrderSnapshot;
  message: string;
  organizationId: string;
  preferredOrderId?: null | number;
  sourceChannel: string;
}): Promise<AIEmployeeCustomerFeedbackCaptureResult> => {
  const message = params.message.trim();

  if (!message) {
    return { created: false };
  }

  const preferredOrder = params.preferredOrderId
    ? [...params.customerOrders.completed, ...params.customerOrders.open].find((order) => {
        return order.id === params.preferredOrderId;
      })
    : undefined;
  const order = preferredOrder
    ?? params.customerOrders.completed[0]
    ?? params.customerOrders.open[0];

  if (!order) {
    return { created: false };
  }

  await db.insert(orderEventsTable).values({
    actorType: 'customer',
    eventType: ORDER_EVENT_TYPE.CUSTOMER_COMPLAINT,
    fromStatus: order.status,
    metadata: {
      conversationId: params.conversationId,
      customerMessage: message,
      source: 'whatsapp_chat_feedback',
      sourceChannel: params.sourceChannel,
    },
    orderId: order.id,
    organizationId: params.organizationId,
    summary: 'Customer feedback captured from WhatsApp chat.',
    toStatus: order.status,
  });

  return {
    created: true,
    orderId: order.id,
  };
};

export const createAIEmployeeDraftOrder = async (params: {
  addOnOrderContext?: unknown;
  aiAnalysis: ConversationDecision;
  conversationId?: number;
  customerAddress?: string;
  customerDetails?: AIEmployeeCustomerDetails;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
  externalThreadId?: string;
  items: ConversationOrderItem[];
  organizationId: string;
  source: string;
}) => {
  if (params.items.length === 0 || params.aiAnalysis.missingDetails.length > 0) {
    return null;
  }

  await assertCanCreateAiOrder(params.organizationId);

  const subtotal = calculateAIEmployeeCartSubtotal(params.items);
  const serviceMethodIds = await resolveAIEmployeeOrderServiceMethodIds({
    customerDetails: params.customerDetails,
    organizationId: params.organizationId,
  });
  const fulfillmentType = normalizeAIEmployeeFulfillmentType(
    params.customerDetails?.fulfillmentType,
    params.customerDetails?.deliveryPreference,
  );
  const orderCustomerAddress = fulfillmentType === 'delivery'
    ? params.customerAddress?.trim() || undefined
    : undefined;
  const pricing = calculateAIEmployeeOrderPricing({
    customerDetails: params.customerDetails,
    deliveryFee: serviceMethodIds.deliveryFee,
    subtotal,
  });

  const [order] = await db.transaction(async (tx) => {
    const [createdOrder] = await tx
      .insert(ordersTable)
      .values({
        aiAnalysis: {
          ...params.aiAnalysis,
          addOnOrderContext: params.addOnOrderContext ?? null,
          conversationId: params.conversationId ?? null,
          customerDetails: params.customerDetails ?? null,
          externalThreadId: params.externalThreadId ?? null,
          fulfillment: {
            deliveryFee: pricing.deliveryFee.toFixed(2),
            deliveryPreference: params.customerDetails?.deliveryPreference ?? null,
            paymentPreference: params.customerDetails?.paymentPreference ?? null,
            subtotal: pricing.subtotal.toFixed(2),
            total: pricing.total.toFixed(2),
            type: fulfillmentType ?? null,
          },
        },
        customerAddress: orderCustomerAddress,
        customerConfirmationAt: new Date(),
        customerEmail: params.customerEmail,
        customerName: params.customerName,
        customerPhone: params.customerPhone,
        deliveryMethodId: serviceMethodIds.deliveryMethodId ?? null,
        items: params.items,
        notes: params.aiAnalysis.missingDetails.length > 0
          ? `Missing details: ${params.aiAnalysis.missingDetails.join(', ')}`
          : null,
        organizationId: params.organizationId,
        paymentMethodId: serviceMethodIds.paymentMethodId ?? null,
        source: params.source,
        status: ORDER_STATUS.PENDING_STORE_REVIEW,
        totalPrice: pricing.total.toFixed(2),
      })
      .returning({ id: ordersTable.id });

    if (createdOrder?.id) {
      await tx.insert(orderEventsTable).values({
        actorType: 'ai_employee',
        eventType: ORDER_EVENT_TYPE.ORDER_CREATED,
        fromStatus: null,
        metadata: {
          addOnOrderContext: params.addOnOrderContext ?? null,
          source: params.source,
        },
        orderId: createdOrder.id,
        organizationId: params.organizationId,
        summary: 'Order created after customer confirmation.',
        toStatus: ORDER_STATUS.PENDING_STORE_REVIEW,
      });
    }

    return [createdOrder];
  });

  return order?.id ?? null;
};

const normalizeOrderItemsForUpdate = (items: unknown): ConversationOrderItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return undefined;
      }

      const data = item as {
        name?: unknown;
        productId?: unknown;
        quantity?: unknown;
        unitPrice?: unknown;
      };

      if (
        typeof data.name !== 'string'
        || typeof data.productId !== 'number'
        || typeof data.quantity !== 'number'
      ) {
        return undefined;
      }

      return {
        name: data.name,
        productId: data.productId,
        quantity: data.quantity,
        unitPrice: Number(data.unitPrice ?? 0),
      };
    })
    .filter((item): item is ConversationOrderItem => Boolean(item));
};

export const addAIEmployeeItemsToExistingOrder = async (params: {
  conversationId: number;
  items: ConversationOrderItem[];
  orderId: number;
  organizationId: string;
}): Promise<AIEmployeeOrderModificationResult> => {
  const [order] = await db
    .select({
      deliveryStatus: ordersTable.deliveryStatus,
      items: ordersTable.items,
      status: ordersTable.status,
      totalPrice: ordersTable.totalPrice,
      updatedAt: ordersTable.updatedAt,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.id, params.orderId),
        eq(ordersTable.organizationId, params.organizationId),
        isNull(ordersTable.archivedAt),
      ),
    )
    .limit(1);

  if (!order || !canAIEmployeeAddItemsToExistingOrder(order)) {
    return { created: false };
  }

  const previousItems = normalizeOrderItemsForUpdate(order.items);
  const mergedItems = mergeAIEmployeeCartItems(previousItems, params.items);
  const previousItemsSubtotal = calculateAIEmployeeCartSubtotal(previousItems);
  const previousDeliveryFee = Math.max(
    0,
    toMoneyNumberOrZero(order.totalPrice) - previousItemsSubtotal,
  );
  const subtotal = calculateAIEmployeeCartSubtotal(mergedItems);
  const totalPrice = (subtotal + previousDeliveryFee).toFixed(2);

  let orderWasUpdated = false;

  await db.transaction(async (tx) => {
    const updated = await tx
      .update(ordersTable)
      .set({
        items: mergedItems,
        totalPrice,
      })
      .where(
        and(
          eq(ordersTable.id, params.orderId),
          eq(ordersTable.organizationId, params.organizationId),
          eq(ordersTable.updatedAt, order.updatedAt),
          isNull(ordersTable.archivedAt),
        ),
      )
      .returning({ id: ordersTable.id });

    if (updated.length === 0) {
      return;
    }

    orderWasUpdated = true;

    await tx.insert(orderEventsTable).values({
      actorType: 'ai_employee',
      eventType: ORDER_EVENT_TYPE.ORDER_UPDATED,
      fromStatus: order.status,
      metadata: {
        addedItems: params.items,
        conversationId: params.conversationId,
      },
      orderId: params.orderId,
      organizationId: params.organizationId,
      summary: 'Order items updated from AI chat after customer confirmation.',
      toStatus: order.status,
    });
  });

  if (!orderWasUpdated) {
    return { created: false };
  }

  return {
    created: true,
    deliveryFee: previousDeliveryFee,
    items: mergedItems,
    orderId: params.orderId,
    status: order.status,
    subtotal,
    totalPrice,
  };
};

export const handleAIEmployeeOrderCancellationRequest = async (params: {
  conversationId: number;
  customerOrders: AIEmployeeCustomerOrderSnapshot;
  organizationId: string;
  preferredOrderId?: null | number;
  requested: boolean;
}): Promise<AIEmployeeOrderCancellationResult> => {
  if (!params.requested) {
    return {
      applied: false,
      requested: false,
      requiresStoreReview: false,
    };
  }

  const order = params.preferredOrderId
    ? params.customerOrders.open.find(candidate => candidate.id === params.preferredOrderId)
    : params.customerOrders.open[0];
  if (!order) {
    return {
      applied: false,
      reason: 'no_matching_order',
      requested: true,
      requiresStoreReview: false,
    };
  }

  const policy = getAIEmployeeOrderCancellationPolicy(order);

  if (policy.canCancelAutomatically) {
    let orderWasCancelled = false;

    await db.transaction(async (tx) => {
      const updated = await tx
        .update(ordersTable)
        .set({
          status: ORDER_STATUS.CANCELLED,
        })
        .where(
          and(
            eq(ordersTable.id, order.id),
            eq(ordersTable.organizationId, params.organizationId),
            eq(ordersTable.status, order.status),
            isNull(ordersTable.archivedAt),
          ),
        )
        .returning({ id: ordersTable.id });

      if (updated.length === 0) {
        return;
      }

      orderWasCancelled = true;

      await tx.insert(orderEventsTable).values({
        actorType: 'ai_employee',
        eventType: ORDER_EVENT_TYPE.STATUS_CHANGED,
        fromStatus: order.status,
        metadata: {
          cancellationReason: policy.reason,
          conversationId: params.conversationId,
          source: 'ai_employee_chat',
        },
        orderId: order.id,
        organizationId: params.organizationId,
        summary: 'Customer cancellation request accepted before store approval.',
        toStatus: ORDER_STATUS.CANCELLED,
      });
    });

    if (!orderWasCancelled) {
      return {
        applied: false,
        orderId: order.id,
        reason: 'state_changed',
        requested: true,
        requiresStoreReview: false,
      };
    }

    return {
      applied: true,
      orderId: order.id,
      reason: policy.reason,
      requested: true,
      requiresStoreReview: false,
      status: ORDER_STATUS.CANCELLED,
    };
  }

  if (policy.requiresStoreReview) {
    await db.insert(orderEventsTable).values({
      actorType: 'ai_employee',
      eventType: ORDER_EVENT_TYPE.STATUS_CHANGED,
      fromStatus: order.status,
      metadata: {
        cancellationReason: policy.reason,
        cancellationRequested: true,
        conversationId: params.conversationId,
        deliveryStatus: order.deliveryStatus ?? null,
        source: 'ai_employee_chat',
      },
      orderId: order.id,
      organizationId: params.organizationId,
      summary: 'Customer requested order cancellation for store review.',
      toStatus: order.status,
    });
  }

  return {
    applied: false,
    orderId: order.id,
    reason: policy.reason,
    requested: true,
    requiresStoreReview: policy.requiresStoreReview,
    status: order.status,
  };
};
