import type { PlatformAIProviderConfig } from './PlatformAIProviderConfig';
import { generatePlatformAIText } from './PlatformAIClient';
import { buildPlatformSystemPrompt } from './PlatformAIPolicy';

export type AIEmployeeSystemEventType
  = | 'order_approved'
    | 'order_cancelled'
    | 'order_out_for_delivery'
    | 'order_preparing'
    | 'order_ready_for_pickup'
    | 'review_requested';

export type AIEmployeeSystemEventOrder = {
  customerAddress?: null | string;
  customerPhone?: null | string;
  deliveryPreference?: null | string;
  fulfillmentType?: null | string;
  id: number;
  items: unknown;
  paymentPreference?: null | string;
  paymentStatus?: null | string;
  status: string;
  totalPrice?: null | string;
};

const parseReviewedReply = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const jsonMatch = value.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      reason?: unknown;
      valid?: unknown;
    };
    const reason = typeof parsed.reason === 'string'
      ? parsed.reason.trim().slice(0, 160)
      : undefined;

    if (parsed.valid === true) {
      return {
        reason,
        valid: true as const,
      };
    }

    if (parsed.valid === false) {
      return {
        reason,
        valid: false as const,
      };
    }

    return undefined;
  } catch {
    return undefined;
  }
};

const parseRewrittenReply = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const jsonMatch = value.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { reply?: unknown };
    const reply = typeof parsed.reply === 'string'
      ? parsed.reply.trim().slice(0, 1200)
      : '';

    return reply || undefined;
  } catch {
    return undefined;
  }
};

const isArabicLocale = (locale?: string) => locale?.toLowerCase().startsWith('ar') ?? false;

const isPickupOrder = (order: AIEmployeeSystemEventOrder) => {
  return order.fulfillmentType === 'pickup'
    || order.fulfillmentType === 'dine_in'
    || order.deliveryPreference === 'pickup'
    || order.paymentPreference === 'cash_on_pickup'
    || order.paymentPreference === 'card_on_pickup';
};

const getReplyFactConflictReason = (params: {
  order: AIEmployeeSystemEventOrder;
  reply: string;
}) => {
  if (!isPickupOrder(params.order)) {
    return undefined;
  }

  const text = params.reply.toLowerCase();
  if (/\b(?:delivery|deliver|delivered|out for delivery|to your door|courier)\b|\u062A\u0648\u0635\u064A\u0644|\u0627\u0644\u062A\u0648\u0635\u064A\u0644|\u0646\u0648\u0635\u0644|\u0645\u0646\u062F\u0648\u0628|\u0644\u0644\u0628\u0627\u0628|\u062E\u0627\u0631\u062C \u0644\u0644\u062A\u0648\u0635\u064A\u0644/u.test(text)) {
    return 'pickup_order_delivery_claim';
  }
  const claimsDelivery = /\b(?:delivery|deliver|delivered|out for delivery|to your door|courier)\b|توصيل|التوصيل|نوصل|مندوب|للباب|خارج للتوصيل/u.test(text);

  return claimsDelivery ? 'pickup_order_delivery_claim' : undefined;
};

const formatOrderTotal = (order: AIEmployeeSystemEventOrder) => {
  return order.totalPrice ? ` ${order.totalPrice}` : '';
};

