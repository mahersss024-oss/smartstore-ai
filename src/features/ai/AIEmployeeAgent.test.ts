import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const orderBy = vi.fn(() => ({ limit }));
  const where = vi.fn(() => ({
    limit,
    orderBy,
    then: (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) =>
      Promise.resolve([]).then(resolve, reject),
  }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const insertReturning = vi.fn(async () => [{ id: 999 }]);
  const insertOnConflictDoNothing = vi.fn(() => ({ returning: insertReturning }));
  const insertOnConflictDoUpdate = vi.fn(() => ({ returning: insertReturning }));
  const insertValues = vi.fn(() => ({
    onConflictDoNothing: insertOnConflictDoNothing,
    onConflictDoUpdate: insertOnConflictDoUpdate,
    returning: insertReturning,
  }));

  return {
    analyzeAIEmployeeMessageSemantics: vi.fn(),
    assertCanPerformAIAction: vi.fn(),
    assertStoreFeatureEnabled: vi.fn(),
    extractConversationRating: vi.fn(),
    generateAIEmployeeSystemEventReply: vi.fn(),
    getAIEmployeeReplyGuardOrchestrationIssues: vi.fn(),
    getPlatformAIProviderConfig: vi.fn(),
    getVisibleAIEmployeeSystemActions: vi.fn(),
    guardModelReplyAgainstFalseActions: vi.fn(),
    insert: vi.fn(() => ({ values: insertValues })),
    insertOnConflictDoUpdate,
    insertReturning,
    insertValues,
    limit,
    orderBy,
    loadStoreAIContext: vi.fn(),
    normalizeAIEmployeeSettings: vi.fn(),
    orchestrateAIEmployeeDialogueState: vi.fn(),
    repairGuardedReplyIfPossible: vi.fn(),
    select,
  };
});

vi.mock('@/libs/AIActionPermissions', () => ({
  AI_AUDIT_ACTION: {
    BUILD_CART: 'build_cart',
    CAPTURE_REVIEW: 'capture_review',
    CREATE_ORDER: 'create_order',
    RECOMMEND_PRODUCTS: 'recommend_products',
    REPLY: 'reply',
  },
  assertCanPerformAIAction: mocks.assertCanPerformAIAction,
  getRequiredAIPermission: vi.fn((action: string) => `permission:${action}`),
}));

vi.mock('@/libs/AIEmployeeSettings', () => ({
  normalizeAIEmployeeSettings: mocks.normalizeAIEmployeeSettings,
}));

vi.mock('@/libs/AIEmployeeSystemEventReply', () => ({
  generateAIEmployeeSystemEventReply: mocks.generateAIEmployeeSystemEventReply,
}));

vi.mock('@/libs/DB', () => ({
  db: {
    insert: mocks.insert,
    select: mocks.select,
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
    })),
  },
}));

vi.mock('@/libs/PlatformAIProviderConfig', () => ({
  getPlatformAIProviderConfig: mocks.getPlatformAIProviderConfig,
}));

vi.mock('@/libs/StoreAIContext', () => ({
  loadStoreAIContext: mocks.loadStoreAIContext,
}));

vi.mock('@/libs/StoreServiceControls', () => ({
  assertStoreFeatureEnabled: mocks.assertStoreFeatureEnabled,
}));

vi.mock('@/models/Schema', () => {
  const table = new Proxy({}, {
    get: (_target, property) => String(property),
  });

  return {
    aiActionLogsTable: table,
    conversationMessagesTable: table,
    conversationsTable: table,
    customerReviewsTable: table,
    customersTable: table,
    ordersTable: table,
    productsTable: table,
    storeSettingsTable: table,
  };
});

