import type {
  OrganizationWebhookEvent,
  WebhookEvent,
} from '@clerk/nextjs/webhooks';
import type { NextRequest } from 'next/server';
import { verifyWebhook } from '@clerk/nextjs/webhooks';
import { NextResponse } from 'next/server';
import { syncOrganizationFromClerk } from '@/libs/ClerkOrganizationSync';
import { logger } from '@/libs/Logger';
import {
  readRequestTextWithLimit,
  RequestBodyTooLargeError,
} from '@/libs/RequestBody';
import { runWebhookEventOnce } from '@/libs/WebhookIdempotency';

const MAX_CLERK_WEBHOOK_BYTES = 1024 * 1024;

const isOrganizationEvent = (event: WebhookEvent): event is OrganizationWebhookEvent => {
  return event.type.startsWith('organization.');
};

export async function POST(request: NextRequest) {
  let event: WebhookEvent;

  try {
    await readRequestTextWithLimit(request.clone(), MAX_CLERK_WEBHOOK_BYTES);
    event = await verifyWebhook(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return new Response('Webhook payload is too large', { status: 413 });
    }

    logger.warn('Clerk webhook verification failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });

    return new Response('Webhook verification failed', { status: 400 });
  }

  try {
    const svixId = request.headers.get('svix-id')?.trim() || null;
    const execution = await runWebhookEventOnce({
      eventId: svixId ?? `${event.type}:${event.data.id}`,
      eventType: event.type,
      handler: async () => {
        if (isOrganizationEvent(event)) {
          await syncOrganizationFromClerk(event);
        }
      },
      metadata: {
        clerkObjectId: event.data.id,
        hasSvixId: Boolean(svixId),
      },
      provider: 'clerk',
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
    logger.error('Clerk webhook processing failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
      eventId: request.headers.get('svix-id'),
      eventType: event.type,
    });

    return new Response('Webhook processing failed', { status: 500 });
  }
}
