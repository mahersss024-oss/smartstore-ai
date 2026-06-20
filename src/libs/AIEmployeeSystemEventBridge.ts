import type { AIEmployeeSemanticHints } from './AIEmployeeSemanticHints';

export type AIEmployeeSystemEventContext = {
  customerMeaning: string;
  source: 'web_order_ui';
  type: NonNullable<AIEmployeeSemanticHints['systemEvent']>['type'];
};

type ProductLookup = {
  findCartItemName?: (productId: number) => string | undefined;
  findProductName?: (productId: number) => string | undefined;
};

const getProductName = (
  productId: number | undefined,
  lookup: ProductLookup,
) => {
  if (!productId) {
    return undefined;
  }

  return lookup.findProductName?.(productId)
    ?? lookup.findCartItemName?.(productId);
};

const describeFulfillment = (hints: AIEmployeeSemanticHints) => {
  if (hints.fulfillmentType === 'delivery' || hints.deliveryPreference === 'delivery') {
    return 'The customer selected delivery from the platform order interface.';
  }

  if (hints.fulfillmentType === 'dine_in') {
    return 'The customer selected dine-in from the platform order interface.';
  }

  return 'The customer selected branch pickup from the platform order interface.';
};

const describePayment = (hints: AIEmployeeSemanticHints) => {
  const payment = hints.paymentPreference?.startsWith('card_')
    ? 'card payment at handoff'
    : 'cash payment at handoff';

  return `The customer selected ${payment} from the platform order interface.`;
};

export const buildAIEmployeeSystemEventContext = (
  hints: AIEmployeeSemanticHints | undefined,
  lookup: ProductLookup = {},
): AIEmployeeSystemEventContext | undefined => {
  const eventType = hints?.systemEvent?.type;

  if (!eventType) {
    return undefined;
  }

  const source = 'web_order_ui' as const;

  if (eventType === 'product_selected' && hints.selectedProductId) {
    const productName = getProductName(hints.selectedProductId, lookup);

    return {
      customerMeaning: productName
        ? `The customer selected "${productName}" from the visible product choices.`
        : 'The customer selected a product from the visible product choices.',
      source,
      type: eventType,
    };
  }

  if (eventType === 'cart_quantity_changed' && hints.selectedProductId && hints.requestedQuantity) {
    const productName = getProductName(hints.selectedProductId, lookup);

    return {
      customerMeaning: productName
        ? `The customer changed "${productName}" quantity to ${hints.requestedQuantity} using cart controls.`
        : `The customer changed an item quantity to ${hints.requestedQuantity} using cart controls.`,
      source,
      type: eventType,
    };
  }

  if (eventType === 'cart_item_removed' && hints.removeCartItemProductId) {
    const productName = getProductName(hints.removeCartItemProductId, lookup);

    return {
      customerMeaning: productName
        ? `The customer removed "${productName}" from the cart using cart controls.`
        : 'The customer removed an item from the cart using cart controls.',
      source,
      type: eventType,
    };
  }

  if (eventType === 'cart_restored') {
    return {
      customerMeaning: 'The customer restored the previously cancelled cart using the platform restore action.',
      source,
      type: eventType,
    };
  }

  if (eventType === 'new_order_started') {
    return {
      customerMeaning: 'The customer chose to start a new order instead of restoring the cancelled cart.',
      source,
      type: eventType,
    };
  }

  if (eventType === 'fulfillment_selected') {
    return {
      customerMeaning: describeFulfillment(hints),
      source,
      type: eventType,
    };
  }

  if (eventType === 'location_shared') {
    return {
      customerMeaning: 'The customer shared a delivery location through the platform order interface.',
      source,
      type: eventType,
    };
  }

  if (eventType === 'payment_selected') {
    return {
      customerMeaning: describePayment(hints),
      source,
      type: eventType,
    };
  }

  if (eventType === 'order_confirmed') {
    return {
      customerMeaning: 'The customer confirmed sending the order using the platform confirmation action.',
      source,
      type: eventType,
    };
  }

  if (eventType === 'order_cancelled') {
    return {
      customerMeaning: 'The customer cancelled the pending order confirmation using the platform cancellation action.',
      source,
      type: eventType,
    };
  }

  return undefined;
};
