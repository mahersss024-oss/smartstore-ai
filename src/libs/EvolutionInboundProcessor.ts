import type { EvolutionInboundMessage, EvolutionStoreConnection } from './EvolutionWhatsApp';
import { sendTrustedWebhookChatMessage } from '@/features/customer/WebChatActions';
import { EvolutionConnectError, sendEvolutionText } from './EvolutionConnect';
import { buildEvolutionExternalThreadId } from './EvolutionWhatsApp';
import { logger } from './Logger';
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

const WHATSAPP_CHANNEL = 'whatsapp';

const toSafeEvolutionSendErrorLog = (error: unknown) => {
  if (error instanceof EvolutionConnectError) {
    return {
      message: error.message,
      status: error.status,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message.replace(/apikey["']?\s*[:=]\s*["']?[\w.-]{8,}/gi, 'apikey=[redacted]'),
    };
  }

  return { message: 'unknown_error' };
};

export const processEvolutionInboundMessage = async (params: {
  beforeSend?: () => Promise<void>;
  connection: EvolutionStoreConnection;
  message: EvolutionInboundMessage;
}) => {
  const { connection, message } = params;
  const threadId = buildEvolutionExternalThreadId({
    customerFrom: message.from,
    instanceName: connection.instanceName,
  });

  const conversationLock = await acquireConversationLock({
    eventId: threadId,
    eventType: 'evolution.whatsapp.thread.processing',
    metadata: { messageId: message.messageId },
    provider: 'evolution_thread_lock',
  });

  if (!conversationLock.acquired) {
    logger.info('Evolution message deferred: conversation already processing', {
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
      logger.warn('Evolution inbound message stored but AI response failed', {
        error: aiResult.error,
        organizationId: connection.organizationId,
      });

      if (aiResult.error === 'system_unavailable') {
        throw new MessageRetryError('ai_system_unavailable');
      }

      try {
        await params.beforeSend?.();
        await sendEvolutionText({
          body: buildFallbackReply(aiResult.error),
          instanceName: connection.instanceName,
          to: message.from,
        });

        return { aiResponseSent: true, error: aiResult.error, fallbackResponseSent: true };
      } catch (error) {
        logger.warn('Evolution fallback reply send failed', {
          error: toSafeEvolutionSendErrorLog(error),
          messageId: message.messageId,
          organizationId: connection.organizationId,
        });

        throw new MessageRetryError('evolution_error_fallback_send_failed');
      }
    }

    const outboundBody = buildWhatsAppOutboundBody(aiResult.data);

    if (!outboundBody) {
      logger.warn('Evolution AI response was empty', {
        conversationId: aiResult.data.conversationId,
        organizationId: connection.organizationId,
      });

      throw new MessageRetryError('empty_ai_reply');
    }

    try {
      await params.beforeSend?.();
      const outboundMessageId = await sendEvolutionText({
        body: outboundBody,
        instanceName: connection.instanceName,
        to: message.from,
      });

      logger.info('Evolution outbound reply sent', {
        conversationId: aiResult.data.conversationId,
        kind: 'text',
        organizationId: connection.organizationId,
        outboundMessageId,
      });
    } catch (error) {
      logger.warn('Evolution reply send failed', {
        conversationId: aiResult.data.conversationId,
        error: toSafeEvolutionSendErrorLog(error),
        kind: 'text',
        messageId: message.messageId,
        organizationId: connection.organizationId,
      });

      throw new MessageRetryError('evolution_reply_send_failed');
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
