import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { sendTrustedWebhookChatMessage } from '@/features/customer/WebChatActions';
import { logger } from '@/libs/Logger';
import { readRequestTextWithLimit, RequestBodyTooLargeError } from '@/libs/RequestBody';
import {
  buildTwilioExternalThreadId,
  extractCustomerPhoneFromWhatsAppFrom,
  findTwilioStoreConnection,
  parseTwilioWebhookBody,
  sendTwilioWhatsAppMessage,
} from '@/libs/TwilioWhatsApp';
import { acquireWebhookProcessingLock, runWebhookEventOnce } from '@/libs/WebhookIdempotency';

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 64 * 1024;
const RETRY_AFTER_SECONDS = 2;
const LOCK_WAIT_MS = 8_000;
const LOCK_POLL_MS = 500;

class ConversationBusyError extends Error {
  constructor() {
    super('Twilio conversation is already processing');
    this.name = 'ConversationBusyError';
  }
}

class MessageRetryError extends Error {
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

const buildFallbackReply = (error: string) => {
  return NON_RETRYABLE_REPLIES[error]
    ?? 'تعذر إكمال الطلب عبر واتساب حاليًا. فضلاً جرّب لاحقًا أو تواصل مع المتجر مباشرة.';
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const acquireConversationLock = async (params: Parameters<typeof acquireWebhookProcessingLock>[0]) => {
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

const verifyTwilioSignature = (params: {
  authToken: string;
  rawBody: string;
  signature: string | null;
  url: string;
}) => {
  if (!params.signature) {
    return false;
  }

  try {
    const bodyParams = Object.fromEntries(new URLSearchParams(params.rawBody));

    return twilio.validateRequest(
      params.authToken,
      params.signature,
      params.url,
      bodyParams,
    );
  } catch {
    return false;
  }
};

export const POST = async (request: Request) => {
  let rawBody = '';

  try {
    rawBody = await readRequestTextWithLimit(request, MAX_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: 'Request payload is too large' }, { status: 413 });
    }

    throw error;
  }

  const params = new URLSearchParams(rawBody);
  const message = parseTwilioWebhookBody(params);

  if (!message.from || !message.to || !message.body || !message.messageSid) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const connection = await findTwilioStoreConnection(message.to);

  if (!connection) {
    logger.warn('Twilio message skipped: no store connection matched', {
      to: message.to,
    });

    return NextResponse.json({ ok: true, skipped: true });
  }

  const signature = request.headers.get('x-twilio-signature');
  const valid = verifyTwilioSignature({
    authToken: connection.authToken,
    rawBody,
    signature,
    url: request.url,
  });

  if (!valid) {
    logger.warn('Twilio webhook signature verification failed', {
      organizationId: connection.organizationId,
    });

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const elapsedSince = (startedAt: number) => Date.now() - startedAt;

  logger.info('Twilio WhatsApp webhook received', {
    messageSid: message.messageSid,
    to: message.to,
  });

  try {
    const threadId = buildTwilioExternalThreadId({
      customerFrom: message.from,
      storeTo: message.to,
    });

    const result = await runWebhookEventOnce({
      eventId: message.messageSid,
      eventType: 'twilio.whatsapp.message',
      handler: async () => {
        logger.info('Twilio store connection matched', {
          organizationId: connection.organizationId,
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

          const reply = aiResult.data.replyToCustomer.trim();

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
      },
      metadata: { from: message.from, to: message.to },
      provider: 'twilio',
    });

    if (result.status === 'in_progress') {
      throw new MessageRetryError('webhook_event_in_progress');
    }

    return NextResponse.json({ ok: true, duplicate: result.duplicate, status: result.status });
  } catch (error) {
    if (error instanceof ConversationBusyError) {
      logger.info('Twilio webhook requested retry for busy conversation');

      return NextResponse.json(
        { error: 'Conversation is busy; retry this webhook delivery', retryAfterSeconds: RETRY_AFTER_SECONDS },
        { headers: { 'Retry-After': String(RETRY_AFTER_SECONDS) }, status: 503 },
      );
    }

    if (error instanceof MessageRetryError) {
      logger.warn('Twilio webhook requested retry for incomplete processing', { reason: error.reason });

      return NextResponse.json(
        { error: 'Message processing is incomplete; retry this webhook delivery', retryAfterSeconds: RETRY_AFTER_SECONDS },
        { headers: { 'Retry-After': String(RETRY_AFTER_SECONDS) }, status: 503 },
      );
    }

    throw error;
  }
};
