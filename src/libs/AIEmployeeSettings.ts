import {
  getDialectFallbackLanguage,
  isSupportedAIDialect,
  isSupportedAILanguage,
} from './PlatformAIPolicy';

export const AI_TONES = [
  'professional',
  'friendly',
  'concise',
  'premium',
] as const;

export const AI_SALES_STYLES = [
  'helpful_only',
  'light_upsell',
  'active_recommendations',
  'no_upsell',
] as const;

export const AI_TARGET_COUNTRIES = [
  'SA',
  'AE',
  'KW',
  'QA',
  'BH',
  'OM',
  'EG',
  'JO',
  'MA',
  'GLOBAL',
] as const;

export const AI_PERMISSION_KEYS = [
  'reply_to_customers',
  'recommend_products',
  'build_carts',
  'create_orders_after_confirmation',
  'request_reviews',
  'suggest_catalog_improvements',
  'suggest_store_setup_improvements',
] as const;

export const AI_HANDOFF_KEYS = [
  'low_confidence',
  'customer_requested_human',
  'complaints',
  'refund_requests',
] as const;

export type AIEmployeeSettings = {
  approvalRequiredForCatalogChanges: boolean;
  approvalRequiredForSetupChanges: boolean;
  dialect: string;
  displayName: string;
  enabled: boolean;
  fallbackLanguage: string;
  handoffRules: Record<typeof AI_HANDOFF_KEYS[number], boolean>;
  language: string;
  permissions: Record<typeof AI_PERMISSION_KEYS[number], boolean>;
  salesStyle: typeof AI_SALES_STYLES[number];
  targetCountry: typeof AI_TARGET_COUNTRIES[number];
  tone: typeof AI_TONES[number];
  welcomeMessage: string;
};

const defaultPermissions: AIEmployeeSettings['permissions'] = {
  build_carts: true,
  create_orders_after_confirmation: true,
  recommend_products: true,
  reply_to_customers: true,
  request_reviews: true,
  suggest_catalog_improvements: false,
  suggest_store_setup_improvements: false,
};

const defaultHandoffRules: AIEmployeeSettings['handoffRules'] = {
  complaints: true,
  customer_requested_human: true,
  low_confidence: true,
  refund_requests: true,
};

export const DEFAULT_AI_EMPLOYEE_SETTINGS: AIEmployeeSettings = {
  approvalRequiredForCatalogChanges: true,
  approvalRequiredForSetupChanges: true,
  dialect: 'saudi_arabic',
  displayName: 'SmartStore Assistant',
  enabled: false,
  fallbackLanguage: 'ar',
  handoffRules: defaultHandoffRules,
  language: 'ar',
  permissions: defaultPermissions,
  salesStyle: 'helpful_only',
  targetCountry: 'SA',
  tone: 'friendly',
  welcomeMessage: '',
};

const pickAllowedValue = <T extends readonly string[]>(
  value: unknown,
  allowed: T,
  fallback: T[number],
): T[number] => {
  return typeof value === 'string' && allowed.includes(value)
    ? value as T[number]
    : fallback;
};

const toBooleanRecord = <T extends readonly string[]>(
  keys: T,
  value: unknown,
  defaults: Record<T[number], boolean>,
) => {
  const submitted = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};

  return keys.reduce((result, key) => ({
    ...result,
    [key]: typeof submitted[key] === 'boolean'
      ? submitted[key]
      : defaults[key as T[number]],
  }), {} as Record<T[number], boolean>);
};

export const normalizeAIEmployeeSettings = (value: unknown): AIEmployeeSettings => {
  const settings = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const language = typeof settings.language === 'string' && isSupportedAILanguage(settings.language)
    ? settings.language
    : DEFAULT_AI_EMPLOYEE_SETTINGS.language;
  const dialect = typeof settings.dialect === 'string' && isSupportedAIDialect(settings.dialect)
    ? settings.dialect
    : DEFAULT_AI_EMPLOYEE_SETTINGS.dialect;
  const fallbackLanguage = typeof settings.fallbackLanguage === 'string'
    && isSupportedAILanguage(settings.fallbackLanguage)
    ? settings.fallbackLanguage
    : getDialectFallbackLanguage(dialect);

  return {
    approvalRequiredForCatalogChanges: typeof settings.approvalRequiredForCatalogChanges === 'boolean'
      ? settings.approvalRequiredForCatalogChanges
      : DEFAULT_AI_EMPLOYEE_SETTINGS.approvalRequiredForCatalogChanges,
    approvalRequiredForSetupChanges: typeof settings.approvalRequiredForSetupChanges === 'boolean'
      ? settings.approvalRequiredForSetupChanges
      : DEFAULT_AI_EMPLOYEE_SETTINGS.approvalRequiredForSetupChanges,
    dialect,
    displayName: typeof settings.displayName === 'string' && settings.displayName.trim()
      ? settings.displayName.trim().slice(0, 80)
      : DEFAULT_AI_EMPLOYEE_SETTINGS.displayName,
    enabled: typeof settings.enabled === 'boolean'
      ? settings.enabled
      : DEFAULT_AI_EMPLOYEE_SETTINGS.enabled,
    fallbackLanguage,
    handoffRules: toBooleanRecord(
      AI_HANDOFF_KEYS,
      settings.handoffRules,
      DEFAULT_AI_EMPLOYEE_SETTINGS.handoffRules,
    ),
    language,
    permissions: toBooleanRecord(
      AI_PERMISSION_KEYS,
      settings.permissions,
      DEFAULT_AI_EMPLOYEE_SETTINGS.permissions,
    ),
    salesStyle: pickAllowedValue(
      settings.salesStyle,
      AI_SALES_STYLES,
      DEFAULT_AI_EMPLOYEE_SETTINGS.salesStyle,
    ),
    targetCountry: pickAllowedValue(
      settings.targetCountry,
      AI_TARGET_COUNTRIES,
      DEFAULT_AI_EMPLOYEE_SETTINGS.targetCountry,
    ),
    tone: pickAllowedValue(settings.tone, AI_TONES, DEFAULT_AI_EMPLOYEE_SETTINGS.tone),
    welcomeMessage: typeof settings.welcomeMessage === 'string'
      ? settings.welcomeMessage.trim().slice(0, 500)
      : DEFAULT_AI_EMPLOYEE_SETTINGS.welcomeMessage,
  };
};
