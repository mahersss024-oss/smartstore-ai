import { Buffer } from 'node:buffer';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  decryptSecret,
  encryptSecret,
  getReusablePlainSecret,
  isEncryptedSecretPayload,
  isMaskedSecretPreview,
  maskApiKey,
  normalizePlatformAIProviderConfig,
  normalizeProviderModel,
} from './PlatformAIProviderConfig';

describe('PlatformAIProviderConfig secret encryption', () => {
  const encryptWithRoot = (value: string, root: string) => {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      createHash('sha256').update(root).digest(),
      iv,
    );
    const encrypted = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);

    return [
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      encrypted.toString('base64url'),
    ].join('.');
  };

  it('decrypts secrets encrypted by the active platform key', () => {
    const encrypted = encryptSecret('secret-value');

    expect(decryptSecret(encrypted)).toBe('secret-value');
  });

  it('returns undefined instead of crashing when a stored secret cannot be authenticated', () => {
    expect(decryptSecret('invalid.authenticated.ciphertext')).toBeUndefined();
  });

  it('decrypts secrets with a previous root during key rotation', () => {
    const previousRoot = 'previous-platform-root-key-value-1234567890';
    const encrypted = encryptWithRoot('rotated-secret-value', previousRoot);

    expect(decryptSecret(encrypted, {
      additionalSecrets: [previousRoot],
    })).toBe('rotated-secret-value');
  });

  it('identifies encrypted payloads and masked previews before secret reuse', () => {
    const encrypted = encryptSecret('secret-value');

    expect(isEncryptedSecretPayload(encrypted)).toBe(true);
    expect(isEncryptedSecretPayload('plain-secret')).toBe(false);
    expect(isEncryptedSecretPayload(null)).toBe(false);
    expect(isEncryptedSecretPayload('')).toBe(false);
    expect(isMaskedSecretPreview('sk-...1234')).toBe(true);
    expect(isMaskedSecretPreview('********')).toBe(true);
    expect(isMaskedSecretPreview(null)).toBe(false);
    expect(isMaskedSecretPreview('')).toBe(false);
    expect(getReusablePlainSecret('plain-secret')).toBe('plain-secret');
    expect(getReusablePlainSecret(encrypted)).toBeUndefined();
    expect(getReusablePlainSecret('sk-...1234')).toBeUndefined();
    expect(getReusablePlainSecret('********')).toBeUndefined();
    expect(getReusablePlainSecret(null)).toBeUndefined();
  });
});

describe('PlatformAIProviderConfig normalization', () => {
  it('masks short and long API keys', () => {
    expect(maskApiKey('12345678')).toBe('********');
    expect(maskApiKey('sk-test-key-12345')).toBe('sk-...2345');
  });

  it('uses default config for non-object input', () => {
    const config = normalizePlatformAIProviderConfig(null);

    expect(config.enabled).toBe(false);
    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-4.1-mini');
    expect(typeof config.systemPrompt).toBe('string');
  });

  it('uses default model when empty string is passed', () => {
    expect(normalizeProviderModel('openai', '')).toBe('gpt-4.1-mini');
    expect(normalizeProviderModel('deepseek', '')).toBe('deepseek-chat');
    expect(normalizeProviderModel('openai_compatible', '')).toBe('gpt-4.1-mini');
  });

  it('rejects deepseek model that does not start with deepseek-', () => {
    expect(normalizeProviderModel('deepseek', 'gpt-4')).toBe('deepseek-chat');
  });

  it('rejects openai model that starts with deepseek-', () => {
    expect(normalizeProviderModel('openai', 'deepseek-chat')).toBe('gpt-4.1-mini');
  });

  it('accepts valid model names', () => {
    expect(normalizeProviderModel('openai', 'gpt-4o')).toBe('gpt-4o');
    expect(normalizeProviderModel('deepseek', 'deepseek-reasoner')).toBe('deepseek-reasoner');
  });

  it('normalizes a full valid config with systemPrompt', () => {
    const config = normalizePlatformAIProviderConfig({
      enabled: true,
      encryptedApiKey: 'abc.def.ghi',
      model: 'gpt-4o',
      provider: 'openai',
      systemPrompt: 'Be helpful.',
      updatedAt: '2026-01-01',
      updatedBy: 'user_1',
    });

    expect(config.enabled).toBe(true);
    expect(config.provider).toBe('openai');
    expect(config.model).toBe('gpt-4o');
    expect(config.systemPrompt).toBe('Be helpful.');
    expect(config.encryptedApiKey).toBe('abc.def.ghi');
    expect(config.updatedAt).toBe('2026-01-01');
  });

  it('falls back to default systemPrompt for whitespace-only value', () => {
    const config = normalizePlatformAIProviderConfig({
      provider: 'openai',
      systemPrompt: '   ',
    });

    expect(config.systemPrompt).not.toBe('   ');
    expect(config.systemPrompt.length).toBeGreaterThan(0);
  });

  it('falls back to default provider for unknown providers', () => {
    const config = normalizePlatformAIProviderConfig({
      provider: 'unknown_provider',
    });

    expect(config.provider).toBe('openai');
  });

  it('normalizes baseUrl: strips trailing slash from valid https URL', () => {
    const config = normalizePlatformAIProviderConfig({
      baseUrl: 'https://api.example.com/v1/',
      provider: 'openai_compatible',
    });

    expect(config.baseUrl).toBe('https://api.example.com/v1');
  });

  it('normalizes baseUrl: rejects non-https URLs', () => {
    const config = normalizePlatformAIProviderConfig({
      baseUrl: 'http://api.example.com/v1',
      provider: 'openai_compatible',
    });

    expect(config.baseUrl).toBeUndefined();
  });

  it('normalizes baseUrl: rejects URLs with embedded credentials', () => {
    const config = normalizePlatformAIProviderConfig({
      baseUrl: 'https://user:pass@api.example.com',
      provider: 'openai_compatible',
    });

    expect(config.baseUrl).toBeUndefined();
  });

  it('normalizes baseUrl: returns deepseek default when no baseUrl for deepseek', () => {
    const config = normalizePlatformAIProviderConfig({
      provider: 'deepseek',
    });

    expect(config.baseUrl).toBe('https://api.deepseek.com');
  });

  it('normalizes baseUrl: returns undefined when baseUrl is empty for openai_compatible', () => {
    const config = normalizePlatformAIProviderConfig({
      provider: 'openai_compatible',
    });

    expect(config.baseUrl).toBeUndefined();
  });

  it('normalizes baseUrl: rejects invalid URL string', () => {
    const config = normalizePlatformAIProviderConfig({
      baseUrl: 'not a url at all :///',
      provider: 'openai_compatible',
    });

    expect(config.baseUrl).toBeUndefined();
  });
});