vi.mock('@/libs/AIEmployeeOrchestration', () => ({
  AIEmployeeSemanticHintsContinueCheckout: vi.fn(() => false),
  buildAIEmployeeCancelledCartSnapshot: vi.fn(() => null),
  buildAIEmployeeOrchestrationTrace: vi.fn(() => ({
    issues: [],
    protocolVersion: '2026-05-28.v1',
    quality: 1,
    systemDecision: { cartActive: false, missingDetails: [], nextCustomerNeed: null, visibleSystemActions: [] },
    systemDecisionReasons: [],
  })),
  getAIEmployeeReplyGuardDecisionSummary: vi.fn(() => ({})),
  getAIEmployeeReplyGuardOrchestrationIssues: mocks.getAIEmployeeReplyGuardOrchestrationIssues,
  getNextAIEmployeeCustomerNeed: vi.fn(() => null),
  getPendingAIEmployeeProductSelectionNeed: vi.fn(() => null),
  getRestorableAIEmployeeCancelledCartSnapshot: vi.fn(() => null),
  getVisibleAIEmployeeSystemActions: mocks.getVisibleAIEmployeeSystemActions,
  hasMeaningfulAIEmployeeSemanticHints: vi.fn(() => false),
  orchestrateAIEmployeeDialogueState: mocks.orchestrateAIEmployeeDialogueState,
  sanitizeAIEmployeeSystemSemanticHints: vi.fn(() => ({})),
  validateAIEmployeeRequestedCustomerNeed: vi.fn(() => null),
}));

vi.mock('@/libs/AIEmployeeOrderLifecycle', () => ({
  addAIEmployeeItemsToExistingOrder: vi.fn(async () => ({ items: [], type: 'unchanged' })),
  buildAIEmployeeAddOnOrderSnapshot: vi.fn(() => null),
  canAIEmployeeAddItemsToExistingOrder: vi.fn(() => false),
  createAIEmployeeCustomerFeedbackEvent: vi.fn(async () => undefined),
  createAIEmployeeDraftOrder: vi.fn(async () => null),
  createAIEmployeeSupportEscalationEvent: vi.fn(async () => undefined),
  getMostRelevantAIEmployeeDeliveryStageOpenOrder: vi.fn(() => null),
  handleAIEmployeeOrderCancellationRequest: vi.fn(async () => ({
    applied: false,
    requested: false,
    requiresStoreReview: false,
  })),
  isAIEmployeeOrderInDeliveryStage: vi.fn(() => false),
  loadAIEmployeeCustomerOrderSnapshot: vi.fn(async () => ({ completed: [], open: [] })),
  loadAIEmployeeOrderLifecycleState: vi.fn(async () => ({
    customerOrders: { completed: [], open: [] },
    openOrder: null,
    supportEscalation: { created: false },
  })),
}));

vi.mock('@/libs/AIEmployeeCart', () => ({
  buildAIEmployeeCartMutationContext: vi.fn(() => ({ cartActive: false, type: 'none' })),
  buildAIEmployeeCartState: vi.fn(() => ({ items: [], status: 'active' })),
  calculateAIEmployeeCartSubtotal: vi.fn(() => '0.00'),
  mergeAIEmployeeCartItems: vi.fn(() => []),
  resolveAIEmployeeCartQuantityChange: vi.fn(() => null),
  toAIEmployeeOrderItem: vi.fn(() => ({ name: 'Item', price: '10.00', productId: 1, quantity: 1 })),
  toMoneyNumberOrZero: vi.fn(() => 0),
}));

vi.mock('@/libs/AIEmployeeCheckout', () => ({
  applyAIEmployeeCartPricing: vi.fn((cart: unknown) => cart),
  constrainAIEmployeeSemanticUnderstandingToStoreMethods: vi.fn(
    (understanding: unknown) => understanding,
  ),
  extractAIEmployeeCustomerDetails: vi.fn(() => ({})),
  getAIEmployeeDeliveryCustomerAddress: vi.fn(() => null),
  getAllowedAIEmployeeDeliveryPreferences: vi.fn(() => []),
  getAllowedAIEmployeePaymentPreferences: vi.fn(() => []),
  getAvailableAIEmployeeServiceChoices: vi.fn(() => ({ delivery: [], payment: [] })),
  getMissingAIEmployeeOrderDetails: vi.fn(() => []),
}));

vi.mock('@/libs/AIEmployeeSemanticAnalysis', () => ({
  analyzeAIEmployeeMessageSemantics: mocks.analyzeAIEmployeeMessageSemantics,
  analyzeAIEmployeeModelReplySystemNeed: vi.fn(async () => null),
}));

vi.mock('@/libs/AIEmployeeSystemEventBridge', () => ({
  buildAIEmployeeSystemEventContext: vi.fn(() => undefined),
}));

vi.mock('@/libs/AIOrchestrationDiagnostics', () => ({
  canAdvanceCustomerNeedBeforeReply: vi.fn(() => false),
  evaluateAIOrchestrationQuality: vi.fn(() => 0.5),
}));

