import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.fn();
const mockRedirect = vi.fn((path: string) => {
  throw new Error(`redirect:${path}`);
});
const mockRevalidatePath = vi.fn();
const mockDbSelectLimit = vi.fn();
const mockDbSelectWhere = vi.fn(() => ({ limit: mockDbSelectLimit }));
const mockDbSelectFrom = vi.fn(() => ({ where: mockDbSelectWhere }));
const mockDbSelect = vi.fn(() => ({ from: mockDbSelectFrom }));
const mockDbUpdateWhere = vi.fn();
const mockDbUpdateSet = vi.fn(() => ({ where: mockDbUpdateWhere }));
const mockDbUpdate = vi.fn(() => ({ set: mockDbUpdateSet }));
const mockTxSelectLimit = vi.fn();
const mockTxSelectWhere = vi.fn();
const mockTxSelectFrom = vi.fn(() => ({ where: mockTxSelectWhere }));
const mockTxSelect = vi.fn(() => ({ from: mockTxSelectFrom }));
const mockTxDeleteWhere = vi.fn();
const mockTxDelete = vi.fn(() => ({ where: mockTxDeleteWhere }));
const mockDbTransaction = vi.fn(async (callback: (tx: unknown) => Promise<void>) => {
  await callback({
    delete: mockTxDelete,
    select: mockTxSelect,
  });
});

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions, type: 'and' })),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, type: 'eq', value })),
  inArray: vi.fn((field: unknown, values: unknown[]) => ({
    field,
    type: 'inArray',
    values,
  })),
  or: vi.fn((...conditions: unknown[]) => ({ conditions, type: 'or' })),
}));

vi.mock('@/libs/DB', () => ({
  db: {
    select: mockDbSelect,
    transaction: mockDbTransaction,
    update: mockDbUpdate,
  },
}));

vi.mock('@/models/Schema', () => ({
  aiActionLogsTable: {
    conversationId: 'conversationId',
    orderId: 'orderId',
    organizationId: 'organizationId',
  },
  conversationMessagesTable: {
    conversationId: 'conversationId',
    organizationId: 'organizationId',
  },
  conversationsTable: {
    customerId: 'customerId',
    id: 'conversationId',
    organizationId: 'organizationId',
  },
  customerReviewsTable: {
    customerId: 'customerId',
    orderId: 'orderId',
    organizationId: 'organizationId',
  },
  customersTable: {
    email: 'email',
    id: 'customerId',
    organizationId: 'organizationId',
    phone: 'phone',
    sourceChannel: 'sourceChannel',
  },
  invoicesTable: {
    orderId: 'orderId',
    organizationId: 'organizationId',
  },
  orderEventsTable: {
    orderId: 'orderId',
    organizationId: 'organizationId',
  },
  ordersTable: {
    customerEmail: 'customerEmail',
    customerPhone: 'customerPhone',
    id: 'orderId',
    organizationId: 'organizationId',
    source: 'source',
  },
}));

vi.mock('@/utils/Helpers', () => ({
  getI18nPath: vi.fn((path: string) => path),
}));

