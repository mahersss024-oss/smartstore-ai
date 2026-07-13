import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Env } from '@/libs/Env';
import {
  readRequestJsonWithLimit,
  RequestBodyTooLargeError,
} from '@/libs/RequestBody';
import { getStripe } from '@/libs/Stripe';
import {
  createStripeBillingCheckoutSession,
  StripeCheckoutConfigurationError,
} from '@/libs/StripeCheckout';
import { PLAN_NAME } from '@/utils/PricingPlans';
import { STRIPE_ADD_ON_PRICE } from '@/utils/StripeBillingPlans';

const MAX_CHECKOUT_REQUEST_BYTES = 8 * 1024;

const checkoutPayloadSchema = z.discriminatedUnion('kind', [
  z.object({
    addOnKey: z.enum([
      STRIPE_ADD_ON_PRICE.EXTRA_AI_ORDERS,
      STRIPE_ADD_ON_PRICE.EXTRA_CATALOG_ITEMS,
      STRIPE_ADD_ON_PRICE.EXTRA_IMAGE_STORAGE,
      STRIPE_ADD_ON_PRICE.EXTRA_TEAM_MEMBER,
    ]),
    kind: z.literal('add_on'),
  }),
  z.object({
    kind: z.literal('base_plan'),
    plan: z.enum([
      PLAN_NAME.STARTER,
      PLAN_NAME.GROWTH,
      PLAN_NAME.PRO,
    ]),
  }),
]);

const resolveBaseUrl = (request: Request) => {
  return Env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '')
    ?? new URL(request.url).origin;
};

export const POST = async (request: Request) => {
  if (!Env.ENABLE_STRIPE_SELF_CHECKOUT) {
    return NextResponse.json(
      { error: 'Stripe self-checkout is disabled' },
      { status: 403 },
    );
  }

  const { orgId } = await auth();

  if (!orgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload = checkoutPayloadSchema.parse(
      await readRequestJsonWithLimit(request, MAX_CHECKOUT_REQUEST_BYTES),
    );
    const session = await createStripeBillingCheckoutSession({
      baseUrl: resolveBaseUrl(request),
      organizationId: orgId,
      payload,
      stripe: getStripe(),
    });

    if (!session.url) {
      return NextResponse.json(
        { error: 'Stripe checkout session did not return a redirect URL' },
        { status: 502 },
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid checkout request' },
        { status: 400 },
      );
    }

    if (error instanceof RequestBodyTooLargeError) {
      return NextResponse.json(
        { error: 'Checkout request payload is too large' },
        { status: 413 },
      );
    }

    if (error instanceof StripeCheckoutConfigurationError) {
      return NextResponse.json(
        { error: 'Stripe checkout is not configured' },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: 'Stripe checkout failed' },
      { status: 500 },
    );
  }
};
