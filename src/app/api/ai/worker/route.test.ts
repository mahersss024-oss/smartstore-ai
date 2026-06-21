import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  claimAiInboundJob: vi.fn(),
  completeAiInboundJob: vi.fn(),
  failAiInboundJob: vi.fn(),
  findTwilioStoreConnection: vi.fn(),
  getAiInboundJob: vi.fn(),
  processTwilioInboundMessage: vi.fn(),
  renewAiInboundJobLease: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('@upstash/qstash', () => ({
  Receiver: class ReceiverMock {
    verify = mocks.verify;
  },
}));

vi.mock('@/libs/Env', () => ({
  Env: {
    QSTASH_CURRENT_SIGNING_KEY: 'current-key',
    QSTASH_NEXT_SIGNING_KEY: 'next-key',
  },
}));

vi.mock('@/libs/AIInboundJobQueue', () => ({
  claimAiInboundJob: mocks.claimAiInboundJob,
  completeAiInboundJob: mocks.completeAiInboundJob,
  failAiInboundJob: mocks.failAiInboundJob,
  getAiInboundJob: mocks.getAiInboundJob,
  renewAiInboundJobLease: mocks.renewAiInboundJobLease,
}));

vi.mock('@/libs/TwilioInboundProcessor', () => ({
  MessageRetryError: class MessageRetryError extends Error {},
  processTwilioInboundMessage: mocks.processTwilioInboundMessage,
}));

vi.mock('@/libs/TwilioWhatsApp', () => ({
  findTwilioStoreConnection: mocks.findTwilioStoreConnection,
}));

vi.mock('@/libs/Logger', () => ({
  logger: {
    warn: vi.fn(),
  },
}));

const payload = {
  jobId: 7,
};

const buildRequest = () => new Request(
  'https://www.smartstore-ai.com/api/ai/worker',
  {
    body: JSON.stringify(payload),
    headers: {
      'content-type': 'application/json',
      'upstash-signature': 'signed',
    },
    method: 'POST',
  },
);

describe('AI inbound worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verify.mockResolvedValue(true);
    mocks.claimAiInboundJob.mockResolvedValue({
      attempts: 1,
      channel: 'whatsapp',
      id: 7,
      leaseToken: 'lease-1',
      organizationId: 'org_1',
      payload: {
        message: {
          body: 'سلام',
          from: 'whatsapp:+966500000001',
          messageSid: 'SM1',
          to: 'whatsapp:+14155552671',
        },
      },
    });
    mocks.findTwilioStoreConnection.mockResolvedValue({
      organizationId: 'org_1',
    });
    mocks.completeAiInboundJob.mockResolvedValue(true);
    mocks.renewAiInboundJobLease.mockResolvedValue(true);
    mocks.failAiInboundJob.mockResolvedValue({
      status: 'failed',
      updated: true,
    });
  });

  it('rejects requests that are not signed by QStash', async () => {
    mocks.verify.mockResolvedValue(false);
    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(401);
    expect(mocks.claimAiInboundJob).not.toHaveBeenCalled();
  });

  it('rejects oversized payloads before signature verification', async () => {
    const { POST } = await import('./route');
    const response = await POST(new Request(
      'https://www.smartstore-ai.com/api/ai/worker',
      {
        body: JSON.stringify({ padding: 'x'.repeat(20_000) }),
        headers: {
          'upstash-signature': 'signed',
        },
        method: 'POST',
      },
    ));

    expect(response.status).toBe(413);
    expect(mocks.verify).not.toHaveBeenCalled();
  });

  it('processes a claimed job and completes it with the same lease', async () => {
    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(mocks.processTwilioInboundMessage).toHaveBeenCalledTimes(1);
    expect(mocks.completeAiInboundJob).toHaveBeenCalledWith({
      jobId: 7,
      leaseToken: 'lease-1',
    });
    expect(await response.json()).toEqual({ ok: true, status: 'done' });
  });

  it('renews the job lease immediately before the processor sends a reply', async () => {
    mocks.processTwilioInboundMessage.mockImplementationOnce(
      async (params: { beforeSend: () => Promise<void> }) => {
        await params.beforeSend();
      },
    );
    const { POST } = await import('./route');
    await POST(buildRequest());

    expect(mocks.renewAiInboundJobLease).toHaveBeenCalledWith({
      jobId: 7,
      leaseToken: 'lease-1',
    });
  });

  it('records a retryable failure without leaking it to QStash retries', async () => {
    mocks.processTwilioInboundMessage.mockRejectedValueOnce(
      new Error('provider credential details'),
    );
    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(mocks.failAiInboundJob).toHaveBeenCalledWith({
      attempts: 1,
      error: expect.any(Error),
      jobId: 7,
      leaseToken: 'lease-1',
    });
    expect(await response.json()).toEqual({ ok: true, status: 'failed' });
  });

  it('defers a non-terminal job that cannot currently be claimed', async () => {
    mocks.claimAiInboundJob.mockResolvedValueOnce(null);
    mocks.getAiInboundJob.mockResolvedValueOnce({ status: 'failed' });
    const { POST } = await import('./route');
    const response = await POST(buildRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: 'deferred' });
  });
});
