import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── DB mock (OperationalDataRetention uses db.transaction) ───────────────────
const mockTransaction = vi.fn();

vi.mock('@/libs/DB', () => ({
  db: { transaction: mockTransaction },
}));

vi.mock('@/models/Schema', () => ({
  aiInboundJobsTable: { id: 'aiJobId', status: 'aiJobStatus', updatedAt: 'aiJobUpdatedAt' },
  publicEndpointRateLimitsTable: { expiresAt: 'expiresAt', id: 'id' },
  webhookEventsTable: { id: 'id', status: 'status', updatedAt: 'updatedAt' },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...c: unknown[]) => ({ conditions: c, type: 'and' })),
  inArray: vi.fn((f: unknown, v: unknown) => ({ field: f, type: 'inArray', value: v })),
  lt: vi.fn((f: unknown, v: unknown) => ({ field: f, type: 'lt', value: v })),
}));

// ─── AI mock (guard pipeline semantic reviewer) ───────────────────────────────
const mockGeneratePlatformAIText = vi.fn();

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

const makeTx = (
  rateLimitsDeleted: Array<{ id: number }>,
  finishedAiInboundJobsDeleted: Array<{ id: number }>,
  deadAiInboundJobsDeleted: Array<{ id: number }>,
  finishedWebhooksDeleted: Array<{ id: number }>,
  failedWebhooksDeleted: Array<{ id: number }>,
) => {
  let deleteCallIndex = 0;
  const deletedBatches = [
    rateLimitsDeleted,
    finishedAiInboundJobsDeleted,
    deadAiInboundJobsDeleted,
    finishedWebhooksDeleted,
    failedWebhooksDeleted,
  ];

  return {
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(async () => deletedBatches[deleteCallIndex++]),
      })),
    })),
  };
};

