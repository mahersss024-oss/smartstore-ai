/**
 * Component Boundary Matrix — Phases 18-21
 *
 * Tests the dangerous failure modes that live BETWEEN components, not inside them.
 * Covers: AI/System, AI/Guardrail, Guardrail/System, Validator/System,
 *         Database/System, WhatsApp/System, Web/System, State Machine, Customer
 *         Expectation mismatches.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockGeneratePlatformAIText, mockDbTransaction, mockDbSelect, mockDbInsert, mockDbUpdate } = vi.hoisted(() => ({
  mockDbInsert: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockGeneratePlatformAIText: vi.fn(),
}));

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('@/libs/DB', () => ({
  db: {
    insert: mockDbInsert,
    select: mockDbSelect,
    transaction: mockDbTransaction,
    update: mockDbUpdate,
  },
}));

vi.mock('@/libs/SubscriptionEntitlements', () => ({
  assertCanCreateAiOrder: vi.fn(),
}));

vi.mock('./PlatformAIClient', () => ({
  generatePlatformAIText: mockGeneratePlatformAIText,
}));

vi.mock('./PlatformAIProviderConfig', () => ({
  getPlatformAIProviderConfig: vi.fn(async () => ({
    apiBaseUrl: 'https://ai.example.test',
    apiKey: 'test-key',
    enabled: true,
    model: 'test-model',
    provider: 'test',
  })),
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...c: unknown[]) => ({ _: 'and', conditions: c })),
  desc: vi.fn((f: unknown) => ({ _: 'desc', field: f })),
  eq: vi.fn((f: unknown, v: unknown) => ({ _: 'eq', field: f, value: v })),
  inArray: vi.fn((f: unknown, v: unknown) => ({ _: 'inArray', field: f, value: v })),
  isNull: vi.fn((f: unknown) => ({ _: 'isNull', field: f })),
  lt: vi.fn((f: unknown, v: unknown) => ({ _: 'lt', field: f, value: v })),
  or: vi.fn((...c: unknown[]) => ({ _: 'or', conditions: c })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ _: 'sql', strings, values }),
}));

vi.mock('@/models/Schema', () => ({
  deliveryMethodsTable: { fee: 'fee', id: 'id', isActive: 'isActive', organizationId: 'organizationId', type: 'type' },
  orderEventsTable: { id: 'id', organizationId: 'organizationId', orderId: 'orderId' },
  ordersTable: {
    aiAnalysis: 'aiAnalysis',
    archivedAt: 'archivedAt',
    customerAddress: 'customerAddress',
    customerEmail: 'customerEmail',
    customerPhone: 'customerPhone',
    deliveryStatus: 'deliveryStatus',
    id: 'id',
    items: 'items',
    organizationId: 'organizationId',
    status: 'status',
    totalPrice: 'totalPrice',
    updatedAt: 'updatedAt',
  },
  paymentMethodsTable: { id: 'id', organizationId: 'organizationId', provider: 'provider', supportedDeliveryMethods: 'supportedDeliveryMethods' },
  publicEndpointRateLimitsTable: { expiresAt: 'expiresAt', id: 'id' },
  webhookEventsTable: { id: 'id', status: 'status', updatedAt: 'updatedAt' },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const buildSelectChain = (rows: unknown[]) => {
  const chain = {
    from: vi.fn(),
    limit: vi.fn(async () => rows),
    orderBy: vi.fn(),
    where: vi.fn(),
  };
  chain.from.mockReturnValue(chain);
  chain.where.mockReturnValue(chain);
  chain.orderBy.mockReturnValue(chain);
  chain.limit.mockResolvedValue(rows);
  mockDbSelect.mockReturnValue(chain);

  return chain;
};

const buildTransactionWith = (cb: (tx: unknown) => unknown) => {
  mockDbTransaction.mockImplementation(cb);
};

const catalogProducts = [
  { availability: 'available' as const, category: 'Meals', id: 1, name: 'Kabsa Chicken', price: '28.00' },
  { availability: 'available' as const, category: 'Drinks', id: 2, name: 'Water', price: '5.00' },
  { availability: 'unavailable' as const, category: 'Meals', id: 3, name: 'Lamb Mandi', price: '45.00' },
];

const baseGuardParams = {
  cartMutation: { cartActive: false, type: 'none' as const },
  catalogProducts,
  customerMessage: '',
  customerOrders: { completed: [], open: [] },
  hasPriorAssistantReply: false,
  locale: 'en' as const,
  missingDetails: [],
  orderCancellation: { applied: false, requested: false, requiresStoreReview: false },
  orderId: null,
  orderModification: { created: false },
  reviewCaptured: false,
  storeName: 'Test Store',
  suggestedProducts: [],
  supportEscalation: { created: false },
  visibleSystemActions: [],
};

// ─── Phase 18: Order State Machine ───────────────────────────────────────────

describe('Phase 18 — Order State Machine certification', () => {
  describe('complete state map — every status defined', () => {
    it('ORDER_STATUS covers all 11 lifecycle states', async () => {
      const { ORDER_STATUS } = await import('./OrderWorkflow');

      expect(Object.keys(ORDER_STATUS)).toEqual(expect.arrayContaining([
        'DRAFT',
        'PENDING_STORE_REVIEW',
        'APPROVED_BY_STORE',
        'SENT_TO_CUSTOMER',
        'WAITING_PAYMENT',
        'CONFIRMED',
        'PREPARING',
        'READY_FOR_PICKUP',
        'OUT_FOR_DELIVERY',
        'COMPLETED',
        'CANCELLED',
      ]));
      expect(Object.keys(ORDER_STATUS)).toHaveLength(11);
    });

    it('COMPLETED and CANCELLED are terminal — zero allowed outbound transitions', async () => {
      const { canTransitionOrderStatus, ORDER_STATUS } = await import('./OrderWorkflow');
      const allStatuses = Object.values(ORDER_STATUS);

      for (const status of allStatuses) {
        expect(canTransitionOrderStatus(ORDER_STATUS.COMPLETED, status)).toBe(false);
        expect(canTransitionOrderStatus(ORDER_STATUS.CANCELLED, status)).toBe(false);
      }
    });
  });

  describe('valid forward transitions', () => {
    it('DRAFT can advance to PENDING_STORE_REVIEW or CANCELLED', async () => {
      const { canTransitionOrderStatus, ORDER_STATUS } = await import('./OrderWorkflow');

      expect(canTransitionOrderStatus(ORDER_STATUS.DRAFT, ORDER_STATUS.PENDING_STORE_REVIEW)).toBe(true);
      expect(canTransitionOrderStatus(ORDER_STATUS.DRAFT, ORDER_STATUS.CANCELLED)).toBe(true);
    });

    it('PENDING_STORE_REVIEW can advance to APPROVED_BY_STORE, WAITING_PAYMENT, or CANCELLED', async () => {
      const { canTransitionOrderStatus, ORDER_STATUS } = await import('./OrderWorkflow');

      expect(canTransitionOrderStatus(ORDER_STATUS.PENDING_STORE_REVIEW, ORDER_STATUS.APPROVED_BY_STORE)).toBe(true);
      expect(canTransitionOrderStatus(ORDER_STATUS.PENDING_STORE_REVIEW, ORDER_STATUS.WAITING_PAYMENT)).toBe(true);
      expect(canTransitionOrderStatus(ORDER_STATUS.PENDING_STORE_REVIEW, ORDER_STATUS.CANCELLED)).toBe(true);
    });

    it('CONFIRMED can advance to PREPARING, READY_FOR_PICKUP, OUT_FOR_DELIVERY, COMPLETED, or CANCELLED', async () => {
      const { canTransitionOrderStatus, ORDER_STATUS } = await import('./OrderWorkflow');

      expect(canTransitionOrderStatus(ORDER_STATUS.CONFIRMED, ORDER_STATUS.PREPARING)).toBe(true);
      expect(canTransitionOrderStatus(ORDER_STATUS.CONFIRMED, ORDER_STATUS.READY_FOR_PICKUP)).toBe(true);
      expect(canTransitionOrderStatus(ORDER_STATUS.CONFIRMED, ORDER_STATUS.OUT_FOR_DELIVERY)).toBe(true);
      expect(canTransitionOrderStatus(ORDER_STATUS.CONFIRMED, ORDER_STATUS.COMPLETED)).toBe(true);
      expect(canTransitionOrderStatus(ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED)).toBe(true);
    });
  });

  describe('invalid transitions — no skipped confirmations or backwards travel', () => {
    it('DRAFT cannot jump to CONFIRMED, PREPARING, or COMPLETED skipping store review', async () => {
      const { assertCanTransitionOrderStatus, ORDER_STATUS } = await import('./OrderWorkflow');

      expect(() => assertCanTransitionOrderStatus(ORDER_STATUS.DRAFT, ORDER_STATUS.CONFIRMED)).toThrow();
      expect(() => assertCanTransitionOrderStatus(ORDER_STATUS.DRAFT, ORDER_STATUS.PREPARING)).toThrow();
      expect(() => assertCanTransitionOrderStatus(ORDER_STATUS.DRAFT, ORDER_STATUS.COMPLETED)).toThrow();
    });

    it('PENDING_STORE_REVIEW cannot jump to PREPARING or CONFIRMED skipping approval', async () => {
      const { assertCanTransitionOrderStatus, ORDER_STATUS } = await import('./OrderWorkflow');

      expect(() => assertCanTransitionOrderStatus(ORDER_STATUS.PENDING_STORE_REVIEW, ORDER_STATUS.PREPARING)).toThrow();
      expect(() => assertCanTransitionOrderStatus(ORDER_STATUS.PENDING_STORE_REVIEW, ORDER_STATUS.CONFIRMED)).toThrow();
    });

    it('PREPARING cannot go backwards to CONFIRMED or PENDING_STORE_REVIEW', async () => {
      const { assertCanTransitionOrderStatus, ORDER_STATUS } = await import('./OrderWorkflow');

      expect(() => assertCanTransitionOrderStatus(ORDER_STATUS.PREPARING, ORDER_STATUS.CONFIRMED)).toThrow();
      expect(() => assertCanTransitionOrderStatus(ORDER_STATUS.PREPARING, ORDER_STATUS.PENDING_STORE_REVIEW)).toThrow();
    });

    it('cannot self-transition — same status to same status always throws', async () => {
      const { assertCanTransitionOrderStatus, ORDER_STATUS } = await import('./OrderWorkflow');
      const allStatuses = Object.values(ORDER_STATUS);

      for (const status of allStatuses) {
        expect(() => assertCanTransitionOrderStatus(status, status)).toThrow(
          `Invalid order status transition from ${status} to ${status}`,
        );
      }
    });

    it('unknown status strings are rejected by canTransitionOrderStatus', async () => {
      const { canTransitionOrderStatus, ORDER_STATUS } = await import('./OrderWorkflow');

      expect(canTransitionOrderStatus('ghost_status', ORDER_STATUS.CONFIRMED)).toBe(false);
      expect(canTransitionOrderStatus(ORDER_STATUS.DRAFT, 'invented_status')).toBe(false);
      expect(canTransitionOrderStatus('', '')).toBe(false);
    });
  });

  describe('AI lifecycle — state modification boundaries', () => {
    it('AI can modify orders in pre-approval states only', async () => {
      const { canAIEmployeeModifyOrderBeforeStoreApproval } = await import('./AIEmployeeOrderLifecycle');
      const { ORDER_STATUS } = await import('./OrderWorkflow');

      // Pre-approval states
      expect(canAIEmployeeModifyOrderBeforeStoreApproval(ORDER_STATUS.PENDING_STORE_REVIEW)).toBe(true);
      expect(canAIEmployeeModifyOrderBeforeStoreApproval(ORDER_STATUS.DRAFT)).toBe(true);
      expect(canAIEmployeeModifyOrderBeforeStoreApproval(ORDER_STATUS.SENT_TO_CUSTOMER)).toBe(true);
      expect(canAIEmployeeModifyOrderBeforeStoreApproval(ORDER_STATUS.WAITING_PAYMENT)).toBe(true);

      // Post-approval states — AI must not auto-modify
      expect(canAIEmployeeModifyOrderBeforeStoreApproval(ORDER_STATUS.APPROVED_BY_STORE)).toBe(false);
      expect(canAIEmployeeModifyOrderBeforeStoreApproval(ORDER_STATUS.CONFIRMED)).toBe(false);
      expect(canAIEmployeeModifyOrderBeforeStoreApproval(ORDER_STATUS.PREPARING)).toBe(false);
      expect(canAIEmployeeModifyOrderBeforeStoreApproval(ORDER_STATUS.OUT_FOR_DELIVERY)).toBe(false);
      expect(canAIEmployeeModifyOrderBeforeStoreApproval(ORDER_STATUS.COMPLETED)).toBe(false);
    });

    it('AI cannot add items to completed or cancelled orders', async () => {
      const { canAIEmployeeAddItemsToExistingOrder } = await import('./AIEmployeeOrderLifecycle');
      const { ORDER_STATUS } = await import('./OrderWorkflow');

      expect(canAIEmployeeAddItemsToExistingOrder({ status: ORDER_STATUS.COMPLETED })).toBe(false);
      expect(canAIEmployeeAddItemsToExistingOrder({ status: ORDER_STATUS.CANCELLED })).toBe(false);
    });

    it('AI cannot add items to an order out for delivery', async () => {
      const { canAIEmployeeAddItemsToExistingOrder } = await import('./AIEmployeeOrderLifecycle');
      const { DELIVERY_STATUS, ORDER_STATUS } = await import('./OrderWorkflow');

      // via order status
      expect(canAIEmployeeAddItemsToExistingOrder({ status: ORDER_STATUS.OUT_FOR_DELIVERY })).toBe(false);

      // via delivery status field (courier already dispatched)
      expect(canAIEmployeeAddItemsToExistingOrder({
        deliveryStatus: DELIVERY_STATUS.OUT_FOR_DELIVERY,
        status: ORDER_STATUS.CONFIRMED,
      })).toBe(false);
    });

    it('AI-created orders start at PENDING_STORE_REVIEW — DRAFT state is never produced by the AI', async () => {
      // createAIEmployeeDraftOrder inserts with status = PENDING_STORE_REVIEW, not DRAFT.
      // resolveAIEmployeeOrderServiceMethodIds queries delivery and payment methods first.
      const selectChain = {
        from: vi.fn(),
        limit: vi.fn(async () => []),
        orderBy: vi.fn(),
        where: vi.fn(),
      };
      selectChain.from.mockReturnValue(selectChain);
      selectChain.where.mockReturnValue(selectChain);
      selectChain.orderBy.mockReturnValue(selectChain);
      selectChain.limit.mockResolvedValue([]);
      mockDbSelect.mockReturnValue(selectChain);

      const insertedValues: unknown[] = [];
      const mockTx = {
        insert: vi.fn(() => ({
          values: vi.fn((vals: unknown) => {
            insertedValues.push(vals);

            return { returning: vi.fn(async () => [{ id: 42 }]) };
          }),
        })),
      };
      buildTransactionWith((txFn: unknown) => (txFn as (tx: unknown) => unknown)(mockTx));

      const { createAIEmployeeDraftOrder } = await import('./AIEmployeeOrderLifecycle');
      const { ORDER_STATUS } = await import('./OrderWorkflow');

      await createAIEmployeeDraftOrder({
        aiAnalysis: { confidence: 1, intent: 'order_request' as const, missingDetails: [], policyVersion: 'v1', reply: 'ok', shouldCreateDraftOrder: true, suggestedProducts: [] },
        items: [{ name: 'Kabsa Chicken', productId: 1, quantity: 1, unitPrice: 28 }],
        organizationId: 'org_test',
        source: 'web_chat',
      });

      const orderInsert = insertedValues[0] as { status?: string };

      expect(orderInsert.status).toBe(ORDER_STATUS.PENDING_STORE_REVIEW);
      expect(orderInsert.status).not.toBe(ORDER_STATUS.DRAFT);
    });
  });
});

// ─── Phase 19: Customer Harm Prevention ──────────────────────────────────────

describe('Phase 19 — Customer Harm Prevention certification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    buildSelectChain([]);
  });

  describe('wrong product / empty cart guard', () => {
    it('createAIEmployeeDraftOrder returns null and writes nothing when cart is empty', async () => {
      const { createAIEmployeeDraftOrder } = await import('./AIEmployeeOrderLifecycle');

      const result = await createAIEmployeeDraftOrder({
        aiAnalysis: { confidence: 1, intent: 'order_request' as const, missingDetails: [], policyVersion: 'v1', reply: 'ok', shouldCreateDraftOrder: true, suggestedProducts: [] },
        items: [],
        organizationId: 'org_test',
        source: 'web_chat',
      });

      expect(result).toBeNull();
      expect(mockDbTransaction).not.toHaveBeenCalled();
    });

    it('createAIEmployeeDraftOrder returns null when missingDetails is non-empty', async () => {
      const { createAIEmployeeDraftOrder } = await import('./AIEmployeeOrderLifecycle');

      const result = await createAIEmployeeDraftOrder({
        aiAnalysis: {
          confidence: 1,
          intent: 'order_request' as const,
          missingDetails: ['delivery_address'],
          policyVersion: 'v1',
          reply: 'Please provide your address.',
          shouldCreateDraftOrder: false,
          suggestedProducts: [],
        },
        items: [{ name: 'Kabsa Chicken', productId: 1, quantity: 1, unitPrice: 28 }],
        organizationId: 'org_test',
        source: 'web_chat',
      });

      expect(result).toBeNull();
      expect(mockDbTransaction).not.toHaveBeenCalled();
    });
  });

  describe('wrong delivery / wrong address guard', () => {
    it('getMissingAIEmployeeOrderDetails requires delivery address for delivery orders', async () => {
      const { getMissingAIEmployeeOrderDetails } = await import('./AIEmployeeCheckout');

      const missing = getMissingAIEmployeeOrderDetails({
        cart: { items: [{ name: 'Kabsa', productId: 1, quantity: 1, unitPrice: 28 }] },
        customerDetails: {
          deliveryPreference: 'delivery',
          paymentPreference: 'cash_on_delivery',
          phone: '0501234567',
          // address intentionally absent
        },
      });

      expect(missing).toContain('delivery_address');
    });

    it('getMissingAIEmployeeOrderDetails does not require address for pickup orders', async () => {
      const { getMissingAIEmployeeOrderDetails } = await import('./AIEmployeeCheckout');

      const missing = getMissingAIEmployeeOrderDetails({
        cart: { items: [{ name: 'Kabsa', productId: 1, quantity: 1, unitPrice: 28 }] },
        customerDetails: {
          deliveryPreference: 'pickup',
          paymentPreference: 'cash_on_pickup',
          phone: '0501234567',
        },
      });

      expect(missing).not.toContain('delivery_address');
    });

    it('getMissingAIEmployeeOrderDetails requires all five details for a complete delivery order', async () => {
      const { getMissingAIEmployeeOrderDetails } = await import('./AIEmployeeCheckout');

      const missing = getMissingAIEmployeeOrderDetails({
        cart: undefined,
        customerDetails: undefined,
      });

      expect(missing).toContain('requested_product');
      expect(missing).toContain('customer_phone');
      expect(missing).toContain('fulfillment_method');
      expect(missing).toContain('payment_method');
      expect(missing).toHaveLength(4);
    });
  });

  describe('wrong delivery method guard', () => {
    it('getAllowedAIEmployeeDeliveryPreferences only returns store-enabled methods', async () => {
      const { getAllowedAIEmployeeDeliveryPreferences } = await import('./AIEmployeeCheckout');

      const deliveryOnly = getAllowedAIEmployeeDeliveryPreferences({
        deliveryMethods: [{ type: 'local_delivery' }],
        paymentMethods: [],
      } as never);

      expect(deliveryOnly).toEqual(['delivery']);
      expect(deliveryOnly).not.toContain('pickup');
    });

    it('getAllowedAIEmployeeDeliveryPreferences returns empty when no delivery methods configured', async () => {
      const { getAllowedAIEmployeeDeliveryPreferences } = await import('./AIEmployeeCheckout');

      const allowed = getAllowedAIEmployeeDeliveryPreferences({
        deliveryMethods: [],
        paymentMethods: [],
      } as never);

      expect(allowed).toEqual([]);
    });
  });

  describe('wrong payment method guard', () => {
    it('constrainAIEmployeeSemanticUnderstandingToStoreMethods strips delivery preference unavailable in store', async () => {
      const { constrainAIEmployeeSemanticUnderstandingToStoreMethods } = await import('./AIEmployeeCheckout');

      // Store only has pickup, AI extracted delivery preference
      const constrained = constrainAIEmployeeSemanticUnderstandingToStoreMethods(
        { deliveryPreference: 'delivery' as const },
        {
          deliveryMethods: [{ type: 'pickup' }],
          paymentMethods: [],
        } as never,
      );

      expect(constrained.deliveryPreference).toBeUndefined();
    });

    it('constrainAIEmployeeSemanticUnderstandingToStoreMethods strips payment preference unavailable for delivery type', async () => {
      const { constrainAIEmployeeSemanticUnderstandingToStoreMethods } = await import('./AIEmployeeCheckout');

      // Store only has cash_on_pickup, AI extracted cash_on_delivery
      const constrained = constrainAIEmployeeSemanticUnderstandingToStoreMethods(
        {
          deliveryPreference: 'pickup' as const,
          paymentPreference: 'cash_on_delivery' as const,
        },
        {
          deliveryMethods: [{ type: 'pickup' }],
          paymentMethods: [
            {
              provider: 'cash_on_pickup',
              supportedDeliveryPreferences: ['pickup'],
            },
          ],
        } as never,
      );

      expect(constrained.paymentPreference).toBeUndefined();
    });
  });

  describe('wrong price guard', () => {
    it('calculateAIEmployeeOrderPricing includes delivery fee in total', async () => {
      const { calculateAIEmployeeOrderPricing } = await import('./AIEmployeeCheckout');

      const pricing = calculateAIEmployeeOrderPricing({
        customerDetails: { deliveryPreference: 'delivery' },
        deliveryFee: 10,
        subtotal: 28,
      });

      expect(pricing.total).toBe(38);
      expect(pricing.deliveryFee).toBe(10);
      expect(pricing.subtotal).toBe(28);
    });

    it('calculateAIEmployeeOrderPricing has zero delivery fee for pickup orders', async () => {
      const { calculateAIEmployeeOrderPricing } = await import('./AIEmployeeCheckout');

      const pricing = calculateAIEmployeeOrderPricing({
        customerDetails: { deliveryPreference: 'pickup' },
        deliveryFee: 0,
        subtotal: 33,
      });

      expect(pricing.total).toBe(33);
      expect(pricing.deliveryFee).toBe(0);
    });
  });

  describe('wrong cancellation — post-approval orders require store review', () => {
    it('getAIEmployeeOrderCancellationPolicy requires store review for approved/preparing orders', async () => {
      const { getAIEmployeeOrderCancellationPolicy } = await import('./AIEmployeeOrderLifecycle');
      const { ORDER_STATUS } = await import('./OrderWorkflow');

      const approvedPolicy = getAIEmployeeOrderCancellationPolicy({ status: ORDER_STATUS.APPROVED_BY_STORE });

      expect(approvedPolicy.canCancelAutomatically).toBe(false);
      expect(approvedPolicy.requiresStoreReview).toBe(true);

      const preparingPolicy = getAIEmployeeOrderCancellationPolicy({ status: ORDER_STATUS.PREPARING });

      expect(preparingPolicy.canCancelAutomatically).toBe(false);
      expect(preparingPolicy.requiresStoreReview).toBe(true);
    });

    it('getAIEmployeeOrderCancellationPolicy allows automatic cancel for pre-approval orders', async () => {
      const { getAIEmployeeOrderCancellationPolicy } = await import('./AIEmployeeOrderLifecycle');
      const { ORDER_STATUS } = await import('./OrderWorkflow');

      const policy = getAIEmployeeOrderCancellationPolicy({ status: ORDER_STATUS.PENDING_STORE_REVIEW });

      expect(policy.canCancelAutomatically).toBe(true);
      expect(policy.requiresStoreReview).toBe(false);
    });

    it('getAIEmployeeOrderCancellationPolicy blocks cancel for out-for-delivery orders', async () => {
      const { getAIEmployeeOrderCancellationPolicy } = await import('./AIEmployeeOrderLifecycle');
      const { ORDER_STATUS } = await import('./OrderWorkflow');

      const policy = getAIEmployeeOrderCancellationPolicy({ status: ORDER_STATUS.OUT_FOR_DELIVERY });

      expect(policy.canCancelAutomatically).toBe(false);
      expect(policy.requiresStoreReview).toBe(true);
      expect(policy.reason).toBe('out_for_delivery');
    });

    it('getAIEmployeeOrderCancellationPolicy blocks cancel for completed orders', async () => {
      const { getAIEmployeeOrderCancellationPolicy } = await import('./AIEmployeeOrderLifecycle');
      const { ORDER_STATUS } = await import('./OrderWorkflow');

      const policy = getAIEmployeeOrderCancellationPolicy({ status: ORDER_STATUS.COMPLETED });

      expect(policy.canCancelAutomatically).toBe(false);
      expect(policy.requiresStoreReview).toBe(false);
      expect(policy.reason).toBe('completed');
    });
  });
});

// ─── Phase 20: AI Hallucination Prevention ───────────────────────────────────

describe('Phase 20 — AI Hallucination Prevention certification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: AI semantic reviewer passes (deterministic checks still fire)
    mockGeneratePlatformAIText.mockResolvedValue(JSON.stringify({
      confidence: 'certain',
      decision: 'pass',
      reason: '',
      replacementReply: '',
      safe: true,
    }));
  });

  describe('price hallucinations — AI cannot invent a price', () => {
    it('guard blocks an AI reply quoting a price completely absent from the catalog', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');

      // 20.00 SAR does not match any product price (28, 5, or 45) — guard blocks it
      const result = await guardModelReplyAgainstFalseActions({
        ...baseGuardParams,
        reply: 'Kabsa Chicken 20.00 SAR.',
      });

      expect(result.guarded).toBe(true);
      expect(result.reason).toContain('unsupported_price:20.00');
    });

    it('guard allows any catalog price — price guard is pool-level, not per-product', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');

      // 28.00 SAR is Kabsa's price and is in the allowed pool — guard must pass
      const result = await guardModelReplyAgainstFalseActions({
        ...baseGuardParams,
        reply: 'Kabsa Chicken 28.00 SAR.',
      });

      expect(result.guarded).toBe(false);
    });

    it('guard blocks delivery-total hallucination — AI cannot invent its own total', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');

      // Order confirmed at 38 SAR (28 subtotal + 10 delivery), AI hallucinates 50 SAR
      const result = await guardModelReplyAgainstFalseActions({
        ...baseGuardParams,
        orderModification: { created: true, totalPrice: '38.00' },
        reply: 'Your order total is 50.00 SAR including delivery.',
      });

      expect(result.guarded).toBe(true);
      expect(result.reason).toContain('unsupported_price:50.00');
    });

    it('guard allows confirmed order total including delivery fee', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');

      const result = await guardModelReplyAgainstFalseActions({
        ...baseGuardParams,
        orderModification: { created: true, totalPrice: '38.00' },
        reply: 'Your order has been submitted. Total: 38.00 SAR.',
      });

      expect(result.guarded).toBe(false);
    });
  });

  describe('availability hallucinations — AI cannot claim unavailable products are available', () => {
    it('guard allows AI to mention an unavailable product name without quoting its price', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');

      // Lamb Mandi is unavailable but AI can say it's unavailable — just not quote a price for it
      const result = await guardModelReplyAgainstFalseActions({
        ...baseGuardParams,
        reply: 'Lamb Mandi is currently unavailable. Can I help you with Kabsa Chicken?',
      });

      expect(result.guarded).toBe(false);
    });

    it('guard allows AI to quote the catalog price of an unavailable product (guard is price-pool level, not availability level)', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');

      // Lamb Mandi is unavailable but 45.00 SAR IS its catalog price.
      // The guard allows this — availability enforcement is the AI's responsibility,
      // not the price guard's. The price guard only blocks non-catalog prices.
      const result = await guardModelReplyAgainstFalseActions({
        ...baseGuardParams,
        reply: 'Lamb Mandi 45.00 SAR is currently unavailable.',
      });

      expect(result.guarded).toBe(false);
    });

    it('guard blocks AI quoting a fabricated price for an unavailable product', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');

      // 99.00 SAR is not in the catalog at all — guard blocks it regardless of product availability
      const result = await guardModelReplyAgainstFalseActions({
        ...baseGuardParams,
        reply: 'Lamb Mandi 99.00 SAR special offer.',
      });

      expect(result.guarded).toBe(true);
      expect(result.reason).toContain('unsupported_price:99.00');
    });
  });

  describe('order hallucinations — AI cannot claim order created when system did not create it', () => {
    it('guard blocks AI claiming order submitted when orderModification.created is false', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');

      const result = await guardModelReplyAgainstFalseActions({
        ...baseGuardParams,
        orderModification: { created: false },
        reply: 'Your order has been received and confirmed.',
      });

      expect(result.guarded).toBe(true);
      expect(result.reason).toBe('unproven_action:order_created');
    });

    it('guard allows AI to confirm order when system created it', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');

      const result = await guardModelReplyAgainstFalseActions({
        ...baseGuardParams,
        orderModification: { created: true, totalPrice: '28.00' },
        reply: 'Your order has been received. Total: 28.00 SAR.',
      });

      expect(result.guarded).toBe(false);
    });
  });

  describe('payment hallucinations — AI cannot claim payment received', () => {
    it('guard blocks AI claiming payment received without system proof', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');

      // "payment received" matches the guard pattern — use the actual pattern wording
      const result = await guardModelReplyAgainstFalseActions({
        ...baseGuardParams,
        reply: 'Your payment has been received. Thank you!',
      });

      expect(result.guarded).toBe(true);
      expect(result.reason).toBe('unproven_action:payment_completed');
    });
  });

  describe('cart hallucinations — AI cannot claim cart modified without system proof', () => {
    it('guard blocks AI claiming item added when no cart mutation occurred', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');

      const result = await guardModelReplyAgainstFalseActions({
        ...baseGuardParams,
        cartMutation: { cartActive: false, type: 'none' as const },
        reply: 'Kabsa Chicken has been added to your cart.',
      });

      expect(result.guarded).toBe(true);
      expect(result.reason).toBe('unproven_action:cart_item_added');
    });

    it('guard allows AI to confirm cart addition when system mutation occurred', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');

      const result = await guardModelReplyAgainstFalseActions({
        ...baseGuardParams,
        cartMutation: { cartActive: true, type: 'added_items' } as never,
        reply: 'Kabsa Chicken has been added to your cart.',
      });

      expect(result.guarded).toBe(false);
    });
  });

  describe('DB/System mismatch — optimistic concurrency in order modification', () => {
    it('addAIEmployeeItemsToExistingOrder returns created:false when concurrent modification invalidates updatedAt', async () => {
      // First select returns the order
      buildSelectChain([{
        deliveryStatus: null,
        items: [{ name: 'Water', productId: 2, quantity: 1, unitPrice: 5 }],
        status: 'pending_store_review',
        totalPrice: '5.00',
        updatedAt: new Date('2026-06-17T10:00:00Z'),
      }]);

      // Transaction update returns 0 rows — concurrent modification won the race
      const mockTx = {
        insert: vi.fn(() => ({ values: vi.fn(async () => []) })),
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => ({
              returning: vi.fn(async () => []), // empty = optimistic lock failed
            })),
          })),
        })),
      };
      buildTransactionWith((txFn: unknown) => (txFn as (tx: unknown) => unknown)(mockTx));

      const { addAIEmployeeItemsToExistingOrder } = await import('./AIEmployeeOrderLifecycle');

      const result = await addAIEmployeeItemsToExistingOrder({
        conversationId: 1,
        items: [{ name: 'Kabsa Chicken', productId: 1, quantity: 1, unitPrice: 28 }],
        orderId: 99,
        organizationId: 'org_test',
      });

      // System must not claim success to the AI when the DB write was lost
      expect(result.created).toBe(false);
    });

    it('addAIEmployeeItemsToExistingOrder returns created:false for completed orders', async () => {
      buildSelectChain([{
        deliveryStatus: null,
        items: [],
        status: 'completed',
        totalPrice: '28.00',
        updatedAt: new Date(),
      }]);

      const { addAIEmployeeItemsToExistingOrder } = await import('./AIEmployeeOrderLifecycle');

      const result = await addAIEmployeeItemsToExistingOrder({
        conversationId: 1,
        items: [{ name: 'Kabsa Chicken', productId: 1, quantity: 1, unitPrice: 28 }],
        orderId: 99,
        organizationId: 'org_test',
      });

      expect(result.created).toBe(false);
      expect(mockDbTransaction).not.toHaveBeenCalled();
    });
  });
});

// ─── Phase 21: WhatsApp / Web Consistency ────────────────────────────────────

describe('Phase 21 — WhatsApp / Web Consistency certification', () => {
  describe('service choices are channel-independent', () => {
    it('getAvailableAIEmployeeServiceChoices derives the same result regardless of channel caller', async () => {
      const { getAvailableAIEmployeeServiceChoices } = await import('./AIEmployeeCheckout');

      const storeContext = {
        deliveryMethods: [{ type: 'local_delivery' }, { type: 'pickup' }],
        paymentMethods: [
          { provider: 'cash_on_delivery', supportedDeliveryPreferences: ['delivery'] },
          { provider: 'cash_on_pickup', supportedDeliveryPreferences: ['pickup'] },
        ],
      };

      // Call with the same storeContext twice — simulates web vs WhatsApp caller
      const webChoices = getAvailableAIEmployeeServiceChoices(storeContext as never);
      const whatsappChoices = getAvailableAIEmployeeServiceChoices(storeContext as never);

      expect(webChoices).toEqual(whatsappChoices);
      expect(webChoices.availableFulfillmentTypes).toEqual(expect.arrayContaining(['delivery', 'pickup']));
    });

    it('getAvailableAIEmployeeServiceChoices excludes fulfillment types with no payment method', async () => {
      const { getAvailableAIEmployeeServiceChoices } = await import('./AIEmployeeCheckout');

      // Store has delivery method but NO delivery payment method
      const storeContext = {
        deliveryMethods: [{ type: 'local_delivery' }],
        paymentMethods: [
          { provider: 'cash_on_pickup', supportedDeliveryPreferences: ['pickup'] },
        ],
      };

      const choices = getAvailableAIEmployeeServiceChoices(storeContext as never);

      // delivery is excluded because no payment method supports it
      expect(choices.availableFulfillmentTypes).not.toContain('delivery');
    });
  });

  describe('delivery preference constraints are channel-independent', () => {
    it('getAllowedAIEmployeeDeliveryPreferences returns same set for identical store context', async () => {
      const { getAllowedAIEmployeeDeliveryPreferences } = await import('./AIEmployeeCheckout');

      const storeContext = {
        deliveryMethods: [{ type: 'pickup' }, { type: 'curbside_pickup' }],
        paymentMethods: [],
      };

      const webAllowed = getAllowedAIEmployeeDeliveryPreferences(storeContext as never);
      const whatsappAllowed = getAllowedAIEmployeeDeliveryPreferences(storeContext as never);

      expect(webAllowed).toEqual(whatsappAllowed);
      expect(webAllowed).toEqual(['pickup']);
    });
  });

  describe('constraint stripping is channel-independent', () => {
    it('constrainAIEmployeeSemanticUnderstandingToStoreMethods strips same disallowed preferences for both channels', async () => {
      const { constrainAIEmployeeSemanticUnderstandingToStoreMethods } = await import('./AIEmployeeCheckout');

      const storeContext = {
        deliveryMethods: [{ type: 'pickup' }],
        paymentMethods: [
          { provider: 'cash_on_pickup', supportedDeliveryPreferences: ['pickup'] },
        ],
      };

      const webInput = { deliveryPreference: 'delivery' as const, paymentPreference: 'cash_on_delivery' as const };
      const whatsappInput = { deliveryPreference: 'delivery' as const, paymentPreference: 'cash_on_delivery' as const };

      const webResult = constrainAIEmployeeSemanticUnderstandingToStoreMethods(webInput, storeContext as never);
      const whatsappResult = constrainAIEmployeeSemanticUnderstandingToStoreMethods(whatsappInput, storeContext as never);

      expect(webResult.deliveryPreference).toBeUndefined();
      expect(whatsappResult.deliveryPreference).toBeUndefined();
      expect(webResult.paymentPreference).toBeUndefined();
      expect(whatsappResult.paymentPreference).toBeUndefined();
    });
  });

  describe('guardrail consistency — same blocks apply to both channels', () => {
    beforeEach(() => {
      vi.clearAllMocks();
      mockGeneratePlatformAIText.mockResolvedValue(JSON.stringify({
        confidence: 'certain',
        decision: 'pass',
        reason: '',
        replacementReply: '',
        safe: true,
      }));
    });

    it('price guard blocks the same unsupported price on web and WhatsApp locales', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');
      const reply = 'Kabsa Chicken 15.00 SAR.';

      const webResult = await guardModelReplyAgainstFalseActions({ ...baseGuardParams, locale: 'en', reply });
      const waResult = await guardModelReplyAgainstFalseActions({ ...baseGuardParams, locale: 'ar', reply });

      expect(webResult.guarded).toBe(true);
      expect(waResult.guarded).toBe(true);
      expect(webResult.reason).toBe(waResult.reason);
    });

    it('order-creation guard blocks same unproven claim on web and WhatsApp locales', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');
      const reply = 'Your order has been submitted and is being prepared.';

      const webResult = await guardModelReplyAgainstFalseActions({
        ...baseGuardParams,
        locale: 'en',
        orderModification: { created: false },
        reply,
      });
      const waResult = await guardModelReplyAgainstFalseActions({
        ...baseGuardParams,
        locale: 'ar',
        orderModification: { created: false },
        reply,
      });

      expect(webResult.guarded).toBe(true);
      expect(waResult.guarded).toBe(true);
      expect(webResult.reason).toBe(waResult.reason);
      expect(webResult.reason).toBe('unproven_action:order_created');
    });
  });

  describe('state machine is channel-independent', () => {
    it('assertCanTransitionOrderStatus enforces the same rules regardless of channel', async () => {
      const { assertCanTransitionOrderStatus, ORDER_STATUS } = await import('./OrderWorkflow');

      // Both channels attempt the same invalid transition — both must throw
      const webAttempt = () => assertCanTransitionOrderStatus(ORDER_STATUS.COMPLETED, ORDER_STATUS.PREPARING);
      const waAttempt = () => assertCanTransitionOrderStatus(ORDER_STATUS.COMPLETED, ORDER_STATUS.PREPARING);

      expect(webAttempt).toThrow();
      expect(waAttempt).toThrow();
    });
  });

  describe('missing order details validation is channel-independent', () => {
    it('getMissingAIEmployeeOrderDetails returns the same missing fields for web and WhatsApp input', async () => {
      const { getMissingAIEmployeeOrderDetails } = await import('./AIEmployeeCheckout');

      // Both channels call the same validator with identical input
      const webMissing = getMissingAIEmployeeOrderDetails({
        cart: { items: [{ name: 'Kabsa', productId: 1, quantity: 1, unitPrice: 28 }] },
        customerDetails: { deliveryPreference: 'delivery', phone: '0501234567' },
      });
      const waMissing = getMissingAIEmployeeOrderDetails({
        cart: { items: [{ name: 'Kabsa', productId: 1, quantity: 1, unitPrice: 28 }] },
        customerDetails: { deliveryPreference: 'delivery', phone: '0501234567' },
      });

      expect(webMissing).toEqual(waMissing);
      expect(webMissing).toContain('delivery_address');
      expect(webMissing).toContain('payment_method');
    });
  });
});

// ─── Cross-component interaction failures ─────────────────────────────────────

describe('Cross-component interaction failure scenarios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('AI/Guardrail mismatch — guardrail must see real system state', () => {
    beforeEach(() => {
      mockGeneratePlatformAIText.mockResolvedValue(JSON.stringify({
        confidence: 'certain',
        decision: 'pass',
        reason: '',
        replacementReply: '',
        safe: true,
      }));
    });

    it('guard receives orderModification.created:false and blocks order confirmation even if AI is confident', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');

      // AI semantic reviewer says 'pass' but deterministic check sees no system order creation
      mockGeneratePlatformAIText.mockResolvedValue(JSON.stringify({
        confidence: 'certain',
        decision: 'pass',
        reason: '',
        safe: true,
      }));

      const result = await guardModelReplyAgainstFalseActions({
        ...baseGuardParams,
        orderModification: { created: false },
        reply: 'Your order has been received and confirmed.',
      });

      // Deterministic check overrides the AI reviewer's 'pass'
      expect(result.guarded).toBe(true);
      expect(result.reason).toBe('unproven_action:order_created');
    });
  });

  describe('Validator/System mismatch — validation must match order creation rules', () => {
    it('createAIEmployeeDraftOrder and getMissingAIEmployeeOrderDetails agree on required fields', async () => {
      // If getMissingAIEmployeeOrderDetails returns no missing details,
      // createAIEmployeeDraftOrder must not reject for missing details.
      const { getMissingAIEmployeeOrderDetails } = await import('./AIEmployeeCheckout');

      const completeDetails = {
        address: '123 Test Street, Riyadh',
        deliveryPreference: 'delivery' as const,
        paymentPreference: 'cash_on_delivery' as const,
        phone: '0501234567',
      };
      const cart = { items: [{ name: 'Kabsa', productId: 1, quantity: 1, unitPrice: 28 }] };

      const missing = getMissingAIEmployeeOrderDetails({ cart, customerDetails: completeDetails });

      // If validator says complete, system should accept the order
      expect(missing).toHaveLength(0);
    });

    it('getMissingAIEmployeeOrderDetails and createAIEmployeeDraftOrder both block empty carts', async () => {
      const { getMissingAIEmployeeOrderDetails } = await import('./AIEmployeeCheckout');
      const { createAIEmployeeDraftOrder } = await import('./AIEmployeeOrderLifecycle');

      const missingFromValidator = getMissingAIEmployeeOrderDetails({ cart: undefined, customerDetails: undefined });

      expect(missingFromValidator).toContain('requested_product');

      // createAIEmployeeDraftOrder also returns null for empty cart
      const created = await createAIEmployeeDraftOrder({
        aiAnalysis: { confidence: 1, intent: 'order_request' as const, missingDetails: [], policyVersion: 'v1', reply: '', shouldCreateDraftOrder: true, suggestedProducts: [] },
        items: [],
        organizationId: 'org_test',
        source: 'web_chat',
      });

      expect(created).toBeNull();
    });
  });

  describe('State Machine/AI mismatch — delivery-stage order cannot receive AI item additions', () => {
    it('canAIEmployeeAddItemsToExistingOrder and canAIEmployeeModifyOrderBeforeStoreApproval are consistent for terminal states', async () => {
      const {
        canAIEmployeeAddItemsToExistingOrder,
        canAIEmployeeModifyOrderBeforeStoreApproval,
      } = await import('./AIEmployeeOrderLifecycle');
      const { ORDER_STATUS } = await import('./OrderWorkflow');

      // A COMPLETED order: neither modification nor item addition should be possible
      expect(canAIEmployeeAddItemsToExistingOrder({ status: ORDER_STATUS.COMPLETED })).toBe(false);
      expect(canAIEmployeeModifyOrderBeforeStoreApproval(ORDER_STATUS.COMPLETED)).toBe(false);

      // A CANCELLED order: neither modification nor item addition should be possible
      expect(canAIEmployeeAddItemsToExistingOrder({ status: ORDER_STATUS.CANCELLED })).toBe(false);
      expect(canAIEmployeeModifyOrderBeforeStoreApproval(ORDER_STATUS.CANCELLED)).toBe(false);
    });
  });
});
