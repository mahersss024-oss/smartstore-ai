import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.fn();
const mockDbSelectLimit = vi.fn();
const mockDbSelectWhere = vi.fn(() => ({ limit: mockDbSelectLimit }));
const mockDbSelectFrom = vi.fn(() => ({ where: mockDbSelectWhere }));
const mockDbSelect = vi.fn(() => ({ from: mockDbSelectFrom }));
const mockDbUpdateWhere = vi.fn();
const mockDbUpdateSet = vi.fn(() => ({ where: mockDbUpdateWhere }));
const mockDbUpdate = vi.fn(() => ({ set: mockDbUpdateSet }));
const mockRevalidatePath = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions, type: 'and' })),
  count: vi.fn((field: unknown) => ({ field, type: 'count' })),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, type: 'eq', value })),
  ne: vi.fn((field: unknown, value: unknown) => ({ field, type: 'ne', value })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}));

vi.mock('@/libs/AIEmployeeSettings', () => ({
  AI_HANDOFF_KEYS: [],
  AI_PERMISSION_KEYS: [],
  normalizeAIEmployeeSettings: vi.fn(() => ({ enabled: false })),
}));

vi.mock('@/libs/DB', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/libs/StoreReadiness', () => ({
  getStoreReadiness: vi.fn(),
}));

vi.mock('@/libs/StoreServiceControls', () => ({
  assertStoreFeatureEnabled: vi.fn(),
}));

vi.mock('@/models/Schema', () => ({
  deliveryMethodsTable: { id: 'deliveryId', isActive: 'deliveryActive', organizationId: 'deliveryOrg' },
  paymentMethodsTable: {
    id: 'paymentId',
    isActive: 'paymentActive',
    organizationId: 'paymentOrg',
    provider: 'paymentProvider',
  },
  productsTable: { id: 'productId', isActive: 'productActive', organizationId: 'productOrg' },
  storeSettingsTable: {
    currency: 'currency',
    metadata: 'metadata',
    organizationId: 'organizationId',
    storeDescription: 'storeDescription',
    storeName: 'storeName',
    timezone: 'timezone',
    welcomeMessage: 'welcomeMessage',
  },
}));

vi.mock('@/utils/Helpers', () => ({
  getI18nPath: vi.fn((path: string) => path),
}));

describe('AIEmployeeSettingsActions tenant authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ orgId: 'org_a' });
    mockDbSelectLimit.mockResolvedValue([{ metadata: {} }]);
  });

  it('fails closed before database access without an active organization', async () => {
    mockAuth.mockResolvedValueOnce({ orgId: null });
    const { saveAIEmployeeSettings } = await import('./AIEmployeeSettingsActions');

    await expect(saveAIEmployeeSettings('ar', new FormData()))
      .rejects
      .toThrow('No active organization selected');

    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('scopes settings reads and writes to the active organization', async () => {
    const { saveAIEmployeeSettings } = await import('./AIEmployeeSettingsActions');

    await saveAIEmployeeSettings('ar', new FormData());

    expect(mockDbSelectWhere).toHaveBeenCalledWith(expect.objectContaining({
      field: 'organizationId',
      type: 'eq',
      value: 'org_a',
    }));
    expect(mockDbUpdateWhere).toHaveBeenCalledWith(expect.objectContaining({
      field: 'organizationId',
      type: 'eq',
      value: 'org_a',
    }));
  });

  it('revalidates dashboard paths after saving AI settings', async () => {
    const { saveAIEmployeeSettings } = await import('./AIEmployeeSettingsActions');

    await saveAIEmployeeSettings('ar', new FormData());

    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/ai-operations');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/launch-readiness');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard');
  });

  it('checks store readiness before enabling the AI feature and redirects when not ready', async () => {
    const { assertStoreFeatureEnabled } = await import('@/libs/StoreServiceControls');
    const { getStoreReadiness } = await import('@/libs/StoreReadiness');
    const { normalizeAIEmployeeSettings } = await import('@/libs/AIEmployeeSettings');
    const { redirect } = await import('next/navigation');
    const { saveAIEmployeeSettings } = await import('./AIEmployeeSettingsActions');

    vi.mocked(normalizeAIEmployeeSettings).mockReturnValueOnce({ enabled: true } as never);
    const makeCountResult = (n: number) => ({
      limit: mockDbSelectLimit,
      then: (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) =>
        Promise.resolve([{ count: n }]).then(resolve, reject),
    });
    mockDbSelectWhere
      .mockReturnValueOnce({ limit: mockDbSelectLimit.mockResolvedValueOnce([{ currency: 'SAR', metadata: {}, storeName: 'Test', timezone: 'Asia/Riyadh', welcomeMessage: 'Hi', storeDescription: '' }]) })
      .mockReturnValueOnce(makeCountResult(0))
      .mockReturnValueOnce(makeCountResult(0))
      .mockReturnValueOnce(makeCountResult(0));
    vi.mocked(getStoreReadiness).mockReturnValueOnce({ issues: ['no_products'], status: 'not_ready' } as never);

    await saveAIEmployeeSettings('ar', new FormData());

    expect(assertStoreFeatureEnabled).toHaveBeenCalledWith('org_a', 'ai');
    expect(redirect).toHaveBeenCalledWith('/dashboard/ai-operations?aiSettingsError=readiness');
  });

  it('saves AI settings when the store is ready and the AI feature is enabled', async () => {
    const { getStoreReadiness } = await import('@/libs/StoreReadiness');
    const { normalizeAIEmployeeSettings } = await import('@/libs/AIEmployeeSettings');
    const { saveAIEmployeeSettings } = await import('./AIEmployeeSettingsActions');

    vi.mocked(normalizeAIEmployeeSettings).mockReturnValueOnce({ enabled: true, displayName: 'Assistant' } as never);
    const makeCountResult = (n: number) => ({
      limit: mockDbSelectLimit,
      then: (resolve: (v: unknown) => unknown, reject?: (r: unknown) => unknown) =>
        Promise.resolve([{ count: n }]).then(resolve, reject),
    });
    mockDbSelectWhere
      .mockReturnValueOnce({ limit: mockDbSelectLimit.mockResolvedValueOnce([{ currency: 'SAR', metadata: {}, storeName: 'Ready Store', timezone: 'Asia/Riyadh', welcomeMessage: 'Hi', storeDescription: 'desc' }]) })
      .mockReturnValueOnce(makeCountResult(5))
      .mockReturnValueOnce(makeCountResult(2))
      .mockReturnValueOnce(makeCountResult(3));
    vi.mocked(getStoreReadiness).mockReturnValueOnce({ issues: [], status: 'ready' } as never);

    await saveAIEmployeeSettings('ar', new FormData());

    expect(mockDbUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        aiEmployee: expect.objectContaining({ enabled: true }),
      }),
    }));
  });
});
