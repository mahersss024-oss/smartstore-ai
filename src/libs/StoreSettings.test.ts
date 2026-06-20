import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const limit = vi.fn();
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const values = vi.fn();
  const insert = vi.fn(() => ({ values }));

  return {
    insert,
    limit,
    select,
    values,
  };
});

vi.mock('./DB', () => ({
  db: {
    insert: mocks.insert,
    select: mocks.select,
  },
}));

vi.mock('@/models/Schema', () => ({
  storeSettingsTable: {
    id: 'id',
    organizationId: 'organizationId',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
}));

describe('ensureStoreSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not create duplicate settings', async () => {
    mocks.limit.mockResolvedValueOnce([{ id: 1 }]);
    const { ensureStoreSettings } = await import('./StoreSettings');

    await ensureStoreSettings('org_1');

    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('creates default settings for a new organization', async () => {
    mocks.limit.mockResolvedValueOnce([]);
    const { ensureStoreSettings } = await import('./StoreSettings');

    await ensureStoreSettings('org_1');

    expect(mocks.values).toHaveBeenCalledWith({
      currency: 'SAR',
      metadata: {
        platform: { status: 'active' },
        subscription: {
          plan: 'free',
          status: 'active',
        },
      },
      organizationId: 'org_1',
      timezone: 'Asia/Riyadh',
    });
  });
});
