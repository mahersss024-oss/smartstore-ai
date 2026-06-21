import { beforeEach, describe, expect, it, vi } from 'vitest';
import { aiInboundJobsTable } from '@/models/Schema';
import {
  AI_INBOUND_JOB_MAX_ATTEMPTS,
  claimAiInboundJob,
  completeAiInboundJob,
  enqueueAiInboundJob,
  failAiInboundJob,
  renewAiInboundJobLease,
} from './AIInboundJobQueue';

const mocks = vi.hoisted(() => {
  const mockInsertReturning = vi.fn();
  const mockOnConflictDoNothing = vi.fn(() => ({ returning: mockInsertReturning }));
  const mockInsertValues = vi.fn(() => ({ onConflictDoNothing: mockOnConflictDoNothing }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

  const mockSelectLimit = vi.fn();
  const mockSelectWhere = vi.fn(() => ({ limit: mockSelectLimit }));
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));

  const mockUpdateReturning = vi.fn();
  const mockUpdateWhere = vi.fn(() => ({ returning: mockUpdateReturning }));
  const mockUpdateSet = vi.fn(() => ({ where: mockUpdateWhere }));
  const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));

  return {
    mockInsert,
    mockOnConflictDoNothing,
    mockInsertReturning,
    mockSelect,
    mockSelectLimit,
    mockUpdate,
    mockUpdateReturning,
    mockUpdateSet,
  };
});

vi.mock('./DB', () => ({
  db: {
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
  },
}));

const enqueueInput = {
  channel: 'whatsapp' as const,
  dedupeKey: 'SM123',
  externalThreadId: 'twa:1:2',
  organizationId: 'org_1',
  payload: { body: 'hi' },
};

describe('AIInboundJobQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockUpdateReturning.mockResolvedValue([{ id: 7 }]);
  });

  it('enqueues a new job and reports it was created', async () => {
    mocks.mockInsertReturning.mockResolvedValueOnce([{ id: 7 }]);

    await expect(enqueueAiInboundJob(enqueueInput)).resolves.toEqual({
      enqueued: true,
      jobId: 7,
    });
    expect(mocks.mockSelect).not.toHaveBeenCalled();
    expect(mocks.mockOnConflictDoNothing).toHaveBeenCalledWith({
      target: [
        aiInboundJobsTable.organizationId,
        aiInboundJobsTable.channel,
        aiInboundJobsTable.dedupeKey,
      ],
    });
  });

  it('is idempotent: a redelivered message resolves to the existing job', async () => {
    mocks.mockInsertReturning.mockResolvedValueOnce([]);
    mocks.mockSelectLimit.mockResolvedValueOnce([{ id: 7 }]);

    await expect(enqueueAiInboundJob(enqueueInput)).resolves.toEqual({
      enqueued: false,
      jobId: 7,
    });
  });

  it('throws if neither insert nor lookup yields a job row', async () => {
    mocks.mockInsertReturning.mockResolvedValueOnce([]);
    mocks.mockSelectLimit.mockResolvedValueOnce([]);

    await expect(enqueueAiInboundJob(enqueueInput)).rejects.toThrow();
  });

  it('claims a claimable job and marks it processing', async () => {
    mocks.mockUpdateReturning.mockResolvedValueOnce([{ attempts: 1, id: 7, status: 'processing' }]);

    const claimed = await claimAiInboundJob({ jobId: 7, now: new Date('2026-06-21T00:00:00Z') });

    expect(claimed).toMatchObject({ id: 7, status: 'processing' });
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: 'processing',
    }));
  });

  it('returns null when a job is not claimable (already taken or terminal)', async () => {
    mocks.mockUpdateReturning.mockResolvedValueOnce([]);

    await expect(claimAiInboundJob({ jobId: 7 })).resolves.toBeNull();
  });

  it('completes a job by marking it done and releasing the lease', async () => {
    await expect(completeAiInboundJob({
      jobId: 7,
      leaseToken: 'lease-1',
      now: new Date('2026-06-21T00:00:00Z'),
    })).resolves.toBe(true);

    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      lockedUntil: null,
      status: 'done',
    }));
  });

  it('returns a failed job to a retryable state with backoff below the ceiling', async () => {
    const result = await failAiInboundJob({
      attempts: 1,
      error: new Error('provider timeout'),
      jobId: 7,
      leaseToken: 'lease-1',
      now: new Date('2026-06-21T00:00:00Z'),
    });

    expect(result).toEqual({ status: 'failed', updated: true });

    const setCalls = mocks.mockUpdateSet.mock.calls as unknown as Array<[{
      lastError: string;
      nextAttemptAt: Date | null;
      status: string;
    }]>;
    const setArg = setCalls.at(-1)?.[0];

    expect(setArg?.status).toBe('failed');
    expect(setArg?.lastError).toBe('provider timeout');
    expect(setArg?.nextAttemptAt).toBeInstanceOf(Date);
  });

  it('dead-letters a job once the attempt ceiling is reached', async () => {
    const result = await failAiInboundJob({
      attempts: AI_INBOUND_JOB_MAX_ATTEMPTS,
      error: new Error('still failing'),
      jobId: 7,
      leaseToken: 'lease-1',
      now: new Date('2026-06-21T00:00:00Z'),
    });

    expect(result).toEqual({ status: 'dead', updated: true });

    const setCalls = mocks.mockUpdateSet.mock.calls as unknown as Array<[{
      nextAttemptAt: Date | null;
      status: string;
    }]>;
    const setArg = setCalls.at(-1)?.[0];

    expect(setArg?.status).toBe('dead');
    expect(setArg?.nextAttemptAt).toBeNull();
  });

  it('does not let a worker update a job after losing its lease', async () => {
    mocks.mockUpdateReturning.mockResolvedValueOnce([]);

    await expect(completeAiInboundJob({
      jobId: 7,
      leaseToken: 'expired-lease',
    })).resolves.toBe(false);
  });

  it('renews a lease only for the worker that still owns it', async () => {
    await expect(renewAiInboundJobLease({
      jobId: 7,
      leaseToken: 'lease-1',
      now: new Date('2026-06-21T00:00:00Z'),
    })).resolves.toBe(true);

    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      lockedUntil: expect.any(Date),
    }));
  });
});
