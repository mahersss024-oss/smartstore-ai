import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.fn();
const mockDbSelectLimit = vi.fn();
const mockDbSelectWhere = vi.fn(() => ({ limit: mockDbSelectLimit }));
const mockDbSelectFrom = vi.fn(() => ({ where: mockDbSelectWhere }));
const mockDbSelect = vi.fn(() => ({ from: mockDbSelectFrom }));
const mockDbUpdateWhere = vi.fn();
const mockDbUpdateSet = vi.fn(() => ({ where: mockDbUpdateWhere }));
const mockDbUpdate = vi.fn(() => ({ set: mockDbUpdateSet }));
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

vi.mock('@/libs/AISimulation', () => ({
  simulateAIEmployeeReply: vi.fn(() => ({
    missingDetails: [],
    recommendedProducts: [],
    reply: 'reply',
  })),
}));

vi.mock('@/libs/DB', () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/libs/StoreAIContext', () => ({
  loadStoreAIContext: mockLoadStoreAIContext,
}));

vi.mock('@/libs/StoreServiceControls', () => ({
  assertStoreFeatureEnabled: vi.fn(),
}));

vi.mock('@/models/Schema', () => ({
  storeSettingsTable: {
    metadata: 'metadata',
    organizationId: 'organizationId',
  },
}));

vi.mock('@/utils/Helpers', () => ({
  getI18nPath: vi.fn((path: string) => path),
}));

describe('AISimulationActions tenant authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ orgId: 'org_a' });
    mockDbSelectLimit.mockResolvedValue([{ metadata: {} }]);
    mockLoadStoreAIContext.mockResolvedValue({});
  });

  it('fails closed before loading store context without an active organization', async () => {
    mockAuth.mockResolvedValueOnce({ orgId: null });
    const { runAIEmployeeSimulation } = await import('./AISimulationActions');
    const formData = new FormData();

    formData.set('simulationMessage', 'hello');

    await expect(runAIEmployeeSimulation('en', formData))
      .rejects
      .toThrow('No active organization selected');

    expect(mockLoadStoreAIContext).not.toHaveBeenCalled();
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it('loads, reads, and writes only the active organization', async () => {
    const { runAIEmployeeSimulation } = await import('./AISimulationActions');
    const formData = new FormData();

    formData.set('simulationMessage', 'hello');
    await runAIEmployeeSimulation('en', formData);

    expect(mockLoadStoreAIContext).toHaveBeenCalledWith({ organizationId: 'org_a' });
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

  it('calls redirect with the empty-simulation error path when the message is blank', async () => {
    const { redirect } = await import('next/navigation');
    const { runAIEmployeeSimulation } = await import('./AISimulationActions');

    await runAIEmployeeSimulation('en', new FormData());

    expect(redirect).toHaveBeenCalledWith('/dashboard/ai-operations?simulation=empty');
  });

  it('saves the simulation result including recommended products under the active store', async () => {
    const { simulateAIEmployeeReply } = await import('@/libs/AISimulation');
    const { runAIEmployeeSimulation } = await import('./AISimulationActions');

    vi.mocked(simulateAIEmployeeReply).mockReturnValueOnce({
      missingDetails: ['delivery_method'],
      recommendedProducts: [
        { category: 'Meals', id: 1, image: null, name: 'Kabsa', price: '28.00' },
      ],
      reply: 'We recommend Kabsa.',
    } as never);

    const formData = new FormData();
    formData.set('simulationMessage', 'What do you sell?');
    await runAIEmployeeSimulation('en', formData);

    expect(mockDbUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        aiSimulation: expect.objectContaining({
          lastResult: expect.objectContaining({
            message: 'What do you sell?',
            missingDetails: ['delivery_method'],
            recommendedProducts: [expect.objectContaining({ id: 1, name: 'Kabsa' })],
            reply: 'We recommend Kabsa.',
          }),
        }),
      }),
    }));
  });
});
