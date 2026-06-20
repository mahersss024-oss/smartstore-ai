import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.fn();
const mockRevalidatePath = vi.fn();
const mockGenerateCustomerReplyForSystemEvent = vi.fn();
const mockAssertCanTransitionOrderStatus = vi.fn();
const mockSendWhatsAppConversationTextMessage = vi.fn();
const mockDbSelectLimit = vi.fn();
const mockDbSelectWhere = vi.fn(() => ({ limit: mockDbSelectLimit }));
const mockDbSelectFrom = vi.fn(() => ({ where: mockDbSelectWhere }));
const mockDbSelect = vi.fn(() => ({ from: mockDbSelectFrom }));
const mockDbDeleteWhere = vi.fn();
const mockDbDelete = vi.fn(() => ({ where: mockDbDeleteWhere }));
const mockTxDeleteWhere = vi.fn();
const mockTxDelete = vi.fn(() => ({ where: mockTxDeleteWhere }));
const mockTxInsertReturning = vi.fn(async () => [{ id: 456 }]);
const mockTxInsertOnConflictDoUpdate = vi.fn(() => ({
  returning: mockTxInsertReturning,
}));
const mockTxUpdateReturning = vi.fn(async () => [{ id: 123 }]);
const mockTxUpdateWhere = vi.fn(() => ({ returning: mockTxUpdateReturning }));
const mockTxUpdateSet = vi.fn(() => ({ where: mockTxUpdateWhere }));
const mockTxUpdate = vi.fn(() => ({ set: mockTxUpdateSet }));
const mockTxSelectLimit = vi.fn(async (): Promise<Array<{ id: number }>> => []);
const mockTxSelectWhere = vi.fn(() => ({ limit: mockTxSelectLimit }));
const mockTxSelectFrom = vi.fn(() => ({ where: mockTxSelectWhere }));
const mockTxSelect = vi.fn(() => ({ from: mockTxSelectFrom }));
const mockTxInsertValues = vi.fn(() => ({
  onConflictDoUpdate: mockTxInsertOnConflictDoUpdate,
  returning: mockTxInsertReturning,
}));
const mockTxInsert = vi.fn(() => ({ values: mockTxInsertValues }));
const mockDbTransaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
  return callback({
    delete: mockTxDelete,
    insert: mockTxInsert,
    select: mockTxSelect,
    update: mockTxUpdate,
  });
});

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('drizzle-orm', () => ({
  and: (...conditions: unknown[]) => ({ conditions, operator: 'and' }),
  eq: (left: unknown, right: unknown) => ({ left, operator: 'eq', right }),
  isNotNull: (value: unknown) => ({ operator: 'isNotNull', value }),
  isNull: (value: unknown) => ({ operator: 'isNull', value }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    query: strings.join('?'),
    type: 'sql',
    values,
  }),
}));

vi.mock('@/features/ai/AIEmployeeAgent', () => ({
  generateCustomerReplyForSystemEvent: mockGenerateCustomerReplyForSystemEvent,
}));

vi.mock('@/libs/DB', () => ({
  db: {
    delete: mockDbDelete,
    select: mockDbSelect,
    transaction: mockDbTransaction,
  },
}));

vi.mock('@/libs/OrderWorkflow', () => ({
  assertCanTransitionOrderStatus: mockAssertCanTransitionOrderStatus,
  DELIVERY_STATUS: {
    COMPLETED: 'completed',
    OUT_FOR_DELIVERY: 'out_for_delivery',
    PREPARING: 'preparing',
    READY_FOR_PICKUP: 'ready_for_pickup',
  },
  ORDER_EVENT_TYPE: {
    ORDER_APPROVED: 'order_approved',
    ORDER_COMPLETED: 'order_completed',
    REVIEW_REQUESTED: 'review_requested',
    STATUS_CHANGED: 'status_changed',
  },
  ORDER_STATUS: {
    APPROVED_BY_STORE: 'approved_by_store',
    CANCELLED: 'cancelled',
    COMPLETED: 'completed',
    OUT_FOR_DELIVERY: 'out_for_delivery',
    PREPARING: 'preparing',
    READY_FOR_PICKUP: 'ready_for_pickup',
  },
}));

vi.mock('@/libs/TwilioWhatsApp', () => ({
  sendTwilioConversationTextMessage: mockSendWhatsAppConversationTextMessage,
}));

