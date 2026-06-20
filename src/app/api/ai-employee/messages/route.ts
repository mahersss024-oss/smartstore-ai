import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleCustomerMessageWithAIEmployee } from '@/features/ai/AIEmployeeAgent';
import { AIEmployeePermissionError } from '@/libs/AIActionPermissions';
import { aiEmployeeSemanticHintsSchema } from '@/libs/AIEmployeeSemanticHints';
import { Env } from '@/libs/Env';
import { getPlatformRuntimeConfig } from '@/libs/PlatformRuntimeConfig';
import {
  checkPublicMessageRateLimit,
  PublicEndpointRateLimitError,
} from '@/libs/PublicEndpointRateLimit';
import {
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from '@/libs/RequestBody';
import { secureTokenEquals } from '@/libs/SecureTokens';
import {
  assertStoreFeatureEnabled,
  StoreFeatureDisabledError,
  StoreSubscriptionInactiveError,
} from '@/libs/StoreServiceControls';
import { isSubscriptionLimitError } from '@/libs/SubscriptionEntitlements';

const MAX_REQUEST_BODY_BYTES = 64 * 1024;

const requestSchema = z.object({
  body: z.string().min(1).max(4000),
  channel: z.string().min(1).max(50),
  customer: z.object({
    email: z.string().email().optional(),
    externalId: z.string().min(1).max(255),
    name: z.string().max(255).optional(),
    phone: z.string().max(50).optional(),
  }),
  customerAddress: z.string().max(500).optional(),
  externalThreadId: z.string().min(1).max(255),
  locale: z.string().min(2).max(10).optional(),
  organizationId: z.string().min(1),
  semanticHints: aiEmployeeSemanticHintsSchema.optional(),
});

export const POST = async (request: Request) => {
  const runtimeConfig = await getPlatformRuntimeConfig();
  const aiEmployeeWebhookSecret = runtimeConfig.internal.aiEmployeeWebhookSecret;

  if (!aiEmployeeWebhookSecret) {
    if (Env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'AI employee webhook is not configured' },
        { status: 500 },
      );
    }
  } else {
    const incomingSecret = request.headers.get('x-ai-employee-secret');

    if (!secureTokenEquals(incomingSecret, aiEmployeeWebhookSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const payload = requestSchema.parse(
      await readRequestJsonWithLimit(request, MAX_REQUEST_BODY_BYTES),
    );
    await checkPublicMessageRateLimit({
      channel: payload.channel,
      customerExternalId: payload.customer.externalId,
      externalThreadId: payload.externalThreadId,
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        ?? request.headers.get('x-real-ip'),
      organizationId: payload.organizationId,
    });

    await assertStoreFeatureEnabled(payload.organizationId, 'ai');
    const result = await handleCustomerMessageWithAIEmployee(payload);
    const { aiOrchestration: _aiOrchestration, ...response } = result;

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: 'Invalid request payload',
          issues: error.issues,
        },
        { status: 400 },
      );
    }

    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: 'Request payload is too large' },
        { status: 413 },
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 },
      );
    }

    if (error instanceof StoreFeatureDisabledError) {
      return NextResponse.json(
        { error: 'Store feature is disabled', feature: error.feature },
        { status: 403 },
      );
    }

    if (error instanceof StoreSubscriptionInactiveError) {
      return NextResponse.json(
        {
          error: 'Store subscription is inactive',
          reason: error.reason,
          subscriptionStatus: error.subscriptionStatus,
        },
        { status: 402 },
      );
    }

    if (error instanceof AIEmployeePermissionError) {
      return NextResponse.json(
        {
          actionType: error.actionType,
          error: 'AI employee action is disabled',
          requiredPermission: error.requiredPermission,
        },
        { status: 403 },
      );
    }

    if (error instanceof PublicEndpointRateLimitError) {
      return NextResponse.json(
        {
          error: 'Too many messages',
          limit: error.limit,
          retryAfterSeconds: error.retryAfterSeconds,
          windowMs: error.windowMs,
        },
        {
          headers: {
            'Retry-After': String(error.retryAfterSeconds),
          },
          status: 429,
        },
      );
    }

    if (isSubscriptionLimitError(error)) {
      return NextResponse.json(
        {
          error: 'Subscription limit reached',
          feature: error.feature,
          limit: error.limit,
          used: error.used,
        },
        { status: 402 },
      );
    }

    throw error;
  }
};
