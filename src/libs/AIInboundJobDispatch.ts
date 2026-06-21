import { Client } from '@upstash/qstash';
import { markAiInboundJobDispatched } from './AIInboundJobQueue';
import { Env } from './Env';
import { logger } from './Logger';

// Single flow-control key + parallelism cap is the most important setting for
// peak load: it guarantees the AI provider rate limit is never exceeded no
// matter how large the burst, while the queue absorbs and drains the surge.
const AI_WORKER_FLOW_CONTROL_KEY = 'ai-inbound-worker';
const AI_WORKER_PARALLELISM = 15;
// Database state owns retries and backoff. QStash performs delivery only; this
// avoids consuming provider retries before nextAttemptAt becomes due.
const AI_WORKER_RETRIES = 0;

let cachedClient: Client | null = null;

const getQStashClient = () => {
  if (!Env.QSTASH_TOKEN) {
    return null;
  }

  cachedClient ??= new Client({ token: Env.QSTASH_TOKEN });

  return cachedClient;
};

export const isAiWorkerDispatchConfigured = () => {
  return Boolean(Env.QSTASH_TOKEN && Env.NEXT_PUBLIC_APP_URL);
};

const getWorkerUrl = () => {
  const baseUrl = Env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, '');

  return baseUrl ? `${baseUrl}/api/ai/worker` : null;
};

/**
 * Publishes a claimed inbound job to the QStash queue, which calls the worker
 * endpoint with controlled parallelism and built-in retries. Returns whether the
 * job was dispatched; when QStash is not configured it is a safe no-op so the
 * synchronous path and local development keep working.
 */
export const dispatchAiInboundJob = async (params: {
  jobId: number;
}): Promise<{ dispatched: boolean }> => {
  const client = getQStashClient();
  const workerUrl = getWorkerUrl();

  if (!client || !workerUrl) {
    return { dispatched: false };
  }

  try {
    await client.publishJSON({
      body: { jobId: params.jobId },
      flowControl: {
        key: AI_WORKER_FLOW_CONTROL_KEY,
        parallelism: AI_WORKER_PARALLELISM,
      },
      retries: AI_WORKER_RETRIES,
      url: workerUrl,
    });

    return { dispatched: true };
  } catch (error) {
    logger.error('Failed to dispatch AI inbound job to QStash', {
      error: error instanceof Error ? error.message : 'unknown_dispatch_error',
      jobId: params.jobId,
    });

    // The job stays pending in the outbox; the sweeper will re-dispatch it.
    return { dispatched: false };
  }
};

export const dispatchAndRecordAiInboundJob = async (params: {
  jobId: number;
}): Promise<{ dispatched: boolean }> => {
  const result = await dispatchAiInboundJob(params);

  if (result.dispatched) {
    try {
      await markAiInboundJobDispatched({ jobId: params.jobId });
    } catch (error) {
      logger.warn('AI inbound job dispatched but dispatch timestamp was not stored', {
        error: error instanceof Error ? error.message : 'unknown_dispatch_record_error',
        jobId: params.jobId,
      });
    }
  }

  return result;
};
