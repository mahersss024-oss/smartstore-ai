import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.fn();
const mockRevalidatePath = vi.fn();
const mockGenerateCustomerReplyForSystemEvent = vi.fn();
const mockAssertCanTransitionOrderStatus = vi.fn();
const mockSendWhatsAppConversationTextMessage = vi.fn();
const mockWriteOrderCustomerConversationMessage = vi.fn(async () => ({ status: 'sent' }));

const mockDbSelectLimit = vi.fn();
const mockDbSelectWhere = vi.fn(() => ({ limit: mockDbSelectLimit }));
const mockDbSelectFrom = vi.fn(() => ({ where: mockDbSelectWhere }));
const mockDbSelect = vi.fn(() => ({ from: mockDbSelectFrom }));
const mockDbDeleteWhere = vi.fn();
const mockDbDelete = vi.fn(() => ({ where: mockDbDeleteWhere }));
const mockTxUpdateReturning = vi.fn(async () => [{ id: 1 }]);
const mockTxUpdateWhere = vi.fn(() => ({ returning: mockTxUpdateReturning }));
const mockTxUpdateSet = vi.fn((_values: unknown) => ({ where: mockTxUpdateWhere }));
const mockTxUpdate = vi.fn(() => ({ set: mockTxUpdateSet }));
const mockTxInsertReturning = vi.fn(async () => [{ id: 1 }]);
const mockTxInsertOnConflictDoUpdate = vi.fn(() => ({ returning: mockTxInsertReturning }));
const mockTxInsertValues = vi.fn(() => ({
  onConflictDoUpdate: mockTxInsertOnConflictDoUpdate,
  returning: mockTxInsertReturning,
}));
const mockTxInsert = vi.fn(() => ({ values: mockTxInsertValues }));
const mockTxSelectLimit = vi.fn(async (): Promise<unknown[]> => []);
const mockTxSelectWhere = vi.fn(() => ({ limit: mockTxSelectLimit }));
const mockTxSelectFrom = vi.fn(() => ({ where: mockTxSelectWhere }));
const mockTxSelect = vi.fn(() => ({ from: mockTxSelectFrom }));
const mockDbTransaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
  return callback({
    delete: mockDbDelete,
    insert: mockTxInsert,
    select: mockTxSelect,
    update: mockTxUpdate,
  });
});
const mockDbUpdateWhere = vi.fn();
const mockDbUpdateSet = vi.fn(() => ({ where: mockDbUpdateWhere }));
const mockDbUpdate = vi.fn(() => ({ set: mockDbUpdateSet }));

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('next/cache', () => ({ revalidatePath: mockRevalidatePath }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...c: unknown[]) => ({ conditions: c, type: 'and' })),
  eq: vi.fn((f: unknown, v: unknown) => ({ field: f, type: 'eq', value: v })),
  isNull: vi.fn((f: unknown) => ({ field: f, type: 'isNull' })),
  isNotNull: vi.fn((f: unknown) => ({ field: f, type: 'isNotNull' })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ query: strings.join('?'), type: 'sql', values }),
}));
vi.mock('@/features/ai/AIEmployeeAgent', () => ({
  generateCustomerReplyForSystemEvent: mockGenerateCustomerReplyForSystemEvent,
}));
vi.mock('@/libs/DB', () => ({
  db: {
    delete: mockDbDelete,
    select: mockDbSelect,
    transaction: mockDbTransaction,
    update: mockDbUpdate,
  },
}));
vi.mock('@/libs/OrderConversationWriter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/OrderConversationWriter')>();
  return {
    ...actual,
    writeOrderCustomerConversationMessage: mockWriteOrderCustomerConversationMessage,
  };
});
vi.mock('@/libs/OrderWorkflow', () => ({
  assertCanTransitionOrderStatus: mockAssertCanTransitionOrderStatus,
  DELIVERY_STATUS: {
    COMPLETED: 'completed',
    NOT_STARTED: 'not_started',
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
    PENDING_STORE_REVIEW: 'pending_store_review',
    PREPARING: 'preparing',
    READY_FOR_PICKUP: 'ready_for_pickup',
  },
}));
vi.mock('@/libs/MetaInboundProcessor', () => ({
  sendMetaConversationTextMessage: mockSendWhatsAppConversationTextMessage,
}));
vi.mock('@/models/Schema', () => ({
  aiActionLogsTable: { orderId: 'orderId', organizationId: 'organizationId' },
  customerReviewsTable: { organizationId: 'organizationId', orderId: 'orderId' },
  invoicesTable: { organizationId: 'organizationId', orderId: 'orderId' },
  orderEventsTable: { organizationId: 'organizationId', orderId: 'orderId' },
  ordersTable: {
    archivedAt: 'archivedAt',
    id: 'id',
    organizationId: 'organizationId',
    status: 'status',
  },
}));
vi.mock('@/utils/Helpers', () => ({
  getI18nPath: vi.fn((p: string) => p),
}));

