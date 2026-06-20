/**
 * Store A / Store B tenant isolation scenario matrix.
 *
 * Every server action that reads or mutates store-scoped data must derive the
 * organization scope from the Clerk authentication context, never from user-
 * supplied input.  These tests prove that two stores with different Clerk org
 * IDs produce completely separate database query scopes across every major
 * action surface: orders, customers, products, settings, and AI context.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Clerk auth mock (must be top-level for hoisting) ────────────────────────
const mockAuth = vi.fn();
vi.mock('@clerk/nextjs/server', () => ({ auth: mockAuth }));

// ─── shared DB mock (top-level so all action imports share it) ───────────────
const mockDbLimit = vi.fn(async () => [] as unknown[]);
const mockDbWhere = vi.fn(() => ({ limit: mockDbLimit }));
const mockDbFrom = vi.fn(() => ({ where: mockDbWhere }));
const mockDbSelect = vi.fn(() => ({ from: mockDbFrom }));
const mockDbUpdateWhere = vi.fn(async () => undefined);
const mockDbUpdateSet = vi.fn(() => ({ where: mockDbUpdateWhere }));
const mockDbUpdate = vi.fn(() => ({ set: mockDbUpdateSet }));
const mockDbInsertOnConflictDoUpdate = vi.fn(async () => undefined);
const mockDbInsertValues = vi.fn((_values: unknown) => ({ onConflictDoUpdate: mockDbInsertOnConflictDoUpdate }));
const mockDbInsert = vi.fn(() => ({ values: mockDbInsertValues }));
const mockTxDelete = vi.fn(() => ({ where: vi.fn(async () => undefined) }));
const mockTxSelect = vi.fn(() => ({
  from: vi.fn(() => ({ where: vi.fn(() => ({ limit: vi.fn(async () => []) })) })),
}));
const mockDbTransaction = vi.fn(async (cb: (tx: unknown) => Promise<void>) => {
  await cb({
    delete: mockTxDelete,
    insert: vi.fn(() => ({ values: vi.fn(async () => undefined) })),
    select: mockTxSelect,
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(async () => undefined) })) })),
  });
});

vi.mock('@/libs/DB', () => ({
  db: {
    insert: mockDbInsert,
    select: mockDbSelect,
    transaction: mockDbTransaction,
    update: mockDbUpdate,
  },
}));

// ─── Drizzle ORM mock ─────────────────────────────────────────────────────────
vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conds: unknown[]) => ({ conds, type: 'and' })),
  count: vi.fn((f: unknown) => ({ f, type: 'count' })),
  desc: vi.fn((f: unknown) => ({ f, type: 'desc' })),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, type: 'eq', value })),
  inArray: vi.fn((field: unknown, values: unknown) => ({ field, type: 'inArray', values })),
  isNotNull: vi.fn((f: unknown) => ({ f, type: 'isNotNull' })),
  isNull: vi.fn((f: unknown) => ({ f, type: 'isNull' })),
  ne: vi.fn((field: unknown, value: unknown) => ({ field, type: 'ne', value })),
  or: vi.fn((...conds: unknown[]) => ({ conds, type: 'or' })),
  sql: Object.assign(vi.fn((s: TemplateStringsArray) => ({ s, type: 'sql' })), {
    raw: vi.fn((s: string) => ({ s, type: 'sql_raw' })),
  }),
}));

// ─── Next.js mocks ────────────────────────────────────────────────────────────
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));
vi.mock('@/utils/Helpers', () => ({ getI18nPath: vi.fn((p: string) => p) }));

// ─── Schema (field-name proxy so any column reference is a string) ────────────
vi.mock('@/models/Schema', () => {
  const table = new Proxy({}, { get: (_t, p) => String(p) });

  return {
    aiActionLogsTable: table,
    channelConnectionsTable: table,
    conversationMessagesTable: table,
    conversationsTable: table,
    customerReviewsTable: table,
    customersTable: table,
    deliveryMethodsTable: table,
    invoicesTable: table,
    orderEventsTable: table,
    ordersTable: table,
    paymentMethodsTable: table,
    productsTable: table,
    storeSettingsTable: table,
  };
});

// ─── External service mocks shared across all tests ───────────────────────────
const mockLoadStoreAIContext = vi.fn(async () => ({}));
vi.mock('@/libs/StoreAIContext', () => ({
  loadStoreAIContext: mockLoadStoreAIContext,
}));

const mockSimulateAIEmployeeReply = vi.fn(() => ({
  missingDetails: [],
  recommendedProducts: [],
  reply: 'Reply',
}));
vi.mock('@/libs/AISimulation', () => ({
  simulateAIEmployeeReply: mockSimulateAIEmployeeReply,
}));

vi.mock('@/libs/AIActionPermissions', () => ({
  AI_AUDIT_ACTION: { REPLY: 'reply' },
  assertCanPerformAIAction: vi.fn(),
  getRequiredAIPermission: vi.fn(() => 'permission:reply'),
}));

vi.mock('@/libs/AIEmployeeSettings', () => ({
  AI_HANDOFF_KEYS: [],
  AI_PERMISSION_KEYS: [],
  normalizeAIEmployeeSettings: vi.fn(() => ({ enabled: false })),
}));

vi.mock('@/libs/StoreReadiness', () => ({
  getStoreReadiness: vi.fn(() => ({ issues: [], status: 'ready' })),
}));

vi.mock('@/libs/StoreServiceControls', () => ({
  assertStoreFeatureEnabled: vi.fn(),
}));

vi.mock('@/libs/OrderConversationWriter', () => ({
  getOrderConversationReference: vi.fn(async () => null),
  writeOrderCustomerConversationMessage: vi.fn(async () => null),
}));

vi.mock('@/features/ai/AIEmployeeAgent', () => ({
  generateCustomerReplyForSystemEvent: vi.fn(async () => undefined),
}));

vi.mock('@/libs/OrderWorkflow', () => ({
  assertCanTransitionOrderStatus: vi.fn(),
  DELIVERY_STATUS: { IN_TRANSIT: 'in_transit' },
  ORDER_EVENT_TYPE: { STATUS_CHANGED: 'status_changed' },
  ORDER_STATUS: {
    APPROVED: 'approved',
    CANCELLED: 'cancelled',
    OUT_FOR_DELIVERY: 'out_for_delivery',
    PENDING: 'pending',
    PREPARING: 'preparing',
    READY_FOR_PICKUP: 'ready_for_pickup',
  },
}));

vi.mock('@/utils/CustomerChannels', () => ({
  buildWhatsAppChannelConfig: vi.fn((params: Record<string, unknown>) => ({
    config: { ...params, mode: 'twilio', provider: 'twilio' },
    connectionStatus: 'connected',
    isActive: true,
    mode: 'twilio',
    whatsappLink: 'https://wa.me/966500000000',
    whatsappTarget: '966500000000',
  })),
}));

vi.mock('@/libs/PlatformAIProviderConfig', () => ({
  decryptSecret: vi.fn(() => undefined),
  encryptSecret: vi.fn((v: string) => `encrypted:${v}`),
  maskApiKey: vi.fn(() => 'bbb...bbbb'),
}));

vi.mock('@/libs/TwilioWhatsApp', () => ({
  sendTwilioConversationTextMessage: vi.fn(async () => ({ status: 'sent' })),
  validateTwilioWhatsAppCredentials: vi.fn(async () => true),
}));

vi.mock('@/libs/ProductImageStorage', () => ({
  isStoredImageDataUrl: vi.fn(() => false),
  isUploadedFile: vi.fn(() => false),
  saveProductImage: vi.fn(async () => undefined),
  saveStoreLogo: vi.fn(),
}));

vi.mock('@/libs/SubscriptionEntitlements', () => ({
  assertCanUseChannels: vi.fn(),
  assertCanUseProductSlots: vi.fn(async () => undefined),
  assertCanUseStorageQuota: vi.fn(async () => undefined),
  isSubscriptionFeatureError: vi.fn(() => false),
  isSubscriptionLimitError: vi.fn(() => false),
}));

vi.mock('@/libs/CustomerIdentity', () => ({
  getCustomerPhoneIdentityVariants: vi.fn(() => ['0500000000', '966500000000']),
}));

// ─── Helper: extract org values from captured WHERE conditions ───────────────
function extractOrgValues(calls: unknown[][]): string[] {
  const seen: string[] = [];

  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') {
      return;
    }

    const n = node as Record<string, unknown>;

    if (n.type === 'eq' && typeof n.value === 'string') {
      seen.push(n.value);
    }

    if (n.type === 'and' && Array.isArray(n.conds)) {
      n.conds.forEach(walk);
    }

    if (Array.isArray(n)) {
      n.forEach(walk);
    }
  };

  calls.forEach(callArgs => callArgs.forEach(walk));

  return seen;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('Store A / Store B tenant isolation matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbLimit.mockResolvedValue([]);
    mockDbUpdateWhere.mockResolvedValue(undefined);
    mockLoadStoreAIContext.mockResolvedValue({});
  });

  // ── CustomerActions ───────────────────────────────────────────────────────

  describe('CustomerActions — org scope is derived exclusively from Clerk auth', () => {
    it('scopes customer archive query to Store A when authenticated as Store A', async () => {
      mockAuth.mockResolvedValue({ orgId: 'org_store_a', userId: 'user_1' });
      mockDbLimit.mockResolvedValueOnce([{ metadata: {} }]);
      const { archiveCustomerRecord } = await import('@/features/dashboard/CustomerActions');

      await expect(archiveCustomerRecord('ar', 99)).rejects.toThrow('redirect:');

      const orgValues = extractOrgValues(mockDbWhere.mock.calls);

      expect(orgValues).toContain('org_store_a');
      expect(orgValues).not.toContain('org_store_b');
    });

    it('scopes customer archive query to Store B when authenticated as Store B', async () => {
      mockAuth.mockResolvedValue({ orgId: 'org_store_b', userId: 'user_2' });
      mockDbLimit.mockResolvedValueOnce([{ metadata: {} }]);
      const { archiveCustomerRecord } = await import('@/features/dashboard/CustomerActions');

      await expect(archiveCustomerRecord('ar', 99)).rejects.toThrow('redirect:');

      const orgValues = extractOrgValues(mockDbWhere.mock.calls);

      expect(orgValues).toContain('org_store_b');
      expect(orgValues).not.toContain('org_store_a');
    });

    it('rejects customer actions entirely when no organization is active', async () => {
      mockAuth.mockResolvedValue({ orgId: null, userId: 'user_1' });
      const { archiveCustomerRecord } = await import('@/features/dashboard/CustomerActions');

      await expect(archiveCustomerRecord('ar', 99))
        .rejects
        .toThrow('No active organization selected');

      expect(mockDbSelect).not.toHaveBeenCalled();
    });
  });

  // ── OrderActions ──────────────────────────────────────────────────────────

  describe('OrderActions — org scope is derived exclusively from Clerk auth', () => {
    it('scopes archived order deletion to Store A when authenticated as Store A', async () => {
      mockAuth.mockResolvedValue({ orgId: 'org_store_a', userId: 'user_1' });
      mockDbLimit.mockResolvedValueOnce([{ archivedAt: '2024-01-01', id: 55 }]);
      const { permanentlyDeleteArchivedOrderFromDashboard } = await import(
        '@/features/dashboard/OrderActions',
      );

      await permanentlyDeleteArchivedOrderFromDashboard('ar', 55);

      const orgValues = extractOrgValues(mockDbWhere.mock.calls);

      expect(orgValues).toContain('org_store_a');
      expect(orgValues).not.toContain('org_store_b');
    });

    it('scopes archived order deletion to Store B when authenticated as Store B', async () => {
      mockAuth.mockResolvedValue({ orgId: 'org_store_b', userId: 'user_2' });
      mockDbLimit.mockResolvedValueOnce([{ archivedAt: '2024-01-01', id: 55 }]);
      const { permanentlyDeleteArchivedOrderFromDashboard } = await import(
        '@/features/dashboard/OrderActions',
      );

      await permanentlyDeleteArchivedOrderFromDashboard('ar', 55);

      const orgValues = extractOrgValues(mockDbWhere.mock.calls);

      expect(orgValues).toContain('org_store_b');
      expect(orgValues).not.toContain('org_store_a');
    });

    it('rejects order actions entirely when no organization is active', async () => {
      mockAuth.mockResolvedValue({ orgId: null });
      const { permanentlyDeleteArchivedOrderFromDashboard } = await import(
        '@/features/dashboard/OrderActions',
      );

      await expect(permanentlyDeleteArchivedOrderFromDashboard('ar', 55))
        .rejects
        .toThrow('No active organization selected');

      expect(mockDbSelect).not.toHaveBeenCalled();
    });
  });

  // ── ProductActions ────────────────────────────────────────────────────────

  describe('ProductActions — org scope is derived exclusively from Clerk auth', () => {
    it('scopes product archive reads and writes to Store A when authenticated as Store A', async () => {
      mockAuth.mockResolvedValue({ orgId: 'org_store_a', userId: 'user_1' });
      mockDbLimit.mockResolvedValueOnce([{ metadata: { aiVisible: true } }]);
      const { deleteProduct } = await import('@/features/dashboard/ProductActions');

      await deleteProduct('ar', 11);

      const orgValues = extractOrgValues([
        ...mockDbWhere.mock.calls,
        ...mockDbUpdateWhere.mock.calls,
      ]);

      expect(orgValues).toContain('org_store_a');
      expect(orgValues).not.toContain('org_store_b');
    });

    it('scopes product archive reads and writes to Store B when authenticated as Store B', async () => {
      mockAuth.mockResolvedValue({ orgId: 'org_store_b', userId: 'user_2' });
      mockDbLimit.mockResolvedValueOnce([{ metadata: { aiVisible: true } }]);
      const { deleteProduct } = await import('@/features/dashboard/ProductActions');

      await deleteProduct('ar', 11);

      const orgValues = extractOrgValues([
        ...mockDbWhere.mock.calls,
        ...mockDbUpdateWhere.mock.calls,
      ]);

      expect(orgValues).toContain('org_store_b');
      expect(orgValues).not.toContain('org_store_a');
    });
  });

  // ── AI Simulation context isolation ───────────────────────────────────────

  describe('AI Simulation — store context is fetched for the authenticated org only', () => {
    it('loads AI context for Store A only when authenticated as Store A', async () => {
      mockAuth.mockResolvedValue({ orgId: 'org_store_a', userId: 'user_1' });
      mockDbLimit.mockResolvedValueOnce([{ metadata: {} }]);
      const { runAIEmployeeSimulation } = await import(
        '@/features/dashboard/AISimulationActions',
      );

      const formData = new FormData();
      formData.set('simulationMessage', 'What do you have?');
      await runAIEmployeeSimulation('ar', formData);

      expect(mockLoadStoreAIContext).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org_store_a' }),
      );
      expect(mockLoadStoreAIContext).not.toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org_store_b' }),
      );
    });

    it('loads AI context for Store B only when authenticated as Store B', async () => {
      mockAuth.mockResolvedValue({ orgId: 'org_store_b', userId: 'user_2' });
      mockDbLimit.mockResolvedValueOnce([{ metadata: {} }]);
      const { runAIEmployeeSimulation } = await import(
        '@/features/dashboard/AISimulationActions',
      );

      const formData = new FormData();
      formData.set('simulationMessage', 'What do you have?');
      await runAIEmployeeSimulation('ar', formData);

      expect(mockLoadStoreAIContext).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org_store_b' }),
      );
      expect(mockLoadStoreAIContext).not.toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org_store_a' }),
      );
    });

    it('denies AI simulation entirely when no organization is active', async () => {
      mockAuth.mockResolvedValue({ orgId: null });
      const { runAIEmployeeSimulation } = await import(
        '@/features/dashboard/AISimulationActions',
      );

      await expect(runAIEmployeeSimulation('ar', new FormData()))
        .rejects
        .toThrow('No active organization selected');

      expect(mockLoadStoreAIContext).not.toHaveBeenCalled();
      expect(mockDbSelect).not.toHaveBeenCalled();
    });
  });

  // ── WhatsApp settings write isolation ────────────────────────────────────

  describe('StoreSettingsActions — WhatsApp writes scoped to the authenticated org', () => {
    const buildWhatsAppFormData = (phone: string) => {
      const fd = new FormData();
      fd.set('twilioAccountSid', `AC${'a'.repeat(32)}`);
      fd.set('twilioAuthToken', 'b'.repeat(32));
      fd.set('twilioWhatsAppFrom', `whatsapp:${phone}`);

      return fd;
    };

    it('inserts WhatsApp config with Store A org ID when authenticated as Store A', async () => {
      mockAuth.mockResolvedValue({ orgId: 'org_store_a', userId: 'user_1' });
      mockDbLimit.mockResolvedValueOnce([{ id: 1, metadata: {}, storeName: 'Store A' }]);
      const { saveWhatsAppSettings } = await import('@/features/dashboard/StoreSettingsActions');

      await saveWhatsAppSettings(
        'ar',
        { status: 'idle' },
        buildWhatsAppFormData('+966500000000'),
      );

      const insertArg = mockDbInsertValues.mock.calls.at(-1)?.[0] as Record<string, unknown>;

      expect(insertArg?.organizationId).toBe('org_store_a');
      expect(insertArg?.organizationId).not.toBe('org_store_b');
    });

    it('inserts WhatsApp config with Store B org ID when authenticated as Store B', async () => {
      mockAuth.mockResolvedValue({ orgId: 'org_store_b', userId: 'user_2' });
      mockDbLimit.mockResolvedValueOnce([{ id: 2, metadata: {}, storeName: 'Store B' }]);
      const { saveWhatsAppSettings } = await import('@/features/dashboard/StoreSettingsActions');

      await saveWhatsAppSettings(
        'ar',
        { status: 'idle' },
        buildWhatsAppFormData('+966509990000'),
      );

      const insertArg = mockDbInsertValues.mock.calls.at(-1)?.[0] as Record<string, unknown>;

      expect(insertArg?.organizationId).toBe('org_store_b');
      expect(insertArg?.organizationId).not.toBe('org_store_a');
    });
  });

  // ── AI Employee Settings write isolation ──────────────────────────────────

  describe('AIEmployeeSettingsActions — settings writes scoped to the authenticated org', () => {
    it('writes AI settings for Store A only when authenticated as Store A', async () => {
      mockAuth.mockResolvedValue({ orgId: 'org_store_a', userId: 'user_1' });
      mockDbLimit.mockResolvedValueOnce([{ metadata: {} }]);
      const { saveAIEmployeeSettings } = await import(
        '@/features/dashboard/AIEmployeeSettingsActions',
      );

      await saveAIEmployeeSettings('ar', new FormData());

      const orgValues = extractOrgValues([
        ...mockDbWhere.mock.calls,
        ...mockDbUpdateWhere.mock.calls,
      ]);

      expect(orgValues).toContain('org_store_a');
      expect(orgValues).not.toContain('org_store_b');
    });

    it('writes AI settings for Store B only when authenticated as Store B', async () => {
      mockAuth.mockResolvedValue({ orgId: 'org_store_b', userId: 'user_2' });
      mockDbLimit.mockResolvedValueOnce([{ metadata: {} }]);
      const { saveAIEmployeeSettings } = await import(
        '@/features/dashboard/AIEmployeeSettingsActions',
      );

      await saveAIEmployeeSettings('ar', new FormData());

      const orgValues = extractOrgValues([
        ...mockDbWhere.mock.calls,
        ...mockDbUpdateWhere.mock.calls,
      ]);

      expect(orgValues).toContain('org_store_b');
      expect(orgValues).not.toContain('org_store_a');
    });
  });
});
