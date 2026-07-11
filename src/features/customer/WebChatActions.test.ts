import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockDbInsert,
  mockInsertOnConflictDoUpdate,
  mockInsertValues,
  mockDbSelect,
  mockSelectRows,
  mockSelectWhereConditions,
} = vi.hoisted(() => {
  const selectRows: unknown[][] = [];
  const selectWhereConditions: unknown[] = [];
  const makeSelectChain = () => {
    const chain = {
      from: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      limit: vi.fn(async () => selectRows.shift() ?? []),
      orderBy: vi.fn(() => chain),
      where: vi.fn((condition: unknown) => {
        selectWhereConditions.push(condition);
        return chain;
      }),
    };

    return chain;
  };
  const insertOnConflictDoUpdate = vi.fn(async () => undefined);
  const insertValues = vi.fn(() => ({
    onConflictDoUpdate: insertOnConflictDoUpdate,
  }));

  return {
    mockDbInsert: vi.fn(() => ({ values: insertValues })),
    mockInsertOnConflictDoUpdate: insertOnConflictDoUpdate,
    mockInsertValues: insertValues,
    mockDbSelect: vi.fn(() => makeSelectChain()),
    mockSelectRows: selectRows,
    mockSelectWhereConditions: selectWhereConditions,
  };
});

vi.mock('next/headers', () => ({
  headers: vi.fn(async () => new Headers()),
}));

vi.mock('@/features/ai/AIEmployeeAgent', () => ({
  handleCustomerMessageWithAIEmployee: vi.fn(),
}));

vi.mock('@/libs/DB', () => ({
  db: {
    insert: mockDbInsert,
    select: mockDbSelect,
  },
}));

vi.mock('@/libs/StoreServiceControls', () => ({
  assertStoreFeatureEnabled: vi.fn(),
  StoreFeatureDisabledError: class StoreFeatureDisabledError extends Error {
    feature = 'webOrders';
  },
  StoreSubscriptionInactiveError: class StoreSubscriptionInactiveError extends Error {
    reason = 'subscription_inactive';
    subscriptionStatus = 'expired';
  },
}));

vi.mock('@/libs/SubscriptionEntitlements', () => ({
  isSubscriptionLimitError: vi.fn(() => false),
}));

vi.mock('@/libs/AIActionPermissions', () => ({
  AIEmployeePermissionError: class AIEmployeePermissionError extends Error {
    actionType = 'reply';
    requiredPermission = 'reply';
  },
}));

vi.mock('@/libs/PublicEndpointRateLimit', () => ({
  checkPublicMessageRateLimit: vi.fn(),
  checkPublicReadRateLimit: vi.fn(),
  PublicEndpointRateLimitError: class PublicEndpointRateLimitError extends Error {
    limit = 0;
    retryAfterSeconds = 0;
    windowMs = 0;
  },
}));

vi.mock('@/models/Schema', () => ({
  conversationMessagesTable: {
    body: 'messageBody',
    conversationId: 'messageConversationId',
    createdAt: 'messageCreatedAt',
    direction: 'messageDirection',
    id: 'messageId',
    metadata: 'messageMetadata',
    organizationId: 'messageOrganizationId',
    senderType: 'messageSenderType',
  },
  conversationsTable: {},
  customerReviewsTable: {},
  customersTable: {
    externalId: 'customerExternalId',
    id: 'customerId',
    organizationId: 'customerOrganizationId',
    sourceChannel: 'customerSourceChannel',
  },
  deliveryMethodsTable: {
    id: 'deliveryMethodId',
    isActive: 'deliveryMethodIsActive',
    organizationId: 'deliveryMethodOrganizationId',
    type: 'deliveryMethodType',
  },
  orderEventsTable: {},
  ordersTable: {
    customerPhone: 'orderCustomerPhone',
    id: 'orderId',
    organizationId: 'orderOrganizationId',
    source: 'orderSource',
    status: 'orderStatus',
  },
  phoneVerificationsTable: {
    expiresAt: 'phoneVerificationExpiresAt',
    id: 'phoneVerificationId',
    organizationId: 'phoneVerificationOrganizationId',
    phone: 'phoneVerificationPhone',
    sessionId: 'phoneVerificationSessionId',
    status: 'phoneVerificationStatus',
    verifiedAt: 'phoneVerificationVerifiedAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions, type: 'and' })),
  desc: vi.fn(),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, type: 'eq', value })),
  inArray: vi.fn((field: unknown, values: unknown[]) => ({
    field,
    type: 'inArray',
    values,
  })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    query: strings.join('?'),
    type: 'sql',
    values,
  }),
}));

