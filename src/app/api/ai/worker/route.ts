import { Receiver } from '@upstash/qstash';
import { NextResponse } from 'next/server';
import * as z from 'zod';
import {
  claimAiInboundJob,
  completeAiInboundJob,
  failAiInboundJob,
  getAiInboundJob,
  renewAiInboundJobLease,
} from '@/libs/AIInboundJobQueue';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import { readRequestTextWithLimit, RequestBodyTooLargeError } from '@/libs/RequestBody';
import {
  MessageRetryError,
  processTwilioInboundMessage,
} from '@/libs/TwilioInboundProcessor';
import { findTwilioStoreConnection } from '@/libs/TwilioWhatsApp';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_WORKER_BODY_BYTES = 16 * 1024;

const requestSchema = z.object({
  jobId: z.number().int().positive(),
});

const twilioPayloadSchema = z.object({
  message: z.object({
    body: z.string().min(1),
    from: z.string().min(1),
    messageSid: z.string().min(1),
    profileName: z.string().optional(),
    to: z.string().min(1),
    waId: z.string().optional(),
  }),
});

const verifyQStashRequest = async (request: Request, rawBody: string) => {
  const signature = request.headers.get('upstash-signature');

  if (
    !signature
    || !Env.QSTASH_CURRENT_SIGNING_KEY
    || !Env.QSTASH_NEXT_SIGNING_KEY
  ) {
    return false;
  }

  const receiver = new Receiver({
    currentSigningKey: Env.QSTASH_CURRENT_SIGNING_KEY,
    nextSigningKey: Env.QSTASH_NEXT_SIGNING_KEY,
  });

  try {
    return await receiver.verify({
      body: rawBody,
      signature,
      upstashRegion: request.headers.get('upstash-region') ?? undefined,
      url: request.url,
    });
  } catch {
    return false;
  }
};

export const POST = async (request: Request) => {
  let rawBody = '';

  try {
    rawBody = await readRequestTextWithLimit(request, MAX_WORKER_BODY_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json({ error: 'Request payload is too large' }, { status: 413 });
    }

    throw error;
  }

  if (!await verifyQStashRequest(request, rawBody)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsedRequest = requestSchema.safeParse(
    (() => {
      try {
        return JSON.parse(rawBody) as unknown;
      } catch {
        return null;
      }
    })(),
  );

  if (!parsedRequest.success) {
    return NextResponse.json({ error: 'Invalid worker payload' }, { status: 400 });
  }

  const claimed = await claimAiInboundJob({ jobId: parsedRequest.data.jobId });

  if (!claimed) {
    const existing = await getAiInboundJob(parsedRequest.data.jobId);

    return NextResponse.json({
      ok: true,
      status: existing?.status === 'done' || existing?.status === 'dead'
        ? existing.status
        : 'deferred',
    });
  }

  if (!claimed.leaseToken) {
    throw new Error('Claimed AI inbound job is missing its lease token.');
  }
  const leaseToken = claimed.leaseToken;

  try {
    if (claimed.channel !== 'whatsapp') {
      throw new Error(`Unsupported AI inbound channel: ${claimed.channel}`);
    }

    const payload = twilioPayloadSchema.parse(claimed.payload);
    const connection = await findTwilioStoreConnection(payload.message.to);

    if (!connection || connection.organizationId !== claimed.organizationId) {
      throw new MessageRetryError('twilio_store_connection_not_found');
    }

    await processTwilioInboundMessage({
      beforeSend: async () => {
        const renewed = await renewAiInboundJobLease({
          jobId: claimed.id,
          leaseToken,
        });

        if (!renewed) {
          throw new MessageRetryError('ai_inbound_job_lease_lost');
        }
      },
      connection,
      message: payload.message,
    });

    const completed = await completeAiInboundJob({
      jobId: claimed.id,
      leaseToken,
    });

    if (!completed) {
      logger.warn('AI inbound worker lost its lease before completion', {
        jobId: claimed.id,
        organizationId: claimed.organizationId,
      });
    }

    return NextResponse.json({
      ok: true,
      status: completed ? 'done' : 'lease_lost',
    });
  } catch (error) {
    const failed = await failAiInboundJob({
      attempts: claimed.attempts,
      error,
      jobId: claimed.id,
      leaseToken,
    });

    logger.warn('AI inbound worker deferred a failed job', {
      attempts: claimed.attempts,
      jobId: claimed.id,
      organizationId: claimed.organizationId,
      status: failed.status,
      updated: failed.updated,
    });

    return NextResponse.json({
      ok: true,
      status: failed.updated ? failed.status : 'lease_lost',
    });
  }
};
