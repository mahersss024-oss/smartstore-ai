import { describe, expect, it } from 'vitest';
import { normalizeAIEmployeeSettings } from './AIEmployeeSettings';

describe('AIEmployeeSettings', () => {
  it('normalizes missing settings to safe defaults', () => {
    const settings = normalizeAIEmployeeSettings(null);

    expect(settings.enabled).toBe(false);
    expect(settings.language).toBe('ar');
    expect(settings.dialect).toBe('saudi_arabic');
    expect(settings.permissions.create_orders_after_confirmation).toBe(true);
  });

  it('rejects unsupported language and dialect values', () => {
    const settings = normalizeAIEmployeeSettings({
      dialect: 'unsafe_custom_dialect',
      fallbackLanguage: 'unsafe',
      language: 'unsafe',
    });

    expect(settings.language).toBe('ar');
    expect(settings.dialect).toBe('saudi_arabic');
    expect(settings.fallbackLanguage).toBe('ar');
  });

  it('keeps owner-controlled allowed values', () => {
    const settings = normalizeAIEmployeeSettings({
      dialect: 'egyptian_arabic',
      displayName: 'Sales Assistant',
      enabled: true,
      fallbackLanguage: 'en',
      language: 'ar',
      salesStyle: 'active_recommendations',
      targetCountry: 'EG',
      tone: 'friendly',
      welcomeMessage: 'Welcome.',
    });

    expect(settings).toMatchObject({
      dialect: 'egyptian_arabic',
      displayName: 'Sales Assistant',
      enabled: true,
      fallbackLanguage: 'en',
      salesStyle: 'active_recommendations',
      targetCountry: 'EG',
      tone: 'friendly',
      welcomeMessage: 'Welcome.',
    });
  });

  it('keeps explicitly disabled permissions and handoff rules disabled', () => {
    const settings = normalizeAIEmployeeSettings({
      handoffRules: {
        complaints: false,
        customer_requested_human: false,
        low_confidence: false,
        refund_requests: false,
      },
      permissions: {
        build_carts: false,
        create_orders_after_confirmation: false,
        recommend_products: false,
        reply_to_customers: false,
        request_reviews: false,
        suggest_catalog_improvements: false,
        suggest_store_setup_improvements: false,
      },
    });

    expect(Object.values(settings.permissions).every(value => value === false)).toBe(true);
    expect(Object.values(settings.handoffRules).every(value => value === false)).toBe(true);
  });
});
