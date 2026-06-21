import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const scriptPath = path.resolve('scripts/validate-production-env.mjs');

const validEnv: Record<string, string | undefined> = {
  ...process.env,
  AI_EMPLOYEE_WEBHOOK_SECRET: 'a'.repeat(32),
  CI: 'true',
  CLERK_SECRET_KEY: ['sk', 'live', 'test_certification_key'].join('_'),
  DATABASE_URL: 'postgresql://user:password@db.smartstore-ai.internal:5432/smartstore',
  MAINTENANCE_SECRET: 'b'.repeat(32),
  NEXT_PUBLIC_APP_URL: 'https://www.smartstore-ai.com',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ['pk', 'live', 'test_certification_key'].join('_'),
  NODE_ENV: 'test',
  PLATFORM_ADMIN_USER_IDS: 'user_123',
  PLATFORM_SECRETS_ENCRYPTION_KEY: 'c'.repeat(32),
  TWILIO_ACCOUNT_SID: 'ACd'.repeat(11),
  TWILIO_AUTH_TOKEN: 'e'.repeat(32),
};

const runValidation = (
  args: string[],
  overrides: Record<string, string | undefined> = {},
) => {
  return spawnSync(process.execPath, [scriptPath, ...args], {
    encoding: 'utf8',
    env: {
      ...validEnv,
      ...overrides,
    } as NodeJS.ProcessEnv,
  });
};

describe('production environment validation script', () => {
  it('passes strict certification checks with remote production-shaped values', () => {
    const result = runValidation(['--strict']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('strict certification checks');
  });

  it('fails strict certification checks when DATABASE_URL points to localhost', () => {
    const result = runValidation(['--strict'], {
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5433/postgres',
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('DATABASE_URL points to a local database host');
  });

  it('keeps non-strict validation compatible while warning about local DATABASE_URL', () => {
    const result = runValidation([], {
      DATABASE_URL: 'postgresql://postgres:postgres@127.0.0.1:5433/postgres',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('DATABASE_URL points to a local database host');
  });

  it('fails strict certification checks when Clerk keys are development keys', () => {
    const result = runValidation(['--strict'], {
      CLERK_SECRET_KEY: ['sk', 'test', 'certification_key'].join('_'),
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: ['pk', 'test', 'certification_key'].join('_'),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('CLERK_SECRET_KEY is using a Clerk development key');
    expect(result.stderr).toContain('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is using a Clerk development key');
  });

  it('fails strict certification checks when the platform encryption key is a provider key', () => {
    const result = runValidation(['--strict'], {
      PLATFORM_SECRETS_ENCRYPTION_KEY: ['sk', 'live', 'this_is_a_provider_key_not_an_encryption_key'].join('_'),
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PLATFORM_SECRETS_ENCRYPTION_KEY must be a dedicated random encryption key');
  });

  it('rejects invalid previous encryption roots during strict certification', () => {
    const result = runValidation(['--strict'], {
      PLATFORM_SECRETS_PREVIOUS_ENCRYPTION_KEYS:
        `short-key,${['sk', 'live', 'this_is_not_an_encryption_root'].join('_')}`,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('contains a key shorter than 32 characters');
    expect(result.stderr).toContain('must contain only dedicated encryption roots');
  });

  it('requires all QStash credentials when outbox processing is enabled', () => {
    const result = runValidation([], {
      AI_PROCESSING_MODE: 'outbox',
      QSTASH_CURRENT_SIGNING_KEY: undefined,
      QSTASH_NEXT_SIGNING_KEY: undefined,
      QSTASH_TOKEN: undefined,
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('QSTASH_TOKEN is missing');
    expect(result.stderr).toContain('QSTASH_CURRENT_SIGNING_KEY is missing');
    expect(result.stderr).toContain('QSTASH_NEXT_SIGNING_KEY is missing');
  });
});
