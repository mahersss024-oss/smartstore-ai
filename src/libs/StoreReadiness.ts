type StoreReadinessInput = {
  businessType?: string | null;
  contactChannels?: Record<string, unknown>;
  currency?: string | null;
  deliveryMethodsCount: number;
  location?: {
    address?: unknown;
    city?: unknown;
    mapsUrl?: unknown;
    pickupInstructions?: unknown;
  } | null | Record<string, unknown>;
  paymentMethodsCount: number;
  productsCount: number;
  storeDescription?: string | null;
  storeName?: string | null;
  timezone?: string | null;
  welcomeMessage?: string | null;
};

type StoreReadinessKey
  = | 'business_type'
    | 'contact_channel'
    | 'currency'
    | 'delivery_method'
    | 'location'
    | 'payment_method'
    | 'product_catalog'
    | 'store_description'
    | 'store_name'
    | 'timezone'
    | 'welcome_message';

export type StoreReadinessItem = {
  isReady: boolean;
  key: StoreReadinessKey;
  requiredForCustomerAI: boolean;
};

export const hasText = (value: unknown) => {
  return typeof value === 'string' && value.trim().length > 0;
};

export const hasConfiguredValue = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value);
  }

  if (typeof value === 'string' && ['true', 'false'].includes(value.trim().toLowerCase())) {
    return false;
  }

  return hasText(value);
};

export const getStoreReadinessItems = (input: StoreReadinessInput): StoreReadinessItem[] => {
  const location = input.location ?? {};
  const hasLocation = [
    location.address,
    location.city,
    location.mapsUrl,
    location.pickupInstructions,
  ].some(hasText);

  return [
    {
      isReady: hasText(input.storeName),
      key: 'store_name',
      requiredForCustomerAI: true,
    },
    {
      isReady: hasText(input.storeDescription),
      key: 'store_description',
      requiredForCustomerAI: true,
    },
    {
      isReady: hasText(input.businessType),
      key: 'business_type',
      requiredForCustomerAI: true,
    },
    {
      isReady: hasText(input.welcomeMessage),
      key: 'welcome_message',
      requiredForCustomerAI: true,
    },
    {
      isReady: hasText(input.currency),
      key: 'currency',
      requiredForCustomerAI: true,
    },
    {
      isReady: hasText(input.timezone),
      key: 'timezone',
      requiredForCustomerAI: true,
    },
    {
      isReady: Object.values(input.contactChannels ?? {}).some(hasConfiguredValue),
      key: 'contact_channel',
      requiredForCustomerAI: true,
    },
    {
      isReady: hasLocation,
      key: 'location',
      requiredForCustomerAI: true,
    },
    {
      isReady: input.paymentMethodsCount > 0,
      key: 'payment_method',
      requiredForCustomerAI: true,
    },
    {
      isReady: input.deliveryMethodsCount > 0,
      key: 'delivery_method',
      requiredForCustomerAI: true,
    },
    {
      isReady: input.productsCount > 0,
      key: 'product_catalog',
      requiredForCustomerAI: true,
    },
  ];
};

export const getStoreReadiness = (input: StoreReadinessInput) => {
  const checks = getStoreReadinessItems(input)
    .filter(item => item.requiredForCustomerAI)
    .map(item => item.isReady);
  const completed = checks.filter(Boolean).length;
  const total = checks.length;
  const score = Math.round((completed / total) * 100);

  if (completed === 0) {
    return {
      completed,
      score,
      status: 'not_started',
      total,
    } as const;
  }

  if (completed < total) {
    return {
      completed,
      score,
      status: 'incomplete',
      total,
    } as const;
  }

  return {
    completed,
    score,
    status: 'ready',
    total,
  } as const;
};
