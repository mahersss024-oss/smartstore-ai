import type { TwilioInboundMessage, TwilioStoreConnection } from './TwilioWhatsApp';
import { sendTrustedWebhookChatMessage } from '@/features/customer/WebChatActions';
import { logger } from './Logger';
import {
  buildTwilioOutboundBody,
  loadTwilioConversationMetadata,
  resolveTwilioSemanticHints,
} from './TwilioConversationAdapter';
import {
  buildTwilioExternalThreadId,
  extractCustomerPhoneFromWhatsAppFrom,
  sendTwilioWhatsAppMessage,
} from './TwilioWhatsApp';
import { acquireWebhookProcessingLock } from './WebhookIdempotency';

const LOCK_WAIT_MS = 8_000;
const LOCK_POLL_MS = 500;

/** The conversation is already being processed by another delivery; retry later. */
export class ConversationBusyError extends Error {
  constructor() {
    super('Twilio conversation is already processing');
    this.name = 'ConversationBusyError';
  }
}

/** Processing did not complete (AI or send failure); the delivery must be retried. */
export class MessageRetryError extends Error {
  constructor(public readonly reason: string) {
    super(`Twilio message processing requires retry: ${reason}`);
    this.name = 'MessageRetryError';
  }
}

const NON_RETRYABLE_REPLIES: Record<string, string> = {
  ai_action_disabled: 'خدمة هذا الإجراء غير متاحة حاليًا في المتجر. فضلاً تواصل مع المتجر مباشرة.',
  invalid_message: 'لم أستطع قراءة الرسالة بشكل صحيح. فضلاً أعد إرسال طلبك بصيغة أوضح.',
  store_feature_disabled: 'خدمة الطلب عبر واتساب غير متاحة حاليًا لهذا المتجر.',
  store_subscription_inactive: 'خدمة الطلبات غير متاحة حاليًا لهذا المتجر.',
  subscription_limit_reached: 'وصل المتجر إلى حد الاستخدام الحالي. فضلاً جرّب لاحقًا أو تواصل مع المتجر مباشرة.',
  too_many_messages: 'وصلت رسائل كثيرة خلال وقت قصير. فضلاً انتظر لحظات ثم أرسل طلبك مرة أخرى.',
};

export const buildFallbackReply = (error: string) => {
  return NON_RETRYABLE_REPLIES[error]
    ?? 'تعذر إكمال الطلب عبر واتساب حاليًا. فضلاً جرّب لاحقًا أو تواصل مع المتجر مباشرة.';
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const acquireConversationLock = async (
  params: Parameters<typeof acquireWebhookProcessingLock>[0],
) => {
  const deadline = Date.now() + LOCK_WAIT_MS;

  for (;;) {
    const lock = await acquireWebhookProcessingLock(params);

    if (lock.acquired) {
      return lock;
    }

    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      return lock;
    }

    await sleep(Math.min(LOCK_POLL_MS, remaining));
  }
};

/**
 * Core WhatsApp inbound processing shared by the synchronous webhook and the
 * asynchronous worker: serialize the conversation, run the trusted AI reply
 * pipeline, and deliver the reply (or a safe fallback) back to the customer.
 * Throws ConversationBusyError / MessageRetryError when the delivery must be
 * retried; the caller maps that to an HTTP retry or a queue retry.
 */
export const processTwilioInboundMessage = async (params: {
  beforeSend?: () => Promise<void>;
  connection: TwilioStoreConnection;
  message: TwilioInboundMessage;
}) => {
  const { connection, message } = params;
  const elapsedSince = (startedAt: number) => Date.now() - startedAt;
  const threadId = buildTwilioExternalThreadId({
    customerFrom: message.from,
    storeTo: message.to,
  });

  const conversationLock = await acquireConversationLock({
    eventId: threadId,
    eventType: 'twilio.whatsapp.thread.processing',
    metadata: { messageSid: message.messageSid },
    provider: 'twilio_thread_lock',
  });

  if (!conversationLock.acquired) {
    logger.info('Twilio message deferred: conversation already processing', {
      messageSid: message.messageSid,
      organizationId: connection.organizationId,
    });

    throw new ConversationBusyError();
  }

  try {
    const customerPhone = extractCustomerPhoneFromWhatsAppFrom(message.from);
    const conversationMetadata = await loadTwilioConversationMetadata({
      externalThreadId: threadId,
      organizationId: connection.organizationId,
    });
    const semanticHints = resolveTwilioSemanticHints({
      message: message.body,
      metadata: conversationMetadata,
    });
    const aiStartedAt = Date.now();
    const aiResult = await sendTrustedWebhookChatMessage({
      body: message.body,
      clientSubmissionId: message.messageSid,
      customer: {
        externalId: customerPhone,
        name: message.profileName,
        phone: customerPhone,
      },
      externalThreadId: threadId,
      locale: 'ar',
      organizationId: connection.organizationId,
      semanticHints,
      source: 'whatsapp',
    });
    const aiResponseMs = elapsedSince(aiStartedAt);

    if (!aiResult.ok) {
      logger.warn('Twilio inbound message stored but AI response failed', {
        aiResponseMs,
        error: aiResult.error,
        organizationId: connection.organizationId,
      });

      if (aiResult.error === 'system_unavailable') {
        throw new MessageRetryError('ai_system_unavailable');
      }

      try {
        const fallbackReply = buildFallbackReply(aiResult.error);

        await params.beforeSend?.();
        await sendTwilioWhatsAppMessage({
          body: fallbackReply,
          connection,
          to: message.from,
        });

        return { aiResponseSent: true, error: aiResult.error, fallbackResponseSent: true };
      } catch {
        logger.warn('Twilio non-retryable error fallback reply failed', {
          error: 'twilio_provider_error',
          organizationId: connection.organizationId,
        });

        throw new MessageRetryError('twilio_error_fallback_send_failed');
      }
    }

    const reply = buildTwilioOutboundBody(aiResult.data);

    if (!reply) {
      logger.warn('Twilio AI response was empty', {
        conversationId: aiResult.data.conversationId,
        organizationId: connection.organizationId,
      });

      throw new MessageRetryError('empty_ai_reply');
    }

    logger.info('Twilio AI response generated', {
      aiResponseMs,
      conversationId: aiResult.data.conversationId,
      organizationId: connection.organizationId,
    });

    try {
      await params.beforeSend?.();
      await sendTwilioWhatsAppMessage({
        body: reply,
        connection,
        to: message.from,
      });

      logger.info('Twilio outbound reply sent', {
        aiResponseMs,
        conversationId: aiResult.data.conversationId,
        organizationId: connection.organizationId,
      });
    } catch {
      logger.warn('Twilio inbound message processed but outbound reply failed', {
        aiResponseMs,
        error: 'twilio_provider_error',
        organizationId: connection.organizationId,
      });

      throw new MessageRetryError('twilio_reply_send_failed');
    }

    return {
      aiResponseSent: true,
      conversationId: aiResult.data.conversationId,
      organizationId: connection.organizationId,
      responseMessageId: aiResult.data.responseMessageId,
    };
  } finally {
    await conversationLock.release();
  }
};