vi.mock('@/models/Schema', () => ({
  aiActionLogsTable: {
    orderId: 'orderId',
    organizationId: 'organizationId',
  },
  conversationMessagesTable: {
    conversationId: 'conversationId',
    id: 'messageId',
    metadata: 'metadata',
    organizationId: 'organizationId',
  },
  conversationsTable: {
    channel: 'channel',
    externalThreadId: 'externalThreadId',
    id: 'conversationId',
    organizationId: 'organizationId',
  },
  orderEventsTable: {
    organizationId: 'organizationId',
    orderId: 'orderId',
  },
  customerReviewsTable: {
    organizationId: 'organizationId',
    orderId: 'orderId',
  },
  invoicesTable: {
    organizationId: 'organizationId',
    orderId: 'orderId',
  },
  ordersTable: {
    archivedAt: 'archivedAt',
    id: 'id',
    organizationId: 'organizationId',
    status: 'status',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions, type: 'and' })),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, type: 'eq', value })),
  isNull: vi.fn((field: unknown) => ({ field, type: 'isNull' })),
  isNotNull: vi.fn((field: unknown) => ({ field, type: 'isNotNull' })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
    query: strings.join('?'),
    type: 'sql',
    values,
  }),
}));

vi.mock('@/utils/Helpers', () => ({
  getBaseUrl: vi.fn(() => 'https://www.smartstore-ai.com'),
  getI18nPath: vi.fn((path: string) => path),
}));