vi.mock('@/libs/AIEmployeeReplyGuardPipeline', () => ({
  guardModelReplyAgainstFalseActions: mocks.guardModelReplyAgainstFalseActions,
  repairGuardedReplyIfPossible: mocks.repairGuardedReplyIfPossible,
}));

vi.mock('@/libs/ConversationEngine', () => ({
  extractConversationRating: mocks.extractConversationRating,
}));

vi.mock('@/libs/PlatformAIClient', () => ({
  generatePlatformAIText: vi.fn(async () => 'Hello! How can I help?'),
}));

vi.mock('@/libs/PlatformAIPolicy', () => ({
  buildPlatformSystemPrompt: vi.fn(() => 'System prompt'),
  PLATFORM_AI_POLICY_VERSION: '2026-05-28.v1',
}));

vi.mock('@/libs/ProductCatalogMetadata', () => ({
  normalizeProductCatalogMetadata: vi.fn((meta: unknown) => ({
    aiVisible: true,
    availability: 'available',
    brand: undefined,
    productType: undefined,
    tags: [],
    unit: undefined,
    ...(meta ?? {}),
  })),
}));

vi.mock('@/libs/SalesConversationIntelligence', () => ({
  analyzeSalesConversation: vi.fn(() => ({
    requestedItems: [],
    signals: [],
    suggestedProducts: [],
    unavailableProduct: null,
  })),
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@/libs/OrderWorkflow', () => ({
  ORDER_STATUS: {
    APPROVED: 'approved',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed',
    OUT_FOR_DELIVERY: 'out_for_delivery',
    PENDING: 'pending',
    PREPARING: 'preparing',
    READY_FOR_PICKUP: 'ready_for_pickup',
  },
}));

vi.mock('@/utils/CustomerChannels', () => ({
  resolveCustomerEntryOperationalContext: vi.fn(() => ({
    deliveryPreference: undefined,
    fulfillmentType: undefined,
  })),
}));

const aiSettings = {
  displayName: 'Maher',
  fallbackLanguage: 'ar',
  handoffRules: {
    complaints: true,
  },
};

const order = {
  customerAddress: null,
  customerPhone: '966500000000',
  deliveryPreference: 'pickup',
  fulfillmentType: 'pickup',
  id: 42,
  items: [],
  paymentPreference: 'cash_on_pickup',
  paymentStatus: 'pending',
  status: 'approved',
  totalPrice: '25.00',
};

