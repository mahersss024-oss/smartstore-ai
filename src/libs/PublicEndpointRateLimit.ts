import { createHash } from 'node:crypto';
import { inArray, sql } from 'drizzle-orm';
import { publicEndpointRateLimitsTable } from '@/models/Schema';
import { db } from './DB';

export class PublicEndpointRateLimitError extends Error {
  constructor(
    public readonly limit: number,
    public readonly retryAfterSeconds: number,
    public readonly windowMs: number,
  ) {
    super('Public endpoint rate limit exceeded');
  }
}

export type PublicMessageRateLimitInput = {
  channel: string;
  customerExternalId: string;
  externalThreadId: string;
  ipAddress?: null | string;
  now?: number;
  organizationId: string;
};

export const PUBLIC_MESSAGE_RATE_LIMIT = {
  limit: 20,
  windowMs: 60_000,
};

export const PUBLIC_MESSAGE_IP_RATE_LIMIT = {
  limit: 120,
  windowMs: 60_000,
};

export const PUBLIC_READ_RATE_LIMIT = {
  limit: 60,
  windowMs: 60_000,
};

export const PUBLIC_READ_IP_RATE_LIMIT = {
  limit: 300,
  windowMs: 60_000,
};

const hashRateLimitKey = (parts: string[]) => {
  return createHash('sha256').update(parts.join('\u001F')).digest('hex');
};

const consumeRateLimitBucket = async (params: {
  keyParts: string[];
  limit: number;
  metadata: Record<string, unknown>;
  now: number;
  scope: string;
  windowMs: number;
}) => {
  const key = hashRateLimitKey(params.keyParts);
  const now = params.now;
  const nowDate = new Date(now);
  const resetAtDate = new Date(now + params.windowMs);
  const [bucket] = await db
    .insert(publicEndpointRateLimitsTable)
    .values({
      count: 1,
      expiresAt: resetAtDate,
      metadata: params.metadata,
      rateLimitKey: key,
      scope: params.scope,
      windowStartAt: nowDate,
    })
    .onConflictDoUpdate({
      set: {
        count: sql`
          case
            when ${publicEndpointRateLimitsTable.expiresAt} <= ${nowDate}
              then 1
            else ${publicEndpointRateLimitsTable.count} + 1
          end
        `,
        expiresAt: sql`
          case
            when ${publicEndpointRateLimitsTable.expiresAt} <= ${nowDate}
              then ${resetAtDate}
            else ${publicEndpointRateLimitsTable.expiresAt}
          end
        `,
        metadata: params.metadata,
        scope: params.scope,
        updatedAt: nowDate,
        windowStartAt: sql`
          case
            when ${publicEndpointRateLimitsTable.expiresAt} <= ${nowDate}
              then ${nowDate}
            else ${publicEndpointRateLimitsTable.windowStartAt}
          end
        `,
      },
      target: publicEndpointRateLimitsTable.rateLimitKey,
    })
    .returning({
      count: publicEndpointRateLimitsTable.count,
      expiresAt: publicEndpointRateLimitsTable.expiresAt,
    });

  if (!bucket) {
    throw new Error('Public rate limit bucket was not created.');
  }

  if (bucket.count > params.limit) {
    throw new PublicEndpointRateLimitError(
      params.limit,
      Math.ceil((bucket.expiresAt.getTime() - now) / 1000),
      params.windowMs,
    );
  }

  return {
    limit: params.limit,
    remaining: Math.max(0, params.limit - bucket.count),
    resetAt: bucket.expiresAt.getTime(),
  };
};

const checkPublicEndpointRateLimit = async (
  input: PublicMessageRateLimitInput,
  config: {
    identityLimit: typeof PUBLIC_MESSAGE_RATE_LIMIT;
    ipLimit: typeof PUBLIC_MESSAGE_IP_RATE_LIMIT;
    scope: string;
  },
) => {
  const now = input.now ?? Date.now();
  const sharedMetadata = {
    channel: input.channel,
    hasIpAddress: Boolean(input.ipAddress),
    organizationId: input.organizationId,
  };

  if (input.ipAddress !== null) {
    await consumeRateLimitBucket({
      keyParts: [
        'ip',
        input.organizationId,
        input.channel,
        input.ipAddress ?? 'unknown-ip',
      ],
      limit: config.ipLimit.limit,
      metadata: sharedMetadata,
      now,
      scope: `${config.scope}_ip`,
      windowMs: config.ipLimit.windowMs,
    });
  }

  return consumeRateLimitBucket({
    keyParts: [
      'identity',
      input.organizationId,
      input.channel,
      input.externalThreadId,
      input.customerExternalId,
      input.ipAddress ?? 'unknown-ip',
    ],
    limit: config.identityLimit.limit,
    metadata: sharedMetadata,
    now,
    scope: `${config.scope}_identity`,
    windowMs: config.identityLimit.windowMs,
  });
};

export const checkPublicMessageRateLimit = async (
  input: PublicMessageRateLimitInput,
) => {
  return checkPublicEndpointRateLimit(input, {
    identityLimit: PUBLIC_MESSAGE_RATE_LIMIT,
    ipLimit: PUBLIC_MESSAGE_IP_RATE_LIMIT,
    scope: 'public_message',
  });
};

export const checkPublicReadRateLimit = async (
  input: PublicMessageRateLimitInput,
) => {
  return checkPublicEndpointRateLimit(input, {
    identityLimit: PUBLIC_READ_RATE_LIMIT,
    ipLimit: PUBLIC_READ_IP_RATE_LIMIT,
    scope: 'public_read',
  });
};

export const resetPublicEndpointRateLimitForTests = async () => {
  await db.delete(publicEndpointRateLimitsTable).where(
    inArray(publicEndpointRateLimitsTable.scope, [
      'public_message',
      'public_message_identity',
      'public_message_ip',
      'public_read_identity',
      'public_read_ip',
    ]),
  );
};
