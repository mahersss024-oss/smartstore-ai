import type { AIEmployeeSemanticHints } from './AIEmployeeSemanticHints';
import type { MetaListRow, MetaReplyButton } from './MetaWhatsApp';
import type { TwilioConversationMetadata } from './TwilioConversationAdapter';
import {
  buildTwilioOutboundBody,
  readCustomerDetails,
  readFulfillmentChoices,
  readPaymentKinds,
  readSuggestedProducts,
  readVisibleSystemActions,
  replaceWebOnlyInstructions,

} from './TwilioConversationAdapter';

// The AI reply shape shared with the web/Twilio renderers.
type AIChannelResult = {
  availableFulfillmentTypes?: unknown;
  availablePaymentKinds?: unknown;
  customerDetails?: unknown;
  replyToCustomer: string;
  suggestedProducts?: unknown;
  visibleSystemActions?: unknown;
};

export type MetaOutboundMessage
  = | { body: string; buttonLabel: string; kind: 'list'; rows: MetaListRow[]; sectionTitle?: string }
    | { body: string; buttons: MetaReplyButton[]; kind: 'buttons' }
    | { body: string; kind: 'text' };

const WEB_ORDER_UI = 'web_order_ui' as const;

const fulfillmentLabel = (choice: 'delivery' | 'dine_in' | 'pickup') => {
  if (choice === 'delivery') {
    return 'توصيل';
  }

  if (choice === 'pickup') {
    return 'استلام من الفرع';
  }

  return 'محلي داخل الفرع';
};

const priceLabel = (price: string) => {
  const value = Number(price);

  return Number.isFinite(value) ? `${value.toFixed(2)} ريال` : '';
};

/**
 * Convert an AI reply into the richest WhatsApp Cloud API message the current
 * step supports — a list picker for product choices, reply buttons for
 * fulfillment / payment / confirmation — falling back to the full text body
 * (with numbered choices) when no interactive element applies or is empty.
 * One interactive element per message, so the active checkout step wins by
 * priority: products → fulfillment → payment → confirmation.
 */
export const buildMetaOutboundMessage = (result: AIChannelResult): MetaOutboundMessage => {
  const body = replaceWebOnlyInstructions(result.replyToCustomer.trim());
  const actions = readVisibleSystemActions(result.visibleSystemActions);

  if (actions.includes('product_choices')) {
    const rows = readSuggestedProducts(result.suggestedProducts)
      .slice(0, 10)
      .map(product => ({
        description: priceLabel(product.price) || undefined,
        id: `product:${product.id}`,
        title: product.name,
      }));

    if (rows.length > 0) {
      return { body, buttonLabel: 'اختر منتجاً', kind: 'list', rows, sectionTitle: 'المنتجات' };
    }
  }

  if (actions.includes('fulfillment_choices')) {
    const buttons = readFulfillmentChoices(result.availableFulfillmentTypes)
      .map(choice => ({ id: `fulfillment:${choice}`, title: fulfillmentLabel(choice) }));

    if (buttons.length > 0) {
      return { body, buttons, kind: 'buttons' };
    }
  }

  if (actions.includes('payment_choices')) {
    const preference = readCustomerDetails(result.customerDetails).deliveryPreference ?? 'pickup';
    const buttons = (readPaymentKinds(result.availablePaymentKinds)[preference] ?? [])
      .map(kind => ({ id: `payment:${kind}`, title: kind === 'cash' ? 'كاش' : 'بطاقة' }));

    if (buttons.length > 0) {
      return { body, buttons, kind: 'buttons' };
    }
  }

  if (actions.includes('final_confirmation')) {
    return {
      body,
      buttons: [{ id: 'confirm:order', title: 'تأكيد الطلب' }],
      kind: 'buttons',
    };
  }

  return { body: buildTwilioOutboundBody(result), kind: 'text' };
};

/**
 * Map a tapped reply button / list row payload id back into the trusted
 * semantic hint — the deterministic equivalent of text matching. Payload ids are
 * minted by buildMetaOutboundMessage (`product:<id>`, `fulfillment:<type>`,
 * `payment:<kind>`, `confirm:order`).
 */
export const resolveMetaInteractiveHints = (
  replyId: string,
  metadata?: TwilioConversationMetadata,
): AIEmployeeSemanticHints | undefined => {
  const separator = replyId.indexOf(':');
  const kind = separator === -1 ? replyId : replyId.slice(0, separator);
  const value = separator === -1 ? '' : replyId.slice(separator + 1);

  if (kind === 'product') {
    const productId = Number(value);

    if (Number.isInteger(productId) && productId > 0) {
      return {
        selectedProductId: productId,
        systemEvent: { source: WEB_ORDER_UI, type: 'product_selected' },
      };
    }
  }

  if (kind === 'fulfillment') {
    if (value === 'delivery') {
      return {
        deliveryPreference: 'delivery',
        fulfillmentType: 'delivery',
        systemEvent: { source: WEB_ORDER_UI, type: 'fulfillment_selected' },
      };
    }

    if (value === 'pickup' || value === 'dine_in') {
      return {
        deliveryPreference: 'pickup',
        fulfillmentType: value,
        systemEvent: { source: WEB_ORDER_UI, type: 'fulfillment_selected' },
      };
    }
  }

  if (kind === 'payment') {
    const deliveryPreference = metadata?.customerDetails?.deliveryPreference;

    if (value === 'cash') {
      return {
        paymentPreference: deliveryPreference === 'delivery' ? 'cash_on_delivery' : 'cash_on_pickup',
        systemEvent: { source: WEB_ORDER_UI, type: 'payment_selected' },
      };
    }

    if (value === 'card') {
      return {
        paymentPreference: deliveryPreference === 'delivery' ? 'card_on_delivery' : 'card_on_pickup',
        systemEvent: { source: WEB_ORDER_UI, type: 'payment_selected' },
      };
    }
  }

  if (kind === 'confirm') {
    return {
      customerConfirmedOrder: true,
      systemEvent: { source: WEB_ORDER_UI, type: 'order_confirmed' },
    };
  }

  return undefined;
};
