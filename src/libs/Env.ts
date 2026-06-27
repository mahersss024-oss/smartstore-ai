import { createEnv } from '@t3-oss/env-nextjs';
import * as z from 'zod';

const doesValueLookLikeProviderSecret = (value: string) => {
  return /^(?:sk|pk)_(?:live|test)_/.test(value)
    || value.startsWith('GOCSPX-')
    || value.startsWith('EAAG')
    || value.startsWith('EAAM');
};

export const Env = createEnv({
  server: {
    AI_EMPLOYEE_WEBHOOK_SECRET: z.string().optional(),
    // Controls how inbound customer messages are processed. 'sync' runs the AI
    // reply inside the inbound request (current behavior). 'outbox' persists a
    // durable job and processes it in the QStash-driven worker.
    AI_PROCESSING_MODE: z.enum(['sync', 'outbox']).default('sync'),
    BETTER_STACK_INGESTING_HOST: z.string().optional(),
    BETTER_STACK_SOURCE_TOKEN: z.string().optional(),
    CLERK_SECRET_KEY: z.string().min(1),
    CLERK_WEBHOOK_SIGNING_SECRET: z.string().optional(),
    CRON_SECRET: z.string().min(32).optional(),
    DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().min(1000).default(10_000),
    DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().min(1000).default(30_000),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    DATABASE_URL: z.string().min(1),
    DEMO_MODE: z.enum(['false', 'true']).default('false').transform(value => value === 'true'),
    MAINTENANCE_SECRET: z.string().min(32).optional(),
    META_APP_SECRET: z.string().optional(),
    META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
    MOYASAR_SECRET_KEY: z.string().optional(),
    PLATFORM_ADMIN_USER_IDS: z.string().optional(),
    PLATFORM_SECRETS_ENCRYPTION_KEY: z
      .string()
      .min(32)
      .refine(
        value => !doesValueLookLikeProviderSecret(value),
        'PLATFORM_SECRETS_ENCRYPTION_KEY must be a dedicated random encryption key, not a provider API key.',
      )
      .optional(),
    PLATFORM_SECRETS_PREVIOUS_ENCRYPTION_KEYS: z
      .string()
      .refine(
        value => value
          .split(',')
          .map(item => item.trim())
          .filter(Boolean)
          .every(item => item.length >= 32 && !doesValueLookLikeProviderSecret(item)),
        'Every previous platform encryption key must be at least 32 characters and must not be a provider API key.',
      )
      .optional(),
    // QStash (Upstash) drives the async AI worker. Token publishes jobs; the two
    // signing keys verify that worker requests genuinely originate from QStash.
    QSTASH_CURRENT_SIGNING_KEY: z.string().optional(),
    QSTASH_NEXT_SIGNING_KEY: z.string().optional(),
    QSTASH_TOKEN: z.string().optional(),
    STRIPE_PRICE_EXTRA_AI_ORDERS: z.string().optional(),
    STRIPE_PRICE_EXTRA_CATALOG_ITEMS: z.string().optional(),
    STRIPE_PRICE_EXTRA_IMAGE_STORAGE: z.string().optional(),
    STRIPE_PRICE_EXTRA_TEAM_MEMBER: z.string().optional(),
    STRIPE_PRICE_GROWTH_MONTHLY: z.string().optional(),
    STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
    STRIPE_PRICE_STARTER_MONTHLY: z.string().optional(),
    STRIPE_SECRET_KEY: z.string().optional(),
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.url().optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_LOGGING_LEVEL: z.enum(['error', 'info', 'debug', 'warning', 'trace', 'fatal']).default('info'),
  },
  shared: {
    NODE_ENV: z.enum(['test', 'development', 'production']).optional(),
  },
  // You need to destructure all the keys manually
  runtimeEnv: {
    AI_EMPLOYEE_WEBHOOK_SECRET: process.env.AI_EMPLOYEE_WEBHOOK_SECRET,
    AI_PROCESSING_MODE: process.env.AI_PROCESSING_MODE,
    BETTER_STACK_INGESTING_HOST: process.env.BETTER_STACK_INGESTING_HOST,
    BETTER_STACK_SOURCE_TOKEN: process.env.BETTER_STACK_SOURCE_TOKEN,
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    CLERK_WEBHOOK_SIGNING_SECRET: process.env.CLERK_WEBHOOK_SIGNING_SECRET,
    CRON_SECRET: process.env.CRON_SECRET,
    DATABASE_CONNECTION_TIMEOUT_MS: process.env.DATABASE_CONNECTION_TIMEOUT_MS,
    DATABASE_IDLE_TIMEOUT_MS: process.env.DATABASE_IDLE_TIMEOUT_MS,
    DATABASE_POOL_MAX: process.env.DATABASE_POOL_MAX,
    DATABASE_URL: process.env.DATABASE_URL,
    DEMO_MODE: process.env.DEMO_MODE,
    MAINTENANCE_SECRET: process.env.MAINTENANCE_SECRET,
    META_APP_SECRET: process.env.META_APP_SECRET,
    META_WEBHOOK_VERIFY_TOKEN: process.env.META_WEBHOOK_VERIFY_TOKEN,
    MOYASAR_SECRET_KEY: process.env.MOYASAR_SECRET_KEY,
    PLATFORM_ADMIN_USER_IDS: process.env.PLATFORM_ADMIN_USER_IDS,
    PLATFORM_SECRETS_ENCRYPTION_KEY: process.env.PLATFORM_SECRETS_ENCRYPTION_KEY,
    PLATFORM_SECRETS_PREVIOUS_ENCRYPTION_KEYS:
      process.env.PLATFORM_SECRETS_PREVIOUS_ENCRYPTION_KEYS,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    STRIPE_PRICE_EXTRA_AI_ORDERS: process.env.STRIPE_PRICE_EXTRA_AI_ORDERS,
    STRIPE_PRICE_EXTRA_CATALOG_ITEMS: process.env.STRIPE_PRICE_EXTRA_CATALOG_ITEMS,
    STRIPE_PRICE_EXTRA_IMAGE_STORAGE: process.env.STRIPE_PRICE_EXTRA_IMAGE_STORAGE,
    STRIPE_PRICE_EXTRA_TEAM_MEMBER: process.env.STRIPE_PRICE_EXTRA_TEAM_MEMBER,
    STRIPE_PRICE_GROWTH_MONTHLY: process.env.STRIPE_PRICE_GROWTH_MONTHLY,
    STRIPE_PRICE_PRO_MONTHLY: process.env.STRIPE_PRICE_PRO_MONTHLY,
    STRIPE_PRICE_STARTER_MONTHLY: process.env.STRIPE_PRICE_STARTER_MONTHLY,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_LOGGING_LEVEL: process.env.NEXT_PUBLIC_LOGGING_LEVEL,
    NODE_ENV: process.env.NODE_ENV,
  },
});

