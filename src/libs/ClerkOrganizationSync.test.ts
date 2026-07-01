import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const disableOrganizationWhatsAppConnection = vi.fn();
  const selectRows: unknown[][] = [];
  const selectLimit = vi.fn(async () => selectRows.shift() ?? []);
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const insertReturning = vi.fn();
  const insertOnConflictDoNothing = vi.fn(() => ({
    returning: insertReturning,
  }));
  const insertValues = vi.fn(() => ({
    onConflictDoNothing: insertOnConflictDoNothing,
  }));
  const txUpdateWhere = vi.fn();
  const txUpdateSet = vi.fn(() => ({ where: txUpdateWhere }));
  const txUpdate = vi.fn(() => ({ set: txUpdateSet }));
  const txInsertValues = vi.fn();
  const txInsert = vi.fn(() => ({ values: txInsertValues }));
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<void>) => {
    await callback({
      insert: txInsert,
      update: txUpdate,
    });
  });

  return {
    insertReturning,
    insertValues,
    select,
    selectRows,
    transaction,
    disableOrganizationWhatsAppConnection,
    txInsertValues,
    txUpdateSet,
  };
});

vi.mock('./DB', () => ({
  db: {
    insert: vi.fn(() => ({
      values: mocks.insertValues,
    })),
    select: mocks.select,
    transaction: mocks.transaction,
    update: vi.fn(),
  },
}));

vi.mock('@/libs/WhatsAppConnectionLifecycle', () => ({
  disableOrganizationWhatsAppConnection: mocks.disableOrganizationWhatsAppConnection,
}));

vi.mock('@/models/Schema', () => ({
  platformAdminAuditLogsTable: {},
  storeSettingsTable: {
    id: 'id',
    metadata: 'metadata',
    organizationId: 'organizationId',
    storeName: 'storeName',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
}));

describe('ClerkOrganizationSync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.selectRows.length = 0;
  });

  it('suspends the store and records an audit event when Clerk deletes it', async () => {
    mocks.selectRows.push([{
      metadata: {
        platform: { status: 'active' },
        subscription: { plan: 'pro', status: 'active' },
      },
    }]);
    const { syncOrganizationFromClerk } = await import('./ClerkOrganizationSync');

    await syncOrganizationFromClerk({
      data: { id: 'org_1' },
      type: 'organization.deleted',
    } as never);

    expect(mocks.txUpdateSet).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        platform: expect.objectContaining({
          archivedBy: 'clerk_webhook',
          status: 'suspended',
        }),
        subscription: expect.objectContaining({
          plan: 'pro',
          status: 'suspended',
        }),
      }),
    });
    expect(mocks.txInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      action: 'clerk_organization_deleted',
      organizationId: 'org_1',
    }));
    expect(mocks.disableOrganizationWhatsAppConnection).toHaveBeenCalledWith('org_1');
  });

  it('recovers from concurrent store settings creation without duplicating rows', async () => {
    mocks.selectRows.push(
      [],
      [{
        id: 10,
        metadata: {},
        storeName: 'Existing',
      }],
    );
    mocks.insertReturning.mockResolvedValueOnce([]);
    const { syncOrganizationFromClerk } = await import('./ClerkOrganizationSync');

    await expect(syncOrganizationFromClerk({
      data: {
        id: 'org_1',
        name: 'Store',
      },
      type: 'organization.created',
    } as never)).resolves.toBeUndefined();

    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
  });

  it('returns early without querying the database when the event has no organization id', async () => {
    const { syncOrganizationFromClerk } = await import('./ClerkOrganizationSync');

    await expect(syncOrganizationFromClerk({
      data: {},
      type: 'organization.created',
    } as never)).resolves.toBeUndefined();

    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('returns early when the deleted organization has no existing store settings', async () => {
    mocks.selectRows.push([]);
    const { syncOrganizationFromClerk } = await import('./ClerkOrganizationSync');

    await expect(syncOrganizationFromClerk({
      data: { id: 'org_ghost' },
      type: 'organization.deleted',
    } as never)).resolves.toBeUndefined();

    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('skips insert when store settings already exist for organization.created', async () => {
    mocks.selectRows.push([{ id: 5, metadata: {}, storeName: 'Already There' }]);
    const { syncOrganizationFromClerk } = await import('./ClerkOrganizationSync');

    await expect(syncOrganizationFromClerk({
      data: { id: 'org_2', name: 'Already There' },
      type: 'organization.created',
    } as never)).resolves.toBeUndefined();

    expect(mocks.insertValues).not.toHaveBeenCalled();
  });

  it('creates store settings and returns the newly inserted row when insert succeeds', async () => {
    mocks.selectRows.push([]);
    mocks.insertReturning.mockResolvedValueOnce([{ id: 99, metadata: {}, storeName: 'New Store' }]);
    const { syncOrganizationFromClerk } = await import('./ClerkOrganizationSync');

    await expect(syncOrganizationFromClerk({
      data: { id: 'org_new', name: 'New Store' },
      type: 'organization.created',
    } as never)).resolves.toBeUndefined();

    expect(mocks.insertValues).toHaveBeenCalledTimes(1);
  });
});
