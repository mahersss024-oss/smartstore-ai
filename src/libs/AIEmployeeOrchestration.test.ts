import { describe, expect, it } from 'vitest';
import {
  AIEmployeeSemanticHintsContinueCheckout,
  buildAIEmployeeCancelledCartSnapshot,
  buildAIEmployeeOrchestrationTrace,
  getAIEmployeeReplyGuardDecisionSummary,
  getAIEmployeeReplyGuardOrchestrationIssues,
  getFirstAIEmployeeBasicCheckoutNeed,
  getNextAIEmployeeCustomerNeed,
  getPendingAIEmployeeProductSelectionNeed,
  getRestorableAIEmployeeCancelledCartSnapshot,
  getVisibleAIEmployeeSystemActions,
  hasMeaningfulAIEmployeeSemanticHints,
  orchestrateAIEmployeeDialogueState,
  sanitizeAIEmployeeSystemSemanticHints,
  validateAIEmployeeRequestedCustomerNeed,
} from './AIEmployeeOrchestration';

const cart = {
  items: [{
    name: 'Product',
    productId: 1,
    quantity: 1,
    unitPrice: 10,
  }],
  status: 'collecting' as const,
  subtotal: 10,
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('AIEmployeeOrchestration', () => {
  it('keeps post-purchase dialogue separate from active commerce', () => {
    expect(orchestrateAIEmployeeDialogueState({
      cart,
      lastOrder: { id: 20 },
      message: '#20',
      requestedItems: [],
      semanticUnderstanding: {
        dialogueState: 'post_purchase_support',
        referencedOrderId: 20,
      },
      suggestedProducts: [],
    })).toMatchObject({
      referencedOrderId: 20,
      shouldClearCart: false,
      shouldSuppressCommerce: true,
      state: 'post_purchase_support',
    });
  });

  it('keeps the active cart when the customer complains without cancelling it', () => {
    expect(orchestrateAIEmployeeDialogueState({
      cart,
      message: 'ليه كذا عدل الطلب',
      requestedItems: [],
      semanticUnderstanding: {
        dialogueState: 'complaint',
      },
      suggestedProducts: [],
    })).toMatchObject({
      shouldClearCart: false,
      shouldSuppressCommerce: true,
      state: 'complaint',
    });
  });

  it('clears the active cart only for an explicit cart cancellation state', () => {
    expect(orchestrateAIEmployeeDialogueState({
      cart,
      message: 'الغ الطلب',
      requestedItems: [],
      semanticUnderstanding: {
        dialogueState: 'cart_cancellation',
      },
      suggestedProducts: [],
    })).toMatchObject({
      shouldClearCart: true,
      shouldSuppressCommerce: true,
      state: 'cart_cancellation',
    });
  });

  it('does not misroute an order message with a bare quantity digit to review (ENGINE-1)', () => {
    expect(orchestrateAIEmployeeDialogueState({
      message: 'اريد 2 برجر',
      requestedItems: [{ name: 'برجر', productId: 1, quantity: 2, unitPrice: 10 }],
      semanticUnderstanding: {},
      suggestedProducts: [],
    })).toMatchObject({
      shouldSuppressCommerce: false,
      state: 'order_request',
    });
  });

  it('still treats a bare rating digit with no order signal as review', () => {
    expect(orchestrateAIEmployeeDialogueState({
      message: '5',
      requestedItems: [],
      semanticUnderstanding: {},
      suggestedProducts: [],
    })).toMatchObject({
      shouldSuppressCommerce: true,
      state: 'review',
    });
  });

  it('derives visible controls from structured state only', () => {
    expect(getVisibleAIEmployeeSystemActions({
      cart,
      missingDetails: ['payment_method'],
      suggestedProducts: [],
    })).toEqual(['cart_controls', 'payment_choices']);
  });

  it('keeps submitted carts read-only even when stale suggestions exist', () => {
    expect(getVisibleAIEmployeeSystemActions({
      cart: {
        ...cart,
        orderId: 20,
        status: 'submitted',
      },
      missingDetails: [],
      suggestedProducts: [{
        availability: 'available',
        id: 2,
        name: 'Another product',
        price: '12.00',
      }],
    })).toEqual([]);
  });

  it('waits for a visible product selection before advancing checkout', () => {
    expect(getPendingAIEmployeeProductSelectionNeed({
      cartMutation: {
        cartActive: true,
        type: 'none',
      },
      requestedItems: [],
      suggestedProducts: [{
        availability: 'available',
        id: 2,
        name: 'Another product',
        price: '12.00',
      }],
    })).toBe('requested_product');
  });

  it('accepts system hints only when they match the previous expected step', () => {
    expect(sanitizeAIEmployeeSystemSemanticHints({
      hints: {
        paymentPreference: 'cash_on_pickup',
        selectedProductId: 99,
      },
      previousMetadata: {
        currentCart: cart,
        lastAskedFor: 'payment_method',
      },
    })).toEqual(expect.objectContaining({
      paymentPreference: 'cash_on_pickup',
      selectedProductId: undefined,
    }));
  });

  it('accepts fulfillment system hints from the last visible action state', () => {
    expect(sanitizeAIEmployeeSystemSemanticHints({
      hints: {
        deliveryPreference: 'pickup',
        fulfillmentType: 'pickup',
        systemEvent: {
          source: 'web_order_ui',
          type: 'fulfillment_selected',
        },
      },
      previousMetadata: {
        aiOrchestration: {
          systemDecision: {
            visibleSystemActions: ['cart_controls', 'fulfillment_choices'],
          },
        },
        currentCart: cart,
        lastAskedFor: null,
        missingDetails: [],
      },
    })).toEqual(expect.objectContaining({
      deliveryPreference: 'pickup',
      fulfillmentType: 'pickup',
      systemEvent: expect.objectContaining({
        type: 'fulfillment_selected',
      }),
    }));
  });

  it('accepts starting a new order only while a cancelled cart can be restored', () => {
    const cancelledAt = new Date();

    expect(sanitizeAIEmployeeSystemSemanticHints({
      hints: {
        startNewOrder: true,
        systemEvent: {
          source: 'web_order_ui',
          type: 'new_order_started',
        },
      },
      previousMetadata: {
        cancelledCartSnapshot: {
          cancelledAt: cancelledAt.toISOString(),
          cart,
          expiresAt: new Date(cancelledAt.getTime() + 60_000).toISOString(),
        },
      },
    })).toEqual(expect.objectContaining({
      startNewOrder: true,
      systemEvent: expect.objectContaining({
        type: 'new_order_started',
      }),
    }));
  });

  it('accepts fulfillment system hints from active cart state when visible action metadata lags', () => {
    expect(sanitizeAIEmployeeSystemSemanticHints({
      hints: {
        deliveryPreference: 'pickup',
        fulfillmentType: 'pickup',
        systemEvent: {
          source: 'web_order_ui',
          type: 'fulfillment_selected',
        },
      },
      previousMetadata: {
        currentCart: cart,
        customerDetails: {
          phone: '0500000000',
        },
        lastAskedFor: null,
        missingDetails: [],
      },
    })).toEqual(expect.objectContaining({
      deliveryPreference: 'pickup',
      fulfillmentType: 'pickup',
      systemEvent: expect.objectContaining({
        type: 'fulfillment_selected',
      }),
    }));
  });

  it('does not accept payment system hints before fulfillment exists in state', () => {
    expect(sanitizeAIEmployeeSystemSemanticHints({
      hints: {
        paymentPreference: 'cash_on_pickup',
        systemEvent: {
          source: 'web_order_ui',
          type: 'payment_selected',
        },
      },
      previousMetadata: {
        currentCart: cart,
        customerDetails: {
          phone: '0500000000',
        },
        lastAskedFor: null,
        missingDetails: [],
      },
    })).toEqual(expect.objectContaining({
      paymentPreference: undefined,
      systemEvent: undefined,
    }));
  });

  it('validates the next need against current system facts', () => {
    expect(validateAIEmployeeRequestedCustomerNeed({
      cart,
      customerDetails: {
        deliveryPreference: 'delivery',
        phone: '0500000000',
      },
      decision: {
        confidence: 1,
        intent: 'order_request',
        missingDetails: [],
        policyVersion: 'test',
        reply: '',
        shouldCreateDraftOrder: false,
      },
      pendingOrderModificationNeedsConfirmation: false,
      requestedNeed: 'delivery_address',
    })).toBe('delivery_address');
  });

  it('does not request final confirmation when there is no active cart', () => {
    expect(validateAIEmployeeRequestedCustomerNeed({
      customerDetails: {
        deliveryPreference: 'pickup',
        paymentPreference: 'cash_on_pickup',
      },
      decision: {
        confidence: 1,
        intent: 'order_request',
        missingDetails: [],
        policyVersion: 'test',
        reply: '',
        requiresCustomerConfirmation: true,
        shouldCreateDraftOrder: false,
      },
      pendingOrderModificationNeedsConfirmation: false,
      requestedNeed: 'order_confirmation',
    })).toBeNull();
  });

  it('does not accept a stale final confirmation action after the cart is gone', () => {
    expect(sanitizeAIEmployeeSystemSemanticHints({
      hints: {
        customerConfirmedOrder: true,
        systemEvent: {
          source: 'web_order_ui',
          type: 'order_confirmed',
        },
      },
      previousMetadata: {
        aiOrchestration: {
          systemDecision: {
            visibleSystemActions: ['final_confirmation'],
          },
        },
        currentCart: {
          ...cart,
          items: [],
        },
        lastAskedFor: 'order_confirmation',
        missingDetails: ['order_confirmation'],
      },
    })).toEqual(expect.objectContaining({
      customerConfirmedOrder: undefined,
      systemEvent: undefined,
    }));
  });

  it('allows product selection while another product is already in the cart', () => {
    expect(validateAIEmployeeRequestedCustomerNeed({
      cart,
      customerDetails: {},
      decision: {
        confidence: 1,
        intent: 'order_request',
        missingDetails: [],
        policyVersion: 'test',
        reply: '',
        shouldCreateDraftOrder: false,
        suggestedProducts: [{
          availability: 'available',
          id: 2,
          name: 'Another product',
          price: '12.00',
        }],
      },
      pendingOrderModificationNeedsConfirmation: false,
      requestedNeed: 'requested_product',
    })).toBe('requested_product');
  });

  it('creates a restorable snapshot without preserving confirmation state', () => {
    const snapshot = buildAIEmployeeCancelledCartSnapshot({
      ...cart,
      confirmationRequestedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(snapshot?.cart.confirmationRequestedAt).toBeUndefined();
    expect(snapshot?.expiresAt).toBeTruthy();
  });

  it('rejects missing, submitted, expired, and malformed cancelled cart snapshots', () => {
    expect(buildAIEmployeeCancelledCartSnapshot(undefined)).toBeUndefined();
    expect(buildAIEmployeeCancelledCartSnapshot({
      ...cart,
      status: 'submitted',
    })).toBeUndefined();
    expect(getRestorableAIEmployeeCancelledCartSnapshot({
      cancelledAt: '2026-01-01T00:00:00.000Z',
      cart,
      expiresAt: 'invalid',
    })).toBeUndefined();
    expect(getRestorableAIEmployeeCancelledCartSnapshot({
      cancelledAt: '2026-01-01T00:00:00.000Z',
      cart,
      expiresAt: '2026-01-01T00:00:00.000Z',
    })).toBeUndefined();
  });

  it('prioritizes explicit dialogue states and order references', () => {
    expect(orchestrateAIEmployeeDialogueState({
      cart,
      customerCancelledOrder: true,
      message: '20',
      requestedItems: [],
      semanticUnderstanding: {
        dialogueState: 'complaint',
        referencedOrderId: 21,
      },
      suggestedProducts: [],
    })).toMatchObject({
      referencedOrderId: 21,
      shouldClearCart: true,
      state: 'cart_cancellation',
    });
    expect(orchestrateAIEmployeeDialogueState({
      message: '#22',
      requestedItems: [],
      semanticUnderstanding: {},
      suggestedProducts: [],
    })).toMatchObject({
      referencedOrderId: 22,
      state: 'order_followup',
    });
    expect(orchestrateAIEmployeeDialogueState({
      message: '5 stars',
      requestedItems: [],
      suggestedProducts: [],
    }).state).toBe('review');
  });

  it('maps system actions for every structured next step and restorable carts', () => {
    const snapshot = buildAIEmployeeCancelledCartSnapshot(cart);

    expect(getVisibleAIEmployeeSystemActions({
      cancelledCartSnapshot: snapshot,
      missingDetails: [],
      suggestedProducts: [],
    })).toContain('restore_cancelled_cart');
    expect(getVisibleAIEmployeeSystemActions({
      cart,
      missingDetails: ['fulfillment_method'],
      suggestedProducts: [],
    })).toContain('fulfillment_choices');
    expect(getVisibleAIEmployeeSystemActions({
      cart,
      missingDetails: ['delivery_address'],
      suggestedProducts: [],
    })).toContain('location_share');
    expect(getVisibleAIEmployeeSystemActions({
      cart,
      missingDetails: ['order_confirmation'],
      suggestedProducts: [],
    })).toContain('final_confirmation');
  });

  it('derives the next customer need from missing details or confirmation', () => {
    expect(getNextAIEmployeeCustomerNeed({
      confidence: 1,
      intent: 'order_request',
      missingDetails: ['customer_phone'],
      policyVersion: 'test',
      reply: '',
      shouldCreateDraftOrder: false,
    })).toBe('customer_phone');
    expect(getNextAIEmployeeCustomerNeed({
      confidence: 1,
      intent: 'order_request',
      missingDetails: [],
      policyVersion: 'test',
      reply: '',
      requiresCustomerConfirmation: true,
      shouldCreateDraftOrder: false,
    })).toBe('order_confirmation');
  });

  it('prioritizes basic checkout details before pending product selection', () => {
    expect(getFirstAIEmployeeBasicCheckoutNeed([
      'requested_product',
      'customer_phone',
      'fulfillment_method',
      'payment_method',
    ])).toBe('customer_phone');
    expect(getFirstAIEmployeeBasicCheckoutNeed([
      'requested_product',
    ])).toBeNull();
  });

  it('summarizes reply guard outcomes and orchestration issues', () => {
    const checks = [
      {
        mode: 'deterministic' as const,
        name: 'price_truth',
        result: 'guarded' as const,
      },
      {
        mode: 'semantic_review' as const,
        name: 'tone',
        result: 'noted' as const,
      },
      {
        mode: 'semantic_review' as const,
        name: 'provider',
        result: 'unavailable' as const,
      },
      {
        mode: 'deterministic' as const,
        name: 'privacy',
        result: 'repaired' as const,
      },
      {
        mode: 'deterministic' as const,
        name: 'catalog',
        result: 'passed' as const,
      },
    ];

    expect(getAIEmployeeReplyGuardDecisionSummary(checks)).toMatchObject({
      checkedCount: 5,
      guardedMode: 'deterministic',
      notedChecks: ['tone'],
      passedChecks: ['catalog'],
      repairedChecks: ['privacy'],
      semanticReviewUnavailable: true,
    });
    expect(getAIEmployeeReplyGuardOrchestrationIssues({
      checks,
      guarded: true,
      reason: 'price',
      repaired: true,
      reply: 'safe',
    })).toEqual([
      'model_reply_guarded',
      'deterministic_reply_guard_triggered',
      'reply_guard_price_truth',
      'model_reply_repaired',
      'semantic_reply_review_note',
      'semantic_reply_review_unavailable',
    ]);
  });

  it('builds a trace that records inconsistent actions and system facts', () => {
    const trace = buildAIEmployeeOrchestrationTrace({
      cart,
      cartMutation: {
        cartActive: true,
        type: 'none',
      },
      customerFacingMissingDetails: ['payment_method'],
      decision: {
        confidence: 1,
        intent: 'order_request',
        missingDetails: ['payment_method'],
        policyVersion: 'test',
        reply: '',
        requiresCustomerConfirmation: true,
        shouldCreateDraftOrder: false,
      },
      dialogue: {
        referencedOrderId: null,
        shouldClearCart: false,
        shouldSuppressCommerce: false,
        state: 'order_request',
      },
      effectiveRequestedItems: [cart.items[0]!],
      effectiveSuggestedProducts: [],
      isSystemSemanticAction: false,
      semanticUnderstanding: {
        cartItemRemovalRequested: true,
        requestedCustomerNeed: 'delivery_address',
      },
      systemNextCustomerNeed: 'payment_method',
      visibleSystemActions: ['cart_controls'],
    });

    expect(trace.issues).toEqual(expect.arrayContaining([
      'confirmation_required_without_visible_action',
      'payment_need_without_payment_action',
      'cart_removal_requested_without_mutation',
    ]));
    expect(trace.systemDecision).toMatchObject({
      cartActive: true,
      cartItemCount: 1,
      nextCustomerNeed: 'payment_method',
    });
  });

  it('validates each requested customer need against current facts', () => {
    const decision = {
      confidence: 1,
      intent: 'order_request' as const,
      missingDetails: [],
      policyVersion: 'test',
      reply: '',
      shouldCreateDraftOrder: false,
      suggestedProducts: [],
    };

    expect(validateAIEmployeeRequestedCustomerNeed({
      cart,
      customerDetails: {},
      decision,
      pendingOrderModificationNeedsConfirmation: false,
      requestedNeed: 'customer_phone',
    })).toBe('customer_phone');
    expect(validateAIEmployeeRequestedCustomerNeed({
      cart,
      customerDetails: {},
      decision,
      pendingOrderModificationNeedsConfirmation: false,
      requestedNeed: 'fulfillment_method',
    })).toBe('fulfillment_method');
    expect(validateAIEmployeeRequestedCustomerNeed({
      cart,
      customerDetails: {
        deliveryPreference: 'pickup',
      },
      decision,
      pendingOrderModificationNeedsConfirmation: false,
      requestedNeed: 'payment_method',
    })).toBe('payment_method');
    expect(validateAIEmployeeRequestedCustomerNeed({
      cart,
      customerDetails: {},
      decision,
      pendingOrderModificationNeedsConfirmation: true,
      requestedNeed: 'order_confirmation',
    })).toBe('order_confirmation');
  });

  it('returns null from validateAIEmployeeRequestedCustomerNeed when no requestedNeed is given', () => {
    expect(validateAIEmployeeRequestedCustomerNeed({
      decision: {
        confidence: 1,
        intent: 'order_request',
        missingDetails: [],
        policyVersion: 'test',
        reply: '',
        shouldCreateDraftOrder: false,
      },
      pendingOrderModificationNeedsConfirmation: false,
    })).toBeNull();
  });

  it('returns null from validateAIEmployeeRequestedCustomerNeed for unknown need values', () => {
    expect(validateAIEmployeeRequestedCustomerNeed({
      decision: {
        confidence: 1,
        intent: 'order_request',
        missingDetails: [],
        policyVersion: 'test',
        reply: '',
        shouldCreateDraftOrder: false,
      },
      pendingOrderModificationNeedsConfirmation: false,
      requestedNeed: 'unknown_need' as never,
    })).toBeNull();
  });

  it('returns undefined from sanitizeAIEmployeeSystemSemanticHints when hints are absent', () => {
    expect(sanitizeAIEmployeeSystemSemanticHints({
      previousMetadata: {},
    })).toBeUndefined();
  });

  it('recognises a selectedProductId that is in the cart but not in lastSuggestedProducts', () => {
    expect(sanitizeAIEmployeeSystemSemanticHints({
      hints: {
        selectedProductId: 7,
      },
      previousMetadata: {
        currentCart: {
          ...cart,
          items: [{ name: 'Cart Item', productId: 7, quantity: 1, unitPrice: 10 }],
        },
        lastSuggestedProducts: [{ availability: 'available', id: 99, name: 'Other', price: '5.00' }],
      },
    })).toMatchObject({
      selectedProductId: 7,
    });
  });

  it('detects meaningful hints and checkout continuation signals', () => {
    expect(hasMeaningfulAIEmployeeSemanticHints()).toBe(false);
    expect(hasMeaningfulAIEmployeeSemanticHints({
      selectedProductId: undefined,
    })).toBe(false);
    expect(hasMeaningfulAIEmployeeSemanticHints({
      selectedProductId: 2,
    })).toBe(true);
    expect(AIEmployeeSemanticHintsContinueCheckout({
      customerAddress: 'Tabuk',
    })).toBe(true);
    expect(AIEmployeeSemanticHintsContinueCheckout({
      startNewOrder: true,
    })).toBe(false);
  });
});
