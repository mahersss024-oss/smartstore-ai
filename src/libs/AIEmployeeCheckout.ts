import type { AIEmployeeConversationCart } from './AIEmployeeCart';
import type { AIOrchestrationCustomerNeed } from './AIOrchestrationDiagnostics';
import type { loadStoreAIContext } from './StoreAIContext';
import { and, eq, or } from 'drizzle-orm';
import {
  deliveryMethodsTable,
  paymentMethodsTable,
} from '@/models/Schema';
import { toMoneyNumberOrZero } from './AIEmployeeCart';
import { db } from './DB';

type StoreAIContext = Awaited<ReturnType<typeof loadStoreAIContext>>;

export type AIEmployeeFulfillmentChoice = 'delivery' | 'dine_in' | 'pickup';
export type AIEmployeePaymentChoiceKind = 'card' | 'cash';

export type AIEmployeeCustomerDetails = {
  address?: string;
  deliveryPreference?: 'delivery' | 'pickup';
  email?: string;
  fulfillmentType?: 'delivery' | 'dine_in' | 'pickup';
  name?: string;
  paymentPreference?: 'card_on_delivery' | 'card_on_pickup' | 'cash_on_delivery' | 'cash_on_pickup';
  phone?: string;
};

type CheckoutSemanticUnderstanding = {
  customerAddress?: string;
  customerName?: string;
  deliveryPreference?: 'delivery' | 'pickup';
  fulfillmentType?: 'delivery' | 'dine_in' | 'pickup';
  paymentPreference?: 'card_on_delivery' | 'card_on_pickup' | 'cash_on_delivery' | 'cash_on_pickup';
};

type CustomerIdentity = {
  email?: string;
  name?: string;
  phone?: string;
};

const extractPhoneNumber = (message: string) => {
  const match = message.match(/\+?\d[\d\s-]{6,}\d/);

  return match?.[0]?.replace(/[^\d+]/g, '').slice(0, 30);
};

const extractEmailAddress = (message: string) => {
  const match = message.match(/[\w.%+-]+@[\d.a-z-]+\.[a-z]{2,}/i);

  return match?.[0]?.toLowerCase().slice(0, 255);
};

const mergeAddressParts = (
  previousAddress?: string,
  nextAddress?: string,
) => {
  const previous = previousAddress?.trim();
  const next = nextAddress?.trim();

  if (!previous) {
    return next;
  }

  if (!next || previous.includes(next)) {
    return previous;
  }

  if (next.includes(previous)) {
    return next;
  }

  return `${previous}, ${next}`.slice(0, 500);
};

export const getAllowedAIEmployeeDeliveryPreferences = (
  storeContext?: StoreAIContext,
) => {
  const activeTypes = new Set(storeContext?.deliveryMethods.map(method => method.type) ?? []);
  const allowed: Array<'delivery' | 'pickup'> = [];

  if (
    activeTypes.has('local_delivery')
    || activeTypes.has('scheduled_delivery')
    || activeTypes.has('courier_shipping')
    || activeTypes.has('digital')
  ) {
    allowed.push('delivery');
  }

  if (
    activeTypes.has('pickup')
    || activeTypes.has('curbside_pickup')
    || activeTypes.has('dine_in')
  ) {
    allowed.push('pickup');
  }

  return allowed;
};

export const normalizeAIEmployeeFulfillmentType = (
  fulfillmentType?: 'delivery' | 'dine_in' | 'pickup',
  deliveryPreference?: 'delivery' | 'pickup',
) => {
  if (fulfillmentType === 'dine_in') {
    return 'dine_in';
  }

  if (fulfillmentType === 'delivery' || fulfillmentType === 'pickup') {
    return fulfillmentType;
  }

  return deliveryPreference;
};

const paymentMethodSupportsDeliveryPreference = (
  method: StoreAIContext['paymentMethods'][number],
  deliveryPreference?: 'delivery' | 'pickup',
) => {
  if (!deliveryPreference) {
    return true;
  }

  const supportedDeliveryPreferences = Array.isArray(method.supportedDeliveryPreferences)
    ? method.supportedDeliveryPreferences
    : [];

  return supportedDeliveryPreferences.includes(deliveryPreference);
};