describe('WebChatActions', () => {
  const conditionContains = (
    condition: unknown,
    field: unknown,
    value: unknown,
  ): boolean => {
    if (!condition || typeof condition !== 'object') {
      return false;
    }

    const entry = condition as {
      conditions?: unknown[];
      field?: unknown;
      value?: unknown;
    };

    return (
      entry.field === field
      && entry.value === value
    ) || Boolean(entry.conditions?.some(item => conditionContains(item, field, value)));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectRows.length = 0;
    mockSelectWhereConditions.length = 0;
  });

  it('requires customerExternalId before returning chat messages', async () => {
    const { getWebChatMessages } = await import('./WebChatActions');

    await expect(getWebChatMessages({
      externalThreadId: 'thread_1',
      locale: 'ar',
      organizationId: 'org_1',
      source: 'web_chat',
    } as never)).rejects.toThrow();
  }, 10000);

  it('reports SMS OTP as disabled (migrated to WhatsApp verification)', async () => {
    const { requestPhoneOtp, verifyPhoneOtp } = await import('./WebChatActions');

    expect(await requestPhoneOtp({
      organizationId: 'org_1',
      phone: '+966500000000',
      sessionId: 'session_1234567890',
    })).toEqual({ error: 'not_configured', ok: false });

    expect(await verifyPhoneOtp({
      code: '123456',
      organizationId: 'org_1',
      phone: '+966500000000',
      sessionId: 'session_1234567890',
    })).toEqual({ error: 'not_configured', ok: false });

    expect(mockInsertOnConflictDoUpdate).not.toHaveBeenCalled();
  });

  it('passes canonical system choices to the AI employee agent', async () => {
    const { handleCustomerMessageWithAIEmployee } = await import('@/features/ai/AIEmployeeAgent');
    vi.mocked(handleCustomerMessageWithAIEmployee).mockResolvedValue({
      conversationId: 1,
      intent: 'order_request',
      missingDetails: [],
      orderId: null,
      replyToCustomer: 'ok',
      reviewCaptured: false,
      suggestedProducts: [],
      unavailableProduct: null,
    } as never);
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled).mockResolvedValue(undefined);
    const { sendWebChatMessage } = await import('./WebChatActions');

    await sendWebChatMessage({
      body: 'system button choice',
      customer: {
        externalId: 'customer_1',
      },
      externalThreadId: 'thread_1',
      locale: 'ar',
      organizationId: 'org_1',
      semanticHints: {
        customerCancelledOrder: false,
        customerConfirmedOrder: true,
        deliveryPreference: 'pickup',
        fulfillmentType: 'dine_in',
        paymentPreference: 'card_on_pickup',
        replaceExistingQuantity: true,
        requestedQuantity: 3,
        removeCartItemProductId: 654,
        selectedProductId: 321,
        tableNumber: 'A12',
      },
      source: 'web_chat',
      suppressCustomerEcho: true,
    });

    expect(handleCustomerMessageWithAIEmployee).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'ar',
        semanticHints: {
          customerCancelledOrder: false,
          customerConfirmedOrder: true,
          deliveryPreference: 'pickup',
          fulfillmentType: 'dine_in',
          paymentPreference: 'card_on_pickup',
          replaceExistingQuantity: true,
          requestedQuantity: 3,
          removeCartItemProductId: 654,
          selectedProductId: 321,
          tableNumber: 'A12',
        },
        suppressCustomerEcho: true,
      }),
    );
  });

  it('rejects table web chat messages before AI processing when table number is missing', async () => {
    const { handleCustomerMessageWithAIEmployee } = await import('@/features/ai/AIEmployeeAgent');
    const { checkPublicMessageRateLimit } = await import('@/libs/PublicEndpointRateLimit');
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    const { sendWebChatMessage } = await import('./WebChatActions');

    const response = await sendWebChatMessage({
      body: 'ابي مضغوط',
      customer: {
        externalId: 'customer_1',
      },
      externalThreadId: 'thread_1',
      locale: 'ar',
      organizationId: 'org_1',
      semanticHints: {
        deliveryPreference: 'pickup',
        fulfillmentType: 'dine_in',
      },
      source: 'web_chat_table',
    });

    expect(response).toEqual({
      error: 'table_number_required',
      ok: false,
    });
    expect(handleCustomerMessageWithAIEmployee).not.toHaveBeenCalled();
    expect(checkPublicMessageRateLimit).not.toHaveBeenCalled();
    expect(assertStoreFeatureEnabled).not.toHaveBeenCalled();
  });

  it('rejects table web chat messages when dine-in table service is disabled', async () => {
    const { handleCustomerMessageWithAIEmployee } = await import('@/features/ai/AIEmployeeAgent');
    const { checkPublicMessageRateLimit } = await import('@/libs/PublicEndpointRateLimit');
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled).mockResolvedValue(undefined);
    const { sendWebChatMessage } = await import('./WebChatActions');

    const response = await sendWebChatMessage({
      body: 'ابي مضغوط',
      customer: {
        externalId: 'customer_1',
      },
      externalThreadId: 'thread_1',
      locale: 'ar',
      organizationId: 'org_1',
      semanticHints: {
        deliveryPreference: 'pickup',
        fulfillmentType: 'dine_in',
        tableNumber: '2',
      },
      source: 'web_chat_table',
    });

    expect(response).toEqual({
      error: 'table_service_disabled',
      ok: false,
    });
    expect(checkPublicMessageRateLimit).toHaveBeenCalled();
    expect(assertStoreFeatureEnabled).toHaveBeenCalledWith('org_1', 'webOrders');
    expect(assertStoreFeatureEnabled).toHaveBeenCalledWith('org_1', 'ai');
    expect(handleCustomerMessageWithAIEmployee).not.toHaveBeenCalled();
    expect(mockSelectWhereConditions.some(condition => conditionContains(
      condition,
      'deliveryMethodType',
      'dine_in',
    ))).toBe(true);
  });

  it('does not expose internal orchestration traces to the public chat response', async () => {
    const { handleCustomerMessageWithAIEmployee } = await import('@/features/ai/AIEmployeeAgent');
    vi.mocked(handleCustomerMessageWithAIEmployee).mockResolvedValue({
      aiOrchestration: {
        executionResult: {},
        modelIntent: {},
        protocolVersion: 'test',
        systemDecision: {},
        systemDecisionReasons: ['cart_active', 'visible_action_final_confirmation'],
      },
      conversationId: 1,
      intent: 'order_request',
      missingDetails: [],
      orderId: null,
      replyToCustomer: 'ok',
      reviewCaptured: false,
      suggestedProducts: [],
      unavailableProduct: null,
    } as never);
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled).mockResolvedValue(undefined);
    const { sendWebChatMessage } = await import('./WebChatActions');

    const response = await sendWebChatMessage({
      body: 'hello',
      customer: {
        externalId: 'customer_1',
      },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
      source: 'web_chat',
    });

    expect(response.ok).toBe(true);
    expect(response.data).not.toHaveProperty('aiOrchestration');
  });

  it('keeps trusted webhook chat ingress off the shared public IP rate-limit bucket', async () => {
    const { handleCustomerMessageWithAIEmployee } = await import('@/features/ai/AIEmployeeAgent');
    vi.mocked(handleCustomerMessageWithAIEmployee).mockResolvedValue({
      aiOrchestration: {
        executionResult: {},
        issues: [],
        modelIntent: {},
        protocolVersion: 'test',
        quality: {
          level: 'excellent',
          penalties: [],
          score: 100,
        },
        systemDecision: {},
        systemDecisionReasons: [],
      },
      conversationId: 1,
      intent: 'order_request',
      missingDetails: [],
      orderId: null,
      replyToCustomer: 'ok',
      reviewCaptured: false,
      suggestedProducts: [],
      unavailableProduct: null,
    } as never);
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled).mockResolvedValue(undefined);
    const { checkPublicMessageRateLimit } = await import('@/libs/PublicEndpointRateLimit');
    const { sendTrustedWebhookChatMessage } = await import('./WebChatActions');

    const response = await sendTrustedWebhookChatMessage({
      body: 'سلام',
      customer: {
        externalId: '966549764152',
      },
      externalThreadId: 'whatsapp:phone_1:966549764152',
      organizationId: 'org_1',
      source: 'whatsapp',
    });

    expect(response.ok).toBe(true);
    expect(response.data).toHaveProperty('aiOrchestration');
    expect(checkPublicMessageRateLimit).toHaveBeenCalledWith(expect.objectContaining({
      channel: 'whatsapp',
      customerExternalId: '966549764152',
      externalThreadId: 'whatsapp:phone_1:966549764152',
      ipAddress: null,
      organizationId: 'org_1',
    }));
  });

  it('stops chat when the store subscription is inactive', async () => {
    const { handleCustomerMessageWithAIEmployee } = await import('@/features/ai/AIEmployeeAgent');
    const {
      assertStoreFeatureEnabled,
      StoreSubscriptionInactiveError,
    } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled).mockRejectedValueOnce(
      new StoreSubscriptionInactiveError('subscription_inactive'),
    );
    const { sendWebChatMessage } = await import('./WebChatActions');

    const response = await sendWebChatMessage({
      body: 'hello',
      customer: {
        externalId: 'customer_1',
      },
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
      source: 'web_chat',
    });

    expect(response).toMatchObject({
      error: 'store_subscription_inactive',
      ok: false,
      reason: 'subscription_inactive',
      subscriptionStatus: 'expired',
    });
    expect(handleCustomerMessageWithAIEmployee).not.toHaveBeenCalled();
  });

  it('stops loading chat messages when the AI feature is disabled', async () => {
    const {
      assertStoreFeatureEnabled,
      StoreFeatureDisabledError,
    } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new StoreFeatureDisabledError('ai'));
    const { getWebChatMessages } = await import('./WebChatActions');

    await expect(getWebChatMessages({
      customerExternalId: 'customer_1',
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
      source: 'web_chat',
    })).rejects.toBeInstanceOf(StoreFeatureDisabledError);

    expect(assertStoreFeatureEnabled).toHaveBeenNthCalledWith(1, 'org_1', 'webOrders');
    expect(assertStoreFeatureEnabled).toHaveBeenNthCalledWith(2, 'org_1', 'ai');
  });

  it('does not return messages when the thread belongs to another customer identity', async () => {
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled).mockResolvedValue(undefined);
    mockSelectRows.push(
      [{ customerId: 10, id: 20 }],
      [],
    );
    const { getWebChatMessages } = await import('./WebChatActions');

    const response = await getWebChatMessages({
      customerExternalId: 'customer_b',
      externalThreadId: 'thread_1',
      organizationId: 'org_1',
      source: 'web_chat',
    });

    expect(response).toEqual({
      data: [],
      ok: true,
    });
    expect(mockDbSelect).toHaveBeenCalledTimes(2);
  });

  it('does not expose a public server action that can delete store chat records', async () => {
    const actions = await import('./WebChatActions');

    expect(actions).not.toHaveProperty('deleteWebChatConversation');
  });

  it('does not attach feedback when the conversation identity does not match', async () => {
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled).mockResolvedValue(undefined);
    mockSelectRows.push([]);
    const { submitWebOrderFeedback } = await import('./WebChatActions');

    const response = await submitWebOrderFeedback({
      customerExternalId: 'customer_b',
      externalThreadId: 'thread_1',
      message: 'food was cold',
      organizationId: 'org_1',
      source: 'web_chat',
    });

    expect(response).toEqual({
      error: 'conversation_not_found',
      ok: false,
    });
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('rejects a star rating until the linked order is completed', async () => {
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled).mockResolvedValue(undefined);
    mockSelectRows.push(
      [{ customerId: 10, id: 20, metadata: { orderId: 30 } }],
      [{ id: 30, status: 'preparing' }],
    );
    const { submitWebOrderFeedback } = await import('./WebChatActions');

    const response = await submitWebOrderFeedback({
      customerExternalId: 'customer_1',
      externalThreadId: 'thread_1',
      message: '',
      organizationId: 'org_1',
      rating: 5,
      source: 'web_chat',
    });

    expect(response).toEqual({
      error: 'order_not_completed',
      ok: false,
    });
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('updates the existing review for a completed customer order', async () => {
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled).mockResolvedValue(undefined);
    mockSelectRows.push(
      [{ customerId: 10, id: 20, metadata: { orderId: 30 } }],
      [{ id: 30, status: 'completed' }],
    );
    const { submitWebOrderFeedback } = await import('./WebChatActions');

    const response = await submitWebOrderFeedback({
      customerExternalId: 'customer_1',
      externalThreadId: 'thread_1',
      message: 'Excellent',
      organizationId: 'org_1',
      rating: 5,
      source: 'web_chat',
    });

    expect(response).toMatchObject({
      ok: true,
      orderId: 30,
      reviewCaptured: true,
    });
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 10,
      orderId: 30,
      organizationId: 'org_1',
      rating: 5,
    }));
    expect(mockInsertOnConflictDoUpdate).toHaveBeenCalledTimes(1);
  });

  it('stores web order text feedback as a complaint event, not a review', async () => {
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled).mockResolvedValue(undefined);
    mockSelectRows.push(
      [{ customerId: 10, id: 20, metadata: { orderId: 30 } }],
      [{ id: 30, status: 'completed' }],
    );
    const { submitWebOrderFeedback } = await import('./WebChatActions');

    const response = await submitWebOrderFeedback({
      customerExternalId: 'customer_1',
      externalThreadId: 'thread_1',
      message: 'The order was late',
      organizationId: 'org_1',
      source: 'web_chat',
    });

    expect(response).toEqual({
      ok: true,
      orderId: 30,
      reviewCaptured: false,
    });
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      actorType: 'customer',
      eventType: 'customer_complaint',
      metadata: expect.objectContaining({
        conversationId: 20,
        customerMessage: 'The order was late',
        source: 'web_order_feedback_panel',
      }),
      orderId: 30,
      organizationId: 'org_1',
    }));
    expect(mockInsertOnConflictDoUpdate).not.toHaveBeenCalled();
  });

  it('submits a tracked order rating after phone verification', async () => {
    const { inArray } = await import('drizzle-orm');
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled).mockResolvedValue(undefined);
    mockSelectRows.push(
      [{
        customerPhone: '966549764152',
        id: 162,
        source: 'whatsapp',
        status: 'completed',
      }],
      [{ id: 10 }],
    );
    const { submitTrackedOrderFeedback } = await import('./WebChatActions');

    const response = await submitTrackedOrderFeedback({
      message: 'ممتاز',
      orderId: 162,
      organizationId: 'org_1',
      phone: '0549764152',
      rating: 5,
    });

    expect(response).toMatchObject({
      ok: true,
      orderId: 162,
      reviewCaptured: true,
    });
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 10,
      orderId: 162,
      organizationId: 'org_1',
      rating: 5,
      sourceChannel: 'whatsapp',
    }));
    expect(mockInsertOnConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(inArray).toHaveBeenCalledWith(
      'customerExternalId',
      expect.arrayContaining(['0549764152', '966549764152']),
    );
  });

  it('rejects a different tracked-order phone that only shares seven trailing digits', async () => {
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled).mockResolvedValue(undefined);
    mockSelectRows.push(
      [{
        customerPhone: '0501234567',
        id: 162,
        source: 'whatsapp',
        status: 'completed',
      }],
    );
    const { submitTrackedOrderFeedback } = await import('./WebChatActions');

    const response = await submitTrackedOrderFeedback({
      message: 'This must not attach to the order',
      orderId: 162,
      organizationId: 'org_1',
      phone: '0591234567',
      rating: 5,
    });

    expect(response).toEqual({
      error: 'order_not_found',
      ok: false,
    });
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('scopes tracked-order feedback reads to the requested organization and order', async () => {
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled).mockResolvedValue(undefined);
    mockSelectRows.push([]);
    const { submitTrackedOrderFeedback } = await import('./WebChatActions');

    const response = await submitTrackedOrderFeedback({
      message: 'Scoped feedback',
      orderId: 162,
      organizationId: 'org_store_a',
      phone: '0549764152',
    });

    expect(response).toEqual({
      error: 'order_not_found',
      ok: false,
    });
    expect(mockSelectWhereConditions).toHaveLength(1);
    expect(conditionContains(
      mockSelectWhereConditions[0],
      'orderOrganizationId',
      'org_store_a',
    )).toBe(true);
    expect(conditionContains(
      mockSelectWhereConditions[0],
      'orderId',
      162,
    )).toBe(true);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('stores tracked order text feedback as a complaint event after phone verification', async () => {
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled).mockResolvedValue(undefined);
    mockSelectRows.push(
      [{
        customerPhone: '966549764152',
        id: 162,
        source: 'whatsapp',
        status: 'completed',
      }],
      [{ id: 10 }],
    );
    const { submitTrackedOrderFeedback } = await import('./WebChatActions');

    const response = await submitTrackedOrderFeedback({
      message: 'The food was cold',
      orderId: 162,
      organizationId: 'org_1',
      phone: '0549764152',
    });

    expect(response).toEqual({
      ok: true,
      orderId: 162,
      reviewCaptured: false,
    });
    expect(mockInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      actorType: 'customer',
      eventType: 'customer_complaint',
      metadata: expect.objectContaining({
        customerMessage: 'The food was cold',
        source: 'order_tracking_feedback_panel',
      }),
      orderId: 162,
      organizationId: 'org_1',
    }));
    expect(mockInsertOnConflictDoUpdate).not.toHaveBeenCalled();
  });

  it('rejects tracked order star ratings until the order is completed', async () => {
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    vi.mocked(assertStoreFeatureEnabled).mockResolvedValue(undefined);
    mockSelectRows.push(
      [{
        customerPhone: '966549764152',
        id: 162,
        source: 'whatsapp',
        status: 'preparing',
      }],
      [{ id: 10 }],
    );
    const { submitTrackedOrderFeedback } = await import('./WebChatActions');

    const response = await submitTrackedOrderFeedback({
      message: '',
      orderId: 162,
      organizationId: 'org_1',
      phone: '0549764152',
      rating: 5,
    });

    expect(response).toEqual({
      error: 'order_not_completed',
      ok: false,
    });
  });
});
