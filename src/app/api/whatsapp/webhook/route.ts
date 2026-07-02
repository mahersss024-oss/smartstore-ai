import { NextResponse } from 'next/server';
import { logger } from '@/libs/Logger';
import { readRequestTextWithLimit, RequestBodyTooLargeError } from '@/libs/RequestBody';
import { runWebhookEventOnce } from '@/libs/WebhookIdempotency';
import { processWhapiInboundMessage } from '@/libs/WhapiInboundProcessor';
import {
  findWhapiStoreConnection,
  parseWhapiWebhookPayload,
} from '@/libs/WhapiWhatsApp';
import { ConversationBusyError, MessageRetryError } from '@/libs/WhatsAppInboundShared';

export const runtime = 'nodejs';

// The AI reply path chains several sequential model calls; give it headroom.
export const maxDuration = 60;

const MAX_BODY_BYTES = 64 * 1024;
const RETRY_AFTER_SECONDS = 2;

export const GET = () => NextResponse.json({ ok: true, provider: 'whapi' });

const handleWebhookRetryError = (params: {
  providerLabel: string;
  error: unknown;
}) => {
  if (params.error instanceof ConversationBusyError) {
    logger.info(`${params.providerLabel} webhook requested retry for busy conversation`);

    return NextResponse.json(
      { error: 'Conversation is busy; retry this webhook delivery', retryAfterSeconds: RETRY_AFTER_SECONDS },
      { headers: { 'Retry-After': String(RETRY_AFTER_SECONDS) }, status: 503 },
    );
  }

  if (params.error instanceof MessageRetryError) {
    logger.warn(`${params.providerLabel} webhook requested retry for incomplete processing`, {
      reason: params.error.reason,
    });

    return NextResponse.json(
      { error: 'Message processing is incomplete; retry this webhook delivery', retryAfterSeconds: RETRY_AFTER_SECONDS },
      { headers: { 'Retry-After': String(RETRY_AFTER_SECONDS) }, status: 503 },
    );
  }

  throw params.error;
};

const processWhapiWebhook = async (request: Request, rawBody: string) => {
  const url = new URL(request.url);
  const fallbackChannelId = url.searchParams.get('channelId');
  const webhookSecret = request.headers.get('x-whapi-secret')
    ?? url.searchParams.get('secret');

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const message = parseWhapiWebhookPayload(payload, fallbackChannelId);

  if (!message) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const connection = await findWhapiStoreConnection({
    channelId: message.channelId,
    webhookSecret,
  });

  if (!connection) {
    logger.warn('Whapi message skipped: no store connection matched', {
      channelId: message.channelId,
    });

    return NextResponse.json({ ok: true, skipped: true });
  }

  logger.info('Whapi WhatsApp webhook received', {
    channelId: message.channelId,
    messageId: message.messageId,
  });

  try {
    const result = await runWebhookEventOnce({
      eventId: message.messageId,
      eventType: 'whapi.whatsapp.message',
      handler: async () => processWhapiInboundMessage({ connection, message }),
      metadata: { channelId: message.channelId, from: message.from },
      provider: 'whapi',
    });

    if (result.status === 'in_progress') {
      throw new MessageRetryError('webhook_event_in_progress');
    }

    return NextResponse.json({ ok: true, duplicate: result.duplicate, status: result.status });
  } catch (error) {
    return handleWebhookRetryError({ error, providerLabel: 'Whapi' });
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

  return processWhapiWebhook(request, rawBody);
};
