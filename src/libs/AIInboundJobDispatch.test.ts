import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const publishJSON = vi.fn();

  class ClientMock {
    publishJSON = publishJSON;
  }

  return {
    ClientMock,
    env: {
      NEXT_PUBLIC_APP_URL: undefined as string | undefined,
      QSTASH_TOKEN: undefined as string | undefined,
    },
    publishJSON,
  };
});

vi.mock('@upstash/qstash', () => ({ Client: hoisted.ClientMock }));
vi.mock('./Env', () => ({ Env: hoisted.env }));
vi.mock('./Logger', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { dispatchAiInboundJob, isAiWorkerDispatchConfigured } = await import('./AIInboundJobDispatch');

describe('AIInboundJobDispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.env.QSTASH_TOKEN = undefined;
    hoisted.env.NEXT_PUBLIC_APP_URL = undefined;
  });

  it('is a safe no-op when QStash is not configured', async () => {
    await expect(dispatchAiInboundJob({ jobId: 7 })).resolves.toEqual({ dispatched: false });

    expect(hoisted.publishJSON).not.toHaveBeenCalled();
    expect(isAiWorkerDispatchConfigured()).toBe(false);
  });

  it('publishes to the worker url with a parallelism cap and database-owned retries', async () => {
    hoisted.env.QSTASH_TOKEN = 'tok';
    hoisted.env.NEXT_PUBLIC_APP_URL = 'https://store.example.com';
    hoisted.publishJSON.mockResolvedValueOnce({ messageId: 'm1' });

    await expect(dispatchAiInboundJob({ jobId: 7 })).resolves.toEqual({ dispatched: true });
    expect(isAiWorkerDispatchConfigured()).toBe(true);

    const calls = hoisted.publishJSON.mock.calls as unknown as Array<[{
      body: { jobId: number };
      flowControl: { key: string; parallelism: number };
      retries: number;
      url: string;
    }]>;
    const arg = calls.at(0)?.[0];

    expect(arg?.body).toEqual({ jobId: 7 });
    expect(arg?.url).toBe('https://store.example.com/api/ai/worker');
    expect(arg?.flowControl.parallelism).toBeGreaterThan(0);
    expect(arg?.retries).toBe(0);
  });

  it('returns dispatched:false when publishing throws so the job stays pending', async () => {
    hoisted.env.QSTASH_TOKEN = 'tok';
    hoisted.env.NEXT_PUBLIC_APP_URL = 'https://store.example.com';
    hoisted.publishJSON.mockRejectedValueOnce(new Error('qstash down'));

    await expect(dispatchAiInboundJob({ jobId: 7 })).resolves.toEqual({ dispatched: false });
  });
});
