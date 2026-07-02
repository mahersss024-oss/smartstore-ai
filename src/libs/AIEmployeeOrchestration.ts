import type { AIEmployeeCartMutationContext, AIEmployeeConversationCart } from './AIEmployeeCart';
import type { AIEmployeeCustomerDetails } from './AIEmployeeCheckout';
import type { AIEmployeeSemanticHints } from './AIEmployeeSemanticHints';
import type {
  AIOrchestrationCustomerNeed,
  AIOrchestrationQuality,
  AIOrchestrationVisibleSystemAction,
} from './AIOrchestrationDiagnostics';
import type {
  ConversationDecision,
  ConversationOrderItem,
  ConversationSuggestedProduct,
} from './ConversationEngine';
import {
  classifyRequestedCustomerNeed,
  evaluateAIOrchestrationQuality,
  shouldReportInvalidRequestedCustomerNeed,
} from './AIOrchestrationDiagnostics';
import { extractConversationRating } from './ConversationEngine';
import { PLATFORM_AI_POLICY_VERSION } from './PlatformAIPolicy';

const CANCELLED_CART_RESTORE_WINDOW_MS = 15 * 60 * 1000;

export type AIEmployeeDialogueState
  = | 'cart_cancellation'
    | 'catalog_inquiry'
    | 'complaint'
    | 'general'
    | 'order_confirmation'
    | 'order_followup'
    | 'order_pause'
    | 'order_request'
    | 'post_purchase_support'
    | 'review';

export type AIEmployeeSemanticUnderstanding = {
  cartItemRemovalRequested?: boolean;
  checkoutRequested?: boolean;
  customerCancelledOrder?: boolean;
  customerAddress?: string;
  customerConfirmedOrder?: boolean;
  customerName?: string;
  deliveryPreference?: 'delivery' | 'pickup';
  dialogueState?: AIEmployeeDialogueState;
  existingOrderModificationConfirmed?: boolean;
  existingOrderModificationRequested?: boolean;
  fulfillmentType?: 'delivery' | 'dine_in' | 'pickup';
  paymentPreference?: 'card_on_delivery' | 'card_on_pickup' | 'cash_on_delivery' | 'cash_on_pickup';
  referencedOrderId?: number;
  replaceExistingQuantity?: boolean;
  requestedCustomerNeed?: AIOrchestrationCustomerNeed;
  requestedQuantity?: number;
  removeCartItemProductId?: number;
  supportEscalationConfirmed?: boolean;
};

export type AIEmployeeCancelledCartSnapshot = {
  cancelledAt: string;
  cart: AIEmployeeConversationCart;
  expiresAt: string;
};

export type AIEmployeeDialogueResult = {
  referencedOrderId: null | number;
  shouldClearCart: boolean;
  shouldSuppressCommerce: boolean;
  state: AIEmployeeDialogueState;
};

export type AIEmployeeOrchestrationTrace = {
  executionResult: Record<string, unknown>;
  issues: string[];
  modelIntent: Record<string, unknown>;
  protocolVersion: string;
  quality: AIOrchestrationQuality;
  systemDecision: Record<string, unknown>;
  systemDecisionReasons: string[];
};

export type AIEmployeeReplyGuardCheck = {
  mode: 'deterministic' | 'model_repair' | 'semantic_review';
  name: string;
  reason?: string;
  result: 'guarded' | 'noted' | 'passed' | 'repaired' | 'unavailable';
};

export type AIEmployeeReplyGuardResult = {
  checks: AIEmployeeReplyGuardCheck[];
  guarded: boolean;
  reason?: string;
  repaired?: boolean;
  repairReason?: string;
  reply: string;
};

export type AIEmployeeReplyGuardDecisionSummary = {
  checkedCount: number;
  guardedCheck: AIEmployeeReplyGuardCheck | null;
  guardedMode: AIEmployeeReplyGuardCheck['mode'] | null;
  notedChecks: string[];
  passedChecks: string[];
  repairedChecks: string[];
  semanticReviewUnavailable: boolean;
};