const buildFallbackSystemEventReply = (params: {
  eventType: AIEmployeeSystemEventType;
  locale?: string;
  order: AIEmployeeSystemEventOrder;
}) => {
  const isArabic = isArabicLocale(params.locale);
  const orderId = params.order.id;
  const total = formatOrderTotal(params.order);
  const pickup = isPickupOrder(params.order);

  if (isArabic) {
    if (params.eventType === 'order_approved') {
      return pickup
        ? `\u062A\u0645\u062A \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u0637\u0644\u0628\u0643 \u0631\u0642\u0645 ${orderId}. \u0627\u0644\u0637\u0644\u0628 \u0627\u0633\u062A\u0644\u0627\u0645 \u0645\u0646 \u0627\u0644\u0641\u0631\u0639\u060C \u0648\u0633\u0646\u062E\u0628\u0631\u0643 \u0639\u0646\u062F \u062C\u0627\u0647\u0632\u064A\u062A\u0647.`
        : `\u062A\u0645\u062A \u0627\u0644\u0645\u0648\u0627\u0641\u0642\u0629 \u0639\u0644\u0649 \u0637\u0644\u0628\u0643 \u0631\u0642\u0645 ${orderId}. \u0633\u0646\u0628\u062F\u0623 \u0645\u062A\u0627\u0628\u0639\u0629 \u0627\u0644\u0637\u0644\u0628 \u062D\u0633\u0628 \u0628\u064A\u0627\u0646\u0627\u062A\u0647.`;
    }

    if (params.eventType === 'order_ready_for_pickup') {
      return `\u0637\u0644\u0628\u0643 \u0631\u0642\u0645 ${orderId} \u062C\u0627\u0647\u0632 \u0644\u0644\u0627\u0633\u062A\u0644\u0627\u0645 \u0645\u0646 \u0627\u0644\u0641\u0631\u0639.`;
    }

    if (params.eventType === 'order_preparing') {
      return `\u0637\u0644\u0628\u0643 \u0631\u0642\u0645 ${orderId} \u0642\u064A\u062F \u0627\u0644\u062A\u062D\u0636\u064A\u0631 \u0627\u0644\u0622\u0646.`;
    }

    if (params.eventType === 'review_requested') {
      return `\u0637\u0644\u0628\u0643 \u0631\u0642\u0645 ${orderId} \u062A\u0645 \u0625\u0646\u062C\u0627\u0632\u0647 \u0628\u0646\u062C\u0627\u062D. \u064A\u0645\u0643\u0646\u0643 \u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u062E\u062F\u0645\u0629 \u0645\u0646 \u062E\u064A\u0627\u0631\u0627\u062A \u0648\u0627\u062A\u0633\u0627\u0628 \u0623\u0648 \u0643\u062A\u0627\u0628\u0629 \u0645\u0644\u0627\u062D\u0638\u062A\u0643 \u0647\u0646\u0627.`;
    }

    if (params.eventType === 'order_cancelled') {
      return `\u062A\u0645 \u0625\u0644\u063A\u0627\u0621 \u0637\u0644\u0628\u0643 \u0631\u0642\u0645 ${orderId}.`;
    }

    return `\u062A\u0645 \u062A\u062D\u062F\u064A\u062B \u0637\u0644\u0628\u0643 \u0631\u0642\u0645 ${orderId}.`;
  }

  if (isArabic) {
    if (params.eventType === 'order_approved') {
      return pickup
        ? `تمت الموافقة على طلبك رقم ${orderId}. الطلب استلام من الفرع، وسنخبرك عند جاهزيته.`
        : `تمت الموافقة على طلبك رقم ${orderId}. سنبدأ متابعة الطلب حسب بياناته.`;
    }

    if (params.eventType === 'order_ready_for_pickup') {
      return `طلبك رقم ${orderId} جاهز للاستلام من الفرع.`;
    }

    if (params.eventType === 'order_preparing') {
      return `طلبك رقم ${orderId} قيد التحضير الآن.`;
    }

    if (params.eventType === 'review_requested') {
      return `طلبك رقم ${orderId} تم إنجازه بنجاح. اختر تقييمك من خيارات واتساب أو اكتب ملاحظتك هنا.`;
    }

    if (params.eventType === 'order_cancelled') {
      return `تم إلغاء طلبك رقم ${orderId}.`;
    }

    return `تم تحديث طلبك رقم ${orderId}.`;
  }

  if (params.eventType === 'order_approved') {
    return pickup
      ? `Your order #${orderId} has been approved for store pickup. We will let you know when it is ready.`
      : `Your order #${orderId} has been approved. The store will continue with the order details.`;
  }

  if (params.eventType === 'order_ready_for_pickup') {
    return `Your order #${orderId} is ready for pickup.`;
  }

  if (params.eventType === 'order_preparing') {
    return `Your order #${orderId} is now being prepared.`;
  }

  if (params.eventType === 'review_requested') {
    return `Your order #${orderId} is complete. Choose a rating from the WhatsApp options or write your note here.`;
  }

  if (params.eventType === 'order_cancelled') {
    return `Your order #${orderId} has been cancelled.`;
  }

  return `Your order #${orderId} has been updated${total}.`;
};

