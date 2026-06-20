import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCleanupExpiredOperationalData,
  mockGetPlatformRuntimeConfig,
  mockSecureTokenEquals,
} = vi.hoisted(() => ({
  mockCleanupExpiredOperationalData: vi.fn(),
  mockGetPlatformRuntimeConfig: vi.fn(),
  mockSecureTokenEquals: vi.fn(),
}));

vi.mock('@/libs/OperationalDataRetention', () => ({
  cleanupExpiredOperationalData: mockCleanupExpiredOperationalData,
}));

vi.mock('@/libs/PlatformRuntimeConfig', () => ({
  getPlatformRuntimeConfig: mockGetPlatformRuntimeConfig,
}));

vi.mock('@/libs/SecureTokens', () => ({
  secureTokenEquals: mockSecureTokenEquals,
}));

describe('maintenance cleanup route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCleanupExpiredOperationalData.mockResolvedValue({
      deletedRateLimitBuckets: 2,
      deletedWebhookEvents: 3,
    });
  });

  it('fails closed when the maintenance secret is not configured', async () => {
    mockGetPlatformRuntimeConfig.mockResolvedValue({
      internal: {
        maintenanceSecret: '',
      },
    });
    const { POST } = await import('./route');

    const response = await POST(new Request(
      'https://www.smartstore-ai.com/api/maintenance/cleanup',
      { method: 'POST' },
    ));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Maintenance endpoint is not configured',
    });
    expect(mockSecureTokenEquals).not.toHaveBeenCalled();
    expect(mockCleanupExpiredOperationalData).not.toHaveBeenCalled();
  });

  it('rejects missing or invalid bearer credentials without running cleanup', async () => {
    mockGetPlatformRuntimeConfig.mockResolvedValue({
      internal: {
        maintenanceSecret: 'configured-secret',
      },
    });
    mockSecureTokenEquals.mockReturnValue(false);
    const { POST } = await import('./route');

    const response = await POST(new Request(
      'https://www.smartstore-ai.com/api/maintenance/cleanup',
      {
        headers: {
          authorization: 'Bearer invalid-secret',
        },
        method: 'POST',
      },
    ));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mockSecureTokenEquals).toHaveBeenCalledWith(
      'invalid-secret',
      'configured-secret',
    );
    expect(mockCleanupExpiredOperationalData).not.toHaveBeenCalled();
  });

  it('runs cleanup only after constant-time credential verification succeeds', async () => {
    mockGetPlatformRuntimeConfig.mockResolvedValue({
      internal: {
        maintenanceSecret: 'configured-secret',
      },
    });
    mockSecureTokenEquals.mockReturnValue(true);
    const { POST } = await import('./route');

    const response = await POST(new Request(
      'https://www.smartstore-ai.com/api/maintenance/cleanup',
      {
        headers: {
          authorization: 'Bearer configured-secret',
        },
        method: 'POST',
      },
    ));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      deletedRateLimitBuckets: 2,
      deletedWebhookEvents: 3,
    });
    expect(payload.cleanedAt).toEqual(expect.any(String));
    expect(mockCleanupExpiredOperationalData).toHaveBeenCalledTimes(1);
  });
});
