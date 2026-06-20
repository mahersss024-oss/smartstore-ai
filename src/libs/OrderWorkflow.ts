export const ORDER_STATUS = {
  APPROVED_BY_STORE: 'approved_by_store',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  CONFIRMED: 'confirmed',
  DRAFT: 'draft',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  PENDING_STORE_REVIEW: 'pending_store_review',
  PREPARING: 'preparing',
  READY_FOR_PICKUP: 'ready_for_pickup',
  SENT_TO_CUSTOMER: 'sent_to_customer',
  WAITING_PAYMENT: 'waiting_payment',
} as const;

export const PAYMENT_STATUS = {
  FAILED: 'failed',
  PAID: 'paid',
  PENDING: 'pending',
  REFUNDED: 'refunded',
  UNPAID: 'unpaid',
} as const;

export const DELIVERY_STATUS = {
  COMPLETED: 'completed',
  NOT_STARTED: 'not_started',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  PREPARING: 'preparing',
  READY_FOR_PICKUP: 'ready_for_pickup',
} as const;

export const ORDER_EVENT_TYPE = {
  CUSTOMER_COMPLAINT: 'customer_complaint',
  ORDER_APPROVED: 'order_approved',
  ORDER_COMPLETED: 'order_completed',
  ORDER_CREATED: 'order_created',
  ORDER_UPDATED: 'order_updated',
  PAYMENT_LINK_CREATED: 'payment_link_created',
  REVIEW_REQUESTED: 'review_requested',
  STATUS_CHANGED: 'status_changed',
} as const;

export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];

const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  [ORDER_STATUS.DRAFT]: [
    ORDER_STATUS.PENDING_STORE_REVIEW,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.PENDING_STORE_REVIEW]: [
    ORDER_STATUS.APPROVED_BY_STORE,
    ORDER_STATUS.WAITING_PAYMENT,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.APPROVED_BY_STORE]: [
    ORDER_STATUS.CONFIRMED,
    ORDER_STATUS.PREPARING,
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.SENT_TO_CUSTOMER]: [
    ORDER_STATUS.CONFIRMED,
    ORDER_STATUS.WAITING_PAYMENT,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.WAITING_PAYMENT]: [
    ORDER_STATUS.CONFIRMED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.CONFIRMED]: [
    ORDER_STATUS.PREPARING,
    ORDER_STATUS.READY_FOR_PICKUP,
    ORDER_STATUS.OUT_FOR_DELIVERY,
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.PREPARING]: [
    ORDER_STATUS.READY_FOR_PICKUP,
    ORDER_STATUS.OUT_FOR_DELIVERY,
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.READY_FOR_PICKUP]: [
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.OUT_FOR_DELIVERY]: [
    ORDER_STATUS.COMPLETED,
    ORDER_STATUS.CANCELLED,
  ],
  [ORDER_STATUS.COMPLETED]: [],
  [ORDER_STATUS.CANCELLED]: [],
};

const isOrderStatus = (value: string): value is OrderStatus => {
  return Object.values(ORDER_STATUS).includes(value as OrderStatus);
};

export const canTransitionOrderStatus = (from: string, to: string) => {
  if (!isOrderStatus(from) || !isOrderStatus(to)) {
    return false;
  }

  return allowedTransitions[from].includes(to);
};

export const assertCanTransitionOrderStatus = (from: string, to: string) => {
  if (!canTransitionOrderStatus(from, to)) {
    throw new Error(`Invalid order status transition from ${from} to ${to}`);
  }
};
