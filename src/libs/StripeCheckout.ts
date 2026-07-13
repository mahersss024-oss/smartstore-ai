import type Stripe from 'stripe';
import type { StripeAddOnKey } from '@/utils/StripeBillingPlans';
import {
  getStripeAddOnPriceId,
  getStripePlanPriceId,
} from '@/utils/StripeBillingPlans';

type StripeBasePlanCheckoutKey = 'growth' | 'pro' | 'starter';

export type StripeCheckoutPayload
  = | {
    kind: 'add_on';
    addOnKey: StripeAddOnKey;
  }
  | {
    kind: 'base_plan';
    plan: StripeBasePlanCheckoutKey;
  };

type CreateStripeBillingCheckoutSessionParams = {
  baseUrl: string;
  organizationId: string;
  payload: StripeCheckoutPayload;
  stripe: Stripe;
};

export class StripeCheckoutConfigurationError extends Error {
  constructor(public readonly code: 'missing_price') {
    super(`Stripe checkout is not configured: ${code}`);
    this.name = 'StripeCheckoutConfigurationError';
  }
}

const getCheckoutPriceId = (payload: StripeCheckoutPayload) => {
  if (payload.kind === 'add_on') {
    return getStripeAddOnPriceId(payload.addOnKey);
  }

  return getStripePlanPriceId(payload.plan);
};

const getCheckoutMetadata = (
  organizationId: string,
  payload: StripeCheckoutPayload,
): Record<string, string> => {
  if (payload.kind === 'add_on') {
    return {
      add_on_key: payload.addOnKey,
      billing_kind: 'add_on',
      organization_id: organizationId,
    };
  }

  return {
    billing_kind: 'base_plan',
    organization_id: organizationId,
    plan: payload.plan,
  };
};

const normalizeBaseUrl = (baseUrl: string) => {
  return baseUrl.replace(/\/+$/, '');
};

export const createStripeBillingCheckoutSession = async (
  params: CreateStripeBillingCheckoutSessionParams,
) => {
  const priceId = getCheckoutPriceId(params.payload);

  if (!priceId) {
    throw new StripeCheckoutConfigurationError('missing_price');
  }

  const metadata = getCheckoutMetadata(params.organizationId, params.payload);
  const baseUrl = normalizeBaseUrl(params.baseUrl);

  return params.stripe.checkout.sessions.create({
    allow_promotion_codes: true,
    client_reference_id: params.organizationId,
    line_items: [{
      price: priceId,
      quantity: 1,
    }],
    metadata,
    mode: 'subscription',
    subscription_data: {
      metadata,
    },
    cancel_url: `${baseUrl}/dashboard/subscription?checkout=cancelled`,
    success_url: `${baseUrl}/dashboard/subscription?checkout=success`,
  });
};
