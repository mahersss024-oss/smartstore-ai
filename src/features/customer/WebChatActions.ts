'use server';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';
import { handleCustomerMessageWithAIEmployee } from '@/features/ai/AIEmployeeAgent';
import { AIEmployeePermissionError } from '@/libs/AIActionPermissions';
import { aiEmployeeSemanticHintsSchema } from '@/libs/AIEmployeeSemanticHints';
import { readOrderIdFromConversationMetadata } from '@/libs/ConversationMetadata';
import {
  customerPhonesMatch,
  getCustomerPhoneIdentityVariants,
} from '@/libs/CustomerIdentity';
import { db } from '@/libs/DB';
import { ORDER_EVENT_TYPE, ORDER_STATUS } from '@/libs/OrderWorkflow';
import {
  checkPublicMessageRateLimit,
  checkPublicReadRateLimit,
  PublicEndpointRateLimitError,
} from '@/libs/PublicEndpointRateLimit';
import {
  assertStoreFeatureEnabled,
  StoreFeatureDisabledError,
  StoreSubscriptionInactiveError,
} from '@/libs/StoreServiceControls';
import { isSubscriptionLimitError } from '@/libs/SubscriptionEntitlements';
import {
  conversationMessagesTable,
  conversationsTable,
  customerReviewsTable,
  customersTable,
  orderEventsTable,
  ordersTable,
} from '@/models/Schema';

const webChatMessageSchema = z.object({
  body: z.string().min(1).max(4000),
  clientSubmissionId: z.string().min(1).max(255).optional(),
  customer: z.object({
    email: z.string().email().optional().or(z.literal('')),
    externalId: z.string().min(1).max(255),
    name: z.string().max(255).optional(),
    phone: z.string().max(50).optional(),
  }),
  externalThreadId: z.string().min(1).max(255),
  locale: z.string().min(2).max(10).optional(),
  organizationId: z.string().min(1),
  semanticHints: aiEmployeeSemanticHintsSchema.optional(),
  source: z.string().min(1).max(50).default('web_chat'),
  suppressCustomerEcho: z.boolean().optional(),
});

const webChatMessagesSchema = z.object({
  customerExternalId: z.string().min(1).max(255),
  externalThreadId: z.string().min(1).max(255),
  organizationId: z.string().min(1),
  source: z.string().min(1).max(50).default('web_chat'),
});

const webOrderFeedbackSchema = z.object({
  customerExternalId: z.string().min(1).max(255),
  externalThreadId: z.string().min(1).max(255),
  message: z.string().max(1000).optional().default(''),
  organizationId: z.string().min(1),
  rating: z.number().int().min(1).max(5).optional(),
  source: z.string().min(1).max(50).default('web_chat'),
}).refine((value) => {
  return Boolean(value.rating) || value.message.trim().length > 0;
}, {
  message: 'rating_or_message_required',
  path: ['message'],
});

const trackedOrderFeedbackSchema = z.object({
  message: z.string().max(1000).optional().default(''),
  orderId: z.number().int().positive(),
  organizationId: z.string().min(1),
  phone: z.string().min(1).max(50),
  rating: z.number().int().min(1).max(5).optional(),
}).refine((value) => {
  return Boolean(value.rating) || value.message.trim().length > 0;
}, {
  message: 'rating_or_message_required',
  path: ['message'],
});

const normalizePhoneDigits = (value?: null | string) => {
  return value?.replace(/\D/g, '') ?? '';
};

