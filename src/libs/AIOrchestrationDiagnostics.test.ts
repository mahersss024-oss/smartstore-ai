import { describe, expect, it } from 'vitest';
import {
  canAdvanceCustomerNeedBeforeReply,
  classifyRequestedCustomerNeed,
  evaluateAIOrchestrationQuality,
  getVisibleActionForCustomerNeed,
  shouldReportInvalidRequestedCustomerNeed,
} from './AIOrchestrationDiagnostics';

describe('AIOrchestrationDiagnostics', () => {
  it('does not advance checkout UI while the customer is still browsing', () => {
    expect(canAdvanceCustomerNeedBeforeReply({
      checkoutRequested: false,
      requestedCustomerNeed: 'fulfillment_method',
      systemSemanticAction: false,
    })).toBe(false);
    expect(canAdvanceCustomerNeedBeforeReply({
      checkoutRequested: false,
      requestedCustomerNeed: 'requested_product',
      systemSemanticAction: false,
    })).toBe(true);
    expect(canAdvanceCustomerNeedBeforeReply({
      checkoutRequested: true,
      requestedCustomerNeed: 'payment_method',
      systemSemanticAction: false,
    })).toBe(true);
  });

  it('maps platform-owned customer needs to the matching visible system action', () => {
    expect(getVisibleActionForCustomerNeed('requested_product')).toBe('product_choices');
    expect(getVisibleActionForCustomerNeed('fulfillment_method')).toBe('fulfillment_choices');
    expect(getVisibleActionForCustomerNeed('delivery_address')).toBe('location_share');
    expect(getVisibleActionForCustomerNeed('payment_method')).toBe('payment_choices');
    expect(getVisibleActionForCustomerNeed('order_confirmation')).toBe('final_confirmation');
    expect(getVisibleActionForCustomerNeed('customer_phone')).toBeNull();
  });

  it('does not report a model request as invalid when the system already shows that action', () => {
    expect(classifyRequestedCustomerNeed({
      requestedCustomerNeed: 'requested_product',
      requestedCustomerNeedAccepted: null,
      systemNextCustomerNeed: null,
      visibleSystemActions: ['product_choices', 'cart_controls'],
    })).toBe('already_visible');
    expect(shouldReportInvalidRequestedCustomerNeed({
      requestedCustomerNeed: 'requested_product',
      requestedCustomerNeedAccepted: null,
      systemNextCustomerNeed: null,
      visibleSystemActions: ['product_choices', 'cart_controls'],
    })).toBe(false);
  });

  it('does not report a model request as invalid when the system has a higher-priority next need', () => {
    expect(classifyRequestedCustomerNeed({
      requestedCustomerNeed: 'order_confirmation',
      requestedCustomerNeedAccepted: null,
      systemNextCustomerNeed: 'fulfillment_method',
      visibleSystemActions: ['cart_controls', 'fulfillment_choices'],
    })).toBe('superseded');
    expect(shouldReportInvalidRequestedCustomerNeed({
      requestedCustomerNeed: 'order_confirmation',
      requestedCustomerNeedAccepted: null,
      systemNextCustomerNeed: 'fulfillment_method',
      visibleSystemActions: ['cart_controls', 'fulfillment_choices'],
    })).toBe(false);
  });

  it('does not report a model request as invalid when the requested detail is already satisfied', () => {
    expect(classifyRequestedCustomerNeed({
      requestedCustomerNeed: 'customer_phone',
      requestedCustomerNeedAccepted: null,
      systemNextCustomerNeed: null,
      visibleSystemActions: ['cart_controls'],
    })).toBe('already_satisfied');
    expect(shouldReportInvalidRequestedCustomerNeed({
      requestedCustomerNeed: 'customer_phone',
      requestedCustomerNeedAccepted: null,
      systemNextCustomerNeed: null,
      visibleSystemActions: ['cart_controls'],
    })).toBe(false);
  });

  it('reports a model request as invalid only when no system state supports it', () => {
    expect(classifyRequestedCustomerNeed({
      requestedCustomerNeed: 'payment_method',
      requestedCustomerNeedAccepted: null,
      systemNextCustomerNeed: 'payment_method',
      visibleSystemActions: ['cart_controls'],
    })).toBe('invalid');
    expect(shouldReportInvalidRequestedCustomerNeed({
      requestedCustomerNeed: 'payment_method',
      requestedCustomerNeedAccepted: null,
      systemNextCustomerNeed: 'payment_method',
      visibleSystemActions: ['cart_controls'],
    })).toBe(true);
  });

  it('treats accepted model requests as valid platform-model harmony', () => {
    expect(classifyRequestedCustomerNeed({
      requestedCustomerNeed: 'payment_method',
      requestedCustomerNeedAccepted: 'payment_method',
      systemNextCustomerNeed: 'payment_method',
      visibleSystemActions: ['cart_controls', 'payment_choices'],
    })).toBe('accepted');
    expect(shouldReportInvalidRequestedCustomerNeed({
      requestedCustomerNeed: 'payment_method',
      requestedCustomerNeedAccepted: 'payment_method',
      systemNextCustomerNeed: 'payment_method',
      visibleSystemActions: ['cart_controls', 'payment_choices'],
    })).toBe(false);
  });

  it('scores a clean system-model trace as excellent', () => {
    expect(evaluateAIOrchestrationQuality({
      cartActive: true,
      issues: [],
      replyGuarded: false,
      systemNextCustomerNeed: 'payment_method',
      visibleSystemActions: ['cart_controls', 'payment_choices'],
    })).toEqual({
      level: 'excellent',
      penalties: [],
      score: 100,
    });
  });

  it('penalizes missing visible actions for the current system need', () => {
    expect(evaluateAIOrchestrationQuality({
      cartActive: true,
      issues: [],
      replyGuarded: false,
      systemNextCustomerNeed: 'delivery_address',
      visibleSystemActions: ['cart_controls'],
    })).toEqual({
      level: 'warning',
      penalties: ['missing_visible_action_location_share'],
      score: 75,
    });
  });

  it('does not require product choice buttons when the system only needs a new product request', () => {
    expect(evaluateAIOrchestrationQuality({
      cartActive: false,
      issues: [],
      replyGuarded: false,
      systemNextCustomerNeed: 'requested_product',
      visibleSystemActions: [],
    })).toEqual({
      level: 'excellent',
      penalties: [],
      score: 100,
    });
  });

  it('marks confirmation without an active cart as critical', () => {
    expect(evaluateAIOrchestrationQuality({
      cartActive: false,
      issues: ['confirmation_visible_without_active_cart'],
      replyGuarded: false,
      systemNextCustomerNeed: 'order_confirmation',
      visibleSystemActions: ['final_confirmation'],
    })).toEqual({
      level: 'critical',
      penalties: [
        'issue_confirmation_visible_without_active_cart',
        'final_confirmation_without_cart',
      ],
      score: 35,
    });
  });

  it('keeps guarded model replies visible as a measurable quality penalty', () => {
    expect(evaluateAIOrchestrationQuality({
      cartActive: true,
      issues: ['model_reply_guarded'],
      replyGuarded: true,
      systemNextCustomerNeed: null,
      visibleSystemActions: ['cart_controls'],
    })).toEqual({
      level: 'healthy',
      penalties: ['issue_model_reply_guarded'],
      score: 90,
    });
  });

  it('treats repaired model replies as excellent with a light diagnostics marker', () => {
    expect(evaluateAIOrchestrationQuality({
      cartActive: true,
      issues: ['model_reply_repaired'],
      replyGuarded: false,
      systemNextCustomerNeed: null,
      visibleSystemActions: ['cart_controls'],
    })).toEqual({
      level: 'excellent',
      penalties: ['issue_model_reply_repaired'],
      score: 98,
    });
  });

  it('treats semantic guard notes as non-blocking diagnostics', () => {
    expect(evaluateAIOrchestrationQuality({
      cartActive: true,
      issues: ['semantic_reply_review_note'],
      replyGuarded: false,
      systemNextCustomerNeed: null,
      visibleSystemActions: ['cart_controls'],
    })).toEqual({
      level: 'excellent',
      penalties: ['issue_semantic_reply_review_note'],
      score: 99,
    });
  });

  it('records guard detail issues without double-penalizing the guarded reply', () => {
    expect(evaluateAIOrchestrationQuality({
      cartActive: true,
      issues: [
        'model_reply_guarded',
        'deterministic_reply_guard_triggered',
        'reply_guard_price_truth',
      ],
      replyGuarded: true,
      systemNextCustomerNeed: null,
      visibleSystemActions: ['cart_controls'],
    })).toEqual({
      level: 'healthy',
      penalties: [
        'issue_model_reply_guarded',
        'issue_deterministic_reply_guard_triggered',
        'issue_reply_guard_price_truth',
      ],
      score: 90,
    });
  });

  it('treats unavailable semantic reply review as a small diagnostics warning', () => {
    expect(evaluateAIOrchestrationQuality({
      cartActive: true,
      issues: ['semantic_reply_review_unavailable'],
      replyGuarded: false,
      systemNextCustomerNeed: null,
      visibleSystemActions: ['cart_controls'],
    })).toEqual({
      level: 'excellent',
      penalties: ['issue_semantic_reply_review_unavailable'],
      score: 97,
    });
  });

  it('marks a failed reply guard that removes the customer reply as critical', () => {
    expect(evaluateAIOrchestrationQuality({
      cartActive: true,
      issues: ['model_reply_guard_failed'],
      replyGuarded: true,
      systemNextCustomerNeed: null,
      visibleSystemActions: ['cart_controls'],
    })).toEqual({
      level: 'critical',
      penalties: ['issue_model_reply_guard_failed', 'reply_guarded'],
      score: 55,
    });
  });

  it('penalizes checkout actions shown while product selection is pending', () => {
    expect(evaluateAIOrchestrationQuality({
      cartActive: true,
      issues: [],
      systemNextCustomerNeed: 'requested_product',
      visibleSystemActions: [
        'cart_controls',
        'product_choices',
        'fulfillment_choices',
      ],
    })).toEqual({
      level: 'warning',
      penalties: ['product_selection_mixed_with_checkout_action'],
      score: 70,
    });
  });
});
