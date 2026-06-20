import type { AIEmployeeConversationCart } from './AIEmployeeCart';
import type { AIEmployeeCustomerDetails } from './AIEmployeeCheckout';
import type {
  AIEmployeeDialogueState,
  AIEmployeeSemanticUnderstanding,
} from './AIEmployeeOrchestration';
import type { AIOrchestrationCustomerNeed, AIOrchestrationVisibleSystemAction } from './AIOrchestrationDiagnostics';
import type { ConversationDecision } from './ConversationEngine';
import type { loadStoreAIContext } from './StoreAIContext';
import {
  getAllowedAIEmployeeDeliveryPreferences,
  getAllowedAIEmployeePaymentPreferences,
} from './AIEmployeeCheckout';
import { validateAIEmployeeRequestedCustomerNeed } from './AIEmployeeOrchestration';
import { generatePlatformAIText } from './PlatformAIClient';
import { getPlatformAIProviderConfig } from './PlatformAIProviderConfig';

type StoreAIContext = Awaited<ReturnType<typeof loadStoreAIContext>>;

export const parseAIEmployeeSemanticUnderstanding = (
  value: string | undefined,
): AIEmployeeSemanticUnderstanding => {
  if (!value) {
    return {};
  }

  const jsonMatch = value.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {};
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as AIEmployeeSemanticUnderstanding;
    const dialogueStates: AIEmployeeDialogueState[] = [
      'cart_cancellation',
      'catalog_inquiry',
      'complaint',
      'general',
      'order_confirmation',
      'order_followup',
      'order_pause',
      'order_request',
      'post_purchase_support',
      'review',
    ];
    const customerNeeds: AIOrchestrationCustomerNeed[] = [
      'customer_phone',
      'delivery_address',
      'fulfillment_method',
      'order_confirmation',
      'payment_method',
      'requested_product',
    ];

    return {
      cartItemRemovalRequested: typeof parsed.cartItemRemovalRequested === 'boolean'
        ? parsed.cartItemRemovalRequested
        : undefined,
      checkoutRequested: typeof parsed.checkoutRequested === 'boolean'
        ? parsed.checkoutRequested
        : undefined,
      customerAddress: typeof parsed.customerAddress === 'string' && parsed.customerAddress.trim()
        ? parsed.customerAddress.trim().slice(0, 500)
        : undefined,
      customerName: typeof parsed.customerName === 'string' && parsed.customerName.trim()
        ? parsed.customerName.trim().slice(0, 80)
        : undefined,
      dialogueState: dialogueStates.includes(parsed.dialogueState as AIEmployeeDialogueState)
        ? parsed.dialogueState
        : undefined,
      existingOrderModificationConfirmed:
        typeof parsed.existingOrderModificationConfirmed === 'boolean'
          ? parsed.existingOrderModificationConfirmed
          : undefined,
      existingOrderModificationRequested:
        typeof parsed.existingOrderModificationRequested === 'boolean'
          ? parsed.existingOrderModificationRequested
          : undefined,
      replaceExistingQuantity: typeof parsed.replaceExistingQuantity === 'boolean'
        ? parsed.replaceExistingQuantity
        : undefined,
      requestedCustomerNeed: customerNeeds.includes(
        parsed.requestedCustomerNeed as AIOrchestrationCustomerNeed,
      )
        ? parsed.requestedCustomerNeed
        : undefined,
      requestedQuantity:
        typeof parsed.requestedQuantity === 'number' && parsed.requestedQuantity > 0
          ? Math.min(Math.floor(parsed.requestedQuantity), 99)
          : undefined,
      supportEscalationConfirmed: typeof parsed.supportEscalationConfirmed === 'boolean'
        ? parsed.supportEscalationConfirmed
        : undefined,
    };
  } catch {
    return {};
  }
};