if (
  Env.AI_PROCESSING_MODE === 'outbox'
  && (
    !Env.NEXT_PUBLIC_APP_URL
    || !Env.QSTASH_TOKEN
    || !Env.QSTASH_CURRENT_SIGNING_KEY
    || !Env.QSTASH_NEXT_SIGNING_KEY
  )
) {
  throw new Error(
    'AI_PROCESSING_MODE=outbox requires NEXT_PUBLIC_APP_URL, QSTASH_TOKEN, '
    + 'QSTASH_CURRENT_SIGNING_KEY, and QSTASH_NEXT_SIGNING_KEY.',
  );
}

const isProductionDeployment = process.env.RENDER === 'true'
  || Boolean(process.env.RENDER_SERVICE_ID)
  || process.env.SMARTSTORE_VALIDATE_PRODUCTION_ENV === 'true';

if (isProductionDeployment) {
  if (!Env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY.startsWith('pk_live_')) {
    console.warn(
      'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not a Clerk production key. This deployment is using Clerk development keys temporarily.',
    );
  }

  if (!Env.CLERK_SECRET_KEY.startsWith('sk_live_')) {
    console.warn(
      'CLERK_SECRET_KEY is not a Clerk production key. This deployment is using Clerk development keys temporarily.',
    );
  }
}