const sendCustomerChatMessage = async (
  input: z.infer<typeof webChatMessageSchema>,
  options?: {
    exposeInternalOrchestration?: boolean;
    trustedWebhookIngress?: boolean;
  },
) => {
  try {
    const payload = webChatMessageSchema.parse(input);
    const requestHeaders = await headers();
    const channel = payload.source === 'web' ? 'web_chat' : payload.source;
    const ipAddress = options?.trustedWebhookIngress
      ? null
      : requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? requestHeaders.get('x-real-ip');

    await checkPublicMessageRateLimit({
      channel,
      customerExternalId: payload.customer.externalId,
      externalThreadId: payload.externalThreadId,
      ipAddress,
      organizationId: payload.organizationId,
    });

    await assertStoreFeatureEnabled(payload.organizationId, 'webOrders');
    await assertStoreFeatureEnabled(payload.organizationId, 'ai');

    const result = await handleCustomerMessageWithAIEmployee({
      body: payload.body,
      channel,
      clientSubmissionId: payload.clientSubmissionId,
      customer: {
        email: payload.customer.email || undefined,
        externalId: payload.customer.externalId,
        name: payload.customer.name?.trim() || undefined,
        phone: payload.customer.phone?.trim() || undefined,
      },
      customerAddress: undefined,
      externalThreadId: payload.externalThreadId,
      locale: payload.locale,
      organizationId: payload.organizationId,
      semanticHints: payload.semanticHints,
      suppressCustomerEcho: payload.suppressCustomerEcho,
    });
    const { aiOrchestration: _aiOrchestration, ...customerResult } = result;

    return {
      data: options?.exposeInternalOrchestration ? result : customerResult,
      ok: true as const,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        error: 'invalid_message',
        issues: error.issues,
        ok: false as const,
      };
    }

    if (error instanceof PublicEndpointRateLimitError) {
      return {
        error: 'too_many_messages',
        retryAfterSeconds: error.retryAfterSeconds,
        ok: false as const,
      };
    }

    if (error instanceof StoreFeatureDisabledError) {
      return {
        error: 'store_feature_disabled',
        feature: error.feature,
        ok: false as const,
      };
    }

    if (error instanceof StoreSubscriptionInactiveError) {
      return {
        error: 'store_subscription_inactive',
        ok: false as const,
        reason: error.reason,
        subscriptionStatus: error.subscriptionStatus,
      };
    }

    if (error instanceof AIEmployeePermissionError) {
      return {
        actionType: error.actionType,
        error: 'ai_action_disabled',
        ok: false as const,
        requiredPermission: error.requiredPermission,
      };
    }

    if (isSubscriptionLimitError(error)) {
      return {
        error: 'subscription_limit_reached',
        feature: error.feature,
        limit: error.limit,
        ok: false as const,
        used: error.used,
      };
    }

    return {
      error: 'system_unavailable',
      ok: false as const,
    };
  }
};

export const sendWebChatMessage = async (input: z.infer<typeof webChatMessageSchema>) => {
  return sendCustomerChatMessage(input);
};

export const sendTrustedWebhookChatMessage = async (
  input: z.infer<typeof webChatMessageSchema>,
) => {
  return sendCustomerChatMessage(input, {
    exposeInternalOrchestration: true,
    trustedWebhookIngress: true,
  });
};

export const getWebChatMessages = async (input: z.infer<typeof webChatMessagesSchema>) => {
  const payload = webChatMessagesSchema.parse(input);
  const channel = payload.source === 'web' ? 'web_chat' : payload.source;
  const requestHeaders = await headers();

  try {
    await checkPublicReadRateLimit({
      channel: `${channel}:read`,
      customerExternalId: payload.customerExternalId,
      externalThreadId: payload.externalThreadId,
      ipAddress: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? requestHeaders.get('x-real-ip'),
      organizationId: payload.organizationId,
    });
  } catch (error) {
    if (error instanceof PublicEndpointRateLimitError) {
      return {
        data: [],
        error: 'too_many_read_requests',
        ok: false as const,
        retryAfterSeconds: error.retryAfterSeconds,
      };
    }

    throw error;
  }

  await assertStoreFeatureEnabled(payload.organizationId, 'webOrders');
  await assertStoreFeatureEnabled(payload.organizationId, 'ai');

  const [conversation] = await db
    .select({ customerId: conversationsTable.customerId, id: conversationsTable.id })
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.organizationId, payload.organizationId),
        eq(conversationsTable.channel, channel),
        eq(conversationsTable.externalThreadId, payload.externalThreadId),
      ),
    )
    .limit(1);

  if (!conversation?.id) {
    return {
      data: [],
      ok: true as const,
    };
  }

  const [authorizedConversation] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .innerJoin(customersTable, eq(conversationsTable.customerId, customersTable.id))
    .where(
      and(
        eq(conversationsTable.id, conversation.id),
        eq(customersTable.organizationId, payload.organizationId),
        eq(customersTable.sourceChannel, channel),
        eq(customersTable.externalId, payload.customerExternalId),
      ),
    )
    .limit(1);

  if (!authorizedConversation?.id) {
    return {
      data: [],
      ok: true as const,
    };
  }

  const rows = await db
    .select({
      body: conversationMessagesTable.body,
      createdAt: sql<string>`${conversationMessagesTable.createdAt}::text`,
      direction: conversationMessagesTable.direction,
      id: conversationMessagesTable.id,
      metadata: conversationMessagesTable.metadata,
      senderType: conversationMessagesTable.senderType,
    })
    .from(conversationMessagesTable)
    .where(
      and(
        eq(conversationMessagesTable.organizationId, payload.organizationId),
        eq(conversationMessagesTable.conversationId, conversation.id),
      ),
    )
    .orderBy(desc(conversationMessagesTable.id))
    .limit(500);

  return {
    data: rows.reverse().map((row) => {
      const raw = row.metadata as Record<string, unknown> | null;
      const metadata = raw
        ? {
            cancelledCartSnapshot: raw.cancelledCartSnapshot,
            clientSubmissionId: raw.clientSubmissionId,
            currentCart: raw.currentCart,
            customerDetails: raw.customerDetails,
            missingDetails: raw.missingDetails,
            orderId: raw.orderId,
            productCards: raw.productCards,
            shouldDisplayInChat: raw.shouldDisplayInChat,
            visibleSystemActions: raw.visibleSystemActions,
          }
        : null;

      return { ...row, createdAt: row.createdAt, metadata };
    }),
    ok: true as const,
  };
};

