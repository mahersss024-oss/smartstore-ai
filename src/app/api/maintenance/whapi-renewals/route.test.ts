import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getPlatformRuntimeConfig: vi.fn(),
  renewWhapiManagedChannels: vi.fn(),
  secureTokenEquals: vi.fn(),
}));

const mockEnv = vi.hoisted(() => ({
  CRON_SECRET: undefined as string | undefined,
  WHAPI_PARTNER_API_TOKEN: 'partner_token' as string | undefined,
  WHAPI_PROJECT_ID: 'project_123' as string | undefined,
}));

vi.mock('@/libs/Env', () => ({ Env: mockEnv }));
vi.mock('@/libs/PlatformRuntimeConfig', () => ({
  getPlatformRuntimeConfig: mocks.getPlatformRuntimeConfig,
}));
vi.mock('@/libs/SecureTokens', () => ({
  secureTokenEquals: mocks.secureTokenEquals,
}));
vi.mock('@/libs/WhapiChannelRenewal', () => ({
  renewWhapiManagedChannels: mocks.renewWhapiManagedChannels,
}));

const buildRequest = () => new Request(
  'https://www.smartstore-ai.com/api/maintenance/whapi-renewals',
  {
    headers: {
      authorization: 'Bearer maintenance-secret',
    },
    method: 'POST',
  },
);

describe('Whapi renewal maintenance route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEnv.CRON_SECRET = undefined;
    mockEnv.WHAPI_PARTNER_API_TOKEN = 'partner_token';
    mockEnv.WHAPI_PROJECT_ID = 'project_123';
    mocks.getPlatformRuntimeConfig.mockResolvedValue({
      internal: { maintenanceSecret: 'maintenance-secret' },
    });
    mocks.secureTokenEquals.mockReturnValue(true);
    mocks.renewWhapiManagedChannels.mockResolvedValue({
      checked: 2,
      extended: 1,
      failed: 0,
      missing: 0,
      skippedInactiveStore: 1,
      skippedNotDue: 0,
      skippedRecentlyExtended: 0,
    });
  });

  it('rejects invalid credentials without running renewal', async () => {
    mocks.secureTokenEquals.mockReturnValue(false);
    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
    expect(mocks.renewWhapiManagedChannels).not.toHaveBeenCalled();
  });

  it('skips renewal when Whapi partner settings are not configured', async () => {
    mockEnv.WHAPI_PARTNER_API_TOKEN = undefined;
    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      checked: 0,
      skipped: true,
    });
    expect(mocks.renewWhapiManagedChannels).not.toHaveBeenCalled();
  });

  it('runs Whapi channel renewal after maintenance authorization succeeds', async () => {
    const { POST } = await import('./route');
    const response = await POST(buildRequest());
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      checked: 2,
      extended: 1,
      skipped: false,
      skippedInactiveStore: 1,
    });
    expect(payload.renewedAt).toEqual(expect.any(String));
    expect(mocks.renewWhapiManagedChannels).toHaveBeenCalledTimes(1);
  });
});
