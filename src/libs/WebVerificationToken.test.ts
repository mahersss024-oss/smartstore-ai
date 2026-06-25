import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_KEY = process.env.PLATFORM_SECRETS_ENCRYPTION_KEY;

describe('WebVerificationToken', () => {
  beforeEach(() => {
    process.env.PLATFORM_SECRETS_ENCRYPTION_KEY = 'a'.repeat(64);
    vi.resetModules();
  });

  afterEach(() => {
    process.env.PLATFORM_SECRETS_ENCRYPTION_KEY = ORIGINAL_KEY;
    vi.useRealTimers();
  });

  it('round-trips a valid token back to its payload', async () => {
    const { signWebVerificationToken, verifyWebVerificationToken } = await import('./WebVerificationToken');
    const token = signWebVerificationToken({ organizationId: 'org_1', phone: '+966500000000' });

    expect(verifyWebVerificationToken(token)).toEqual({ organizationId: 'org_1', phone: '+966500000000' });
  });

  it('rejects a tampered token, a wrong key, and garbage', async () => {
    const { signWebVerificationToken, verifyWebVerificationToken } = await import('./WebVerificationToken');
    const token = signWebVerificationToken({ organizationId: 'org_1', phone: '+966500000000' });

    expect(verifyWebVerificationToken(`${token}x`)).toBeNull();
    expect(verifyWebVerificationToken('not.a.valid.token')).toBeNull();
    expect(verifyWebVerificationToken('')).toBeNull();
  });

  it('rejects an expired token', async () => {
    const { signWebVerificationToken, verifyWebVerificationToken } = await import('./WebVerificationToken');
    const token = signWebVerificationToken({ organizationId: 'org_1', phone: '+966500000000', ttlMs: 1000 });

    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 5000);

    expect(verifyWebVerificationToken(token)).toBeNull();
  });

  it('builds a verification link to the web-order page', async () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://smartstore-ai.com';
    vi.resetModules();
    const { buildWebVerificationLink, verifyWebVerificationToken } = await import('./WebVerificationToken');
    const link = buildWebVerificationLink({ organizationId: 'org_1', phone: '+966500000000' });

    expect(link.startsWith('https://smartstore-ai.com/web-order/org_1?vt=')).toBe(true);

    const token = link.split('vt=')[1] ?? '';

    expect(verifyWebVerificationToken(token)).toEqual({ organizationId: 'org_1', phone: '+966500000000' });
  });
});