export const submitWebOrderFeedback = async (input: z.infer<typeof webOrderFeedbackSchema>) => {
  const payload = webOrderFeedbackSchema.parse(input);
  const channel = payload.source === 'web' ? 'web_chat' : payload.source;
  const requestHeaders = await headers();

  try {
    await checkPublicMessageRateLimit({
      channel: `${channel}:feedback`,
      customerExternalId: payload.customerExternalId,
      externalThreadId: payload.externalThreadId,
      ipAddress: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? requestHeaders.get('x-real-ip'),
      organizationId: payload.organizationId,
    });
  } catch (error) {
    if (error instanceof PublicEndpointRateLimitError) {
      return {
        error: 'too_many_feedback_requests',
        ok: false as const,
        retryAfterSeconds: error.retryAfterSeconds,
      };
    }

    throw error;
  }

  await assertStoreFeatureEnabled(payload.organizationId, 'webOrders');

  const [conversation] = await db
    .select({
      customerId: customersTable.id,
      id: conversationsTable.id,
      metadata: conversationsTable.metadata,
    })
    .from(conversationsTable)
    .innerJoin(customersTable, eq(conversationsTable.customerId, customersTable.id))
    .where(
      and(
        eq(conversationsTable.organizationId, payload.organizationId),
        eq(conversationsTable.channel, channel),
        eq(conversationsTable.externalThreadId, payload.externalThreadId),
        eq(customersTable.organizationId, payload.organizationId),
        eq(customersTable.sourceChannel, channel),
        eq(customersTable.externalId, payload.customerExternalId),
      ),
    )
    .limit(1);

  if (!conversation?.id) {
    return {
      error: 'conversation_not_found',
      ok: false as const,
    };
  }

  const metadataOrderId = readOrderIdFromConversationMetadata(conversation.metadata);
  if (!metadataOrderId) {
    return {
      error: 'order_not_found',
      ok: false as const,
    };
  }

  const [order] = await db
    .select({
      id: ordersTable.id,
      status: ordersTable.status,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.organizationId, payload.organizationId),
        eq(ordersTable.id, metadataOrderId),
      ),
    )
    .limit(1);

  if (!order?.id) {
    return {
      error: 'order_not_found',
      ok: false as const,
    };
  }

  const message = payload.message.trim();

  if (payload.rating) {
    if (order.status !== ORDER_STATUS.COMPLETED) {
      return {
        error: 'order_not_completed',
        ok: false as const,
      };
    }

    await db
      .insert(customerReviewsTable)
      .values({
        comment: message || null,
        customerId: conversation.customerId,
        metadata: {
          conversationId: conversation.id,
          source: 'web_order_feedback_panel',
        },
        orderId: order.id,
        organizationId: payload.organizationId,
        rating: payload.rating,
        sourceChannel: channel,
      })
      .onConflictDoUpdate({
        set: {
          comment: message || null,
          metadata: {
            conversationId: conversation.id,
            source: 'web_order_feedback_panel',
          },
          rating: payload.rating,
          sourceChannel: channel,
        },
        target: [
          customerReviewsTable.organizationId,
          customerReviewsTable.orderId,
          customerReviewsTable.customerId,
        ],
      });
  } else {
    await db.insert(orderEventsTable).values({
      actorType: 'customer',
      eventType: ORDER_EVENT_TYPE.CUSTOMER_COMPLAINT,
      fromStatus: order.status,
      metadata: {
        conversationId: conversation.id,
        customerMessage: message,
        source: 'web_order_feedback_panel',
      },
      orderId: order.id,
      organizationId: payload.organizationId,
      summary: 'Customer feedback submitted from web order panel.',
      toStatus: order.status,
    });
  }

  return {
    ok: true as const,
    orderId: order.id,
    reviewCaptured: Boolean(payload.rating),
  };
};

