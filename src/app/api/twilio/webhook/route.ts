import { NextResponse } from 'next/server';
import twilio from 'twilio';
import { dispatchAndRecordAiInboundJob } from '@/libs/AIInboundJobDispatch';
import { enqueueAiInboundJob } from '@/libs/AIInboundJobQueue';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { readRequestTextWithLimit, RequestBodyTooLargeError } from '@/libs/RequestBody';
import {
  ConversationBusyError,
  MessageRetryError,
  processTwilioInboundMessage,
} from '@/libs/TwilioInboundProcessor';
import {
  buildTwilioExternalThreadId,
  findTwilioStoreConnection,
  parseTwilioWebhookBody,
} from '@/libs/TwilioWhatsApp';
import { runWebhookEventOnce } from '@/libs/WebhookIdempotency';

export const runtime = 'nodejs';

// The AI reply path can chain several sequential model calls (reply generation,
// safety review, and a bounded repair + re-guard cycle). Give the function
// enough headroom to persist the reply before the platform terminates it.
export const maxDuration = 60;

const MAX_BODY_BYTES = 64 * 1024;
const RETRY_AFTER_SECONDS = 2;

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

// Twilio signs the exact PUBLIC URL it called (https://<host>/api/twilio/webhook).
// Behind a TLS-terminating proxy (Render, etc.) `request.url` is the INTERNAL
// http URL, so it would never match Twilio's signature. Rebuild candidate public
// URLs from forwarding headers and the configured app URL, and accept if any
// validates — keeps signature verification working across hosts.
const buildTwilioSignatureUrls = (request: Request): string[] => {
  const original = new URL(request.url);
  const pathWithQuery = `${original.pathname}${original.search}`;
  const host = request.headers.get('x-forwarded-host')
    ?? request.headers.get('host')
    ?? original.host;
  const forwardedProto = (request.headers.get('x-forwarded-proto') ?? '')
    .split(',')[0]
    ?.trim();
  const proto = forwardedProto || original.protocol.replace(/:$/, '');

  const candidates = new Set<string>([
    `${proto}://${host}${pathWithQuery}`,
    `https://${host}${pathWithQuery}`,
    request.url,
  ]);

  if (Env.NEXT_PUBLIC_APP_URL) {
    candidates.add(`${Env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '')}${pathWithQuery}`);
  }

  return [...candidates];
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
  const valid = buildTwilioSignatureUrls(request).some(url =>
    verifyTwilioSignature({
      authToken: connection.authToken,
      rawBody,
      signature,
      url,
    }),
  );

  if (!valid) {
    logger.warn('Twilio webhook signature verification failed', {
      forwardedHost: request.headers.get('x-forwarded-host') ?? request.headers.get('host'),
      forwardedProto: request.headers.get('x-forwarded-proto'),
      hasSignature: Boolean(signature),
      organizationId: connection.organizationId,
    });

    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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

        if (Env.AI_PROCESSING_MODE === 'outbox') {
          const queued = await enqueueAiInboundJob({
            channel: 'whatsapp',
            dedupeKey: message.messageSid,
            externalThreadId: threadId,
            organizationId: connection.organizationId,
            payload: { message },
          });
          const dispatched = await dispatchAndRecordAiInboundJob({
            jobId: queued.jobId,
          });

          if (!dispatched.dispatched) {
            logger.warn('Twilio AI job persisted but immediate dispatch failed', {
              jobId: queued.jobId,
              organizationId: connection.organizationId,
            });
          }

          return {
            dispatched: dispatched.dispatched,
            jobId: queued.jobId,
            queued: true,
          };
        }

        return processTwilioInboundMessage({ connection, message });
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
