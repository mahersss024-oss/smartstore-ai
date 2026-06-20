import type { AIEmployeeConversationCart } from '@/libs/AIEmployeeCart';
import type { AIEmployeeCustomerDetails } from '@/libs/AIEmployeeCheckout';
import type { AIEmployeeDialogueState } from '@/libs/AIEmployeeOrchestration';
import type { ConversationDecision, ConversationOrderItem } from '@/libs/ConversationEngine';
import { getMissingAIEmployeeOrderDetails } from '@/libs/AIEmployeeCheckout';
import { PLATFORM_AI_POLICY_VERSION } from './AIEmployeeAgentPrompt';

export const MAX_PRODUCT_CARDS_IN_CHAT = 8;
const INTERNAL_DECISION_REPLY = 'internal_decision_only';

export const buildDecision = async (params: {
  cart?: AIEmployeeConversationCart;
  checkoutRequested?: boolean;
  customerConfirmedOrder?: boolean;
  customerDetails?: AIEmployeeCustomerDetails;
  dialogueState: AIEmployeeDialogueState;
  existingOrderModificationInProgress?: boolean;
  items: ConversationOrderItem[];
  suggestedProducts: NonNullable<ConversationDecision['suggestedProducts']>;
  unavailableProduct?: ConversationDecision['unavailableProduct'];
}) => {
  const {
    cart,
    checkoutRequested,
    customerConfirmedOrder,
    customerDetails,
    dialogueState,
    existingOrderModificationInProgress,
    items,
    suggestedProducts,
    unavailableProduct,
  } = params;
  const missingDetails: string[] = [];
  const customerConfirmed = customerConfirmedOrder === true;

  if (unavailableProduct) {
    return {
      confidence: suggestedProducts.length > 0 ? 0.84 : 0.72,
      intent: 'order_request',
      missingDetails,
      policyVersion: PLATFORM_AI_POLICY_VERSION,
      reply: INTERNAL_DECISION_REPLY,
      suggestedProducts,
      shouldCreateDraftOrder: false,
      unavailableProduct,
    } satisfies ConversationDecision;
  }

  if (dialogueState === 'review') {
    return {
      confidence: 0.86,
      intent: 'review_response',
      missingDetails,
      policyVersion: PLATFORM_AI_POLICY_VERSION,
      reply: INTERNAL_DECISION_REPLY,
      shouldCreateDraftOrder: false,
    } satisfies ConversationDecision;
  }

  if (dialogueState === 'complaint') {
    return {
      confidence: 0.9,
      intent: 'order_followup',
      missingDetails,
      policyVersion: PLATFORM_AI_POLICY_VERSION,
      reply: INTERNAL_DECISION_REPLY,
      shouldCreateDraftOrder: false,
    } satisfies ConversationDecision;
  }

  if (dialogueState === 'cart_cancellation') {
    return {
      confidence: 0.88,
      intent: 'general_question',
      missingDetails,
      policyVersion: PLATFORM_AI_POLICY_VERSION,
      reply: INTERNAL_DECISION_REPLY,
      shouldCreateDraftOrder: false,
    } satisfies ConversationDecision;
  }

  if (dialogueState === 'post_purchase_support') {
    return {
      confidence: 0.86,
      intent: 'order_followup',
      missingDetails,
      policyVersion: PLATFORM_AI_POLICY_VERSION,
      reply: INTERNAL_DECISION_REPLY,
      shouldCreateDraftOrder: false,
    } satisfies ConversationDecision;
  }

  if (dialogueState === 'order_pause') {
    return {
      confidence: 0.78,
      intent: 'order_request',
      missingDetails,
      policyVersion: PLATFORM_AI_POLICY_VERSION,
      reply: INTERNAL_DECISION_REPLY,
      shouldCreateDraftOrder: false,
    } satisfies ConversationDecision;
  }

  if (dialogueState === 'catalog_inquiry') {
    const scopedProducts = suggestedProducts.length > 0
      ? suggestedProducts.slice(0, MAX_PRODUCT_CARDS_IN_CHAT)
      : [];

    return {
      confidence: 0.9,
      intent: 'general_question',
      missingDetails,
      policyVersion: PLATFORM_AI_POLICY_VERSION,
      reply: INTERNAL_DECISION_REPLY,
      suggestedProducts: scopedProducts,
      shouldCreateDraftOrder: false,
    } satisfies ConversationDecision;
  }

  if (suggestedProducts.length > 0 && (!cart?.items.length || items.length === 0)) {
    const visibleSuggestions = suggestedProducts.slice(0, MAX_PRODUCT_CARDS_IN_CHAT);

    return {
      confidence: 0.8,
      intent: 'order_request',
      missingDetails,
      policyVersion: PLATFORM_AI_POLICY_VERSION,
      reply: INTERNAL_DECISION_REPLY,
      suggestedProducts: visibleSuggestions,
      shouldCreateDraftOrder: false,
    } satisfies ConversationDecision;
  }

  if (dialogueState === 'order_request' || dialogueState === 'order_confirmation') {
    const shouldCollectCheckoutDetails = dialogueState === 'order_confirmation'
      || customerConfirmed
      || checkoutRequested === true
      || items.length > 0;

    if (!shouldCollectCheckoutDetails) {
      const visibleSuggestions = suggestedProducts.slice(0, MAX_PRODUCT_CARDS_IN_CHAT);

      return {
        confidence: visibleSuggestions.length > 0 ? 0.78 : 0.66,
        intent: visibleSuggestions.length > 0 ? 'order_request' : 'general_question',
        missingDetails,
        policyVersion: PLATFORM_AI_POLICY_VERSION,
        reply: INTERNAL_DECISION_REPLY,
        suggestedProducts: visibleSuggestions.length > 0 ? visibleSuggestions : undefined,
        shouldCreateDraftOrder: false,
      } satisfies ConversationDecision;
    }

    missingDetails.push(...getMissingAIEmployeeOrderDetails({ cart, customerDetails }));

    const readyForConfirmation = Boolean(cart && cart.items.length > 0 && missingDetails.length === 0);
    const confirmationWasRequested = Boolean(cart?.confirmationRequestedAt);
    const canCreateOrder = Boolean(
      readyForConfirmation
      && customerConfirmed
      && confirmationWasRequested
      && !existingOrderModificationInProgress,
    );
    return {
      confidence: items.length > 0 ? 0.82 : 0.58,
      intent: 'order_request',
      missingDetails,
      policyVersion: PLATFORM_AI_POLICY_VERSION,
      reply: INTERNAL_DECISION_REPLY,
      requiresCustomerConfirmation: readyForConfirmation && !canCreateOrder && !existingOrderModificationInProgress,
      shouldCreateDraftOrder: canCreateOrder,
    } satisfies ConversationDecision;
  }

  if (suggestedProducts.length > 0) {
    const visibleSuggestions = suggestedProducts.slice(0, MAX_PRODUCT_CARDS_IN_CHAT);

    return {
      confidence: 0.78,
      intent: 'order_request',
      missingDetails,
      policyVersion: PLATFORM_AI_POLICY_VERSION,
      reply: INTERNAL_DECISION_REPLY,
      suggestedProducts: visibleSuggestions,
      shouldCreateDraftOrder: false,
    } satisfies ConversationDecision;
  }

  if (dialogueState === 'order_followup') {
    return {
      confidence: 0.74,
      intent: 'order_followup',
      missingDetails,
      policyVersion: PLATFORM_AI_POLICY_VERSION,
      reply: INTERNAL_DECISION_REPLY,
      shouldCreateDraftOrder: false,
    } satisfies ConversationDecision;
  }

  return {
    confidence: 0.62,
    intent: 'general_question',
    missingDetails,
    policyVersion: PLATFORM_AI_POLICY_VERSION,
    reply: INTERNAL_DECISION_REPLY,
    shouldCreateDraftOrder: false,
  } satisfies ConversationDecision;
};
