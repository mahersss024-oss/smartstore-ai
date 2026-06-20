import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class MockPublicEndpointRateLimitError extends Error {
    constructor() {
      super('rate limited');
      this.limit = 10;
      this.retryAfterSeconds = 30;
      this.windowMs = 60_000;
    }

    limit: number;
    retryAfterSeconds: number;
    windowMs: number;
  }

  class MockStoreFeatureDisabledError extends Error {
    constructor(public readonly feature: string) {
      super('feature disabled');
    }
  }

  class MockStoreSubscriptionInactiveError extends Error {
    reason = 'inactive';
    subscriptionStatus = 'inactive';
  }

  return {
    mockAssertStoreFeatureEnabled: vi.fn(async () => undefined),
    mockCheckPublicMessageRateLimit: vi.fn(async () => undefined),
    mockEnv: { NODE_ENV: 'test' },
    mockGetPlatformRuntimeConfig: vi.fn(async () => ({
      internal: { aiEmployeeWebhookSecret: 'configured-secret' as string | undefined },
    })),
    mockHandleCustomerMessageWithAIEmployee: vi.fn(async () => ({
      aiOrchestration: {
        prompt: 'internal prompt',
        secret: 'must-not-leak',
      },
      conversationId: 123,
      replyToCustomer: 'أهلاً بك',
    })),
    MockPublicEndpointRateLimitError,
    MockStoreFeatureDisabledError,
    MockStoreSubscriptionInactiveError,
  };
});

vi.mock('@/features/ai/AIEmployeeAgent', () => ({
  handleCustomerMessageWithAIEmployee: mocks.mockHandleCustomerMessageWithAIEmployee,
}));

vi.mock('@/libs/Env', () => ({
  Env: mocks.mockEnv,
}));

vi.mock('@/libs/PlatformRuntimeConfig', () => ({
  getPlatformRuntimeConfig: mocks.mockGetPlatformRuntimeConfig,
}));

vi.mock('@/libs/PublicEndpointRateLimit', () => ({
  checkPublicMessageRateLimit: mocks.mockCheckPublicMessageRateLimit,
  PublicEndpointRateLimitError: mocks.MockPublicEndpointRateLimitError,
}));

vi.mock('@/libs/StoreServiceControls', () => ({
  assertStoreFeatureEnabled: mocks.mockAssertStoreFeatureEnabled,
  StoreFeatureDisabledError: mocks.MockStoreFeatureDisabledError,
  StoreSubscriptionInactiveError: mocks.MockStoreSubscriptionInactiveError,
}));

vi.mock('@/libs/SubscriptionEntitlements', () => ({
  isSubscriptionLimitError: vi.fn((error: unknown) => {
    return Boolean((error as { code?: string }).code === 'subscription_limit');
  }),
}));

const validPayload = {
  body: 'سلام',
  channel: 'web',
  customer: {
    externalId: 'customer-1',
    name: 'Maher',
    phone: '966500000000',
  },
  externalThreadId: 'thread-1',
  locale: 'ar',
  organizationId: 'org_1',
};

const buildRequest = (body: unknown, headers?: HeadersInit) => new Request(
  'https://www.smartstore-ai.com/api/ai-employee/messages',
  {
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {
      'content-type': 'application/json',
      'x-ai-employee-secret': 'configured-secret',
      ...headers,
    },
    method: 'POST',
  },
);