describe('AIEmployeeAgent public gates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.assertCanPerformAIAction.mockReset();
    mocks.assertStoreFeatureEnabled.mockReset();
    mocks.assertStoreFeatureEnabled.mockResolvedValue(undefined);
    mocks.limit.mockImplementation(async (n: unknown) => n === 1
      ? [{ metadata: { aiEmployee: { enabled: true } }, storeName: 'Test Store', welcomeMessage: 'Welcome' }]
      : []);
    mocks.normalizeAIEmployeeSettings.mockReturnValue(aiSettings);
    mocks.getPlatformAIProviderConfig.mockResolvedValue({
      apiKey: 'secret',
      enabled: true,
      systemPrompt: 'Be helpful',
    });
    mocks.generateAIEmployeeSystemEventReply.mockResolvedValue('Order update');
    mocks.loadStoreAIContext.mockResolvedValue({
      aiSettings,
      catalog: [],
      deliveryMethods: [],
      knowledgeBase: {},
      paymentMethods: [],
      store: { name: 'Test Store' },
    });
    mocks.analyzeAIEmployeeMessageSemantics.mockResolvedValue({ dialogueState: 'greeting' });
    mocks.extractConversationRating.mockReturnValue(null);
    mocks.getAIEmployeeReplyGuardOrchestrationIssues.mockReturnValue([]);
    mocks.getVisibleAIEmployeeSystemActions.mockReturnValue([]);
    mocks.guardModelReplyAgainstFalseActions.mockResolvedValue({ checks: {}, guarded: false, reply: 'Hello! How can I help?' });
    mocks.orchestrateAIEmployeeDialogueState.mockImplementation(
      (params: { semanticUnderstanding?: { dialogueState?: string } }) => ({
        cart: undefined,
        cartMutation: { cartActive: false, type: 'none' },
        state: params.semanticUnderstanding?.dialogueState ?? 'greeting',
        effectiveRequestedItems: [],
        effectiveSuggestedProducts: [],
      }),
    );
    mocks.repairGuardedReplyIfPossible.mockImplementation(async (_params: unknown, original: unknown) => original);
  });

  it('rejects malformed customer messages before service or database access', async () => {
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    await expect(handleCustomerMessageWithAIEmployee({
      body: '',
      channel: 'whatsapp',
      customer: {
        externalId: 'customer_1',
      },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    })).rejects.toThrow();

    expect(mocks.assertStoreFeatureEnabled).not.toHaveBeenCalled();
    expect(mocks.select).not.toHaveBeenCalled();
  }, 15_000);

  it('stops customer processing when the store AI feature is disabled', async () => {
    const disabledError = new Error('AI disabled');
    mocks.assertStoreFeatureEnabled.mockRejectedValue(disabledError);
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    await expect(handleCustomerMessageWithAIEmployee({
      body: 'سلام',
      channel: 'whatsapp',
      customer: {
        externalId: 'customer_1',
      },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    })).rejects.toBe(disabledError);

    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('audits and rejects a customer reply blocked by store permissions', async () => {
    const permissionError = new Error('Reply permission disabled');
    mocks.assertCanPerformAIAction.mockImplementation(() => {
      throw permissionError;
    });
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    await expect(handleCustomerMessageWithAIEmployee({
      body: 'سلام',
      channel: 'whatsapp',
      customer: {
        externalId: 'customer_1',
      },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    })).rejects.toBe(permissionError);

    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'reply',
      allowed: false,
      organizationId: 'org_1',
      requiredPermission: 'permission:reply',
    }));
  });

  it('does not generate system-event text without an enabled provider key', async () => {
    mocks.getPlatformAIProviderConfig.mockResolvedValue({
      apiKey: '',
      enabled: true,
    });
    const { generateCustomerReplyForSystemEvent } = await import('./AIEmployeeAgent');

    await expect(generateCustomerReplyForSystemEvent({
      eventType: 'order_approved',
      order,
      organizationId: 'org_1',
    })).resolves.toBeUndefined();

    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.generateAIEmployeeSystemEventReply).not.toHaveBeenCalled();
  });

  it('requires reply and review permissions for a review request', async () => {
    mocks.assertCanPerformAIAction.mockImplementation((_settings: unknown, action: string) => {
      if (action === 'capture_review') {
        throw new Error('Review capture disabled');
      }
    });
    const { generateCustomerReplyForSystemEvent } = await import('./AIEmployeeAgent');

    await expect(generateCustomerReplyForSystemEvent({
      eventType: 'review_requested',
      locale: 'ar',
      order,
      organizationId: 'org_1',
    })).resolves.toBeUndefined();

    expect(mocks.assertCanPerformAIAction).toHaveBeenCalledTimes(2);
    expect(mocks.generateAIEmployeeSystemEventReply).not.toHaveBeenCalled();
  });

  it('generates an authorized order event reply with normalized store identity', async () => {
    const { generateCustomerReplyForSystemEvent } = await import('./AIEmployeeAgent');

    await expect(generateCustomerReplyForSystemEvent({
      eventType: 'order_ready_for_pickup',
      locale: 'ar',
      order,
      organizationId: 'org_1',
    })).resolves.toBe('Order update');

    expect(mocks.generateAIEmployeeSystemEventReply).toHaveBeenCalledWith({
      assistantDisplayName: 'Maher',
      config: expect.objectContaining({
        apiKey: 'secret',
        enabled: true,
      }),
      eventType: 'order_ready_for_pickup',
      locale: 'ar',
      order,
      storeName: 'Test Store',
    });
  });

  it('fails closed when the system-event model call throws', async () => {
    mocks.generateAIEmployeeSystemEventReply.mockRejectedValue(new Error('Provider down'));
    const { generateCustomerReplyForSystemEvent } = await import('./AIEmployeeAgent');

    await expect(generateCustomerReplyForSystemEvent({
      eventType: 'order_cancelled',
      order,
      organizationId: 'org_1',
    })).resolves.toBeUndefined();
  });

  it('returns a state-fallback reply for a system semantic action with no meaningful hints', async () => {
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: 'system_action',
      channel: 'web',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
      semanticHints: {},
      suppressCustomerEcho: true,
    });

    expect(result).toMatchObject({
      cartMutation: { type: 'none' },
      conversationId: 0,
      replyToCustomer: expect.any(String),
      reviewCaptured: false,
    });
  });

  it('returns an AI-generated reply for a plain customer greeting message', async () => {
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: 'مرحبا',
      channel: 'web',
      customer: { externalId: 'customer_1', name: 'Ali' },
      externalThreadId: 'thread_1',
      locale: 'ar',
      organizationId: 'org_1',
    });

    expect(result).toMatchObject({
      replyToCustomer: expect.any(String),
      reviewCaptured: false,
    });
    expect(mocks.assertStoreFeatureEnabled).toHaveBeenCalledWith('org_1', 'ai');
  });

  it('returns a state fallback and logs when the guard pipeline throws', async () => {
    mocks.guardModelReplyAgainstFalseActions.mockRejectedValueOnce(new Error('Guard provider timeout'));
    mocks.getVisibleAIEmployeeSystemActions.mockReturnValue(['final_confirmation']);
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: 'yes please send the order',
      channel: 'web',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    });

    expect(result.replyToCustomer.length).toBeGreaterThan(0);
    expect(result.reviewCaptured).toBe(false);
    expect(mocks.insert).toHaveBeenCalled();
  });

  it('calls repairGuardedReplyIfPossible when the guard blocks the model reply', async () => {
    mocks.guardModelReplyAgainstFalseActions.mockResolvedValueOnce({
      checks: {},
      guarded: true,
      reason: 'price_mismatch',
      reply: 'Safe fallback from guard',
    });
    mocks.repairGuardedReplyIfPossible.mockResolvedValueOnce({
      checks: {},
      guarded: false,
      repaired: true,
      reply: 'Repaired safe reply',
    });
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: 'what is the price of item X?',
      channel: 'web',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    });

    expect(mocks.repairGuardedReplyIfPossible).toHaveBeenCalledOnce();
    expect(result.replyToCustomer).toBe('Repaired safe reply');
  });

  it('captures a review and marks reviewCaptured when dialogue is review and rating is extracted', async () => {
    mocks.analyzeAIEmployeeMessageSemantics.mockResolvedValueOnce({ dialogueState: 'review' });
    mocks.extractConversationRating.mockReturnValueOnce({ rating: 5 });
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: '5 stars great service',
      channel: 'whatsapp',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    });

    expect(result.reviewCaptured).toBe(true);
  });

  it('logs an orchestration issue when the guard returns non-empty issue list', async () => {
    mocks.getAIEmployeeReplyGuardOrchestrationIssues.mockReturnValueOnce(['price_mismatch_detected']);
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: 'hello',
      channel: 'web',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    });

    expect(result).toMatchObject({ replyToCustomer: expect.any(String) });
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'ai_orchestration_issue',
    }));
  });

  it('routes complaint dialogue to order_followup intent without creating an order', async () => {
    mocks.analyzeAIEmployeeMessageSemantics.mockResolvedValueOnce({ dialogueState: 'complaint' });
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: 'I have a problem with my order',
      channel: 'web',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    });

    expect(result.intent).toBe('order_followup');
    expect(result.orderId).toBeFalsy();
  });

  it('routes catalog_inquiry dialogue to general_question intent', async () => {
    mocks.analyzeAIEmployeeMessageSemantics.mockResolvedValueOnce({ dialogueState: 'catalog_inquiry' });
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: 'what do you sell?',
      channel: 'web',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    });

    expect(result.intent).toBe('general_question');
    expect(result.orderId).toBeFalsy();
  });

  it('processes a system semantic action that has meaningful hints without falling back', async () => {
    const { hasMeaningfulAIEmployeeSemanticHints } = await import('@/libs/AIEmployeeOrchestration');
    vi.mocked(hasMeaningfulAIEmployeeSemanticHints).mockReturnValueOnce(true);
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: 'system_action',
      channel: 'web',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
      semanticHints: { deliveryPreference: 'pickup' },
      suppressCustomerEcho: true,
    });

    expect(result).toMatchObject({ replyToCustomer: expect.any(String) });
    expect(mocks.analyzeAIEmployeeMessageSemantics).not.toHaveBeenCalled();
  });

  it('routes post_purchase_support dialogue to order_followup intent', async () => {
    mocks.analyzeAIEmployeeMessageSemantics.mockResolvedValueOnce({ dialogueState: 'post_purchase_support' });
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: 'I received a damaged item',
      channel: 'web',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    });

    expect(result.intent).toBe('order_followup');
    expect(result.orderId).toBeFalsy();
  });

  it('routes order_pause dialogue to order_request intent without creating an order', async () => {
    mocks.analyzeAIEmployeeMessageSemantics.mockResolvedValueOnce({ dialogueState: 'order_pause' });
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: 'hold on let me check',
      channel: 'web',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    });

    expect(result.intent).toBe('order_request');
    expect(result.orderId).toBeFalsy();
  });

  it('routes cart_cancellation dialogue to general_question intent without creating an order', async () => {
    mocks.analyzeAIEmployeeMessageSemantics.mockResolvedValueOnce({ dialogueState: 'cart_cancellation' });
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: 'never mind cancel everything',
      channel: 'web',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    });

    expect(result.intent).toBe('general_question');
    expect(result.orderId).toBeFalsy();
  });

  it('routes order_followup dialogue to order_followup intent', async () => {
    mocks.analyzeAIEmployeeMessageSemantics.mockResolvedValueOnce({ dialogueState: 'order_followup' });
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: 'where is my order',
      channel: 'web',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    });

    expect(result.intent).toBe('order_followup');
  });

  it('returns a state-fallback reply and logs an issue when the AI model reply is unavailable', async () => {
    const { generatePlatformAIText } = await import('@/libs/PlatformAIClient');
    vi.mocked(generatePlatformAIText).mockResolvedValueOnce('');
    mocks.getVisibleAIEmployeeSystemActions.mockReturnValue(['final_confirmation']);
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: 'yes confirm order',
      channel: 'web',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    });

    expect(result.replyToCustomer.length).toBeGreaterThan(0);
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'ai_orchestration_issue',
    }));
  });

  it('returns a safe generic fallback when model reply is unavailable and no state fallback is possible', async () => {
    const { generatePlatformAIText } = await import('@/libs/PlatformAIClient');
    vi.mocked(generatePlatformAIText).mockResolvedValueOnce('');
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: 'hello',
      channel: 'web',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    });

    expect(result.replyToCustomer).toBe('لم أتمكن من فهم طلبك. هل يمكنك توضيح ما تريده؟');
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'ai_orchestration_issue',
    }));
  });

  it('audits and rejects when review capture permission is blocked by store settings', async () => {
    mocks.analyzeAIEmployeeMessageSemantics.mockResolvedValueOnce({ dialogueState: 'review' });
    mocks.extractConversationRating.mockReturnValueOnce({ rating: 5 });
    mocks.assertCanPerformAIAction.mockImplementation((_settings: unknown, action: string) => {
      if (action === 'capture_review') {
        throw new Error('Review capture blocked');
      }
    });
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    await expect(handleCustomerMessageWithAIEmployee({
      body: '5 stars great service',
      channel: 'web',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    })).rejects.toThrow('Review capture blocked');

    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'capture_review',
      allowed: false,
      organizationId: 'org_1',
    }));
  });

  it('captures WhatsApp feedback note and logs when complaint arrives on whatsapp channel', async () => {
    mocks.analyzeAIEmployeeMessageSemantics.mockResolvedValueOnce({ dialogueState: 'complaint' });
    const { createAIEmployeeCustomerFeedbackEvent } = await import('@/libs/AIEmployeeOrderLifecycle');
    vi.mocked(createAIEmployeeCustomerFeedbackEvent).mockResolvedValueOnce({
      created: true,
      orderId: 77,
    } as never);
    const { handleCustomerMessageWithAIEmployee } = await import('./AIEmployeeAgent');

    const result = await handleCustomerMessageWithAIEmployee({
      body: 'I received the wrong items',
      channel: 'whatsapp',
      customer: { externalId: 'customer_1' },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
    });

    expect(result.replyToCustomer.length).toBeGreaterThan(0);
    expect(vi.mocked(createAIEmployeeCustomerFeedbackEvent)).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: 'org_1',
        sourceChannel: 'whatsapp',
      }),
    );
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'capture_complaint',
      allowed: true,
    }));
  });

  it('returns undefined for a system event when the AI reply permission is blocked', async () => {
    mocks.assertCanPerformAIAction.mockImplementation(() => {
      throw new Error('AI reply disabled');
    });
    const { generateCustomerReplyForSystemEvent } = await import('./AIEmployeeAgent');

    await expect(generateCustomerReplyForSystemEvent({
      eventType: 'order_approved',
      order,
      organizationId: 'org_1',
    })).resolves.toBeUndefined();

    expect(mocks.assertCanPerformAIAction).toHaveBeenCalledTimes(1);
    expect(mocks.generateAIEmployeeSystemEventReply).not.toHaveBeenCalled();
  });
});
