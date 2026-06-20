import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.fn();
const mockDbSelect = vi.fn();
const mockDbUpdate = vi.fn();
const mockDbTransaction = vi.fn();
const mockLoadStoreAIContext = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field: unknown, value: unknown) => ({ field, type: 'eq', value })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('@/libs/AIApprovalQueue', () => ({
  approveLatestPendingApproval: vi.fn(),
  createAIApprovalRequest: vi.fn(),
  normalizeAIApprovalQueue: vi.fn(() => ({ items: [] })),
}));

vi.mock('@/libs/AISetupAssistant', () => ({
  parseAIProductDrafts: vi.fn(() => []),
  productDraftToInsertMetadata: vi.fn(),
}));

vi.mock('@/libs/DB', () => ({
  db: {
    select: mockDbSelect,
    transaction: mockDbTransaction,
    update: mockDbUpdate,
  },
}));

vi.mock('@/libs/StoreAIContext', () => ({
  loadStoreAIContext: mockLoadStoreAIContext,
}));

vi.mock('@/libs/StoreProductCreation', () => ({
  buildStoreProductInsertValues: vi.fn(),
  findStoreProductDuplicate: vi.fn(),
}));

vi.mock('@/libs/StoreServiceControls', () => ({
  assertStoreFeatureEnabled: vi.fn(),
}));

vi.mock('@/libs/SubscriptionEntitlements', () => ({
  assertCanCreateProducts: vi.fn(),
  isSubscriptionFeatureError: vi.fn(() => false),
  isSubscriptionLimitError: vi.fn(() => false),
}));

vi.mock('@/models/Schema', () => ({
  productsTable: {},
  storeSettingsTable: {
    metadata: 'metadata',
    organizationId: 'organizationId',
  },
}));

vi.mock('@/utils/Helpers', () => ({
  getI18nPath: vi.fn((path: string) => path),
}));

describe('AISetupAssistantActions tenant authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ orgId: null });
  });

  it('blocks draft generation before feature, context, or database access', async () => {
    const { generateAIProductDrafts } = await import('./AISetupAssistantActions');
    const formData = new FormData();

    formData.set('productDraftInput', 'product');

    await expect(generateAIProductDrafts('ar', formData))
      .rejects
      .toThrow('No active organization selected');

    expect(mockLoadStoreAIContext).not.toHaveBeenCalled();
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('blocks draft approval before database or transaction access', async () => {
    const { approveAIProductDrafts } = await import('./AISetupAssistantActions');

    await expect(approveAIProductDrafts('ar'))
      .rejects
      .toThrow('No active organization selected');

    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbTransaction).not.toHaveBeenCalled();
  });
});
