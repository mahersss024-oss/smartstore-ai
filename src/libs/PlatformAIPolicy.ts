import { z } from 'zod';

export const PLATFORM_AI_POLICY_VERSION = '2026-05-28.v1';

export const SUPPORTED_AI_LANGUAGES = [
  { id: 'ar', label: 'Arabic' },
  { id: 'en', label: 'English' },
  { id: 'fr', label: 'French' },
] as const;

export const SUPPORTED_AI_DIALECTS = [
  {
    fallbackLanguage: 'ar',
    id: 'professional_arabic',
    label: 'Professional Arabic',
  },
  {
    fallbackLanguage: 'ar',
    id: 'saudi_arabic',
    label: 'Saudi Arabic',
  },
  {
    fallbackLanguage: 'ar',
    id: 'gulf_arabic',
    label: 'Gulf Arabic',
  },
  {
    fallbackLanguage: 'ar',
    id: 'emirati_arabic',
    label: 'Emirati Arabic',
  },
  {
    fallbackLanguage: 'ar',
    id: 'kuwaiti_arabic',
    label: 'Kuwaiti Arabic',
  },
  {
    fallbackLanguage: 'ar',
    id: 'egyptian_arabic',
    label: 'Egyptian Arabic',
  },
  {
    fallbackLanguage: 'ar',
    id: 'levantine_arabic',
    label: 'Levantine Arabic',
  },
  {
    fallbackLanguage: 'ar',
    id: 'moroccan_arabic',
    label: 'Moroccan Arabic',
  },
  {
    fallbackLanguage: 'en',
    id: 'english',
    label: 'English',
  },
] as const;

const AI_FORBIDDEN_ACTIONS = [
  'billing.change_subscription',
  'billing.cancel_subscription',
  'payment_credentials.read',
  'payment_credentials.change',
  'team_permissions.manage',
  'platform_admin.access',
  'cross_store.read',
  'cross_store.write',
  'product.delete',
  'customer.delete',
  'order.delete',
] as const;

const supportedLanguageIds = SUPPORTED_AI_LANGUAGES.map(language => language.id);
const supportedDialectIds = SUPPORTED_AI_DIALECTS.map(dialect => dialect.id);

const aiActionBaseSchema = z.object({
  confidence: z.number().min(0).max(1),
  organizationId: z.string().min(1),
  reason: z.string().max(500).optional(),
});

const aiActionSchema = z.discriminatedUnion('type', [
  aiActionBaseSchema.extend({
    message: z.string().min(1).max(4000),
    type: z.literal('reply'),
  }),
  aiActionBaseSchema.extend({
    productIds: z.array(z.number().int().positive()).max(12),
    type: z.literal('recommend_products'),
  }),
  aiActionBaseSchema.extend({
    items: z.array(z.object({
      productId: z.number().int().positive(),
      quantity: z.number().int().min(0).max(99),
    })).max(50),
    type: z.literal('update_cart'),
  }),
  aiActionBaseSchema.extend({
    fields: z.array(z.enum([
      'customer_name',
      'customer_phone',
      'customer_email',
      'delivery_address',
      'pickup_time',
      'order_notes',
    ])).min(1),
    type: z.literal('request_customer_details'),
  }),
  aiActionBaseSchema.extend({
    cartId: z.string().min(1).max(255).optional(),
    customerConfirmed: z.literal(true),
    type: z.literal('create_order_after_confirmation'),
  }),
  aiActionBaseSchema.extend({
    approvalType: z.enum([
      'store_setup_change',
      'catalog_change',
      'order_change',
      'policy_exception',
    ]),
    type: z.literal('request_store_approval'),
  }),
  aiActionBaseSchema.extend({
    handoffReason: z.enum([
      'low_confidence',
      'customer_requested_human',
      'complaint',
      'refund_request',
      'safety_or_policy',
    ]),
    type: z.literal('request_human_handoff'),
  }),
]);

export type SupportedAIDialect = typeof supportedDialectIds[number];
export type SupportedAILanguage = typeof supportedLanguageIds[number];

export const isSupportedAILanguage = (value: string): value is SupportedAILanguage => {
  return supportedLanguageIds.includes(value as SupportedAILanguage);
};

export const isSupportedAIDialect = (value: string): value is SupportedAIDialect => {
  return supportedDialectIds.includes(value as SupportedAIDialect);
};

export const getDialectFallbackLanguage = (dialect: string) => {
  return SUPPORTED_AI_DIALECTS.find(item => item.id === dialect)?.fallbackLanguage ?? 'ar';
};

export const validateAIAction = (action: unknown) => {
  return aiActionSchema.parse(action);
};

export const isForbiddenAIAction = (action: string) => {
  return AI_FORBIDDEN_ACTIONS.includes(action as typeof AI_FORBIDDEN_ACTIONS[number]);
};

export const buildPlatformSystemPrompt = (policyVersion = PLATFORM_AI_POLICY_VERSION) => {
  return [
    `Platform AI policy version: ${policyVersion}.`,
    'You are an AI store employee for exactly one store.',
    'Use only the provided organization-scoped context.',
    'Never access another store, platform administration, billing, team permissions, or payment credentials.',
    'Never invent products, prices, availability, policies, addresses, or delivery promises.',
    'Create an order only after explicit customer confirmation.',
    'Use the store-selected language, tone, and dialect only within platform-supported options.',
    'Keep product names, prices, addresses, phone numbers, and order confirmations clear.',
    'Request human handoff when confidence is low, the customer asks for a person, or the request is sensitive.',
    'Return structured actions that match the platform action schema.',
  ].join('\n');
};