describe('OrderActions', () => {
  const getLastMockArgument = (calls: unknown[][]) => {
    return calls.at(-1)?.[0];
  };

  const conditionHasOrganizationScope = (condition: unknown) => {
    const conditions = (condition as { conditions?: unknown[] }).conditions ?? [];

    return conditions.some((entry) => {
      const scopedCondition = entry as {
        field?: unknown;
        left?: unknown;
        operator?: unknown;
        right?: unknown;
        type?: unknown;
        value?: unknown;
      };

      return (
        (
          scopedCondition.field === 'organizationId'
          && scopedCondition.type === 'eq'
          && scopedCondition.value === 'org_1'
        )
        || (
          scopedCondition.left === 'organizationId'
          && scopedCondition.operator === 'eq'
          && scopedCondition.right === 'org_1'
        )
      );
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSendWhatsAppConversationTextMessage.mockResolvedValue({ status: 'sent' });
    mockAssertCanTransitionOrderStatus.mockImplementation((from: string, to: string) => {
      if (from === to) {
        throw new Error(`Invalid order status transition from ${from} to ${to}`);
      }
    });
    mockAuth.mockResolvedValue({ orgId: 'org_1', userId: 'user_1' });
    mockDbSelectLimit.mockResolvedValue([{ id: 123 }]);
    mockTxSelectLimit.mockResolvedValue([]);
    mockTxUpdateReturning.mockResolvedValue([{ id: 123 }]);
  });

  it('archives dashboard orders instead of deleting order records', async () => {
    const { deleteOrderFromDashboard } = await import('./OrderActions');

    await deleteOrderFromDashboard('ar', 123);

    expect(mockTxUpdate).toHaveBeenCalled();
    expect(mockTxUpdateSet).toHaveBeenCalledWith({
      archivedAt: expect.objectContaining({
        query: 'localtimestamp',
        type: 'sql',
      }),
    });
    expect(mockTxInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'user_1',
      actorType: 'store_user',
      orderId: 123,
      organizationId: 'org_1',
      summary: 'Order archived from dashboard.',
    }));
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/orders');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/revenue');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/customers');
  });

  it('restores archived dashboard orders', async () => {
    const archivedAt = new Date('2026-05-31T00:00:00.000Z');
    const { restoreArchivedOrderFromDashboard } = await import('./OrderActions');

    mockDbSelectLimit.mockResolvedValueOnce([{ archivedAt, id: 123 }]);

    await restoreArchivedOrderFromDashboard('ar', 123);

    expect(mockTxUpdateSet).toHaveBeenCalledWith({
      archivedAt: null,
    });
    expect(mockTxInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'user_1',
      actorType: 'store_user',
      orderId: 123,
      organizationId: 'org_1',
      summary: 'Order restored from archive.',
    }));
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/orders/archive');
  });

  it('permanently deletes archived dashboard orders only from archive', async () => {
    const { permanentlyDeleteArchivedOrderFromDashboard } = await import('./OrderActions');

    mockDbSelectLimit.mockResolvedValueOnce([{ id: 123 }]);

    await permanentlyDeleteArchivedOrderFromDashboard('ar', 123);

    expect(mockTxDelete).toHaveBeenCalledTimes(5);
    expect(mockTxDeleteWhere).toHaveBeenCalledTimes(5);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/orders');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/orders/archive');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/revenue');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/customers');
  });

  it('scopes archived order permanent deletion to the active organization', async () => {
    const { permanentlyDeleteArchivedOrderFromDashboard } = await import('./OrderActions');

    mockDbSelectLimit.mockResolvedValueOnce([{ id: 123 }]);

    await permanentlyDeleteArchivedOrderFromDashboard('ar', 123);

    const whereCalls = [
      ...mockDbSelectWhere.mock.calls,
      ...mockTxDeleteWhere.mock.calls,
    ];

    expect(whereCalls.length).toBeGreaterThan(0);

    for (const [condition] of whereCalls) {
      expect(conditionHasOrganizationScope(condition)).toBe(true);
    }
  });

  it('marks pickup orders as ready without using delivery status', async () => {
    const { updateOrderStatusFromDashboard } = await import('./OrderActions');

    mockDbSelectLimit.mockResolvedValueOnce([{
      deliveryStatus: 'preparing',
      id: 123,
      status: 'preparing',
    }]);

    await updateOrderStatusFromDashboard('ar', 123, 'ready_for_pickup');

    expect(mockTxUpdateSet).toHaveBeenCalledWith({
      deliveryStatus: 'ready_for_pickup',
      status: 'ready_for_pickup',
    });
  });

  it('scopes dashboard order status transitions to the active organization', async () => {
    const { updateOrderStatusFromDashboard } = await import('./OrderActions');

    mockDbSelectLimit.mockResolvedValueOnce([{
      deliveryStatus: 'not_started',
      id: 123,
      status: 'approved_by_store',
    }]);

    await updateOrderStatusFromDashboard('en', 123, 'preparing');

    expect(mockDbSelectWhere).toHaveBeenCalled();
    expect(mockTxUpdateWhere).toHaveBeenCalled();
    expect(conditionHasOrganizationScope(getLastMockArgument(
      mockDbSelectWhere.mock.calls as unknown[][],
    ))).toBe(true);
    expect(conditionHasOrganizationScope(getLastMockArgument(
      mockTxUpdateWhere.mock.calls as unknown[][],
    ))).toBe(true);
  });

  it('rejects a stale status transition when another worker changed the order first', async () => {
    const { updateOrderStatusFromDashboard } = await import('./OrderActions');
    const { OrderConcurrencyError } = await import('./OrderErrors');

    mockDbSelectLimit.mockResolvedValueOnce([{
      deliveryStatus: 'not_started',
      id: 123,
      status: 'approved_by_store',
    }]);
    mockTxUpdateReturning.mockResolvedValueOnce([]);

    await expect(
      updateOrderStatusFromDashboard('en', 123, 'preparing'),
    ).rejects.toBeInstanceOf(OrderConcurrencyError);

    expect(mockSendWhatsAppConversationTextMessage).not.toHaveBeenCalled();
  });

  it('does not send a WhatsApp approval notification when the approval update loses a race', async () => {
    const { approveOrderForCustomer } = await import('./OrderActions');
    const { OrderConcurrencyError } = await import('./OrderErrors');

    mockGenerateCustomerReplyForSystemEvent.mockResolvedValueOnce('تمت الموافقة على طلبك.');
    mockDbSelectLimit.mockResolvedValueOnce([{
      aiAnalysis: {
        externalThreadId: 'twa:14155552671:966549764152',
      },
      customerAddress: null,
      customerPhone: '966549764152',
      id: 162,
      items: [],
      paymentStatus: 'paid',
      source: 'whatsapp',
      status: 'pending_store_review',
      totalPrice: '20.00',
    }]);
    mockTxUpdateReturning.mockResolvedValueOnce([]);

    await expect(
      approveOrderForCustomer('ar', 162),
    ).rejects.toBeInstanceOf(OrderConcurrencyError);

    expect(mockSendWhatsAppConversationTextMessage).not.toHaveBeenCalled();
  });

  it('rejects repeating the current status before generating or sending another message', async () => {
    const { updateOrderStatusFromDashboard } = await import('./OrderActions');

    mockDbSelectLimit.mockResolvedValueOnce([{
      deliveryStatus: 'preparing',
      id: 123,
      status: 'preparing',
    }]);

    await expect(
      updateOrderStatusFromDashboard('ar', 123, 'preparing'),
    ).rejects.toThrowError('Invalid order status transition');

    expect(mockGenerateCustomerReplyForSystemEvent).not.toHaveBeenCalled();
    expect(mockDbTransaction).not.toHaveBeenCalled();
    expect(mockSendWhatsAppConversationTextMessage).not.toHaveBeenCalled();
  });

  it('does not send a customer chat reply when the event model reply is unavailable', async () => {
    const { approveOrderForCustomer } = await import('./OrderActions');

    mockGenerateCustomerReplyForSystemEvent.mockResolvedValueOnce(undefined);
    mockDbSelectLimit.mockResolvedValueOnce([{
      aiAnalysis: {},
      customerAddress: null,
      customerPhone: '0500000000',
      id: 123,
      items: [],
      paymentStatus: 'unpaid',
      source: 'web_chat',
      status: 'pending_store_review',
      totalPrice: '15.00',
    }]);

    await approveOrderForCustomer('ar', 123);

    expect(mockTxInsertValues).not.toHaveBeenCalledWith(expect.objectContaining({
      senderType: 'ai_employee',
    }));
  });

  it('passes pickup and payment facts to approved order customer updates', async () => {
    const { approveOrderForCustomer } = await import('./OrderActions');

    mockGenerateCustomerReplyForSystemEvent.mockResolvedValueOnce('تمت الموافقة على طلبك رقم 152.');
    mockDbSelectLimit.mockResolvedValueOnce([{
      aiAnalysis: {
        customerDetails: {
          deliveryPreference: 'pickup',
          fulfillmentType: 'pickup',
          paymentPreference: 'card_on_pickup',
        },
        fulfillment: {
          deliveryPreference: 'pickup',
          paymentPreference: 'card_on_pickup',
          type: 'pickup',
        },
      },
      customerAddress: null,
      customerPhone: '0549764152',
      id: 152,
      items: [],
      paymentStatus: 'unpaid',
      source: 'web_chat_social',
      status: 'pending_store_review',
      totalPrice: '73.00',
    }]);

    await approveOrderForCustomer('ar', 152);

    expect(mockGenerateCustomerReplyForSystemEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'order_approved',
      order: expect.objectContaining({
        deliveryPreference: 'pickup',
        fulfillmentType: 'pickup',
        paymentPreference: 'card_on_pickup',
      }),
    }));
  });

  it('sends store cancellation to the customer conversation', async () => {
    const { updateOrderStatusFromDashboard } = await import('./OrderActions');

    mockGenerateCustomerReplyForSystemEvent.mockResolvedValueOnce('تم إلغاء طلبك من المتجر.');
    mockDbSelectLimit.mockResolvedValueOnce([{
      aiAnalysis: {
        externalThreadId: 'web-chat-guest-1',
      },
      customerAddress: null,
      customerPhone: '0500000000',
      deliveryStatus: 'not_started',
      id: 123,
      items: [],
      paymentStatus: 'unpaid',
      source: 'web_chat',
      status: 'pending_store_review',
      totalPrice: '15.00',
    }]);

    await updateOrderStatusFromDashboard('ar', 123, 'cancelled');

    expect(mockGenerateCustomerReplyForSystemEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'order_cancelled',
      locale: 'ar',
      organizationId: 'org_1',
    }));
    expect(mockTxInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      body: 'تم إلغاء طلبك من المتجر.',
      metadata: expect.objectContaining({
        lastOrder: {
          id: 123,
          status: 'cancelled',
        },
        shouldSendToCustomer: true,
        status: 'cancelled',
      }),
      senderType: 'ai_employee',
    }));
  });

  it('sends preparation status updates to the customer conversation', async () => {
    const { updateOrderStatusFromDashboard } = await import('./OrderActions');

    mockGenerateCustomerReplyForSystemEvent.mockResolvedValueOnce('The store has started preparing your order.');
    mockDbSelectLimit.mockResolvedValueOnce([{
      aiAnalysis: {
        externalThreadId: 'web-chat-guest-1',
      },
      customerAddress: null,
      customerPhone: '0500000000',
      deliveryStatus: 'not_started',
      id: 123,
      items: [],
      paymentStatus: 'unpaid',
      source: 'web_chat',
      status: 'approved_by_store',
      totalPrice: '15.00',
    }]);

    await updateOrderStatusFromDashboard('en', 123, 'preparing');

    expect(mockGenerateCustomerReplyForSystemEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'order_preparing',
      locale: 'en',
      organizationId: 'org_1',
    }));
    expect(mockTxInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      body: 'The store has started preparing your order.',
      metadata: expect.objectContaining({
        eventType: 'order_preparing',
        shouldSendToCustomer: true,
        status: 'preparing',
      }),
      senderType: 'ai_employee',
    }));
  });

  it('sends dashboard order status updates to WhatsApp for WhatsApp orders', async () => {
    const { updateOrderStatusFromDashboard } = await import('./OrderActions');

    mockGenerateCustomerReplyForSystemEvent.mockResolvedValueOnce('طلبك قيد التحضير الآن.');
    mockDbSelectLimit.mockResolvedValueOnce([{
      aiAnalysis: {
        externalThreadId: 'twa:14155552671:966549764152',
      },
      customerAddress: null,
      customerPhone: '966549764152',
      deliveryStatus: 'not_started',
      id: 162,
      items: [],
      paymentStatus: 'paid',
      source: 'whatsapp',
      status: 'approved_by_store',
      totalPrice: '20.00',
    }]);

    await updateOrderStatusFromDashboard('ar', 162, 'preparing');

    expect(mockSendWhatsAppConversationTextMessage).toHaveBeenCalledWith({
      body: 'طلبك قيد التحضير الآن.',
      externalThreadId: 'twa:14155552671:966549764152',
      organizationId: 'org_1',
    });
  });

  it('does not resend a WhatsApp status notification already stored for the order state', async () => {
    const { updateOrderStatusFromDashboard } = await import('./OrderActions');

    mockGenerateCustomerReplyForSystemEvent.mockResolvedValueOnce('طلبك قيد التجهيز الآن.');
    mockDbSelectLimit.mockResolvedValueOnce([{
      aiAnalysis: {
        externalThreadId: 'twa:14155552671:966549764152',
      },
      customerAddress: null,
      customerPhone: '966549764152',
      deliveryStatus: 'not_started',
      id: 162,
      items: [],
      paymentStatus: 'paid',
      source: 'whatsapp',
      status: 'approved_by_store',
      totalPrice: '20.00',
    }]);
    mockTxSelectLimit.mockResolvedValueOnce([{ id: 999 }]);

    await updateOrderStatusFromDashboard('ar', 162, 'preparing');

    expect(mockSendWhatsAppConversationTextMessage).not.toHaveBeenCalled();
  });

  it('does not send dashboard order status updates to WhatsApp for web orders', async () => {
    const { updateOrderStatusFromDashboard } = await import('./OrderActions');

    mockGenerateCustomerReplyForSystemEvent.mockResolvedValueOnce('The store has started preparing your order.');
    mockDbSelectLimit.mockResolvedValueOnce([{
      aiAnalysis: {
        externalThreadId: 'web-chat-guest-1',
      },
      customerAddress: null,
      customerPhone: '0500000000',
      deliveryStatus: 'not_started',
      id: 123,
      items: [],
      paymentStatus: 'unpaid',
      source: 'web_chat',
      status: 'approved_by_store',
      totalPrice: '15.00',
    }]);

    await updateOrderStatusFromDashboard('en', 123, 'preparing');

    expect(mockSendWhatsAppConversationTextMessage).not.toHaveBeenCalled();
  });

  it('sends completed WhatsApp orders a review request through Twilio', async () => {
    const { completeOrderAndRequestReview } = await import('./OrderActions');

    mockGenerateCustomerReplyForSystemEvent.mockResolvedValueOnce('طلبك رقم 162 تم إنجازه بنجاح.');
    mockDbSelectLimit.mockResolvedValueOnce([{
      aiAnalysis: {
        externalThreadId: 'twa:14155552671:966549764152',
      },
      customerAddress: null,
      customerPhone: '966549764152',
      deliveryStatus: 'ready_for_pickup',
      id: 162,
      items: [],
      paymentStatus: 'paid',
      source: 'whatsapp',
      status: 'ready_for_pickup',
      totalPrice: '20.00',
    }]);

    await completeOrderAndRequestReview('ar', 162);

    expect(mockSendWhatsAppConversationTextMessage).toHaveBeenCalledWith({
      body: 'طلبك رقم 162 تم إنجازه بنجاح.',
      externalThreadId: 'twa:14155552671:966549764152',
      organizationId: 'org_1',
    });
    expect(mockTxInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      body: 'طلبك رقم 162 تم إنجازه بنجاح.',
      senderType: 'ai_employee',
    }));
  });

  it('rejects completeOrderAndRequestReview when there is no active organization', async () => {
    const { completeOrderAndRequestReview } = await import('./OrderActions');
    mockAuth.mockResolvedValueOnce({ orgId: null, userId: 'user_1' });

    await expect(completeOrderAndRequestReview('ar', 162))
      .rejects
      .toThrow('No active organization selected');

    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('throws when the order is not found in completeOrderAndRequestReview', async () => {
    const { completeOrderAndRequestReview } = await import('./OrderActions');
    mockDbSelectLimit.mockResolvedValueOnce([]);

    await expect(completeOrderAndRequestReview('ar', 999))
      .rejects
      .toThrow('Order not found');

    expect(mockDbTransaction).not.toHaveBeenCalled();
  });

  it('throws OrderConcurrencyError when completeOrderAndRequestReview loses a race', async () => {
    const { completeOrderAndRequestReview } = await import('./OrderActions');
    const { OrderConcurrencyError } = await import('./OrderErrors');

    mockGenerateCustomerReplyForSystemEvent.mockResolvedValueOnce('طلبك تم إنجازه.');
    mockDbSelectLimit.mockResolvedValueOnce([{
      aiAnalysis: {},
      customerAddress: null,
      customerPhone: '0500000000',
      deliveryStatus: 'ready_for_pickup',
      id: 162,
      items: [],
      paymentStatus: 'paid',
      source: 'web_chat',
      status: 'ready_for_pickup',
      totalPrice: '20.00',
    }]);
    mockTxUpdateReturning.mockResolvedValueOnce([]);

    await expect(completeOrderAndRequestReview('ar', 162))
      .rejects
      .toBeInstanceOf(OrderConcurrencyError);
  });

  it('returns undefined from completeOrderAndRequestReview when no review message is generated', async () => {
    const { completeOrderAndRequestReview } = await import('./OrderActions');

    mockGenerateCustomerReplyForSystemEvent.mockResolvedValueOnce(undefined);
    mockDbSelectLimit.mockResolvedValueOnce([{
      aiAnalysis: {},
      customerAddress: null,
      customerPhone: '0500000000',
      deliveryStatus: 'ready_for_pickup',
      id: 162,
      items: [],
      paymentStatus: 'paid',
      source: 'web_chat',
      status: 'ready_for_pickup',
      totalPrice: '20.00',
    }]);

    await completeOrderAndRequestReview('ar', 162);

    expect(mockSendWhatsAppConversationTextMessage).not.toHaveBeenCalled();
  });

  it('does not resend a completed WhatsApp review request already stored for the order', async () => {
    const { completeOrderAndRequestReview } = await import('./OrderActions');

    mockGenerateCustomerReplyForSystemEvent.mockResolvedValueOnce('طلبك رقم 162 تم إنجازه بنجاح.');
    mockDbSelectLimit.mockResolvedValueOnce([{
      aiAnalysis: {
        externalThreadId: 'twa:14155552671:966549764152',
      },
      customerAddress: null,
      customerPhone: '966549764152',
      deliveryStatus: 'ready_for_pickup',
      id: 162,
      items: [],
      paymentStatus: 'paid',
      source: 'whatsapp',
      status: 'ready_for_pickup',
      totalPrice: '20.00',
    }]);
    mockTxSelectLimit.mockResolvedValueOnce([{ id: 777 }]);

    await completeOrderAndRequestReview('ar', 162);

    expect(mockSendWhatsAppConversationTextMessage).not.toHaveBeenCalled();
  });
});
