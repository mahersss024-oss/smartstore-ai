import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkPublicMessageRateLimit,
  checkPublicReadRateLimit,
  PUBLIC_MESSAGE_IP_RATE_LIMIT,
  PUBLIC_MESSAGE_RATE_LIMIT,
  PUBLIC_READ_IP_RATE_LIMIT,
  PUBLIC_READ_RATE_LIMIT,
  PublicEndpointRateLimitError,
  resetPublicEndpointRateLimitForTests,
} from './PublicEndpointRateLimit';

const mocks = vi.hoisted(() => {
  const mockReturning = vi.fn();
  const mockOnConflictDoUpdate = vi.fn(() => ({ returning: mockReturning }));
  const mockInsertValues = vi.fn(() => ({ onConflictDoUpdate: mockOnConflictDoUpdate }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
  const mockDeleteWhere = vi.fn();
  const mockDelete = vi.fn(() => ({ where: mockDeleteWhere }));

  return {
    mockDelete,
    mockDeleteWhere,
    mockInsert,
    mockReturning,
  };
});

vi.mock('./DB', () => ({
  db: {
    delete: mocks.mockDelete,
    insert: mocks.mockInsert,
  },
}));

describe('PublicEndpointRateLimit', () => {
  const input = {
    channel: 'web',
    customerExternalId: 'customer-1',
    externalThreadId: 'thread-1',
    ipAddress: '127.0.0.1',
    now: 1000,
    organizationId: 'org-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows messages inside the public message window', async () => {
    mocks.mockReturning.mockResolvedValueOnce([{
      count: PUBLIC_MESSAGE_IP_RATE_LIMIT.limit,
      expiresAt: new Date(input.now + PUBLIC_MESSAGE_IP_RATE_LIMIT.windowMs),
    }]).mockResolvedValueOnce([{
      count: PUBLIC_MESSAGE_RATE_LIMIT.limit,
      expiresAt: new Date(input.now + PUBLIC_MESSAGE_RATE_LIMIT.windowMs),
    }]);

    await expect(checkPublicMessageRateLimit(input)).resolves.toMatchObject({
      limit: PUBLIC_MESSAGE_RATE_LIMIT.limit,
      remaining: 0,
      resetAt: input.now + PUBLIC_MESSAGE_RATE_LIMIT.windowMs,
    });
  });

  it('blocks repeated public messages above the window limit', async () => {
    mocks.mockReturning.mockResolvedValueOnce([{
      count: PUBLIC_MESSAGE_IP_RATE_LIMIT.limit,
      expiresAt: new Date(input.now + PUBLIC_MESSAGE_IP_RATE_LIMIT.windowMs),
    }]).mockResolvedValueOnce([{
      count: PUBLIC_MESSAGE_RATE_LIMIT.limit + 1,
      expiresAt: new Date(input.now + PUBLIC_MESSAGE_RATE_LIMIT.windowMs),
    }]);

    await expect(checkPublicMessageRateLimit(input)).rejects.toThrow(
      PublicEndpointRateLimitError,
    );
  });

  it('blocks an abusive IP even when customer and thread identifiers change', async () => {
    mocks.mockReturning.mockResolvedValueOnce([{
      count: PUBLIC_MESSAGE_IP_RATE_LIMIT.limit + 1,
      expiresAt: new Date(input.now + PUBLIC_MESSAGE_IP_RATE_LIMIT.windowMs),
    }]);

    await expect(checkPublicMessageRateLimit({
      ...input,
      customerExternalId: 'rotated-customer',
      externalThreadId: 'rotated-thread',
    })).rejects.toMatchObject({
      limit: PUBLIC_MESSAGE_IP_RATE_LIMIT.limit,
    });

    expect(mocks.mockReturning).toHaveBeenCalledTimes(1);
  });

  it('skips the shared IP bucket for trusted ingress while preserving the identity bucket', async () => {
    mocks.mockReturning.mockResolvedValueOnce([{
      count: 1,
      expiresAt: new Date(input.now + PUBLIC_MESSAGE_RATE_LIMIT.windowMs),
    }]);

    await expect(checkPublicMessageRateLimit({
      ...input,
      channel: 'whatsapp',
      ipAddress: null,
    })).resolves.toMatchObject({
      limit: PUBLIC_MESSAGE_RATE_LIMIT.limit,
      remaining: PUBLIC_MESSAGE_RATE_LIMIT.limit - 1,
    });

    expect(mocks.mockInsert).toHaveBeenCalledTimes(1);
    expect(mocks.mockInsert.mock.results[0]?.value.values).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'public_message_identity',
      }),
    );
  });

  it('uses a separate higher-capacity bucket for public polling reads', async () => {
    mocks.mockReturning.mockResolvedValueOnce([{
      count: PUBLIC_READ_IP_RATE_LIMIT.limit,
      expiresAt: new Date(input.now + PUBLIC_READ_IP_RATE_LIMIT.windowMs),
    }]).mockResolvedValueOnce([{
      count: PUBLIC_READ_RATE_LIMIT.limit,
      expiresAt: new Date(input.now + PUBLIC_READ_RATE_LIMIT.windowMs),
    }]);

    await expect(checkPublicReadRateLimit(input)).resolves.toMatchObject({
      limit: PUBLIC_READ_RATE_LIMIT.limit,
      remaining: 0,
    });
  });

  it('stores hashed bucket keys without raw customer identifiers', async () => {
    mocks.mockReturning.mockResolvedValueOnce([{
      count: 1,
      expiresAt: new Date(input.now + PUBLIC_MESSAGE_IP_RATE_LIMIT.windowMs),
    }]).mockResolvedValueOnce([{
      count: 1,
      expiresAt: new Date(input.now + PUBLIC_MESSAGE_RATE_LIMIT.windowMs),
    }]);

    await checkPublicMessageRateLimit(input);

    const values = mocks.mockInsert.mock.results
      .map(result => result.value.values.mock.calls[0]?.[0])
      .filter(Boolean);

    for (const bucket of values) {
      expect(bucket.rateLimitKey).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(bucket)).not.toContain(input.customerExternalId);
      expect(JSON.stringify(bucket)).not.toContain(input.externalThreadId);
      expect(JSON.stringify(bucket)).not.toContain(input.ipAddress);
    }
  });

  it('clears durable public message buckets for tests', async () => {
    await resetPublicEndpointRateLimitForTests();

    expect(mocks.mockDelete).toHaveBeenCalledTimes(1);
    expect(mocks.mockDeleteWhere).toHaveBeenCalledTimes(1);
  });
});
