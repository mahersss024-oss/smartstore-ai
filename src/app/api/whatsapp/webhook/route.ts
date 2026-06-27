import { NextResponse } from 'next/server';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { processMetaInboundMessage } from '@/libs/MetaInboundProcessor';
import {
  findMetaStoreConnection,
  parseMetaWebhookPayload,
  verifyMetaSignature,
} from '@/libs/MetaWhatsApp';
import { readRequestTextWithLimit, RequestBodyTooLargeError } from '@/libs/RequestBody';
import { runWebhookEventOnce } from '@/libs/WebhookIdempotency';
import { ConversationBusyError, MessageRetryError } from '@/libs/WhatsAppInboundShared';

export const runtime = 'nodejs';

// The AI reply path chains several sequential model calls; give it headroom.
export const maxDuration = 60;

const MAX_BODY_BYTES = 64 * 1024;
const RETRY_AFTER_SECONDS = 2;

/**
 * Webhook verification handshake. Meta calls this once with hub.mode=subscribe
 * and the verify token; echo the challenge back when the token matches.
 */
export const GET = (request: Request) => {
  const url = new URL(request.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (
    mode === 'subscribe'
    && Boolean(Env.META_WEBHOOK_VERIFY_TOKEN)
    && token === Env.META_WEBHOOK_VERIFY_TOKEN
  ) {
    return new Response(challenge ?? '', { status: 200 });
  }

  return new Response('Forbidden', { status: 403 });
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

  const signature = request.headers.get('x-hub-signature-256');

  if (!Env.META_APP_SECRET || !verifyMetaSignature(rawBody, signature, Env.META_APP_SECRET)) {
    logger.warn('Meta webhook signature verification failed', {
      hasSignature: Boolean(signature),
    });

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const message = parseMetaWebhookPayload(payload);

  if (!message) {
    // Status updates and unsupported message types are acknowledged, not processed.
    return NextResponse.json({ ok: true, skipped: true });
  }

  const connection = await findMetaStoreConnection(message.phoneNumberId);

  if (!connection) {
    logger.warn('Meta message skipped: no store connection matched', {
      phoneNumberId: message.phoneNumberId,
    });

    return NextResponse.json({ ok: true, skipped: true });
  }

  logger.info('Meta WhatsApp webhook received', {
    messageId: message.messageId,
    phoneNumberId: message.phoneNumberId,
  });

  try {
    const result = await runWebhookEventOnce({
      eventId: message.messageId,
      eventType: 'meta.whatsapp.message',
      handler: async () => processMetaInboundMessage({ connection, message }),
      metadata: { from: message.from, phoneNumberId: message.phoneNumberId },
      provider: 'meta',
    });

    if (result.status === 'in_progress') {
      throw new MessageRetryError('webhook_event_in_progress');
    }

    return NextResponse.json({ ok: true, duplicate: result.duplicate, status: result.status });
  } catch (error) {
    if (error instanceof ConversationBusyError) {
      logger.info('Meta webhook requested retry for busy conversation');

      return NextResponse.json(
        { error: 'Conversation is busy; retry this webhook delivery', retryAfterSeconds: RETRY_AFTER_SECONDS },
        { headers: { 'Retry-After': String(RETRY_AFTER_SECONDS) }, status: 503 },
      );
    }

    if (error instanceof MessageRetryError) {
      logger.warn('Meta webhook requested retry for incomplete processing', { reason: error.reason });

      return NextResponse.json(
        { error: 'Message processing is incomplete; retry this webhook delivery', retryAfterSeconds: RETRY_AFTER_SECONDS },
        { headers: { 'Retry-After': String(RETRY_AFTER_SECONDS) }, status: 503 },
      );
    }

    throw error;
  }
};