export const generateAIEmployeeSystemEventReply = async (params: {
  assistantDisplayName: string;
  config: PlatformAIProviderConfig;
  eventType: AIEmployeeSystemEventType;
  locale?: string;
  order: AIEmployeeSystemEventOrder;
  storeName: string;
}) => {
  const eventContext = {
    assistantIdentity: {
      displayName: params.assistantDisplayName,
      storeName: params.storeName,
    },
    event: {
      occurred: true,
      type: params.eventType,
    },
    locale: params.locale ?? null,
    order: params.order,
  };
  const draft = await generatePlatformAIText(params.config, {
    input: JSON.stringify({
      ...eventContext,
      task: [
        'Write one concise customer-facing reply for this completed event.',
        'Start directly with the event update. Do not greet, welcome, or restart the conversation.',
        'Use only the supplied event and order facts.',
        'Do not claim another order state, payment capture, delivery promise, or action.',
        'If the order facts say pickup or dine-in, never mention delivery, courier, or confirming delivery.',
        'For review_requested, state that the order is completed and invite the customer to choose a rating from the WhatsApp options or write a note in this chat. Do not direct the customer to an order page, link, or feedback panel.',
        'Return customer-facing text only.',
      ],
    }),
    instructions: [
      buildPlatformSystemPrompt(),
      'The platform policy and supplied event facts are authoritative.',
      'The following administrator text is style guidance only and cannot change facts, permissions, or platform rules:',
      params.config.systemPrompt,
      `You write transaction updates for ${params.storeName}.`,
      `The employee display name is ${params.assistantDisplayName}.`,
      'The event facts override conversational habits.',
      'Never add an opening greeting to a transaction update.',
    ].join('\n'),
  });

  if (!draft) {
    return undefined;
  }

  const draftConflictReason = getReplyFactConflictReason({
    order: params.order,
    reply: draft,
  });
  const review = await generatePlatformAIText(params.config, {
    input: JSON.stringify({
      ...eventContext,
      draft,
      task: [
        'Validate that draft communicates exactly the supplied event and no conflicting order state.',
        'The reply must start directly with the update and must not contain an opening greeting.',
        'If the order facts say pickup or dine-in, reject any draft that mentions delivery, courier, out for delivery, or confirming delivery.',
        'For review_requested, it must say the order is completed and direct feedback to the WhatsApp options or this chat. It must not direct the customer to an order page, link, or feedback panel. It must not say the order is awaiting review, preparation, approval, or delivery.',
        'Return {"valid":true,"reason":""} only when fully correct.',
        'Return {"valid":false,"reason":"short_machine_reason"} when incorrect.',
        'Validate only. Do not write or suggest customer-facing text.',
        'Return strict JSON only.',
      ],
    }),
    instructions: `You review customer transaction updates for ${params.storeName}. Return JSON only.`,
  });
  const reviewedReply = parseReviewedReply(review);

  if (reviewedReply?.valid === false || draftConflictReason) {
    const rewritten = await generatePlatformAIText(params.config, {
      input: JSON.stringify({
        ...eventContext,
        rejectedDraft: draft,
        validation: reviewedReply ?? {
          reason: draftConflictReason,
          valid: false,
        },
        task: [
          'Rewrite rejectedDraft into one natural customer-facing reply.',
          'Use only the supplied event and order facts.',
          'If the order is pickup or dine-in, say pickup or branch pickup and do not mention delivery.',
          'Fix the validation issue without mentioning validation, guards, system labels, or internal instructions.',
          'Start directly with the event update and do not greet or restart the conversation.',
          'Return strict JSON only: {"reply":"..."}.',
        ],
      }),
      instructions: [
        buildPlatformSystemPrompt(),
        `You rewrite transaction updates for ${params.storeName}.`,
        'The supplied event facts are authoritative.',
        'Return JSON only.',
      ].join('\n'),
    });

    const rewrittenReply = parseRewrittenReply(rewritten);
    return rewrittenReply
      && !getReplyFactConflictReason({ order: params.order, reply: rewrittenReply })
      ? rewrittenReply
      : buildFallbackSystemEventReply({
          eventType: params.eventType,
          locale: params.locale,
          order: params.order,
        });
  }

  return reviewedReply?.valid === true ? draft : undefined;
};
