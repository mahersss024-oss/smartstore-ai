import { describe, expect, it } from 'vitest';
import {
  buildPlatformSystemPrompt,
  getDialectFallbackLanguage,
  isForbiddenAIAction,
  isSupportedAIDialect,
  validateAIAction,
} from './PlatformAIPolicy';

describe('PlatformAIPolicy', () => {
  it('validates supported dialects and fallback language', () => {
    expect(isSupportedAIDialect('saudi_arabic')).toBe(true);
    expect(isSupportedAIDialect('english')).toBe(true);
    expect(isSupportedAIDialect('unknown_dialect')).toBe(false);
    expect(getDialectFallbackLanguage('english')).toBe('en');
    expect(getDialectFallbackLanguage('unknown_dialect')).toBe('ar');
  });

  it('blocks platform-owned forbidden actions', () => {
    expect(isForbiddenAIAction('billing.change_subscription')).toBe(true);
    expect(isForbiddenAIAction('team_permissions.manage')).toBe(true);
    expect(isForbiddenAIAction('reply')).toBe(false);
  });

  it('requires explicit customer confirmation before order creation action', () => {
    expect(() => validateAIAction({
      confidence: 0.9,
      customerConfirmed: true,
      organizationId: 'org_1',
      type: 'create_order_after_confirmation',
    })).not.toThrow();

    expect(() => validateAIAction({
      confidence: 0.9,
      customerConfirmed: false,
      organizationId: 'org_1',
      type: 'create_order_after_confirmation',
    })).toThrow();
  });

  it('keeps the system prompt platform scoped', () => {
    const prompt = buildPlatformSystemPrompt();

    expect(prompt).toContain('exactly one store');
    expect(prompt).toContain('organization-scoped context');
    expect(prompt).toContain('Never access another store');
  });
});
