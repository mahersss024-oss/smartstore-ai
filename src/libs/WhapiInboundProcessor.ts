import type { WhapiInboundMessage, WhapiStoreConnection } from './WhapiWhatsApp';
import { sendTrustedWebhookChatMessage } from '@/features/customer/WebChatActions';
import { logger } from './Logger';
import { sendWhapiText, WhapiSendError } from './WhapiWhatsApp';
import {
  buildWhatsAppOutboundBody,
  loadWhatsAppConversationMetadata,
  resolveWhatsAppSemanticHints,
} from './WhatsAppConversationAdapter';
import {
  acquireConversationLock,
  buildFallbackReply,
  ConversationBusyError,
  MessageRetryError,
} from './WhatsAppInboundShared';

const WHAPI_THREAD_PREFIX = 'wwa';
const WHATSAPP_CHANNEL = 'whatsapp';

const digitsOnly = (value: string) => value.replace(/\D/g, '');

const toSafeWhapiSendErrorLog = (error: unknown) => {
  if (error instanceof WhapiSendError) {
    return {
      message: error.message,
      status: error.status,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message.replace(/Bearer\s+[\w.-]+/gi, 'Bearer [redacted]'),
    };
  }

  return { message: 'unknown_error' };
};

const buildWhapiExternalThreadId = (params: {
  channelId: string;
  customerFrom: string;
}) => {
  return `${WHAPI_THREAD_PREFIX}:${params.channelId}:${digitsOnly(params.customerFrom)}`;
};

export const processWhapiInboundMessage = async (params: {
  beforeSend?: () => Promise<void>;
  connection: WhapiStoreConnection;
  message: WhapiInboundMessage;
}) => {
  const { connection, message } = params;
  const threadId = buildWhapiExternalThreadId({
    channelId: connection.channelId,
    customerFrom: message.from,
  });

  const conversationLock = await acquireConversationLock({
    eventId: threadId,
    eventType: 'whapi.whatsapp.thread.processing',
    metadata: { messageId: message.messageId },
    provider: 'whapi_thread_lock',
  });

  if (!conversationLock.acquired) {
    logger.info('Whapi message deferred: conversation already processing', {
      messageId: message.messageId,
      organizationId: connection.organizationId,
    });

    throw new ConversationBusyError();
  }

  try {
    const conversationMetadata = await loadWhatsAppConversationMetadata({
      externalThreadId: threadId,
      organizationId: connection.organizationId,
    });
    const semanticHints = resolveWhatsAppSemanticHints({
      message: message.body,
      metadata: conversationMetadata,
    });

    const aiResult = await sendTrustedWebhookChatMessage({
      body: message.body,
      clientSubmissionId: message.messageId,
      customer: {
        externalId: message.from,
        name: message.profileName,
        phone: message.from,
      },
      externalThreadId: threadId,
      locale: 'ar',
      organizationId: connection.organizationId,
      semanticHints,
      source: WHATSAPP_CHANNEL,
    });

    if (!aiResult.ok) {
      logger.warn('Whapi inbound message stored but AI response failed', {
        error: aiResult.error,
        organizationId: connection.organizationId,
      });

      if (aiResult.error === 'system_unavailable') {
        throw new MessageRetryError('ai_system_unavailable');
      }

      try {
        await params.beforeSend?.();
        await sendWhapiText({
          apiToken: connection.apiToken,
          body: buildFallbackReply(aiResult.error),
          to: message.from,
        });

        return { aiResponseSent: true, error: aiResult.error, fallbackResponseSent: true };
      } catch (error) {
        logger.warn('Whapi fallback reply send failed', {
          error: toSafeWhapiSendErrorLog(error),
          messageId: message.messageId,
          organizationId: connection.organizationId,
        });

        throw new MessageRetryError('whapi_error_fallback_send_failed');
      }
    }

    const outboundBody = buildWhatsAppOutboundBody(aiResult.data);

    if (!outboundBody) {
      logger.warn('Whapi AI response was empty', {
        conversationId: aiResult.data.conversationId,
        organizationId: connection.organizationId,
      });

      throw new MessageRetryError('empty_ai_reply');
    }

    try {
      await params.beforeSend?.();
      const outboundMessageId = await sendWhapiText({
        apiToken: connection.apiToken,
        body: outboundBody,
        to: message.from,
      });

      logger.info('Whapi outbound reply sent', {
        conversationId: aiResult.data.conversationId,
        kind: 'text',
        organizationId: connection.organizationId,
        outboundMessageId,
      });
    } catch (error) {
      logger.warn('Whapi reply send failed', {
        conversationId: aiResult.data.conversationId,
        error: toSafeWhapiSendErrorLog(error),
        kind: 'text',
        messageId: message.messageId,
        organizationId: connection.organizationId,
      });

      throw new MessageRetryError('whapi_reply_send_failed');
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