describe('AI employee messages API route security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockEnv.NODE_ENV = 'test';
    mocks.mockGetPlatformRuntimeConfig.mockResolvedValue({
      internal: { aiEmployeeWebhookSecret: 'configured-secret' as string | undefined },
    });
    mocks.mockCheckPublicMessageRateLimit.mockResolvedValue(undefined);
    mocks.mockAssertStoreFeatureEnabled.mockResolvedValue(undefined);
    mocks.mockHandleCustomerMessageWithAIEmployee.mockResolvedValue({
      aiOrchestration: {
        prompt: 'internal prompt',
        secret: 'must-not-leak',
      },
      conversationId: 123,
      replyToCustomer: 'أهلاً بك',
    });
  });

  it('rejects production requests when the shared AI employee secret is missing', async () => {
    mocks.mockEnv.NODE_ENV = 'production';
    mocks.mockGetPlatformRuntimeConfig.mockResolvedValueOnce({
      internal: { aiEmployeeWebhookSecret: undefined },
    });
    const { POST } = await import('./route');

    const response = await POST(buildRequest(validPayload));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'AI employee webhook is not configured',
    });
    expect(mocks.mockHandleCustomerMessageWithAIEmployee).not.toHaveBeenCalled();
  }, 15_000);

  it('rejects requests with an invalid shared AI employee secret', async () => {
    const { POST } = await import('./route');

    const response = await POST(buildRequest(validPayload, {
      'x-ai-employee-secret': 'wrong-secret',
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(mocks.mockCheckPublicMessageRateLimit).not.toHaveBeenCalled();
    expect(mocks.mockHandleCustomerMessageWithAIEmployee).not.toHaveBeenCalled();
  });

  it('rejects oversized request bodies before customer message processing', async () => {
    const { POST } = await import('./route');

    const response = await POST(buildRequest('{}', {
      'content-length': String((64 * 1024) + 1),
    }));

    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      error: 'Request payload is too large',
    });
    expect(mocks.mockHandleCustomerMessageWithAIEmployee).not.toHaveBeenCalled();
  });

  it('returns a retry-after response when the public message rate limit triggers', async () => {
    mocks.mockCheckPublicMessageRateLimit.mockRejectedValueOnce(
      new mocks.MockPublicEndpointRateLimitError(),
    );
    const { POST } = await import('./route');

    const response = await POST(buildRequest(validPayload, {
      'x-forwarded-for': '203.0.113.10, 10.0.0.1',
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect(await response.json()).toMatchObject({
      error: 'Too many messages',
      limit: 10,
      retryAfterSeconds: 30,
      windowMs: 60_000,
    });
    expect(mocks.mockCheckPublicMessageRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({
        ipAddress: '203.0.113.10',
        organizationId: 'org_1',
      }),
    );
    expect(mocks.mockHandleCustomerMessageWithAIEmployee).not.toHaveBeenCalled();
  });

  it('rejects AI messages when the store AI feature is paused by platform controls', async () => {
    mocks.mockAssertStoreFeatureEnabled.mockRejectedValueOnce(
      new mocks.MockStoreFeatureDisabledError('ai'),
    );
    const { POST } = await import('./route');

    const response = await POST(buildRequest(validPayload));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Store feature is disabled',
      feature: 'ai',
    });
    expect(mocks.mockHandleCustomerMessageWithAIEmployee).not.toHaveBeenCalled();
  });

  it('rejects AI messages when the store subscription is inactive', async () => {
    mocks.mockAssertStoreFeatureEnabled.mockRejectedValueOnce(
      new mocks.MockStoreSubscriptionInactiveError(),
    );
    const { POST } = await import('./route');

    const response = await POST(buildRequest(validPayload));

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      error: 'Store subscription is inactive',
      reason: 'inactive',
      subscriptionStatus: 'inactive',
    });
    expect(mocks.mockHandleCustomerMessageWithAIEmployee).not.toHaveBeenCalled();
  });

  it('does not enter the AI engine after subscription limit failures', async () => {
    mocks.mockAssertStoreFeatureEnabled.mockRejectedValueOnce({
      code: 'subscription_limit',
      feature: 'aiOrders',
      limit: 100,
      used: 100,
    });
    const { POST } = await import('./route');

    const response = await POST(buildRequest(validPayload));

    expect(response.status).toBe(402);
    expect(await response.json()).toEqual({
      error: 'Subscription limit reached',
      feature: 'aiOrders',
      limit: 100,
      used: 100,
    });
    expect(mocks.mockHandleCustomerMessageWithAIEmployee).not.toHaveBeenCalled();
  });

  it('removes internal AI orchestration data from successful API responses', async () => {
    const { POST } = await import('./route');

    const response = await POST(buildRequest(validPayload));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      conversationId: 123,
      replyToCustomer: 'أهلاً بك',
    });
    expect(serialized).not.toContain('aiOrchestration');
    expect(serialized).not.toContain('must-not-leak');
    expect(serialized).not.toContain('internal prompt');
  });

  it('returns 400 and does not invoke the AI engine when the request body is not valid JSON', async () => {
    const { POST } = await import('./route');

    const response = await POST(buildRequest('not-valid-json{'));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid JSON payload' });
    expect(mocks.mockHandleCustomerMessageWithAIEmployee).not.toHaveBeenCalled();
  });

  it('returns 400 with validation issues when required fields are missing from the payload', async () => {
    const { POST } = await import('./route');

    const response = await POST(buildRequest({ organizationId: 'org_1' }));

    expect(response.status).toBe(400);

    const body = await response.json() as { error: string; issues: unknown[] };

    expect(body.error).toBe('Invalid request payload');
    expect(Array.isArray(body.issues)).toBe(true);
    expect(body.issues.length).toBeGreaterThan(0);
    expect(mocks.mockHandleCustomerMessageWithAIEmployee).not.toHaveBeenCalled();
  });
});
