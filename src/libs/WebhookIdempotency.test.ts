import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireWebhookProcessingLock,
  runWebhookEventOnce,
  WEBHOOK_PROCESSING_LEASE_MS,
} from './WebhookIdempotency';

const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockOnConflictDoNothing = vi.fn(() => ({ returning: mockReturning }));
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
  const mockDeleteWhere = vi.fn();
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));

  return {
    mockDelete,
    mockDeleteWhere,
    mockInsert,
    mockSelect,
    mockSelectLimit,
    mockUpdate,
    mockUpdateReturning,
    mockUpdateSet,
  };
});

vi.mock('./DB', () => ({
  db: {
    delete: mocks.mockDelete,
    insert: mocks.mockInsert,
    select: mocks.mockSelect,
    update: mocks.mockUpdate,
  },
}));

describe('WebhookIdempotency', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockUpdateReturning.mockResolvedValue([{ id: 12 }]);
  });

  it('processes a new webhook event once and marks it processed', async () => {
    mocks.mockInsert().values().onConflictDoNothing().returning.mockResolvedValueOnce([{ id: 10 }]);
    const handler = vi.fn(async () => 'done');

    await expect(runWebhookEventOnce({
      eventId: 'evt_1',
      eventType: 'checkout.session.completed',
      handler,
      provider: 'stripe',
    })).resolves.toMatchObject({
      duplicate: false,
      result: 'done',
      status: 'processed',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: 'processed',
    }));
  });

  it('skips a webhook event that was already processed', async () => {
    mocks.mockInsert().values().onConflictDoNothing().returning.mockResolvedValueOnce([]);
    mocks.mockSelectLimit.mockResolvedValueOnce([{
      attempts: 1,
      id: 11,
      status: 'processed',
      updatedAt: new Date(),
    }]);
    const handler = vi.fn(async () => 'done');

    await expect(runWebhookEventOnce({
      eventId: 'evt_2',
      eventType: 'invoice.paid',
      handler,
      provider: 'stripe',
    })).resolves.toMatchObject({
      duplicate: true,
      status: 'processed',
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('retries a previously failed webhook event', async () => {
    mocks.mockInsert().values().onConflictDoNothing().returning.mockResolvedValueOnce([]);
    mocks.mockSelectLimit.mockResolvedValueOnce([{
      attempts: 2,
      id: 12,
      status: 'failed',
      updatedAt: new Date(),
    }]);
    const handler = vi.fn(async () => 'retried');

    await expect(runWebhookEventOnce({
      eventId: 'evt_3',
      eventType: 'organization.updated',
      handler,
      provider: 'clerk',
    })).resolves.toMatchObject({
      duplicate: false,
      result: 'retried',
      status: 'processed',
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      attempts: 3,
      status: 'processing',
    }));
  });

  it('does not run a webhook while another worker owns a fresh lease', async () => {
    const now = new Date('2026-06-07T12:00:00.000Z');
    mocks.mockInsert().values().onConflictDoNothing().returning.mockResolvedValueOnce([]);
    mocks.mockSelectLimit.mockResolvedValueOnce([{
      attempts: 1,
      id: 13,
      status: 'processing',
      updatedAt: new Date(now.getTime() - WEBHOOK_PROCESSING_LEASE_MS + 1000),
    }]);
    const handler = vi.fn(async () => 'duplicate');

    await expect(runWebhookEventOnce({
      eventId: 'evt_4',
      eventType: 'invoice.paid',
      handler,
      now,
      provider: 'stripe',
    })).resolves.toMatchObject({
      duplicate: true,
      status: 'in_progress',
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('reclaims and processes a webhook after its processing lease expires', async () => {
    const now = new Date('2026-06-07T12:00:00.000Z');
    mocks.mockInsert().values().onConflictDoNothing().returning.mockResolvedValueOnce([]);
    mocks.mockSelectLimit.mockResolvedValueOnce([{
      attempts: 1,
      id: 14,
      status: 'processing',
      updatedAt: new Date(now.getTime() - WEBHOOK_PROCESSING_LEASE_MS),
    }]);
    mocks.mockUpdateReturning.mockResolvedValueOnce([{ id: 14 }]);
    const handler = vi.fn(async () => 'recovered');

    await expect(runWebhookEventOnce({
      eventId: 'evt_5',
      eventType: 'invoice.paid',
      handler,
      now,
      provider: 'stripe',
    })).resolves.toMatchObject({
      duplicate: false,
      result: 'recovered',
      status: 'processed',
    });

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not process when another worker claims the stale event first', async () => {
    const now = new Date('2026-06-07T12:00:00.000Z');
    mocks.mockInsert().values().onConflictDoNothing().returning.mockResolvedValueOnce([]);
    mocks.mockSelectLimit.mockResolvedValueOnce([{
      attempts: 1,
      id: 15,
      status: 'processing',
      updatedAt: new Date(now.getTime() - WEBHOOK_PROCESSING_LEASE_MS),
    }]);
    mocks.mockUpdateReturning.mockResolvedValueOnce([]);
    const handler = vi.fn(async () => 'duplicate');

    await expect(runWebhookEventOnce({
      eventId: 'evt_6',
      eventType: 'invoice.paid',
      handler,
      now,
      provider: 'stripe',
    })).resolves.toMatchObject({
      duplicate: true,
      status: 'in_progress',
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('acquires and releases a temporary processing lock', async () => {
    mocks.mockInsert().values().onConflictDoNothing().returning.mockResolvedValueOnce([{ id: 20 }]);

    const lock = await acquireWebhookProcessingLock({
      eventId: 'whatsapp:phone:customer',
      eventType: 'whatsapp.thread.processing',
      provider: 'twilio_thread_lock',
    });

    expect(lock).toMatchObject({
      acquired: true,
      status: 'acquired',
    });

    await lock.release();

    expect(mocks.mockDeleteWhere).toHaveBeenCalled();
  });

  it('does not acquire a fresh temporary processing lock owned by another worker', async () => {
    const now = new Date('2026-06-07T12:00:00.000Z');
    mocks.mockInsert().values().onConflictDoNothing().returning.mockResolvedValueOnce([]);
    mocks.mockSelectLimit.mockResolvedValueOnce([{
      attempts: 1,
      id: 21,
      status: 'processing',
      updatedAt: new Date(now.getTime() - WEBHOOK_PROCESSING_LEASE_MS + 1000),
    }]);

    const lock = await acquireWebhookProcessingLock({
      eventId: 'whatsapp:phone:customer',
      eventType: 'whatsapp.thread.processing',
      now,
      provider: 'twilio_thread_lock',
    });

    expect(lock).toMatchObject({
      acquired: false,
      status: 'in_progress',
    });
    expect(mocks.mockUpdateReturning).not.toHaveBeenCalled();
  });

  it('returns in_progress when acquireWebhookProcessingLock races on stale lock claim', async () => {
    const now = new Date('2026-06-07T12:00:00.000Z');
    mocks.mockInsert().values().onConflictDoNothing().returning.mockResolvedValueOnce([]);
    mocks.mockSelectLimit.mockResolvedValueOnce([{
      attempts: 1,
      id: 22,
      status: 'processing',
      updatedAt: new Date(now.getTime() - WEBHOOK_PROCESSING_LEASE_MS),
    }]);
    mocks.mockUpdateReturning.mockResolvedValueOnce([]);

    const lock = await acquireWebhookProcessingLock({
      eventId: 'whatsapp:phone:customer2',
      eventType: 'whatsapp.thread.processing',
      now,
      provider: 'twilio_thread_lock',
    });

    expect(lock).toMatchObject({
      acquired: false,
      status: 'in_progress',
    });
  });

  it('marks webhook event as failed and rethrows when handler throws', async () => {
    mocks.mockInsert().values().onConflictDoNothing().returning.mockResolvedValueOnce([{ id: 30 }]);
    const handler = vi.fn(async () => {
      throw new Error('payment gateway timeout');
    });

    await expect(runWebhookEventOnce({
      eventId: 'evt_fail',
      eventType: 'checkout.session.completed',
      handler,
      provider: 'stripe',
    })).rejects.toThrow('payment gateway timeout');

    expect(mocks.mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      lastError: 'payment gateway timeout',
      status: 'failed',
    }));
  });

  it('throws when runWebhookEventOnce cannot find the event record after conflict', async () => {
    mocks.mockInsert().values().onConflictDoNothing().returning.mockResolvedValueOnce([]);
    mocks.mockSelectLimit.mockResolvedValueOnce([]);

    await expect(runWebhookEventOnce({
      eventId: 'evt_missing',
      eventType: 'invoice.paid',
      handler: async () => 'x',
      provider: 'stripe',
    })).rejects.toThrow('not created');
  });
});
