import { describe, expect, it } from 'vitest';
import { secureTokenEquals } from './SecureTokens';

describe('SecureTokens', () => {
  it('accepts matching tokens', () => {
    expect(secureTokenEquals('secret-value', 'secret-value')).toBe(true);
  });

  it('rejects different, missing, and differently sized tokens', () => {
    expect(secureTokenEquals('secret-value', 'other-value')).toBe(false);
    expect(secureTokenEquals('short', 'a-much-longer-secret')).toBe(false);
    expect(secureTokenEquals(undefined, 'secret-value')).toBe(false);
  });
});