export const getAllowedAIEmployeePaymentPreferences = (
  storeContext?: StoreAIContext,
  deliveryPreference?: 'delivery' | 'pickup',
) => {
  const activeProviders = new Set(
    storeContext?.paymentMethods
      .filter(method => paymentMethodSupportsDeliveryPreference(method, deliveryPreference))
      .map(method => method.provider) ?? [],
  );

  return ([
    'cash_on_delivery',
    'card_on_delivery',
    'cash_on_pickup',
    'card_on_pickup',
  ] as const).filter(provider => activeProviders.has(provider));
};

const getDeliveryMethodTypePriority = (
  customerDetails?: AIEmployeeCustomerDetails,
) => {
  const fulfillmentType = normalizeAIEmployeeFulfillmentType(
    customerDetails?.fulfillmentType,
    customerDetails?.deliveryPreference,
  );

  if (fulfillmentType === 'dine_in') {
    return ['dine_in'];
  }

  if (fulfillmentType === 'pickup') {
    return ['pickup', 'curbside_pickup'];
  }

  if (fulfillmentType === 'delivery') {
    return ['local_delivery', 'scheduled_delivery', 'courier_shipping', 'digital'];
  }

  return [];
};

const findDeliveryMethodForCustomerDetails = (
  deliveryMethods: Array<{
    fee?: null | number | string;
    type: string;
  }>,
  customerDetails?: AIEmployeeCustomerDetails,
) => {
  const deliveryTypePriority = getDeliveryMethodTypePriority(customerDetails);

  return deliveryTypePriority
    .map(type => deliveryMethods.find(method => method.type === type))
    .find((method): method is {
      fee?: null | number | string;
      type: string;
    } => Boolean(method));
};

export const calculateAIEmployeeOrderPricing = (params: {
  customerDetails?: AIEmployeeCustomerDetails;
  deliveryFee?: null | number | string;
  storeContext?: StoreAIContext;
  subtotal: number;
}) => {
  const method = params.deliveryFee === undefined
    ? findDeliveryMethodForCustomerDetails(
        params.storeContext?.deliveryMethods ?? [],
        params.customerDetails,
      )
    : undefined;
  const deliveryFee = Math.max(0, toMoneyNumberOrZero(params.deliveryFee ?? method?.fee));

  return {
    deliveryFee,
    subtotal: params.subtotal,
    total: params.subtotal + deliveryFee,
  };
};

export const applyAIEmployeeCartPricing = <T extends AIEmployeeConversationCart>(
  cart: T | undefined,
  params: {
    customerDetails?: AIEmployeeCustomerDetails;
    storeContext?: StoreAIContext;
  },
): T | undefined => {
  if (!cart) {
    return undefined;
  }

  const pricing = calculateAIEmployeeOrderPricing({
    customerDetails: params.customerDetails,
    storeContext: params.storeContext,
    subtotal: cart.subtotal,
  });

  return {
    ...cart,
    deliveryFee: pricing.deliveryFee,
    total: pricing.total,
  };
};

const getAIEmployeeFulfillmentChoiceFromDeliveryType = (type: string): AIEmployeeFulfillmentChoice | null => {
  if (type === 'dine_in') {
    return 'dine_in';
  }

  if (type === 'pickup' || type === 'curbside_pickup') {
    return 'pickup';
  }

  if (
    type === 'local_delivery'
    || type === 'courier_shipping'
    || type === 'digital'
    || type === 'scheduled_delivery'
  ) {
    return 'delivery';
  }

  return null;
};

const getAIEmployeePaymentChoiceKind = (provider: string): AIEmployeePaymentChoiceKind | null => {
  if (provider.startsWith('card_')) {
    return 'card';
  }

  if (provider.startsWith('cash_')) {
    return 'cash';
  }

  return null;
};

