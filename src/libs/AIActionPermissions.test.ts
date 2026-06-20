import { describe, expect, it } from 'vitest';
import {
  AI_AUDIT_ACTION,
  AIEmployeePermissionError,
  assertCanPerformAIAction,
  canPerformAIAction,
  getRequiredAIPermission,
} from './AIActionPermissions';
import { DEFAULT_AI_EMPLOYEE_SETTINGS } from './AIEmployeeSettings';

describe('AIActionPermissions', () => {
  it('maps all actions to store-owned permissions', () => {
    expect(getRequiredAIPermission(AI_AUDIT_ACTION.REPLY)).toBe('reply_to_customers');
    expect(getRequiredAIPermission(AI_AUDIT_ACTION.CREATE_ORDER)).toBe('create_orders_after_confirmation');
    expect(getRequiredAIPermission(AI_AUDIT_ACTION.BUILD_CART)).toBe('build_carts');
    expect(getRequiredAIPermission(AI_AUDIT_ACTION.CAPTURE_REVIEW)).toBe('request_reviews');
    expect(getRequiredAIPermission(AI_AUDIT_ACTION.RECOMMEND_PRODUCTS)).toBe('recommend_products');
  });

  it('blocks actions when AI is disabled', () => {
    expect(canPerformAIAction(DEFAULT_AI_EMPLOYEE_SETTINGS, AI_AUDIT_ACTION.REPLY)).toBe(false);
    expect(() => assertCanPerformAIAction(DEFAULT_AI_EMPLOYEE_SETTINGS, AI_AUDIT_ACTION.REPLY))
      .toThrow(AIEmployeePermissionError);
  });

  it('allows actions when AI is enabled and permission is present', () => {
    const settings = {
      ...DEFAULT_AI_EMPLOYEE_SETTINGS,
      enabled: true,
    };

    expect(canPerformAIAction(settings, AI_AUDIT_ACTION.REPLY)).toBe(true);
    expect(() => assertCanPerformAIAction(settings, AI_AUDIT_ACTION.REPLY)).not.toThrow();
  });

  it('throws when AI is enabled but the specific permission is false', () => {
    const settings = {
      ...DEFAULT_AI_EMPLOYEE_SETTINGS,
      enabled: true,
      permissions: {
        ...DEFAULT_AI_EMPLOYEE_SETTINGS.permissions,
        build_carts: false,
      },
    };

    expect(canPerformAIAction(settings, AI_AUDIT_ACTION.BUILD_CART)).toBe(false);
    expect(() => assertCanPerformAIAction(settings, AI_AUDIT_ACTION.BUILD_CART))
      .toThrow(AIEmployeePermissionError);
  });
});
