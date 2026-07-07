import { beforeEach, describe, expect, it, vi } from 'vitest';

// Shared auth mock — all categories use the same pattern
const mockAuth = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: vi.fn() }));
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...c: unknown[]) => ({ conditions: c, type: 'and' })),
  eq: vi.fn((f: unknown, v: unknown) => ({ field: f, type: 'eq', value: v })),
  inArray: vi.fn((f: unknown, v: unknown) => ({ field: f, type: 'inArray', value: v })),
  isNull: vi.fn((f: unknown) => ({ field: f, type: 'isNull' })),
  isNotNull: vi.fn((f: unknown) => ({ field: f, type: 'isNotNull' })),
  or: vi.fn((...c: unknown[]) => ({ conditions: c, type: 'or' })),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ query: strings.join('?'), type: 'sql', values }),
}));
vi.mock('@/libs/DB', () => ({
  db: {
    delete: vi.fn(() => ({ where: vi.fn() })),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn(() => ({ returning: vi.fn(async () => []) })), returning: vi.fn(async () => []) })) })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })) })),
    transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({
      delete: vi.fn(() => ({ where: vi.fn() })),
      insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn(() => ({ returning: vi.fn(async () => []) })), returning: vi.fn(async () => []) })) })),
      select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => []) })) })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn() })) })),
  },
}));
vi.mock('@/libs/CustomerIdentity', () => ({
  getCustomerPhoneIdentityVariants: vi.fn(() => ['0500000000', '966500000000']),
}));
vi.mock('@/libs/OrderWorkflow', () => ({
  assertCanTransitionOrderStatus: vi.fn(),
  DELIVERY_STATUS: { COMPLETED: 'completed', NOT_STARTED: 'not_started', OUT_FOR_DELIVERY: 'out_for_delivery', PREPARING: 'preparing', READY_FOR_PICKUP: 'ready_for_pickup' },
  ORDER_EVENT_TYPE: { ORDER_APPROVED: 'order_approved', STATUS_CHANGED: 'status_changed' },
  ORDER_STATUS: { APPROVED_BY_STORE: 'approved_by_store', CANCELLED: 'cancelled', COMPLETED: 'completed', PREPARING: 'preparing' },
}));
vi.mock('@/libs/OrderConversationWriter', () => ({
  getOrderConversationReference: vi.fn(() => ({})),
  writeOrderCustomerConversationMessage: vi.fn(async () => ({ status: 'skipped' })),
}));
vi.mock('@/libs/StoreServiceControls', () => ({ assertStoreFeatureEnabled: vi.fn() }));
vi.mock('@/libs/StoreAIContext', () => ({ loadStoreAIContext: vi.fn(async () => ({})) }));
vi.mock('@/libs/AISimulation', () => ({ simulateAIEmployeeReply: vi.fn(() => ({ missingDetails: [], recommendedProducts: [], reply: 'ok' })) }));
vi.mock('@/features/ai/AIEmployeeAgent', () => ({
  generateCustomerReplyForSystemEvent: vi.fn(async () => undefined),
}));
vi.mock('@/libs/WhapiWhatsApp', () => ({
  sendWhapiConversationTextMessage: vi.fn(),
}));
vi.mock('@/libs/EvolutionWhatsApp', () => ({
  sendEvolutionConversationTextMessage: vi.fn(),
}));
vi.mock('@/libs/ProductAvailabilitySync', () => ({ syncProductAvailability: vi.fn() }));
vi.mock('@/libs/ProductCatalogConflict', () => ({
  assertNoDuplicateProductName: vi.fn(),
  findDuplicateProductEntry: vi.fn(async () => null),
}));
vi.mock('@/libs/ProductImageStorage', () => ({
  deleteProductImage: vi.fn(),
  getImageStorageMb: vi.fn(() => 0),
  isStoredImageDataUrl: vi.fn(() => false),
  isUploadedFile: vi.fn(() => false),
  saveProductImage: vi.fn(async () => 'https://cdn.example.test/image.jpg'),
  uploadProductImage: vi.fn(async () => ({ url: 'https://cdn.example.test/image.jpg' })),
}));
vi.mock('@/libs/StoreEntitlements', () => ({ getActiveProductLimit: vi.fn(async () => 100) }));
vi.mock('@/libs/StoreReadiness', () => ({ assertStoreReadyForAI: vi.fn() }));
vi.mock('@/libs/AIEmployeeOrchestration', () => ({
  buildAIEmployeeOrchestrationTrace: vi.fn(),
  getVisibleAIEmployeeSystemActions: vi.fn(() => []),
  hasMeaningfulAIEmployeeSemanticHints: vi.fn(() => false),
  orchestrateAIEmployeeDialogueState: vi.fn(() => ({ cartState: null, nextNeed: null })),
  sanitizeAIEmployeeSystemSemanticHints: vi.fn(() => ({})),
}));
vi.mock('@/models/Schema', () => ({
  aiActionLogsTable: { organizationId: 'organizationId', orderId: 'orderId' },
  channelConnectionsTable: { organizationId: 'organizationId' },
  conversationMessagesTable: { organizationId: 'organizationId', conversationId: 'conversationId', id: 'id', metadata: 'metadata' },
  conversationsTable: { organizationId: 'organizationId', channel: 'channel', externalThreadId: 'externalThreadId', id: 'id' },
  customerReviewsTable: { organizationId: 'organizationId', orderId: 'orderId' },
  customersTable: { id: 'id', metadata: 'metadata', organizationId: 'organizationId', phone: 'phone' },
  deliveryMethodsTable: { organizationId: 'organizationId' },
  invoicesTable: { organizationId: 'organizationId', orderId: 'orderId' },
  orderEventsTable: { organizationId: 'organizationId', orderId: 'orderId' },
  ordersTable: { archivedAt: 'archivedAt', customerPhone: 'customerPhone', id: 'id', organizationId: 'organizationId', status: 'status' },
  paymentMethodsTable: { organizationId: 'organizationId' },
  productsTable: { archivedAt: 'archivedAt', id: 'id', organizationId: 'organizationId' },
  storeSettingsTable: { id: 'id', metadata: 'metadata', organizationId: 'organizationId' },
  webhookEventsTable: { id: 'id', organizationId: 'organizationId' },
}));
vi.mock('@/utils/Helpers', () => ({
  getBaseUrl: vi.fn(() => 'https://www.smartstore-ai.com'),
  getI18nPath: vi.fn((p: string) => p),
}));

