import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  dispatchAndRecordAiInboundJob: vi.fn(),
  findDispatchableAiInboundJobs: vi.fn(),
  reapStuckAiInboundJobs: vi.fn(),
  getPlatformRuntimeConfig: vi.fn(),
  secureTokenEquals: vi.fn(),
}));

const mockEnv = vi.hoisted(() => ({
  AI_PROCESSING_MODE: 'outbox' as 'outbox' | 'sync',
}));

vi.mock('@/libs/Env', () => ({ Env: mockEnv }));
vi.mock('@/libs/AIInboundJobDispatch', () => ({
  dispatchAndRecordAiInboundJob: mocks.dispatchAndRecordAiInboundJob,
}));
vi.mock('@/libs/AIInboundJobQueue', () => ({
  findDispatchableAiInboundJobs: mocks.findDispatchableAiInboundJobs,
  reapStuckAiInboundJobs: mocks.reapStuckAiInboundJobs,
}));
vi.mock('@/libs/PlatformRuntimeConfig', () => ({
  getPlatformRuntimeConfig: mocks.getPlatformRuntimeConfig,
}));
vi.mock('@/libs/SecureTokens', () => ({
  secureTokenEquals: mocks.secureTokenEquals,
}));

const buildRequest = () => new Request(
  'https://www.smartstore-ai.com/api/maintenance/ai-inbound-jobs',
  {
    headers: {
      authorization: 'Bearer maintenance-secret',
    },
    method: 'POST',
  },
);

describe('AI inbound job sweeper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.AI_PROCESSING_MODE = 'outbox';
    mocks.getPlatformRuntimeConfig.mockResolvedValue({
      internal: { maintenanceSecret: 'maintenance-secret' },
    });
    mocks.secureTokenEquals.mockReturnValue(true);
    mocks.findDispatchableAiInboundJobs.mockResolvedValue([{ id: 7 }, { id: 8 }]);
    mocks.reapStuckAiInboundJobs.mockResolvedValue(0);
    mocks.dispatchAndRecordAiInboundJob
      .mockResolvedValueOnce({ dispatched: true })
      .mockResolvedValueOnce({ dispatched: false });
  });

  it('rejects an invalid maintenance credential', async () => {
    mocks.secureTokenEquals.mockReturnValue(false);
    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
    expect(mocks.findDispatchableAiInboundJobs).not.toHaveBeenCalled();
  });

  it('re-dispatches due jobs and reports failures', async () => {
    mocks.reapStuckAiInboundJobs.mockResolvedValue(3);
    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      dispatched: 1,
      failed: 1,
      reaped: 3,
      scanned: 2,
      skipped: false,
    });
    expect(mocks.reapStuckAiInboundJobs).toHaveBeenCalledTimes(1);
  });

  it('does not dispatch while synchronous processing is active', async () => {
    mockEnv.AI_PROCESSING_MODE = 'sync';
    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(await response.json()).toMatchObject({
      dispatched: 0,
      skipped: true,
    });
    expect(mocks.findDispatchableAiInboundJobs).not.toHaveBeenCalled();
  });
});
