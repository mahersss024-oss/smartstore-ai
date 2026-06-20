import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import {
  readRequestTextWithLimit,
  RequestBodyTooLargeError,
} from '@/libs/RequestBody';
import { getStripe } from '@/libs/Stripe';
import { syncBillingFromStripe } from '@/libs/StripeBillingSync';
import { runWebhookEventOnce } from '@/libs/WebhookIdempotency';

const MAX_STRIPE_WEBHOOK_BYTES = 1024 * 1024;

export async function POST(request: NextRequest) {
  if (!Env.STRIPE_WEBHOOK_SECRET) {
    return new Response('Stripe webhook secret is not configured', { status: 500 });
  }

  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return new Response('Missing Stripe signature', { status: 400 });
  }

  const stripe = getStripe();
  let event;

  try {
    const body = await readRequestTextWithLimit(
      request,
      MAX_STRIPE_WEBHOOK_BYTES,
    );
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      Env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    logger.warn('Stripe webhook verification failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });

    return new Response(
      error instanceof RequestBodyTooLargeError
        ? 'Webhook payload is too large'
        : 'Webhook verification failed',
      { status: error instanceof RequestBodyTooLargeError ? 413 : 400 },
    );
  }

  try {
    const execution = await runWebhookEventOnce({
      eventId: event.id,
      eventType: event.type,
      handler: async () => syncBillingFromStripe(event),
      metadata: {
        livemode: event.livemode,
        pendingWebhooks: event.pending_webhooks,
      },
      provider: 'stripe',
    });

    if (execution.status === 'in_progress') {
      return NextResponse.json(
        { received: false, retry: true },
        {
          headers: { 'Retry-After': '5' },
          status: 503,
        },
      );
    }

    return NextResponse.json({
      duplicate: execution.duplicate,
      received: true,
    });
  } catch (error) {
    logger.error('Stripe webhook processing failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
      eventId: event.id,
      eventType: event.type,
    });

    return new Response('Webhook processing failed', { status: 500 });
  }
}