const baseWhatsAppOrder = (id: number, phone: string, thread: string) => ({
  aiAnalysis: { externalThreadId: thread },
  customerAddress: null,
  customerPhone: phone,
  deliveryStatus: 'not_started',
  id,
  items: [],
  paymentStatus: 'pending',
  source: 'whatsapp',
  status: 'pending_store_review',
  storeApprovedAt: null,
  totalPrice: '50.00',
});

const baseWebOrder = (id: number) => ({
  aiAnalysis: {},
  customerAddress: null,
  customerPhone: '966500000001',
  deliveryStatus: 'not_started',
  id,
  items: [],
  paymentStatus: 'pending',
  source: 'web_chat',
  status: 'pending_store_review',
  storeApprovedAt: null,
  totalPrice: '100.00',
});

describe('Order scenario matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ orgId: 'org_1', userId: 'user_1' });
    mockGenerateCustomerReplyForSystemEvent.mockResolvedValue('Status updated.');
    mockSendWhatsAppConversationTextMessage.mockResolvedValue({ status: 'sent' });
  });

  describe('cross-customer WhatsApp notification isolation', () => {
    it('routes each approval notification to the correct customer WhatsApp thread', async () => {
      const { approveOrderForCustomer } = await import('@/features/dashboard/OrderActions');

      mockDbSelectLimit.mockResolvedValueOnce([
        baseWhatsAppOrder(101, '966500000001', 'twa:14155552671:966500000001'),
      ]);
      await approveOrderForCustomer('en', 101);

      mockDbSelectLimit.mockResolvedValueOnce([
        baseWhatsAppOrder(102, '966500000002', 'twa:14155552671:966500000002'),
      ]);
      await approveOrderForCustomer('en', 102);

      expect(mockSendWhatsAppConversationTextMessage).toHaveBeenCalledTimes(2);

      const [call1, call2] = mockSendWhatsAppConversationTextMessage.mock.calls;

      expect(call1![0]).toMatchObject({ externalThreadId: 'twa:14155552671:966500000001' });
      expect(call2![0]).toMatchObject({ externalThreadId: 'twa:14155552671:966500000002' });
      expect(call1![0].externalThreadId).not.toBe(call2![0].externalThreadId);
    });

    it('sends status notifications to the original order thread, not the new order thread', async () => {
      const { updateOrderStatusFromDashboard } = await import('@/features/dashboard/OrderActions');

      mockDbSelectLimit.mockResolvedValueOnce([{
        ...baseWhatsAppOrder(101, '966500000001', 'twa:14155552671:966500000001'),
        status: 'approved_by_store',
      }]);
      await updateOrderStatusFromDashboard('en', 101, 'preparing');

      mockDbSelectLimit.mockResolvedValueOnce([{
        ...baseWhatsAppOrder(102, '966500000002', 'twa:14155552671:966500000002'),
        status: 'approved_by_store',
      }]);
      await updateOrderStatusFromDashboard('en', 102, 'preparing');

      const calls = mockSendWhatsAppConversationTextMessage.mock.calls;

      expect(calls[0]![0].externalThreadId).toBe('twa:14155552671:966500000001');
      expect(calls[1]![0].externalThreadId).toBe('twa:14155552671:966500000002');
    });

    it('does not send WhatsApp notifications for web orders when a WhatsApp order exists', async () => {
      const { approveOrderForCustomer } = await import('@/features/dashboard/OrderActions');

      mockDbSelectLimit.mockResolvedValueOnce([baseWebOrder(201)]);
      await approveOrderForCustomer('en', 201);

      mockDbSelectLimit.mockResolvedValueOnce([
        baseWhatsAppOrder(202, '966500000002', 'twa:14155552671:966500000002'),
      ]);
      await approveOrderForCustomer('en', 202);

      expect(mockSendWhatsAppConversationTextMessage).toHaveBeenCalledTimes(1);
      expect(mockSendWhatsAppConversationTextMessage.mock.calls[0]![0]).toMatchObject({
        externalThreadId: 'twa:14155552671:966500000002',
      });
    });
  });

  describe('full order lifecycle sequence', () => {
    it('processes all status transitions from approval to completion for a web order', async () => {
      const {
        approveOrderForCustomer,
        updateOrderStatusFromDashboard,
      } = await import('@/features/dashboard/OrderActions');

      const order = baseWebOrder(301);

      // Step 1: pending_store_review → approved_by_store
      mockDbSelectLimit.mockResolvedValueOnce([{ ...order, status: 'pending_store_review' }]);
      await approveOrderForCustomer('en', 301);

      // Step 2: approved_by_store → preparing
      mockDbSelectLimit.mockResolvedValueOnce([{ ...order, status: 'approved_by_store' }]);
      await updateOrderStatusFromDashboard('en', 301, 'preparing');

      // Step 3: preparing → completed (no customer event type for completed)
      mockDbSelectLimit.mockResolvedValueOnce([{ ...order, status: 'preparing' }]);
      await updateOrderStatusFromDashboard('en', 301, 'completed');

      expect(mockAssertCanTransitionOrderStatus).toHaveBeenCalledTimes(3);
      expect(mockAssertCanTransitionOrderStatus).toHaveBeenNthCalledWith(1, 'pending_store_review', 'approved_by_store');
      expect(mockAssertCanTransitionOrderStatus).toHaveBeenNthCalledWith(2, 'approved_by_store', 'preparing');
      expect(mockAssertCanTransitionOrderStatus).toHaveBeenNthCalledWith(3, 'preparing', 'completed');
      expect(mockSendWhatsAppConversationTextMessage).not.toHaveBeenCalled();
    });

    it('processes approved → out_for_delivery → completed for a delivery order', async () => {
      const { updateOrderStatusFromDashboard } = await import('@/features/dashboard/OrderActions');
      const order = baseWebOrder(302);

      mockDbSelectLimit.mockResolvedValueOnce([{ ...order, status: 'approved_by_store' }]);
      await updateOrderStatusFromDashboard('en', 302, 'out_for_delivery');

      // completed has no customer event type so generateCustomerReplyForSystemEvent is not called
      mockDbSelectLimit.mockResolvedValueOnce([{ ...order, status: 'out_for_delivery' }]);
      await updateOrderStatusFromDashboard('en', 302, 'completed');

      expect(mockAssertCanTransitionOrderStatus).toHaveBeenNthCalledWith(1, 'approved_by_store', 'out_for_delivery');
      expect(mockAssertCanTransitionOrderStatus).toHaveBeenNthCalledWith(2, 'out_for_delivery', 'completed');
    });

    it('cancels an order in preparing state and sends cancellation message', async () => {
      const { updateOrderStatusFromDashboard } = await import('@/features/dashboard/OrderActions');

      mockDbSelectLimit.mockResolvedValueOnce([{
        ...baseWhatsAppOrder(303, '966500000001', 'twa:14155552671:966500000001'),
        status: 'preparing',
      }]);
      mockGenerateCustomerReplyForSystemEvent.mockResolvedValueOnce('Your order has been cancelled.');
      await updateOrderStatusFromDashboard('en', 303, 'cancelled');

      expect(mockAssertCanTransitionOrderStatus).toHaveBeenCalledWith('preparing', 'cancelled');
      expect(mockSendWhatsAppConversationTextMessage).toHaveBeenCalledOnce();
      expect(mockSendWhatsAppConversationTextMessage.mock.calls[0]![0]).toMatchObject({
        externalThreadId: 'twa:14155552671:966500000001',
      });
    });
  });

  describe('order archive / restore / permanent delete lifecycle', () => {
    it('archives an order by setting archivedAt inside a transaction and does not permanently delete it', async () => {
      const { deleteOrderFromDashboard } = await import('@/features/dashboard/OrderActions');

      mockDbSelectLimit.mockResolvedValueOnce([{
        id: 401,
        organizationId: 'org_1',
        status: 'completed',
      }]);
      await deleteOrderFromDashboard('en', 401);

      expect(mockDbTransaction).toHaveBeenCalledOnce();
      expect(mockTxUpdateSet).toHaveBeenCalledOnce();
      expect(mockTxUpdateSet.mock.calls[0]![0]).toMatchObject({ archivedAt: expect.anything() });
      expect(mockDbDeleteWhere).not.toHaveBeenCalled();
    });

    it('restores an archived order by clearing archivedAt inside a transaction', async () => {
      const { restoreArchivedOrderFromDashboard } = await import('@/features/dashboard/OrderActions');

      mockDbSelectLimit.mockResolvedValueOnce([{
        archivedAt: '2026-01-01T00:00:00.000Z',
        id: 402,
        organizationId: 'org_1',
        status: 'completed',
      }]);
      await restoreArchivedOrderFromDashboard('en', 402);

      expect(mockDbTransaction).toHaveBeenCalledOnce();
      expect(mockTxUpdateSet).toHaveBeenCalledOnce();
      expect(mockTxUpdateSet.mock.calls[0]![0]).toMatchObject({ archivedAt: null });
    });

    it('permanently deletes only archived orders by removing the record', async () => {
      const { permanentlyDeleteArchivedOrderFromDashboard } = await import('@/features/dashboard/OrderActions');

      mockDbSelectLimit.mockResolvedValueOnce([{
        archivedAt: '2026-01-01T00:00:00.000Z',
        id: 403,
        organizationId: 'org_1',
      }]);
      await permanentlyDeleteArchivedOrderFromDashboard('en', 403);

      expect(mockDbDeleteWhere).toHaveBeenCalled();
    });

    it('rejects permanent deletion when the order is not archived', async () => {
      const { permanentlyDeleteArchivedOrderFromDashboard } = await import('@/features/dashboard/OrderActions');

      mockDbSelectLimit.mockResolvedValueOnce([]);

      await expect(permanentlyDeleteArchivedOrderFromDashboard('en', 404))
        .rejects
        .toThrow();

      expect(mockDbDeleteWhere).not.toHaveBeenCalled();
    });

    it('does not restore or permanently delete an order from another organization', async () => {
      const { restoreArchivedOrderFromDashboard } = await import('@/features/dashboard/OrderActions');

      mockDbSelectLimit.mockResolvedValueOnce([]);

      await expect(restoreArchivedOrderFromDashboard('en', 405)).rejects.toThrow();

      expect(mockDbUpdateSet).not.toHaveBeenCalled();
    });
  });

  describe('review request as part of order completion', () => {
    it('sends a WhatsApp review request to the correct thread when completing a WhatsApp order', async () => {
      const { completeOrderAndRequestReview } = await import('@/features/dashboard/OrderActions');

      mockGenerateCustomerReplyForSystemEvent.mockResolvedValueOnce('Please review your order!');
      mockDbSelectLimit.mockResolvedValueOnce([{
        ...baseWhatsAppOrder(501, '966500000001', 'twa:14155552671:966500000001'),
        status: 'ready_for_pickup',
      }]);
      await completeOrderAndRequestReview('en', 501);

      expect(mockSendWhatsAppConversationTextMessage).toHaveBeenCalledOnce();
      expect(mockSendWhatsAppConversationTextMessage.mock.calls[0]![0]).toMatchObject({
        externalThreadId: 'twa:14155552671:966500000001',
      });
    });

    it('does not send a review request for a web order at completion', async () => {
      const { completeOrderAndRequestReview } = await import('@/features/dashboard/OrderActions');

      mockGenerateCustomerReplyForSystemEvent.mockResolvedValueOnce('Thank you!');
      mockDbSelectLimit.mockResolvedValueOnce([{
        ...baseWebOrder(502),
        status: 'ready_for_pickup',
      }]);
      await completeOrderAndRequestReview('en', 502);

      expect(mockSendWhatsAppConversationTextMessage).not.toHaveBeenCalled();
    });
  });
});
