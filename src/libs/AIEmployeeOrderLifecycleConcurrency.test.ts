import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const selectLimit = vi.fn();
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const updateReturning = vi.fn();
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));
  const insertValues = vi.fn();
  const insert = vi.fn(() => ({ values: insertValues }));
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<void>) => {
    await callback({ insert, update });
  });

  return {
    insertValues,
    select,
    selectLimit,
    transaction,
    updateReturning,
  };
});

vi.mock('./DB', () => ({
  db: {
    insert: vi.fn(() => ({ values: mocks.insertValues })),
    select: mocks.select,
    transaction: mocks.transaction,
  },
}));

vi.mock('@/models/Schema', () => ({
  orderEventsTable: {},
  ordersTable: {
    archivedAt: 'archivedAt',
    deliveryStatus: 'deliveryStatus',
    id: 'id',
    items: 'items',
    organizationId: 'organizationId',
    status: 'status',
    totalPrice: 'totalPrice',
    updatedAt: 'updatedAt',
  },
}));

vi.mock('./SubscriptionEntitlements', () => ({
  assertCanCreateAiOrder: vi.fn(),
}));

describe('AIEmployeeOrderLifecycle concurrency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.insertValues.mockResolvedValue(undefined);
  });

  it('does not append an order event when an item update loses a race', async () => {
    mocks.selectLimit.mockResolvedValueOnce([{
      deliveryStatus: 'not_started',
      items: [{
        name: 'Existing',
        productId: 1,
        quantity: 1,
        unitPrice: 10,
      }],
      status: 'pending_store_review',
      totalPrice: '10.00',
      updatedAt: new Date('2026-06-07T10:00:00.000Z'),
    }]);
    mocks.updateReturning.mockResolvedValueOnce([]);
    const { addAIEmployeeItemsToExistingOrder } = await import(
      './AIEmployeeOrderLifecycle',
    );

    await expect(addAIEmployeeItemsToExistingOrder({
      conversationId: 1,
      items: [{
        name: 'New',
        productId: 2,
        quantity: 1,
        unitPrice: 5,
      }],
      orderId: 10,
      organizationId: 'org_1',
    })).resolves.toEqual({ created: false });

    expect(mocks.insertValues).not.toHaveBeenCalled();
  }, 10_000);

  it('reports a changed state when automatic cancellation loses a race', async () => {
    mocks.updateReturning.mockResolvedValueOnce([]);
    const { handleAIEmployeeOrderCancellationRequest } = await import(
      './AIEmployeeOrderLifecycle',
    );

    await expect(handleAIEmployeeOrderCancellationRequest({
      conversationId: 1,
      customerOrders: {
        completed: [],
        open: [{
          createdAt: '2026-06-07T10:00:00.000Z',
          deliveryStatus: 'not_started',
          id: 10,
          items: [],
          matchReasons: ['latest'],
          status: 'pending_store_review',
          totalPrice: '10.00',
          updatedAt: '2026-06-07T10:00:00.000Z',
        }],
      },
      organizationId: 'org_1',
      requested: true,
    })).resolves.toMatchObject({
      applied: false,
      orderId: 10,
      reason: 'state_changed',
      requested: true,
    });

    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it('captures WhatsApp customer feedback as an order event', async () => {
    const { createAIEmployeeCustomerFeedbackEvent } = await import(
      './AIEmployeeOrderLifecycle',
    );

    const result = await createAIEmployeeCustomerFeedbackEvent({
      conversationId: 1375,
      customerOrders: {
        completed: [{
          createdAt: '2026-06-12T07:09:11.000Z',
          id: 162,
          items: [],
          matchReasons: ['phone'],
          status: 'completed',
          totalPrice: '20.00',
          updatedAt: '2026-06-12T07:12:12.000Z',
        }],
        open: [],
      },
      message: 'الخدمة ممتازة لكن الطلب تأخر',
      organizationId: 'org_1',
      preferredOrderId: 162,
      sourceChannel: 'whatsapp',
    });

    expect(result).toEqual({
      created: true,
      orderId: 162,
    });
    expect(mocks.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      actorType: 'customer',
      eventType: 'customer_complaint',
      metadata: expect.objectContaining({
        conversationId: 1375,
        customerMessage: 'الخدمة ممتازة لكن الطلب تأخر',
        source: 'whatsapp_chat_feedback',
        sourceChannel: 'whatsapp',
      }),
      orderId: 162,
      organizationId: 'org_1',
    }));
  });

  it('does not create a draft order from an empty cart', async () => {
    const { createAIEmployeeDraftOrder } = await import('./AIEmployeeOrderLifecycle');

    await expect(createAIEmployeeDraftOrder({
      aiAnalysis: {
        confidence: 1,
        intent: 'order_request',
        missingDetails: [],
        policyVersion: 'test',
        reply: '',
        shouldCreateDraftOrder: true,
      },
      items: [],
      organizationId: 'org_1',
      source: 'web_chat',
    })).resolves.toBeNull();

    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it('does not create a draft order while checkout facts are missing', async () => {
    const { createAIEmployeeDraftOrder } = await import('./AIEmployeeOrderLifecycle');

    await expect(createAIEmployeeDraftOrder({
      aiAnalysis: {
        confidence: 1,
        intent: 'order_request',
        missingDetails: ['payment_method'],
        policyVersion: 'test',
        reply: '',
        shouldCreateDraftOrder: true,
      },
      items: [{
        name: 'Product',
        productId: 1,
        quantity: 1,
        unitPrice: 10,
      }],
      organizationId: 'org_1',
      source: 'whatsapp',
    })).resolves.toBeNull();

    expect(mocks.insertValues).not.toHaveBeenCalled();
  });
});