describe('Server action security matrix — fail-closed without authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ orgId: null, userId: null });
  });

  describe('order management actions', () => {
    it('approveOrderForCustomer throws without active organization', async () => {
      const { approveOrderForCustomer } = await import('@/features/dashboard/OrderActions');

      await expect(approveOrderForCustomer('en', 1)).rejects.toThrow('No active organization selected');
    });

    it('updateOrderStatusFromDashboard throws without active organization', async () => {
      const { updateOrderStatusFromDashboard } = await import('@/features/dashboard/OrderActions');

      await expect(updateOrderStatusFromDashboard('en', 1, 'preparing')).rejects.toThrow('No active organization selected');
    });

    it('deleteOrderFromDashboard throws without active organization', async () => {
      const { deleteOrderFromDashboard } = await import('@/features/dashboard/OrderActions');

      await expect(deleteOrderFromDashboard('en', 1)).rejects.toThrow('No active organization selected');
    });

    it('permanentlyDeleteArchivedOrderFromDashboard throws without active organization', async () => {
      const { permanentlyDeleteArchivedOrderFromDashboard } = await import('@/features/dashboard/OrderActions');

      await expect(permanentlyDeleteArchivedOrderFromDashboard('en', 1)).rejects.toThrow('No active organization selected');
    });
  });

  describe('customer management actions', () => {
    it('archiveCustomerRecord throws without active organization', async () => {
      const { archiveCustomerRecord } = await import('@/features/dashboard/CustomerActions');

      await expect(archiveCustomerRecord('en', 1)).rejects.toThrow('No active organization selected');
    });

    it('deleteCustomerRecord throws without active organization', async () => {
      const { deleteCustomerRecord } = await import('@/features/dashboard/CustomerActions');

      await expect(deleteCustomerRecord('en', 1)).rejects.toThrow('No active organization selected');
    });

    it('deleteCustomerConversation throws without active organization', async () => {
      const { deleteCustomerConversation } = await import('@/features/dashboard/CustomerActions');

      await expect(deleteCustomerConversation('en', 1, 1)).rejects.toThrow('No active organization selected');
    });
  });

  describe('product management actions', () => {
    it('deleteProduct throws without active organization', async () => {
      const { deleteProduct } = await import('@/features/dashboard/ProductActions');

      await expect(deleteProduct('en', 1)).rejects.toThrow('No active organization selected');
    }, 15_000);

    it('updateProductAvailability throws without active organization', async () => {
      const { updateProductAvailability } = await import('@/features/dashboard/ProductActions');

      await expect(updateProductAvailability('en', 1, 'available')).rejects.toThrow('No active organization selected');
    }, 15_000);
  });

  describe('AI management actions', () => {
    it('runAIEmployeeSimulation throws without active organization', async () => {
      const { runAIEmployeeSimulation } = await import('@/features/dashboard/AISimulationActions');
      const formData = new FormData();
      formData.set('simulationMessage', 'hello');

      await expect(runAIEmployeeSimulation('en', formData)).rejects.toThrow('No active organization selected');
    });
  });
});
