export type AIOrchestrationCustomerNeed
  = | 'customer_phone'
    | 'delivery_address'
    | 'fulfillment_method'
    | 'order_confirmation'
    | 'payment_method'
    | 'requested_product';

export type AIOrchestrationVisibleSystemAction
  = | 'cart_controls'
    | 'final_confirmation'
    | 'fulfillment_choices'
    | 'location_share'
    | 'payment_choices'
    | 'product_choices'
    | 'restore_cancelled_cart';

export type AIOrchestrationQuality = {
  level: 'critical' | 'excellent' | 'healthy' | 'warning';
  penalties: string[];
  score: number;
};

export const getVisibleActionForCustomerNeed = (
  need: AIOrchestrationCustomerNeed,
): AIOrchestrationVisibleSystemAction | null => {
  if (need === 'requested_product') {
    return 'product_choices';
  }

  if (need === 'fulfillment_method') {
    return 'fulfillment_choices';
  }

  if (need === 'delivery_address') {
    return 'location_share';
  }

  if (need === 'payment_method') {
    return 'payment_choices';
  }

  if (need === 'order_confirmation') {
    return 'final_confirmation';
  }

  return null;
};

export const classifyRequestedCustomerNeed = (params: {
  requestedCustomerNeed?: AIOrchestrationCustomerNeed | null;
  requestedCustomerNeedAccepted?: AIOrchestrationCustomerNeed | null;
  systemNextCustomerNeed?: AIOrchestrationCustomerNeed | null;
  visibleSystemActions: AIOrchestrationVisibleSystemAction[];
}) => {
  const requestedNeed = params.requestedCustomerNeed;

  if (!requestedNeed) {
    return 'none';
  }

  if (params.requestedCustomerNeedAccepted) {
    return 'accepted';
  }

  const visibleAction = getVisibleActionForCustomerNeed(requestedNeed);
  const alreadyVisible = visibleAction
    ? params.visibleSystemActions.includes(visibleAction)
    : false;

  if (alreadyVisible) {
    return 'already_visible';
  }

  if (
    params.systemNextCustomerNeed
    && params.systemNextCustomerNeed !== requestedNeed
  ) {
    return 'superseded';
  }

  if (!params.systemNextCustomerNeed) {
    return 'already_satisfied';
  }

  return 'invalid';
};

export const shouldReportInvalidRequestedCustomerNeed = (params: {
  requestedCustomerNeed?: AIOrchestrationCustomerNeed | null;
  requestedCustomerNeedAccepted?: AIOrchestrationCustomerNeed | null;
  systemNextCustomerNeed?: AIOrchestrationCustomerNeed | null;
  visibleSystemActions: AIOrchestrationVisibleSystemAction[];
}) => classifyRequestedCustomerNeed(params) === 'invalid';

export const canAdvanceCustomerNeedBeforeReply = (params: {
  checkoutRequested?: boolean;
  requestedCustomerNeed?: AIOrchestrationCustomerNeed | null;
  systemSemanticAction: boolean;
}) => {
  if (!params.requestedCustomerNeed) {
    return false;
  }

  return params.systemSemanticAction
    || params.checkoutRequested === true
    || params.requestedCustomerNeed === 'requested_product';
};

const getIssuePenalty = (issue: string) => {
  if (
    issue === 'confirmation_visible_without_active_cart'
    || issue === 'payment_need_without_payment_action'
    || issue === 'fulfillment_need_without_fulfillment_action'
    || issue === 'delivery_address_need_without_location_action'
  ) {
    return 30;
  }

  if (issue === 'confirmation_required_without_visible_action') {
    return 25;
  }

  if (
    issue === 'model_requested_invalid_system_need'
    || issue === 'cart_removal_requested_without_mutation'
  ) {
    return 15;
  }

  if (issue === 'model_reply_unavailable') {
    return 40;
  }

  if (issue === 'model_reply_guard_failed') {
    return 35;
  }

  if (issue === 'model_reply_guarded') {
    return 10;
  }

  if (issue === 'model_reply_repaired') {
    return 2;
  }

  if (issue === 'semantic_reply_review_note') {
    return 1;
  }

  if (
    issue === 'deterministic_reply_guard_triggered'
    || issue === 'semantic_reply_review_guarded'
    || issue.startsWith('reply_guard_')
  ) {
    return 0;
  }

  if (issue === 'semantic_reply_review_unavailable') {
    return 3;
  }

  return 5;
};

const getQualityLevel = (score: number): AIOrchestrationQuality['level'] => {
  if (score >= 95) {
    return 'excellent';
  }

  if (score >= 85) {
    return 'healthy';
  }

  if (score >= 70) {
    return 'warning';
  }

  return 'critical';
};

const getExpectedVisibleActionForNextNeed = (
  need?: AIOrchestrationCustomerNeed | null,
) => {
  if (!need || need === 'customer_phone' || need === 'requested_product') {
    return null;
  }

  return getVisibleActionForCustomerNeed(need);
};

export const evaluateAIOrchestrationQuality = (params: {
  cartActive: boolean;
  issues: string[];
  replyGuarded?: boolean;
  systemNextCustomerNeed?: AIOrchestrationCustomerNeed | null;
  visibleSystemActions: AIOrchestrationVisibleSystemAction[];
}): AIOrchestrationQuality => {
  const penalties: string[] = [];
  let penaltyScore = 0;

  for (const issue of params.issues) {
    penaltyScore += getIssuePenalty(issue);
    penalties.push(`issue_${issue}`);
  }

  if (
    params.replyGuarded
    && !params.issues.includes('model_reply_guarded')
  ) {
    penaltyScore += getIssuePenalty('model_reply_guarded');
    penalties.push('reply_guarded');
  }

  const expectedVisibleAction = getExpectedVisibleActionForNextNeed(params.systemNextCustomerNeed);
  if (
    expectedVisibleAction
    && !params.visibleSystemActions.includes(expectedVisibleAction)
  ) {
    penaltyScore += 25;
    penalties.push(`missing_visible_action_${expectedVisibleAction}`);
  }

  if (
    params.visibleSystemActions.includes('final_confirmation')
    && !params.cartActive
  ) {
    penaltyScore += 35;
    penalties.push('final_confirmation_without_cart');
  }

  if (
    params.visibleSystemActions.includes('product_choices')
    && params.visibleSystemActions.some(action => (
      action === 'final_confirmation'
      || action === 'fulfillment_choices'
      || action === 'location_share'
      || action === 'payment_choices'
    ))
  ) {
    penaltyScore += 30;
    penalties.push('product_selection_mixed_with_checkout_action');
  }

  const score = Math.max(0, 100 - penaltyScore);

  return {
    level: getQualityLevel(score),
    penalties,
    score,
  };
};
