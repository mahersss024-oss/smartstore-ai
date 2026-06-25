import type { MetaOutboundMessage } from './MetaInteractiveMessage';
import type { MetaInboundMessage, MetaStoreConnection } from './MetaWhatsApp';
import { sendTrustedWebhookChatMessage } from '@/features/customer/WebChatActions';
import { logger } from './Logger';
import { buildMetaOutboundMessage, resolveMetaInteractiveHints } from './MetaInteractiveMessage';
import {
  sendMetaWhatsAppButtons,
  sendMetaWhatsAppList,
  sendMetaWhatsAppText,
} from './MetaWhatsApp';
import { loadTwilioConversationMetadata, resolveTwilioSemanticHints } from './TwilioConversationAdapter';
import {
  acquireConversationLock,
  buildFallbackReply,
  ConversationBusyError,
  MessageRetryError,
} from './TwilioInboundProcessor';

const META_THREAD_PREFIX = 'mwa';
const META_CHANNEL = 'whatsapp';

const digitsOnly = (value: string) => value.replace(/\D/g, '');

const buildMetaExternalThreadId = (params: {
  customerFrom: string;
  phoneNumberId: string;
}) => {
  return `${META_THREAD_PREFIX}:${params.phoneNumberId}:${digitsOnly(params.customerFrom)}`;
};

const deliverMetaMessage = async (params: {
  connection: MetaStoreConnection;
  message: MetaOutboundMessage;
  to: string;
}) => {
  const { connection, message, to } = params;

  if (message.kind === 'buttons') {
    await sendMetaWhatsAppButtons({
      accessToken: connection.accessToken,
      body: message.body,
      buttons: message.buttons,
      phoneNumberId: connection.phoneNumberId,
      to,
    });

    return;
  }

  if (message.kind === 'list') {
    await sendMetaWhatsAppList({
      accessToken: connection.accessToken,
      body: message.body,
      buttonLabel: message.buttonLabel,
      phoneNumberId: connection.phoneNumberId,
      rows: message.rows,
      sectionTitle: message.sectionTitle,
      to,
    });

    return;
  }

  await sendMetaWhatsAppText({
    accessToken: connection.accessToken,
    body: message.body,
    phoneNumberId: connection.phoneNumberId,
    to,
  });
};

/**
 * WhatsApp Cloud API (Meta) inbound processing — the provider counterpart of
 * processTwilioInboundMessage. Serializes the conversation, resolves the
 * customer's intent (tapped button/list payload → deterministic hint, otherwise
 * text matching), runs the shared trusted AI pipeline, and delivers the reply as
 * an interactive message (with text fallback). Throws ConversationBusyError /
 * MessageRetryError when the delivery must be retried.
 */
export const processMetaInboundMessage = async (params: {
  connection: MetaStoreConnection;
  message: MetaInboundMessage;
}) => {
  const { connection, message } = params;
  const threadId = buildMetaExternalThreadId({
    customerFrom: message.from,
    phoneNumberId: connection.phoneNumberId,
  });

  const conversationLock = await acquireConversationLock({
    eventId: threadId,
    eventType: 'meta.whatsapp.thread.processing',
    metadata: { messageId: message.messageId },
    provider: 'meta_thread_lock',
  });

  if (!conversationLock.acquired) {
    logger.info('Meta message deferred: conversation already processing', {
      messageId: message.messageId,
      organizationId: connection.organizationId,
    });

    throw new ConversationBusyError();
  }

  try {
    const conversationMetadata = await loadTwilioConversationMetadata({
      externalThreadId: threadId,
      organizationId: connection.organizationId,
    });
    const semanticHints = message.interactiveReplyId
      ? resolveMetaInteractiveHints(message.interactiveReplyId, conversationMetadata)
      : resolveTwilioSemanticHints({ message: message.body, metadata: conversationMetadata });

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
      source: META_CHANNEL,
    });

    if (!aiResult.ok) {
      logger.warn('Meta inbound message stored but AI response failed', {
        error: aiResult.error,
        organizationId: connection.organizationId,
      });

      if (aiResult.error === 'system_unavailable') {
        throw new MessageRetryError('ai_system_unavailable');
      }

      try {
        await deliverMetaMessage({
          connection,
          message: { body: buildFallbackReply(aiResult.error), kind: 'text' },
          to: message.from,
        });

        return { aiResponseSent: true, error: aiResult.error, fallbackResponseSent: true };
      } catch {
        throw new MessageRetryError('meta_error_fallback_send_failed');
      }
    }

    const outbound = buildMetaOutboundMessage(aiResult.data);

    if (outbound.kind === 'text' && !outbound.body) {
      logger.warn('Meta AI response was empty', {
        conversationId: aiResult.data.conversationId,
        organizationId: connection.organizationId,
      });

      throw new MessageRetryError('empty_ai_reply');
    }

    try {
      await deliverMetaMessage({ connection, message: outbound, to: message.from });

      logger.info('Meta outbound reply sent', {
        conversationId: aiResult.data.conversationId,
        kind: outbound.kind,
        organizationId: connection.organizationId,
      });
    } catch {
      throw new MessageRetryError('meta_reply_send_failed');
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