// Minimal catalog for guard pipeline tests
const guardBaseParams = {
  cartMutation: { cartActive: false, type: 'none' as const },
  catalogProducts: [
    { availability: 'available' as const, category: 'Meals', id: 1, name: 'Kabsa Chicken', price: '28.00' },
  ],
  customerMessage: 'Hello.',
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

describe('Reliability matrix — DB cleanup and AI failure modes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Operational data retention ─────────────────────────────────────────────

  describe('cleanupExpiredOperationalData DB operations', () => {
    it('returns zero counts when nothing has expired', async () => {
      const { cleanupExpiredOperationalData } = await import('./OperationalDataRetention');
      const tx = makeTx([], [], [], [], []);
      mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

      const result = await cleanupExpiredOperationalData(new Date('2026-01-01T12:00:00Z'));

      expect(result).toEqual({
        deadAiInboundJobsDeleted: 0,
        failedWebhooksDeleted: 0,
        finishedAiInboundJobsDeleted: 0,
        finishedWebhooksDeleted: 0,
        rateLimitsDeleted: 0,
      });
    });

    it('returns correct counts when rows are deleted across all three buckets', async () => {
      const { cleanupExpiredOperationalData } = await import('./OperationalDataRetention');
      const tx = makeTx(
        [{ id: 10 }, { id: 11 }],
        [{ id: 15 }],
        [{ id: 16 }, { id: 17 }],
        [{ id: 20 }, { id: 21 }, { id: 22 }],
        [{ id: 30 }],
      );
      mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

      const result = await cleanupExpiredOperationalData(new Date('2026-06-17T12:00:00Z'));

      expect(result).toEqual({
        deadAiInboundJobsDeleted: 2,
        failedWebhooksDeleted: 1,
        finishedAiInboundJobsDeleted: 1,
        finishedWebhooksDeleted: 3,
        rateLimitsDeleted: 2,
      });
    });

    it('runs all three deletes inside a single transaction', async () => {
      const { cleanupExpiredOperationalData } = await import('./OperationalDataRetention');
      const tx = makeTx([], [], [], [], []);
      mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

      await cleanupExpiredOperationalData(new Date('2026-06-17T12:00:00Z'));

      expect(mockTransaction).toHaveBeenCalledTimes(1);
      expect(tx.delete).toHaveBeenCalledTimes(5);
    });

    it('propagates a DB transaction failure without swallowing it', async () => {
      const { cleanupExpiredOperationalData } = await import('./OperationalDataRetention');
      const dbError = new Error('DB connection lost during cleanup');
      mockTransaction.mockRejectedValue(dbError);

      await expect(cleanupExpiredOperationalData()).rejects.toThrow('DB connection lost during cleanup');
    });

    it('uses a reference timestamp so cutoffs are deterministic', async () => {
      const { cleanupExpiredOperationalData, OPERATIONAL_RETENTION } = await import('./OperationalDataRetention');
      const { lt } = await import('drizzle-orm');
      const tx = makeTx([], [], [], [], []);
      mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(tx));

      const now = new Date('2026-06-17T00:00:00.000Z');
      await cleanupExpiredOperationalData(now);

      const ltCalls = (lt as ReturnType<typeof vi.fn>).mock.calls;
      const rateLimitCutoff = ltCalls[0]?.[1] as Date;
      const expectedRateLimitCutoff = new Date(
        now.getTime() - OPERATIONAL_RETENTION.rateLimitGraceDays * 24 * 60 * 60 * 1000,
      );

      expect(rateLimitCutoff?.toISOString()).toBe(expectedRateLimitCutoff.toISOString());
    });
  });

  // ─── AI semantic reviewer failure injection ──────────────────────────────────

  describe('guard pipeline AI reviewer failure modes', () => {
    it('fails open when the AI semantic reviewer throws a timeout error', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');
      mockGeneratePlatformAIText.mockRejectedValue(
        new DOMException('The operation timed out', 'TimeoutError'),
      );

      const result = await guardModelReplyAgainstFalseActions({
        ...guardBaseParams,
        reply: 'Welcome! How can I help you today?',
      });

      // Deterministic checks (price, action) pass; unavailable semantic review
      // does not block a safe reply — fail-open is the intended behaviour
      expect(result.guarded).toBe(false);

      const semanticCheck = result.checks.find(c => c.mode === 'semantic_review');

      expect(semanticCheck?.result).toBe('unavailable');
    });

    it('fails open when the AI semantic reviewer returns unparseable JSON', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');
      mockGeneratePlatformAIText.mockResolvedValue('not-valid-json!!');

      const result = await guardModelReplyAgainstFalseActions({
        ...guardBaseParams,
        reply: 'How can I assist you today?',
      });

      expect(result.guarded).toBe(false);

      const semanticCheck = result.checks.find(c => c.mode === 'semantic_review');

      expect(semanticCheck?.result).toBe('unavailable');
    });

    it('still blocks deterministic price violations even when the AI reviewer is down', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');
      mockGeneratePlatformAIText.mockRejectedValue(new Error('Provider unreachable'));

      const result = await guardModelReplyAgainstFalseActions({
        ...guardBaseParams,
        reply: 'Kabsa Chicken 99.00 SAR — special deal just for you!',
      });

      // Price check is deterministic and does not depend on the AI reviewer
      expect(result.guarded).toBe(true);
      expect(result.reason).toContain('unsupported_price:99.00');
    });

    it('still blocks unproven order creation even when the AI reviewer is down', async () => {
      const { guardModelReplyAgainstFalseActions } = await import('./AIEmployeeReplyGuardPipeline');
      mockGeneratePlatformAIText.mockRejectedValue(new Error('Provider unreachable'));

      const result = await guardModelReplyAgainstFalseActions({
        ...guardBaseParams,
        orderModification: { created: false },
        reply: 'Your order has been submitted and is being prepared.',
      });

      expect(result.guarded).toBe(true);
      expect(result.reason).toBe('unproven_action:order_created');
    });
  });
});