export const getAvailableAIEmployeeServiceChoices = (storeContext?: StoreAIContext) => {
  const configuredFulfillmentTypes = Array.from(
    new Set(
      storeContext?.deliveryMethods
        .map(method => getAIEmployeeFulfillmentChoiceFromDeliveryType(method.type))
        .filter((choice): choice is AIEmployeeFulfillmentChoice => Boolean(choice)) ?? [],
    ),
  );
  const availablePaymentKinds = (storeContext?.paymentMethods ?? []).reduce<{
    delivery: AIEmployeePaymentChoiceKind[];
    pickup: AIEmployeePaymentChoiceKind[];
  }>((choices, method) => {
    const kind = getAIEmployeePaymentChoiceKind(method.provider);

    if (!kind) {
      return choices;
    }

    for (const deliveryPreference of method.supportedDeliveryPreferences) {
      if (!choices[deliveryPreference].includes(kind)) {
        choices[deliveryPreference].push(kind);
      }
    }

    return choices;
  }, { delivery: [], pickup: [] });
  const availableFulfillmentTypes = configuredFulfillmentTypes.filter((choice) => {
    return choice === 'delivery'
      ? availablePaymentKinds.delivery.length > 0
      : availablePaymentKinds.pickup.length > 0;
  });

  return {
    availableFulfillmentTypes,
    availablePaymentKinds,
  };
};

export const resolveAIEmployeeOrderServiceMethodIds = async (params: {
  customerDetails?: AIEmployeeCustomerDetails;
  organizationId: string;
}) => {
  const deliveryTypePriority = getDeliveryMethodTypePriority(params.customerDetails);
  const paymentProvider = params.customerDetails?.paymentPreference;
  const [deliveryMethods, paymentMethods] = await Promise.all([
    db
      .select({
        fee: deliveryMethodsTable.fee,
        id: deliveryMethodsTable.id,
        type: deliveryMethodsTable.type,
      })
      .from(deliveryMethodsTable)
      .where(
        and(
          eq(deliveryMethodsTable.organizationId, params.organizationId),
          eq(deliveryMethodsTable.isActive, true),
        ),
      ),
    db
      .select({
        id: paymentMethodsTable.id,
        provider: paymentMethodsTable.provider,
        supportedDeliveryMethods: paymentMethodsTable.supportedDeliveryMethods,
      })
      .from(paymentMethodsTable)
      .where(
        and(
          eq(paymentMethodsTable.organizationId, params.organizationId),
          eq(paymentMethodsTable.isActive, true),
          or(
            eq(paymentMethodsTable.provider, 'cash_on_delivery'),
            eq(paymentMethodsTable.provider, 'card_on_delivery'),
            eq(paymentMethodsTable.provider, 'cash_on_pickup'),
            eq(paymentMethodsTable.provider, 'card_on_pickup'),
          ),
        ),
      ),
  ]);
  const deliveryMethod = deliveryTypePriority
    .map(type => deliveryMethods.find(method => method.type === type))
    .find((method): method is (typeof deliveryMethods)[number] => Boolean(method));
  const deliveryMethodId = deliveryMethod?.id;
  const paymentMethodId = paymentProvider
    ? paymentMethods.find((method) => {
      const supportedDeliveryPreferences = Array.isArray(method.supportedDeliveryMethods)
        ? method.supportedDeliveryMethods
        : [];

      return method.provider === paymentProvider
        && (
          !params.customerDetails?.deliveryPreference
          || supportedDeliveryPreferences.includes(params.customerDetails.deliveryPreference)
        );
    })?.id
    : undefined;

  return {
    deliveryFee: deliveryMethod?.fee ?? '0',
    deliveryMethodId,
    paymentMethodId,
  };
};

export const constrainAIEmployeeSemanticUnderstandingToStoreMethods = <
  T extends CheckoutSemanticUnderstanding,
