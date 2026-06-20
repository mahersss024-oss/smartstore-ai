import { performance } from 'node:perf_hooks';

const getArgument = (name, fallback) => {
  const prefix = `--${name}=`;
  const value = process.argv.find(argument => argument.startsWith(prefix));

  return value ? value.slice(prefix.length) : fallback;
};

const parsePositiveInteger = (name, fallback) => {
  const value = Number.parseInt(getArgument(name, String(fallback)), 10);

  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`--${name} must be a positive integer`);
  }

  return value;
};

const percentile = (sortedValues, percentage) => {
  if (sortedValues.length === 0) {
    return 0;
  }

  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil((percentage / 100) * sortedValues.length) - 1),
  );

  return sortedValues[index];
};

const baseUrl = getArgument(
  'base-url',
  process.env.NEXT_PUBLIC_APP_URL || 'https://www.smartstore-ai.com',
).replace(/\/+$/, '');
const organizationId = getArgument('organization-id', '');
const requestCount = parsePositiveInteger('requests', 30);
const concurrency = Math.min(
  requestCount,
  parsePositiveInteger('concurrency', 5),
);
const timeoutMs = parsePositiveInteger('timeout-ms', 15_000);
const maxP95Ms = parsePositiveInteger('max-p95-ms', 5_000);
const maxErrorRate = Number.parseFloat(getArgument('max-error-rate', '0'));

if (!Number.isFinite(maxErrorRate) || maxErrorRate < 0 || maxErrorRate > 1) {
  throw new TypeError('--max-error-rate must be between 0 and 1');
}

const paths = [
  '/robots.txt',
  '/sitemap.xml',
  ...(organizationId
    ? [`/ar/web-order/${encodeURIComponent(organizationId)}`]
    : []),
];

if (paths.length === 2) {
  console.warn(
    'No --organization-id was provided; the DB-backed web-order route is excluded.',
  );
}

let nextRequestIndex = 0;
const results = [];

const executeRequest = async (requestIndex) => {
  const path = paths[requestIndex % paths.length];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = performance.now();

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        'user-agent': 'SmartStoreAI-ReadOnlyCapacityProbe/1.0',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    const body = await response.text();
    const durationMs = performance.now() - startedAt;
    const hasApplicationError = body.includes('Application error')
      || body.includes('orders unavailable');

    return {
      durationMs,
      ok: response.ok && !hasApplicationError,
      path,
      status: response.status,
    };
  } catch (error) {
    return {
      durationMs: performance.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      ok: false,
      path,
      status: 0,
    };
  } finally {
    clearTimeout(timeout);
  }
};

const worker = async () => {
  while (true) {
    const requestIndex = nextRequestIndex;
    nextRequestIndex += 1;

    if (requestIndex >= requestCount) {
      return;
    }

    results.push(await executeRequest(requestIndex));
  }
};

const runStartedAt = performance.now();
await Promise.all(Array.from({ length: concurrency }, () => worker()));
const runDurationMs = performance.now() - runStartedAt;
const durations = results
  .map(result => result.durationMs)
  .sort((first, second) => first - second);
const failed = results.filter(result => !result.ok);
const errorRate = failed.length / results.length;
const summary = {
  baseUrl,
  concurrency,
  errorRate,
  failedRequests: failed.length,
  maxMs: Math.round(percentile(durations, 100)),
  p50Ms: Math.round(percentile(durations, 50)),
  p95Ms: Math.round(percentile(durations, 95)),
  p99Ms: Math.round(percentile(durations, 99)),
  requests: results.length,
  requestsPerSecond: Number(
    (results.length / (runDurationMs / 1000)).toFixed(2),
  ),
  runDurationMs: Math.round(runDurationMs),
  statusCounts: Object.fromEntries(
    Array.from(
      results.reduce((counts, result) => {
        const key = String(result.status);
        counts.set(key, (counts.get(key) ?? 0) + 1);
        return counts;
      }, new Map()),
    ).sort(([first], [second]) => first.localeCompare(second)),
  ),
};

console.log(JSON.stringify(summary, null, 2));

if (failed.length > 0) {
  console.error(JSON.stringify({ failed: failed.slice(0, 10) }, null, 2));
}

if (errorRate > maxErrorRate || summary.p95Ms > maxP95Ms) {
  process.exitCode = 1;
}