describe('CustomerActions', () => {
  const expectConditionScopesCustomerToActiveStore = (condition: unknown, customerId: number) => {
    expect(condition).toMatchObject({
      conditions: expect.arrayContaining([
        expect.objectContaining({
          field: 'customerId',
          type: 'eq',
          value: customerId,
        }),
        expect.objectContaining({
          field: 'organizationId',
          type: 'eq',
          value: 'org_1',
        }),
      ]),
      type: 'and',
    });
  };
  const getLastCondition = (mock: { mock: { calls: unknown[][] } }) => {
    return mock.mock.calls.at(-1)?.[0];
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockTxSelectLimit.mockReset();
    mockTxSelectWhere.mockReset();
    mockAuth.mockResolvedValue({ orgId: 'org_1', userId: 'user_1' });
    const selectResults = [
      [{ id: 55 }, { id: 56 }],
    ];

    mockTxSelectWhere.mockImplementation(() => {
      const value = selectResults.shift() ?? [];

      return {
        limit: mockTxSelectLimit.mockImplementationOnce(async () => value),
        then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) => {
          return Promise.resolve(value).then(resolve, reject);
        },
      };
    });
  });

  it('archives customer records only inside the active store', async () => {
    const { archiveCustomerRecord } = await import('./CustomerActions');

    mockDbSelectLimit.mockResolvedValueOnce([{
      metadata: {
        lifetimeValue: '100',
      },
    }]);

    await expect(archiveCustomerRecord('ar', 123))
      .rejects
      .toThrow('redirect:/dashboard/customers');

    expect(mockDbUpdateSet).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        archivedAt: expect.any(String),
        archivedBy: 'user_1',
        lifetimeValue: '100',
      }),
    });

    expectConditionScopesCustomerToActiveStore(getLastCondition(mockDbSelectWhere), 123);
    expectConditionScopesCustomerToActiveStore(getLastCondition(mockDbUpdateWhere), 123);
  });

  it('restores archived customer records without leaking archive metadata', async () => {
    const { restoreCustomerRecord } = await import('./CustomerActions');

    mockDbSelectLimit.mockResolvedValueOnce([{
      metadata: {
        archivedAt: '2026-06-14T01:00:00.000Z',
        archivedBy: 'user_1',
        preferredName: 'Maher',
      },
    }]);

    await restoreCustomerRecord('ar', 123);

    expect(mockDbUpdateSet).toHaveBeenCalledWith({
      metadata: {
        preferredName: 'Maher',
      },
    });

    expectConditionScopesCustomerToActiveStore(getLastCondition(mockDbSelectWhere), 123);
    expectConditionScopesCustomerToActiveStore(getLastCondition(mockDbUpdateWhere), 123);

    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/customers');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/customers/123');
  });

  it('deletes customer conversations, messages, AI logs, reviews, and the customer record', async () => {
    const { deleteCustomerRecord } = await import('./CustomerActions');

    await expect(deleteCustomerRecord('ar', 123)).rejects.toThrow('redirect:/dashboard/customers');

    expect(mockTxDelete).toHaveBeenCalledTimes(7);
    expect(mockTxDeleteWhere).toHaveBeenCalledTimes(7);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/customers');
  });

  it('does not hard-delete orders by matching customer phone or email heuristics', async () => {
    const { deleteCustomerRecord } = await import('./CustomerActions');

    await expect(deleteCustomerRecord('ar', 123)).rejects.toThrow('redirect:/dashboard/customers');

    const deletedTables = (mockTxDelete.mock.calls as unknown[][]).map(call => call[0]);

    expect(deletedTables).not.toContainEqual(expect.objectContaining({
      customerPhone: 'customerPhone',
      id: 'orderId',
    }));
  });

  it('allows only the active store to permanently delete one customer conversation', async () => {
    const { deleteCustomerConversation } = await import('./CustomerActions');

    await deleteCustomerConversation('ar', 123, 55);

    expect(mockAuth).toHaveBeenCalledTimes(1);
    expect(mockDbTransaction).toHaveBeenCalledTimes(1);
    expect(mockTxDelete).toHaveBeenCalledTimes(3);
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/customers/123');

    const conditions = [
      ...mockTxSelectWhere.mock.calls,
      ...mockTxDeleteWhere.mock.calls,
    ].map(([condition]) => condition);

    expect(conditions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conditions: expect.arrayContaining([
          expect.objectContaining({
            field: 'organizationId',
            type: 'eq',
            value: 'org_1',
          }),
          expect.objectContaining({
            field: 'customerId',
            type: 'eq',
            value: 123,
          }),
          expect.objectContaining({
            field: 'conversationId',
            type: 'eq',
            value: 55,
          }),
        ]),
        type: 'and',
      }),
    ]));
  });

  it('rejects permanent conversation deletion without an active store', async () => {
    mockAuth.mockResolvedValueOnce({ orgId: null, userId: 'user_1' });
    const { deleteCustomerConversation } = await import('./CustomerActions');

    await expect(deleteCustomerConversation('ar', 123, 55))
      .rejects
      .toThrow('No active organization selected');

    expect(mockDbTransaction).not.toHaveBeenCalled();
  });

  it('rejects deleteCustomerConversation with non-integer IDs', async () => {
    const { deleteCustomerConversation } = await import('./CustomerActions');

    await expect(deleteCustomerConversation('ar', 1.5, 55))
      .rejects
      .toThrow('Invalid conversation deletion target');
    await expect(deleteCustomerConversation('ar', 123, 5.5))
      .rejects
      .toThrow('Invalid conversation deletion target');
  });

  it('returns early when the conversation is not found in deleteCustomerConversation', async () => {
    const { deleteCustomerConversation } = await import('./CustomerActions');

    mockTxSelectWhere.mockImplementationOnce(() => ({
      limit: vi.fn().mockResolvedValueOnce([]),
    }));

    await deleteCustomerConversation('ar', 123, 99);

    expect(mockTxDelete).not.toHaveBeenCalled();
  });

  it('redirects when archiveCustomerRecord does not find the customer', async () => {
    const { archiveCustomerRecord } = await import('./CustomerActions');

    mockDbSelectLimit.mockResolvedValueOnce([]);

    await expect(archiveCustomerRecord('ar', 999))
      .rejects
      .toThrow('redirect:/dashboard/customers');

    expect(mockDbUpdateSet).not.toHaveBeenCalled();
  });

  it('handles null customer metadata when archiving', async () => {
    const { archiveCustomerRecord } = await import('./CustomerActions');

    mockDbSelectLimit.mockResolvedValueOnce([{ metadata: null }]);

    await expect(archiveCustomerRecord('ar', 123))
      .rejects
      .toThrow('redirect:/dashboard/customers');

    expect(mockDbUpdateSet).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        archivedAt: expect.any(String),
        archivedBy: 'user_1',
      }),
    });
  });

  it('redirects when restoreCustomerRecord does not find the customer', async () => {
    const { restoreCustomerRecord } = await import('./CustomerActions');

    mockDbSelectLimit.mockResolvedValueOnce([]);

    await expect(restoreCustomerRecord('ar', 999))
      .rejects
      .toThrow('redirect:/dashboard/customers');

    expect(mockDbUpdateSet).not.toHaveBeenCalled();
  });

  it('scopes every customer deletion query to the active organization', async () => {
    const { deleteCustomerRecord } = await import('./CustomerActions');

    await expect(deleteCustomerRecord('ar', 123)).rejects.toThrow('redirect:/dashboard/customers');

    const whereCalls = [
      ...mockTxSelectWhere.mock.calls,
      ...mockTxDeleteWhere.mock.calls,
    ];

    expect(whereCalls.length).toBeGreaterThan(0);

    for (const [condition] of whereCalls) {
      expect(condition).toMatchObject({
        conditions: expect.arrayContaining([
          expect.objectContaining({
            field: 'organizationId',
            type: 'eq',
            value: 'org_1',
          }),
        ]),
        type: 'and',
      });
    }
  });
});