type ConversationMetadataForHints = {
  aiOrchestration?: {
    systemDecision?: {
      visibleSystemActions?: AIOrchestrationVisibleSystemAction[];
    };
  };
  cancelledCartSnapshot?: AIEmployeeCancelledCartSnapshot | null;
  customerDetails?: AIEmployeeCustomerDetails;
  currentCart?: AIEmployeeConversationCart;
  lastAskedFor?: AIOrchestrationCustomerNeed | null;
  lastOrder?: {
    id: number;
  };
  lastSuggestedProducts?: ConversationSuggestedProduct[];
  missingDetails?: AIOrchestrationCustomerNeed[];
};

const extractOrderReference = (message: string) => {
  const trimmed = message.trim();
  const match = trimmed.match(/^#?(\d{1,10})$/);

  return match?.[1] ? Number(match[1]) : null;
};

export const getRestorableAIEmployeeCancelledCartSnapshot = (
  snapshot?: AIEmployeeCancelledCartSnapshot | null,
) => {
  if (!snapshot?.cart.items.length) {
    return undefined;
  }

  const expiresAt = Date.parse(snapshot.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return undefined;
  }

  return snapshot;
};

export const buildAIEmployeeCancelledCartSnapshot = (
  cart?: AIEmployeeConversationCart,
): AIEmployeeCancelledCartSnapshot | undefined => {
  if (!cart?.items.length || cart.status !== 'collecting') {
    return undefined;
  }

  const cancelledAt = new Date();
  const expiresAt = new Date(cancelledAt.getTime() + CANCELLED_CART_RESTORE_WINDOW_MS);

  return {
    cancelledAt: cancelledAt.toISOString(),
    cart: {
      ...cart,
      confirmationRequestedAt: undefined,
      updatedAt: cancelledAt.toISOString(),
    },
    expiresAt: expiresAt.toISOString(),
  };
};

export const orchestrateAIEmployeeDialogueState = (params: {
  cart?: AIEmployeeConversationCart;
  customerCancelledOrder?: boolean;
  customerConfirmedOrder?: boolean;
  lastOrder?: {
    id: number;
  };
  locale?: string;
  message: string;
  requestedItems: ConversationOrderItem[];
  semanticUnderstanding?: AIEmployeeSemanticUnderstanding;
  suggestedProducts: ConversationSuggestedProduct[];
}): AIEmployeeDialogueResult => {
  const referencedOrderId = extractOrderReference(params.message);
  const semanticReferencedOrderId = params.semanticUnderstanding?.referencedOrderId;
  const customerCancelled = params.customerCancelledOrder === true;
  const customerConfirmed = params.customerConfirmedOrder === true;
  const semanticState = params.semanticUnderstanding?.dialogueState;
  const hasActiveCart = Boolean(params.cart?.items.length);
  const hasComplaintIntent = semanticState === 'complaint';
  const hasCartCancellation = semanticState === 'cart_cancellation';
  const hasCatalogInquiry = semanticState === 'catalog_inquiry';
  const hasOrderPause = hasActiveCart && semanticState === 'order_pause';
  const hasRecommendationInquiry = semanticState === 'order_request';
  // A bare 1-5 digit is treated as a rating ONLY when nothing in the turn signals
  // an order; otherwise a quantity like "اريد 2 برجر" / "اضف 2" would be misrouted
  // to review and have commerce suppressed. An explicit model `review` state always
  // wins.
  const hasOrderSignal = params.requestedItems.length > 0
    || hasActiveCart
    || semanticState === 'order_request'
    || semanticState === 'order_confirmation'
    || params.suggestedProducts.length > 0;
  const hasReviewIntent = semanticState === 'review'
    || (extractConversationRating(params.message) !== null && !hasOrderSignal);
  const hasFollowupIntent = semanticState === 'order_followup';
  const hasCheckoutDetailIntent = hasActiveCart
    && (params.semanticUnderstanding?.deliveryPreference
      || params.semanticUnderstanding?.paymentPreference
      || /\+?\d[\d\s-]{6,}\d/.test(params.message));
  const hasOrderIntent = semanticState === 'order_request'
    || semanticState === 'order_confirmation'
    || params.requestedItems.length > 0
    || hasCheckoutDetailIntent
    || Boolean(hasActiveCart && customerConfirmed);
  const referencesLastOrder = Boolean(params.lastOrder)
    && (semanticState === 'post_purchase_support'
      || (semanticReferencedOrderId ?? referencedOrderId) === params.lastOrder?.id);

  let state: AIEmployeeDialogueState = 'general';

  if (customerCancelled) {
    state = 'cart_cancellation';
  } else if (hasComplaintIntent) {
    state = 'complaint';
  } else if (hasOrderPause) {
    state = 'order_pause';
  } else if (hasCartCancellation) {
    state = 'cart_cancellation';
  } else if (hasReviewIntent) {
    state = 'review';
  } else if (referencesLastOrder) {
    state = 'post_purchase_support';
  } else if (hasCatalogInquiry) {
    state = 'catalog_inquiry';
  } else if (hasFollowupIntent || referencedOrderId) {
    state = 'order_followup';
  } else if (hasActiveCart && customerConfirmed) {
    state = 'order_confirmation';
  } else if (hasActiveCart) {
    state = 'order_request';
  } else if (hasOrderIntent || hasRecommendationInquiry || params.suggestedProducts.length > 0) {
    state = 'order_request';
  }

  return {
    referencedOrderId: semanticReferencedOrderId ?? referencedOrderId,
    shouldClearCart: state === 'cart_cancellation',
    shouldSuppressCommerce: state === 'cart_cancellation'
      || state === 'complaint'
      || state === 'post_purchase_support'
      || state === 'review',
    state,
  };
};

export const getNextAIEmployeeCustomerNeed = (
  decision: ConversationDecision,
): AIOrchestrationCustomerNeed | null => {
  if (decision.missingDetails.length > 0) {
    return decision.missingDetails[0] as AIOrchestrationCustomerNeed;
  }

  if (decision.requiresCustomerConfirmation === true) {
    return 'order_confirmation';
  }

  return null;
};

export const getVisibleAIEmployeeSystemActions = (params: {
  cancelledCartSnapshot?: AIEmployeeCancelledCartSnapshot | null;
  cart?: AIEmployeeConversationCart;
  missingDetails: string[];
  suggestedProducts: ConversationSuggestedProduct[];
}) => {
  const actions = new Set<AIOrchestrationVisibleSystemAction>();

  if (
    params.suggestedProducts.length > 0
    && params.cart?.status !== 'submitted'
  ) {
    actions.add('product_choices');
  }

  if (params.cart?.status === 'collecting' && params.cart.items.length > 0) {
    actions.add('cart_controls');
  }

  if (
    !params.cart?.items.length
    && getRestorableAIEmployeeCancelledCartSnapshot(params.cancelledCartSnapshot)
  ) {
    actions.add('restore_cancelled_cart');
  }

  const primaryNeed = params.missingDetails[0];
  if (primaryNeed === 'fulfillment_method') {
    actions.add('fulfillment_choices');
  } else if (primaryNeed === 'delivery_address') {
    actions.add('location_share');
  } else if (primaryNeed === 'payment_method') {
    actions.add('payment_choices');
  } else if (primaryNeed === 'order_confirmation') {
    actions.add('final_confirmation');
  }

  return Array.from(actions);
};

const AI_EMPLOYEE_BASIC_CHECKOUT_NEEDS = new Set<AIOrchestrationCustomerNeed>([
  'customer_phone',
  'delivery_address',
  'fulfillment_method',
  'payment_method',
]);

export const getFirstAIEmployeeBasicCheckoutNeed = (
  missingDetails: string[],
): AIOrchestrationCustomerNeed | null => {
  return missingDetails.find((need): need is AIOrchestrationCustomerNeed => {
    return AI_EMPLOYEE_BASIC_CHECKOUT_NEEDS.has(need as AIOrchestrationCustomerNeed);
  }) ?? null;
};

export const getPendingAIEmployeeProductSelectionNeed = (params: {
  cartMutation: AIEmployeeCartMutationContext;
  requestedItems: ConversationOrderItem[];
  suggestedProducts: ConversationSuggestedProduct[];
}) => {
  return params.suggestedProducts.length > 0
    && params.requestedItems.length === 0
    && params.cartMutation.type === 'none'
    ? 'requested_product' as const
    : null;
};

const pushUnique = (values: string[], value: string) => {
  if (!values.includes(value)) {
    values.push(value);
  }
};

export const getAIEmployeeReplyGuardDecisionSummary = (
  checks: AIEmployeeReplyGuardCheck[],
): AIEmployeeReplyGuardDecisionSummary => {
  const guardedCheck = checks.find(check => check.result === 'guarded') ?? null;

  return {
    checkedCount: checks.length,
    guardedCheck,
    guardedMode: guardedCheck?.mode ?? null,
    notedChecks: checks
      .filter(check => check.result === 'noted')
      .map(check => check.name),
    passedChecks: checks
      .filter(check => check.result === 'passed')
      .map(check => check.name),
    repairedChecks: checks
      .filter(check => check.result === 'repaired')
      .map(check => check.name),
    semanticReviewUnavailable: checks.some(
      check => check.mode === 'semantic_review' && check.result === 'unavailable',
    ),
  };
};

export const getAIEmployeeReplyGuardOrchestrationIssues = (
  guardResult: AIEmployeeReplyGuardResult,
) => {
  const issues: string[] = [];
  const decision = getAIEmployeeReplyGuardDecisionSummary(guardResult.checks);

  if (guardResult.guarded) {
    pushUnique(issues, 'model_reply_guarded');

    if (decision.guardedMode === 'deterministic') {
      pushUnique(issues, 'deterministic_reply_guard_triggered');
    } else if (decision.guardedMode === 'semantic_review') {
      pushUnique(issues, 'semantic_reply_review_guarded');
    }

    if (decision.guardedCheck?.name) {
      pushUnique(issues, `reply_guard_${decision.guardedCheck.name}`);
    }
  }

  if (guardResult.repaired) {
    pushUnique(issues, 'model_reply_repaired');
  }

  if (decision.notedChecks.length > 0) {
    pushUnique(issues, 'semantic_reply_review_note');
  }

  if (decision.semanticReviewUnavailable) {
    pushUnique(issues, 'semantic_reply_review_unavailable');
  }

  return issues;
};

const getAIOrchestrationIssues = (params: {
  cart?: AIEmployeeConversationCart;
  cartMutation: AIEmployeeCartMutationContext;
  decision: ConversationDecision;
  requestedCustomerNeedFromModel?: AIOrchestrationCustomerNeed | null;
  semanticUnderstanding: AIEmployeeSemanticUnderstanding;
  systemNextCustomerNeed?: AIOrchestrationCustomerNeed | null;
  visibleSystemActions: AIOrchestrationVisibleSystemAction[];
}) => {
  const issues: string[] = [];
  const requestedNeed = params.semanticUnderstanding.requestedCustomerNeed;

  if (
    shouldReportInvalidRequestedCustomerNeed({
      requestedCustomerNeed: requestedNeed,
      requestedCustomerNeedAccepted: params.requestedCustomerNeedFromModel,
      systemNextCustomerNeed: params.systemNextCustomerNeed,
      visibleSystemActions: params.visibleSystemActions,
    })
  ) {
    pushUnique(issues, 'model_requested_invalid_system_need');
  }

  if (
    params.decision.requiresCustomerConfirmation === true
    && !params.visibleSystemActions.includes('final_confirmation')
  ) {
    pushUnique(issues, 'confirmation_required_without_visible_action');
  }

  if (
    params.visibleSystemActions.includes('final_confirmation')
    && !params.cart?.items.length
  ) {
    pushUnique(issues, 'confirmation_visible_without_active_cart');
  }

  if (
    params.systemNextCustomerNeed === 'payment_method'
    && !params.visibleSystemActions.includes('payment_choices')
  ) {
    pushUnique(issues, 'payment_need_without_payment_action');
  }

  if (
    params.systemNextCustomerNeed === 'fulfillment_method'
    && !params.visibleSystemActions.includes('fulfillment_choices')
  ) {
    pushUnique(issues, 'fulfillment_need_without_fulfillment_action');
  }

  if (
    params.systemNextCustomerNeed === 'delivery_address'
    && !params.visibleSystemActions.includes('location_share')
  ) {
    pushUnique(issues, 'delivery_address_need_without_location_action');
  }

  if (
    params.cartMutation.type === 'none'
    && params.semanticUnderstanding.cartItemRemovalRequested === true
  ) {
    pushUnique(issues, 'cart_removal_requested_without_mutation');
  }

  return issues;
};

const getAIOrchestrationDecisionReasons = (params: {
  cart?: AIEmployeeConversationCart;
  cartMutation: AIEmployeeCartMutationContext;
  cancelledCartSnapshot?: AIEmployeeCancelledCartSnapshot | null;
  customerFacingMissingDetails: string[];
  decision: ConversationDecision;
  dialogue: AIEmployeeDialogueResult;
  effectiveRequestedItems: ConversationOrderItem[];
  effectiveSuggestedProducts: ConversationSuggestedProduct[];
  isSystemSemanticAction: boolean;
  requestedCustomerNeedFromModel?: AIOrchestrationCustomerNeed | null;
  semanticUnderstanding: AIEmployeeSemanticUnderstanding;
  systemNextCustomerNeed?: AIOrchestrationCustomerNeed | null;
  visibleSystemActions: AIOrchestrationVisibleSystemAction[];
}) => {
  const reasons: string[] = [];

  pushUnique(reasons, params.cart?.items.length ? 'cart_active' : 'cart_empty');

  if (getRestorableAIEmployeeCancelledCartSnapshot(params.cancelledCartSnapshot)) {
    pushUnique(reasons, 'cart_restorable');
  }

  if (params.cartMutation.type !== 'none') {
    pushUnique(reasons, `cart_mutation_${params.cartMutation.type}`);
  }

  for (const missingDetail of params.customerFacingMissingDetails) {
    pushUnique(reasons, `missing_${missingDetail}`);
  }

  if (params.systemNextCustomerNeed) {
    pushUnique(reasons, `system_next_need_${params.systemNextCustomerNeed}`);
  }

  if (params.decision.requiresCustomerConfirmation === true) {
    pushUnique(reasons, 'decision_requires_customer_confirmation');
  }

  if (params.decision.shouldCreateDraftOrder === true) {
    pushUnique(reasons, 'decision_can_create_draft_order');
  }

  if (params.dialogue.shouldSuppressCommerce) {
    pushUnique(reasons, 'dialogue_suppresses_commerce');
  }

  if (params.isSystemSemanticAction) {
    pushUnique(reasons, 'system_semantic_action_applied');
  }

  if (params.effectiveRequestedItems.length > 0) {
    pushUnique(reasons, 'requested_items_available');
  }

  if (params.effectiveSuggestedProducts.length > 0) {
    pushUnique(reasons, 'suggested_products_available');
  }

  const requestedNeed = params.semanticUnderstanding.requestedCustomerNeed;
  if (requestedNeed && params.requestedCustomerNeedFromModel) {
    pushUnique(reasons, `model_requested_need_accepted_${requestedNeed}`);
  } else if (requestedNeed) {
    const classification = classifyRequestedCustomerNeed({
      requestedCustomerNeed: requestedNeed,
      requestedCustomerNeedAccepted: params.requestedCustomerNeedFromModel,
      systemNextCustomerNeed: params.systemNextCustomerNeed,
      visibleSystemActions: params.visibleSystemActions,
    });

    if (classification === 'already_visible') {
      pushUnique(reasons, `model_requested_need_already_visible_${requestedNeed}`);
    } else if (classification === 'superseded') {
      pushUnique(reasons, `model_requested_need_superseded_${requestedNeed}`);
    } else if (classification === 'already_satisfied') {
      pushUnique(reasons, `model_requested_need_already_satisfied_${requestedNeed}`);
    } else {
      pushUnique(reasons, `model_requested_need_rejected_${requestedNeed}`);
    }
  }

  for (const visibleAction of params.visibleSystemActions) {
    pushUnique(reasons, `visible_action_${visibleAction}`);
  }

  return reasons;
};

export const buildAIEmployeeOrchestrationTrace = (params: {
  cart?: AIEmployeeConversationCart;
  cartMutation: AIEmployeeCartMutationContext;
  cancelledCartSnapshot?: AIEmployeeCancelledCartSnapshot | null;
  customerFacingMissingDetails: string[];
  decision: ConversationDecision;
  dialogue: AIEmployeeDialogueResult;
  effectiveRequestedItems: ConversationOrderItem[];
  effectiveSuggestedProducts: ConversationSuggestedProduct[];
  executionResult?: Record<string, unknown>;
  isSystemSemanticAction: boolean;
  requestedCustomerNeedFromModel?: AIOrchestrationCustomerNeed | null;
  semanticHints?: AIEmployeeSemanticHints;
  semanticUnderstanding: AIEmployeeSemanticUnderstanding;
  systemNextCustomerNeed?: AIOrchestrationCustomerNeed | null;
  visibleSystemActions: AIOrchestrationVisibleSystemAction[];
}): AIEmployeeOrchestrationTrace => {
  const issues = getAIOrchestrationIssues(params);
  const systemDecisionReasons = getAIOrchestrationDecisionReasons(params);
  const quality = evaluateAIOrchestrationQuality({
    cartActive: Boolean(params.cart?.items.length),
    issues,
    replyGuarded: false,
    systemNextCustomerNeed: params.systemNextCustomerNeed,
    visibleSystemActions: params.visibleSystemActions,
  });

  return {
    executionResult: {
      cartMutation: params.cartMutation,
      ...(params.executionResult ?? {}),
    },
    issues,
    modelIntent: {
      checkoutRequested: params.semanticUnderstanding.checkoutRequested === true,
      dialogueState: params.semanticUnderstanding.dialogueState ?? null,
      existingOrderModificationConfirmed:
        params.semanticUnderstanding.existingOrderModificationConfirmed === true,
      existingOrderModificationRequested:
        params.semanticUnderstanding.existingOrderModificationRequested === true,
      requestedCustomerNeed: params.semanticUnderstanding.requestedCustomerNeed ?? null,
      requestedCustomerNeedAccepted: params.requestedCustomerNeedFromModel ?? null,
      semanticHintsApplied: params.semanticHints ?? null,
      systemSemanticAction: params.isSystemSemanticAction,
    },
    protocolVersion: PLATFORM_AI_POLICY_VERSION,
    quality,
    systemDecision: {
      cartActive: Boolean(params.cart?.items.length),
      cartItemCount: params.cart?.items.length ?? 0,
      cancelledCartRestorable: Boolean(
        getRestorableAIEmployeeCancelledCartSnapshot(params.cancelledCartSnapshot),
      ),
      dialogueState: params.dialogue.state,
      missingDetails: params.customerFacingMissingDetails,
      nextCustomerNeed: params.systemNextCustomerNeed ?? null,
      orderIntent: params.decision.intent,
      requestedItemProductIds: params.effectiveRequestedItems.map(item => item.productId),
      requiresCustomerConfirmation: params.decision.requiresCustomerConfirmation === true,
      shouldCreateDraftOrder: params.decision.shouldCreateDraftOrder === true,
      suggestedProductIds: params.effectiveSuggestedProducts.map(product => product.id),
      suppressCommerce: params.dialogue.shouldSuppressCommerce,
      visibleSystemActions: params.visibleSystemActions,
    },
    systemDecisionReasons,
  };
};

export const validateAIEmployeeRequestedCustomerNeed = (params: {
  cart?: AIEmployeeConversationCart;
  customerDetails?: AIEmployeeCustomerDetails;
  decision: ConversationDecision;
  pendingOrderModificationNeedsConfirmation: boolean;
  requestedNeed?: AIOrchestrationCustomerNeed;
}) => {
  const requestedNeed = params.requestedNeed;

  if (!requestedNeed) {
    return null;
  }

  if (requestedNeed === 'requested_product') {
    return params.decision.suggestedProducts?.length
      ? requestedNeed
      : null;
  }

  if (requestedNeed === 'customer_phone') {
    return params.customerDetails?.phone ? null : requestedNeed;
  }

  if (requestedNeed === 'fulfillment_method') {
    return params.cart?.items.length && !params.customerDetails?.deliveryPreference
      ? requestedNeed
      : null;
  }

  if (requestedNeed === 'delivery_address') {
    return params.cart?.items.length
      && params.customerDetails?.deliveryPreference === 'delivery'
      && !params.customerDetails.address
      ? requestedNeed
      : null;
  }

  if (requestedNeed === 'payment_method') {
    return params.cart?.items.length
      && Boolean(params.customerDetails?.deliveryPreference)
      && !params.customerDetails?.paymentPreference
      ? requestedNeed
      : null;
  }

  if (requestedNeed === 'order_confirmation') {
    return params.pendingOrderModificationNeedsConfirmation
      || (
        Boolean(params.cart?.items.length)
        && params.decision.requiresCustomerConfirmation === true
      )
      ? requestedNeed
      : null;
  }

  return null;
};

export const sanitizeAIEmployeeSystemSemanticHints = (params: {
  hints?: AIEmployeeSemanticHints;
  previousMetadata: ConversationMetadataForHints;
}) => {
  const hints = params.hints;

  if (!hints) {
    return undefined;
  }

  const lastAskedFor = params.previousMetadata.lastAskedFor;
  const previousMissingDetails = params.previousMetadata.missingDetails ?? [];
  const previousVisibleSystemActions = params.previousMetadata.aiOrchestration?.systemDecision
    ?.visibleSystemActions ?? [];
  const previousCustomerDetails = params.previousMetadata.customerDetails;
  const hasActiveCollectingCart = Boolean(
    params.previousMetadata.currentCart?.status === 'collecting'
    && params.previousMetadata.currentCart.items.length > 0,
  );
  const canAcceptFulfillment = lastAskedFor === 'fulfillment_method'
    || previousMissingDetails.includes('fulfillment_method')
    || previousVisibleSystemActions.includes('fulfillment_choices')
    || (hasActiveCollectingCart && !previousCustomerDetails?.deliveryPreference);
  const canAcceptPayment = lastAskedFor === 'payment_method'
    || previousMissingDetails.includes('payment_method')
    || previousVisibleSystemActions.includes('payment_choices')
    || (
      hasActiveCollectingCart
      && Boolean(previousCustomerDetails?.deliveryPreference)
      && !previousCustomerDetails?.paymentPreference
    );
  const canAcceptConfirmation = hasActiveCollectingCart && (
    lastAskedFor === 'order_confirmation'
    || previousVisibleSystemActions.includes('final_confirmation')
    || Boolean(params.previousMetadata.currentCart?.confirmationRequestedAt)
  );
  const canRestoreCancelledCart = Boolean(
    getRestorableAIEmployeeCancelledCartSnapshot(
      params.previousMetadata.cancelledCartSnapshot,
    ),
  ) && !params.previousMetadata.currentCart?.items.length;
  const referencedOrderIdIsKnown = typeof hints.referencedOrderId === 'number'
    && (
      hints.referencedOrderId === params.previousMetadata.lastOrder?.id
      || hints.referencedOrderId === params.previousMetadata.currentCart?.orderId
    );
  const selectedProductIdIsKnown = params.previousMetadata.lastSuggestedProducts?.some((product) => {
    return product.id === hints.selectedProductId;
  }) || params.previousMetadata.currentCart?.items.some((item) => {
    return item.productId === hints.selectedProductId;
  });
  const removableProductIdIsKnown = params.previousMetadata.currentCart?.items.some((item) => {
    return item.productId === hints.removeCartItemProductId;
  });
  const addAllSuggestedProductsIsKnown = Boolean(
    params.previousMetadata.lastSuggestedProducts?.length,
  );

  const sanitized = {
    addAllSuggestedProducts: addAllSuggestedProductsIsKnown
      ? hints.addAllSuggestedProducts
      : undefined,
    customerCancelledOrder: canAcceptConfirmation
      ? hints.customerCancelledOrder
      : undefined,
    customerAddress: hints.customerAddress,
    customerConfirmedOrder: canAcceptConfirmation
      ? hints.customerConfirmedOrder
      : undefined,
    deliveryPreference: canAcceptFulfillment
      ? hints.deliveryPreference
      : undefined,
    dialogueState: hints.dialogueState === 'complaint' && referencedOrderIdIsKnown
      ? hints.dialogueState
      : undefined,
    fulfillmentType: canAcceptFulfillment
      ? hints.fulfillmentType
      : undefined,
    paymentPreference: canAcceptPayment
      ? hints.paymentPreference
      : undefined,
    referencedOrderId: referencedOrderIdIsKnown
      ? hints.referencedOrderId
      : undefined,
    removeCartItemProductId: removableProductIdIsKnown
      ? hints.removeCartItemProductId
      : undefined,
    replaceExistingQuantity: selectedProductIdIsKnown
      ? hints.replaceExistingQuantity
      : undefined,
    requestedQuantity: selectedProductIdIsKnown
      ? hints.requestedQuantity
      : undefined,
    restoreCancelledCart: canRestoreCancelledCart
      ? hints.restoreCancelledCart
      : undefined,
    selectedProductId: selectedProductIdIsKnown
      ? hints.selectedProductId
      : undefined,
    startNewOrder: canRestoreCancelledCart
      ? hints.startNewOrder
      : undefined,
    supportEscalationConfirmed: hints.dialogueState === 'complaint' && referencedOrderIdIsKnown
      ? hints.supportEscalationConfirmed
      : undefined,
  } satisfies AIEmployeeSemanticHints;

  const systemEventType = hints.systemEvent?.type;
  const systemEventAllowed = (
    (systemEventType === 'product_selected' && Boolean(sanitized.selectedProductId))
    || (systemEventType === 'cart_quantity_changed' && Boolean(sanitized.selectedProductId && sanitized.requestedQuantity))
    || (systemEventType === 'cart_item_removed' && Boolean(sanitized.removeCartItemProductId))
    || (systemEventType === 'cart_restored' && sanitized.restoreCancelledCart === true)
    || (systemEventType === 'fulfillment_selected' && Boolean(sanitized.fulfillmentType || sanitized.deliveryPreference))
    || (systemEventType === 'location_shared' && Boolean(sanitized.customerAddress))
    || (systemEventType === 'new_order_started' && sanitized.startNewOrder === true)
    || (systemEventType === 'payment_selected' && Boolean(sanitized.paymentPreference))
    || (systemEventType === 'order_confirmed' && sanitized.customerConfirmedOrder === true)
    || (systemEventType === 'order_cancelled' && sanitized.customerCancelledOrder === true)
    || (systemEventType === 'all_products_confirmed' && sanitized.addAllSuggestedProducts === true)
  );

  return {
    ...sanitized,
    systemEvent: systemEventAllowed
      ? hints.systemEvent
      : undefined,
  } satisfies AIEmployeeSemanticHints;
};

export const hasMeaningfulAIEmployeeSemanticHints = (
  hints?: AIEmployeeSemanticHints,
) => {
  if (!hints) {
    return false;
  }

  return Object.values(hints).some(value => value !== undefined);
};

export const AIEmployeeSemanticHintsContinueCheckout = (
  hints?: AIEmployeeSemanticHints,
) => {
  return Boolean(
    hints?.customerConfirmedOrder
    || hints?.customerAddress
    || hints?.deliveryPreference
    || hints?.fulfillmentType
    || hints?.paymentPreference
    || hints?.requestedQuantity
    || hints?.removeCartItemProductId
    || hints?.restoreCancelledCart
    || hints?.selectedProductId,
  );
};