export const submitTrackedOrderFeedback = async (
  input: z.infer<typeof trackedOrderFeedbackSchema>,
) => {
  const payload = trackedOrderFeedbackSchema.parse(input);
  const requestHeaders = await headers();
  const customerPhone = normalizePhoneDigits(payload.phone);

  try {
    await checkPublicMessageRateLimit({
      channel: 'order_tracking:feedback',
      customerExternalId: customerPhone,
      externalThreadId: `track:${payload.organizationId}:${payload.orderId}:${customerPhone}`,
      ipAddress: requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? requestHeaders.get('x-real-ip'),
      organizationId: payload.organizationId,
    });
  } catch (error) {
    if (error instanceof PublicEndpointRateLimitError) {
      return {
        error: 'too_many_feedback_requests',
        ok: false as const,
        retryAfterSeconds: error.retryAfterSeconds,
      };
    }

    throw error;
  }

  await assertStoreFeatureEnabled(payload.organizationId, 'webOrders');

  const [order] = await db
    .select({
      customerPhone: ordersTable.customerPhone,
      id: ordersTable.id,
      source: ordersTable.source,
      status: ordersTable.status,
    })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.organizationId, payload.organizationId),
        eq(ordersTable.id, payload.orderId),
      ),
    )
    .limit(1);

  if (!order?.id || !customerPhonesMatch(payload.phone, order.customerPhone)) {
    return {
      error: 'order_not_found',
      ok: false as const,
    };
  }

  const [customer] = await db
    .select({ id: customersTable.id })
    .from(customersTable)
    .where(
      and(
        eq(customersTable.organizationId, payload.organizationId),
        eq(customersTable.sourceChannel, order.source ?? 'web_chat'),
        inArray(
          customersTable.externalId,
          getCustomerPhoneIdentityVariants(payload.phone),
        ),
      ),
    )
    .limit(1);
  const message = payload.message.trim();
  const sourceChannel = order.source ?? 'order_tracking';

  if (payload.rating) {
    if (order.status !== ORDER_STATUS.COMPLETED) {
      return {
        error: 'order_not_completed',
        ok: false as const,
      };
    }

    await db
      .insert(customerReviewsTable)
      .values({
        comment: message || null,
        customerId: customer?.id ?? null,
        metadata: {
          source: 'order_tracking_feedback_panel',
        },
        orderId: order.id,
        organizationId: payload.organizationId,
        rating: payload.rating,
        sourceChannel,
      })
      .onConflictDoUpdate({
        set: {
          comment: message || null,
          metadata: {
            source: 'order_tracking_feedback_panel',
          },
          rating: payload.rating,
          sourceChannel,
        },
        target: [
          customerReviewsTable.organizationId,
          customerReviewsTable.orderId,
          customerReviewsTable.customerId,
        ],
      });
  } else {
    await db.insert(orderEventsTable).values({
      actorType: 'customer',
      eventType: ORDER_EVENT_TYPE.CUSTOMER_COMPLAINT,
      fromStatus: order.status,
      metadata: {
        customerMessage: message,
        source: 'order_tracking_feedback_panel',
      },
      orderId: order.id,
      organizationId: payload.organizationId,
      summary: 'Customer feedback submitted from order tracking page.',
      toStatus: order.status,
    });
  }

  return {
    ok: true as const,
    orderId: order.id,
    reviewCaptured: Boolean(payload.rating),
  };
};

const otpRequestSchema = z.object({
  organizationId: z.string().min(1),
  phone: z.string().min(7).max(20),
  sessionId: z.string().min(10).max(100),
});

const otpVerifySchema = z.object({
  code: z.string().length(6),
  organizationId: z.string().min(1),
  phone: z.string().min(7).max(20),
  sessionId: z.string().min(10).max(100),
});

export const requestPhoneOtp = async (input: z.infer<typeof otpRequestSchema>) => {
  const parsed = otpRequestSchema.safeParse(input);

  if (!parsed.success) {
    return { error: 'invalid_input', ok: false as const };
  }

  // SMS OTP (Twilio Verify) was removed. Web-order phone verification now flows
  // through WhatsApp (Pattern B: a signed link delivered in the customer's
  // WhatsApp conversation). Disabled until the WhatsApp-link UI is wired.
  return { error: 'not_configured', ok: false as const };
};

export const verifyPhoneOtp = async (input: z.infer<typeof otpVerifySchema>) => {
  const parsed = otpVerifySchema.safeParse(input);

  if (!parsed.success) {
    return { error: 'invalid_input', ok: false as const };
  }

  // See requestPhoneOtp — SMS OTP removed; verification moves to WhatsApp (Pattern B).
  return { error: 'not_configured', ok: false as const };
};