>(
  semanticUnderstanding: T,
  storeContext?: StoreAIContext,
  options?: {
    lastAskedFor?: AIOrchestrationCustomerNeed | null;
    message?: string;
    previousMissingDetails?: AIOrchestrationCustomerNeed[];
    previousCustomerDetails?: AIEmployeeCustomerDetails;
  },
): T => {
  const allowedDeliveryPreferences = getAllowedAIEmployeeDeliveryPreferences(storeContext);
  const deliveryPreference = semanticUnderstanding.deliveryPreference
    && allowedDeliveryPreferences.includes(semanticUnderstanding.deliveryPreference)
    ? semanticUnderstanding.deliveryPreference
    : undefined;
  const allowedPaymentPreferences = getAllowedAIEmployeePaymentPreferences(
    storeContext,
    deliveryPreference ?? options?.previousCustomerDetails?.deliveryPreference,
  );

  return {
    ...semanticUnderstanding,
    deliveryPreference,
    fulfillmentType: normalizeAIEmployeeFulfillmentType(
      semanticUnderstanding.fulfillmentType,
      deliveryPreference ?? options?.previousCustomerDetails?.deliveryPreference,
    ),
    paymentPreference: semanticUnderstanding.paymentPreference
      && allowedPaymentPreferences.includes(semanticUnderstanding.paymentPreference)
      ? semanticUnderstanding.paymentPreference
      : undefined,
  };
};

export const extractAIEmployeeCustomerDetails = (
  previousDetails: AIEmployeeCustomerDetails | undefined,
  message: string,
  customer: CustomerIdentity,
  customerAddress?: string,
  semanticUnderstanding?: CheckoutSemanticUnderstanding,
): AIEmployeeCustomerDetails => {
  const deliveryPreference = semanticUnderstanding?.deliveryPreference
    ?? previousDetails?.deliveryPreference;
  const paymentPreference = semanticUnderstanding?.paymentPreference
    ?? previousDetails?.paymentPreference;
  const fulfillmentType = normalizeAIEmployeeFulfillmentType(
    semanticUnderstanding?.fulfillmentType,
    deliveryPreference,
  ) ?? previousDetails?.fulfillmentType;
  const extractedAddress = semanticUnderstanding?.customerAddress;
  const shouldKeepDeliveryAddress = deliveryPreference === 'delivery'
    || fulfillmentType === 'delivery';

  return {
    address: shouldKeepDeliveryAddress
      ? mergeAddressParts(
          previousDetails?.address ?? customerAddress?.trim(),
          extractedAddress,
        )
      : undefined,
    deliveryPreference,
    fulfillmentType,
    email: customer.email?.trim()
      || extractEmailAddress(message)
      || previousDetails?.email,
    name: customer.name?.trim()
      || semanticUnderstanding?.customerName
      || previousDetails?.name,
    paymentPreference,
    phone: customer.phone?.trim()
      || extractPhoneNumber(message)
      || previousDetails?.phone,
  };
};

export const getAIEmployeeDeliveryCustomerAddress = (
  customerDetails?: AIEmployeeCustomerDetails,
  fallbackAddress?: string,
) => {
  const fulfillmentType = normalizeAIEmployeeFulfillmentType(
    customerDetails?.fulfillmentType,
    customerDetails?.deliveryPreference,
  );

  if (fulfillmentType !== 'delivery') {
    return undefined;
  }

  return customerDetails?.address?.trim()
    || fallbackAddress?.trim()
    || undefined;
};

export const getMissingAIEmployeeOrderDetails = (params: {
  cart?: Pick<AIEmployeeConversationCart, 'items'>;
  customerDetails?: AIEmployeeCustomerDetails;
}) => {
  const missingDetails: AIOrchestrationCustomerNeed[] = [];

  if (!params.cart || params.cart.items.length === 0) {
    missingDetails.push('requested_product');
  }

  if (!params.customerDetails?.phone) {
    missingDetails.push('customer_phone');
  }

  if (!params.customerDetails?.deliveryPreference) {
    missingDetails.push('fulfillment_method');
  }

  if (
    params.customerDetails?.deliveryPreference === 'delivery'
    && !params.customerDetails.address
  ) {
    missingDetails.push('delivery_address');
  }

  if (!params.customerDetails?.paymentPreference) {
    missingDetails.push('payment_method');
  }

  return missingDetails;
};
