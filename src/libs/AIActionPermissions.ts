import type { AIEmployeeSettings } from './AIEmployeeSettings';

export const AI_AUDIT_ACTION = {
  BUILD_CART: 'build_cart',
  CAPTURE_REVIEW: 'capture_review',
  CREATE_ORDER: 'create_order',
  RECOMMEND_PRODUCTS: 'recommend_products',
  REPLY: 'reply',
} as const;

export type AIAuditAction = typeof AI_AUDIT_ACTION[keyof typeof AI_AUDIT_ACTION];

export class AIEmployeePermissionError extends Error {
  constructor(
    public actionType: AIAuditAction,
    public requiredPermission: keyof AIEmployeeSettings['permissions'] | 'enabled',
  ) {
    super(`AI employee action is not allowed: ${actionType}`);
  }
}

export const getRequiredAIPermission = (
  actionType: AIAuditAction,
): keyof AIEmployeeSettings['permissions'] => {
  switch (actionType) {
    case AI_AUDIT_ACTION.BUILD_CART:
      return 'build_carts';
    case AI_AUDIT_ACTION.CAPTURE_REVIEW:
      return 'request_reviews';
    case AI_AUDIT_ACTION.CREATE_ORDER:
      return 'create_orders_after_confirmation';
    case AI_AUDIT_ACTION.RECOMMEND_PRODUCTS:
      return 'recommend_products';
    case AI_AUDIT_ACTION.REPLY:
      return 'reply_to_customers';
  }
};

export const canPerformAIAction = (
  settings: AIEmployeeSettings,
  actionType: AIAuditAction,
) => {
  if (!settings.enabled) {
    return false;
  }

  return settings.permissions[getRequiredAIPermission(actionType)];
};

export const assertCanPerformAIAction = (
  settings: AIEmployeeSettings,
  actionType: AIAuditAction,
) => {
  if (!settings.enabled) {
    throw new AIEmployeePermissionError(actionType, 'enabled');
  }

  const permission = getRequiredAIPermission(actionType);

  if (!settings.permissions[permission]) {
    throw new AIEmployeePermissionError(actionType, permission);
  }
};
