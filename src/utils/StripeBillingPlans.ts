import { Env } from '@/libs/Env';
import { PLAN_NAME } from '@/utils/PricingPlans';

export const STRIPE_ADD_ON_PRICE = {
  EXTRA_AI_ORDERS: 'extra_ai_orders',
  EXTRA_CATALOG_ITEMS: 'extra_catalog_items',
  EXTRA_IMAGE_STORAGE: 'extra_image_storage',
  EXTRA_TEAM_MEMBER: 'extra_team_member',
} as const;

export type StripeAddOnKey = typeof STRIPE_ADD_ON_PRICE[keyof typeof STRIPE_ADD_ON_PRICE];

export type AddOnEntitlement = {
  aiOrders?: number;
  products?: number;
  storageMb?: number;
  teamMembers?: number;
};

export const ADD_ON_ENTITLEMENTS: Record<StripeAddOnKey, AddOnEntitlement> = {
  [STRIPE_ADD_ON_PRICE.EXTRA_AI_ORDERS]: {
    aiOrders: 100,
  },
  [STRIPE_ADD_ON_PRICE.EXTRA_CATALOG_ITEMS]: {
    products: 100,
  },
  [STRIPE_ADD_ON_PRICE.EXTRA_IMAGE_STORAGE]: {
    storageMb: 50,
  },
  [STRIPE_ADD_ON_PRICE.EXTRA_TEAM_MEMBER]: {
    teamMembers: 1,
  },
};

const STRIPE_PLAN_PRICE_IDS: Record<string, string | undefined> = {
  [PLAN_NAME.STARTER]: Env.STRIPE_PRICE_STARTER_MONTHLY,
  [PLAN_NAME.GROWTH]: Env.STRIPE_PRICE_GROWTH_MONTHLY,
  [PLAN_NAME.PRO]: Env.STRIPE_PRICE_PRO_MONTHLY,
};

const STRIPE_ADD_ON_PRICE_IDS: Record<StripeAddOnKey, string | undefined> = {
  [STRIPE_ADD_ON_PRICE.EXTRA_AI_ORDERS]: Env.STRIPE_PRICE_EXTRA_AI_ORDERS,
  [STRIPE_ADD_ON_PRICE.EXTRA_CATALOG_ITEMS]: Env.STRIPE_PRICE_EXTRA_CATALOG_ITEMS,
  [STRIPE_ADD_ON_PRICE.EXTRA_IMAGE_STORAGE]: Env.STRIPE_PRICE_EXTRA_IMAGE_STORAGE,
  [STRIPE_ADD_ON_PRICE.EXTRA_TEAM_MEMBER]: Env.STRIPE_PRICE_EXTRA_TEAM_MEMBER,
};

export const normalizeBillingPlanKey = (slugOrName?: string | null) => {
  return slugOrName
    ?.trim()
    .toLowerCase()
    .replace(/^smartstore[-_ ]/, '')
    .replaceAll('-', '_')
    .replaceAll(' ', '_')
    ?? '';
};

export const getStripeAddOnKeyByPriceId = (priceId?: string | null) => {
  return Object.entries(STRIPE_ADD_ON_PRICE_IDS)
    .find(([, configuredPriceId]) => configuredPriceId && configuredPriceId === priceId)
    ?.[0] as StripeAddOnKey | undefined;
};

export const getStripePlanByPriceId = (priceId?: string | null) => {
  return Object.entries(STRIPE_PLAN_PRICE_IDS)
    .find(([, configuredPriceId]) => configuredPriceId && configuredPriceId === priceId)
    ?.[0];
};

export const getStripeAddOnPriceId = (addOnKey: StripeAddOnKey) => {
  return STRIPE_ADD_ON_PRICE_IDS[addOnKey];
};

export const getStripePlanPriceId = (planName: string) => {
  return STRIPE_PLAN_PRICE_IDS[normalizeBillingPlanKey(planName)];
};