export const analyzeAIEmployeeMessageSemantics = async (params: {
  cart?: AIEmployeeConversationCart;
  customerDetails?: AIEmployeeCustomerDetails;
  lastAskedFor?: AIOrchestrationCustomerNeed | null;
  message: string;
  previousDialogueState?: AIEmployeeDialogueState;
  previousMissingDetails?: AIOrchestrationCustomerNeed[];
  storeContext?: StoreAIContext;
  storeName: string;
}): Promise<AIEmployeeSemanticUnderstanding> => {
  const config = await getPlatformAIProviderConfig();

  if (!config.enabled || !config.apiKey) {
    return {};
  }

  const allowedDeliveryPreferences = getAllowedAIEmployeeDeliveryPreferences(params.storeContext);
  const allowedPaymentPreferences = getAllowedAIEmployeePaymentPreferences(params.storeContext);
  const prompt = JSON.stringify({
    allowedDeliveryPreferences,
    allowedPaymentPreferences,
    currentCart: params.cart ?? null,
    customerDetails: params.customerDetails ?? null,
    lastAskedFor: params.lastAskedFor ?? null,
    previousDialogueState: params.previousDialogueState ?? null,
    previousMissingDetails: params.previousMissingDetails ?? [],
    store: params.storeContext
      ? {
          deliveryMethods: params.storeContext.deliveryMethods,
          knowledgeBase: params.storeContext.knowledgeBase,
          location: params.storeContext.store.location,
          paymentMethods: params.storeContext.paymentMethods,
          store: params.storeContext.store,
        }
      : null,
    task: [
      'Infer only the meaning needed by the internal store system to continue this order conversation.',
      'Return strict JSON only.',
      'Understand the customer meaning from any language, dialect, typo, slang, short reply, or indirect wording, then convert it to canonical fields.',
      'Use currentCart, customerDetails, previousDialogueState, deliveryMethods, paymentMethods, and conversation state rather than literal keyword matching.',
      'requestedCustomerNeed may be requested_product, customer_phone, fulfillment_method, delivery_address, payment_method, or order_confirmation.',
      'Set requestedCustomerNeed only when the customer conversation needs a platform-controlled UI or required data step.',
      'The platform validates and executes sensitive actions. Never mark order creation, cart mutation, payment, fulfillment, cancellation, review capture, or escalation as completed.',
      'A visible platform step does not lock the conversation. Follow the latest customer intent.',
      'Use lastAskedFor and previousMissingDetails only when the latest message actually answers them.',
      'When a cart is active and the customer indicates they are finished choosing items or wants to continue, set checkoutRequested to true even when the message is very short.',
      'dialogueState may be general, catalog_inquiry, order_request, order_confirmation, order_followup, order_pause, cart_cancellation, complaint, review, or post_purchase_support.',
      'Use complaint for a reported problem or dissatisfaction.',
      'Use post_purchase_support for a completed or previous purchase.',
      'Use catalog_inquiry for availability, menu, or category questions.',
      'Use order_request for buying, recommendations for a new order, or selecting a product.',
      'Use order_pause when the customer pauses current checkout without clearing the cart.',
      'Use cart_cancellation when the customer wants to clear the current cart.',
      'Use order_followup for status questions.',
      'Use review for rating or post-order feedback.',
      'Use order_confirmation only when the current cart can be sent and the customer wants to place it now.',
      'checkoutRequested is true only when the customer wants to continue or finish checkout.',
      'Do not set customerConfirmedOrder, deliveryPreference, fulfillmentType, or paymentPreference from free text. Those are controlled by validated system actions.',
      'customerName and customerAddress may be extracted only when clearly provided.',
      'Preserve map URLs or coordinates exactly as customerAddress.',
      'requestedQuantity is the clearly stated numeric quantity, capped by the platform later.',
      'replaceExistingQuantity is true only when the stated quantity replaces the current quantity.',
      'cartItemRemovalRequested is true when the customer wants an item removed.',
      'existingOrderModificationRequested is true when the customer wants to change an existing open order.',
      'existingOrderModificationConfirmed is true only for approval of a previously proposed modification.',
      'supportEscalationConfirmed is true only for clear approval to escalate a support issue.',
      'Do not invent missing values.',
    ],
    userMessage: params.message,
  });

  try {
    const text = await generatePlatformAIText(config, {
      input: prompt,
      instructions: `You understand customer messages for ${params.storeName}. Return JSON only.`,
    });

    return parseAIEmployeeSemanticUnderstanding(text);
  } catch {
    return {};
  }
};

export const analyzeAIEmployeeModelReplySystemNeed = async (params: {
  cart?: AIEmployeeConversationCart;
  currentVisibleSystemActions: AIOrchestrationVisibleSystemAction[];
  customerDetails?: AIEmployeeCustomerDetails;
  decision: ConversationDecision;
  pendingOrderModificationNeedsConfirmation: boolean;
  reply: string;
  storeContext?: StoreAIContext;
  storeName: string;
}): Promise<AIOrchestrationCustomerNeed | null> => {
  const config = await getPlatformAIProviderConfig();

  if (!config.enabled || !config.apiKey) {
    return null;
  }

  const prompt = JSON.stringify({
    assistantReply: params.reply,
    currentCart: params.cart ?? null,
    currentVisibleSystemActions: params.currentVisibleSystemActions,
    customerDetails: params.customerDetails ?? null,
    store: params.storeContext
      ? {
          deliveryMethods: params.storeContext.deliveryMethods,
          paymentMethods: params.storeContext.paymentMethods,
        }
      : null,
    task: [
      'Infer whether this assistant reply asks the customer for a platform-controlled next step.',
      'Return strict JSON only.',
      'Understand meaning from any language, dialect, typo, or indirect wording.',
      'requestedCustomerNeed may be requested_product, customer_phone, fulfillment_method, delivery_address, payment_method, or order_confirmation.',
      'Set it only if the reply asks for that next step or guides the customer to its system action.',
      'If the reply asks for more than one required step, return only the earliest unsatisfied step in this order: customer_phone, fulfillment_method, delivery_address, payment_method, order_confirmation.',
      'Omit it when the reply only answers a question, describes facts, or asks a normal follow-up.',
      'Do not request a need already satisfied by customerDetails.',
      'Do not invent values.',
    ],
  });

  try {
    const text = await generatePlatformAIText(config, {
      input: prompt,
      instructions: `You are an internal orchestration reviewer for ${params.storeName}. Return JSON only.`,
    });
    const semantic = parseAIEmployeeSemanticUnderstanding(text);

    return validateAIEmployeeRequestedCustomerNeed({
      cart: params.cart,
      customerDetails: params.customerDetails,
      decision: params.decision,
      pendingOrderModificationNeedsConfirmation: params.pendingOrderModificationNeedsConfirmation,
      requestedNeed: semantic.requestedCustomerNeed,
    });
  } catch {
    return null;
  }
};
