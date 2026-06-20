import {
  ORDER_EVENT_TYPE,
  ORDER_STATUS,
} from './OrderWorkflow';

export type ProductionOrderState
  = | 'accepted'
    | 'cancelled'
    | 'completed'
    | 'needs_customer_confirmation'
    | 'new'
    | 'out_for_delivery'
    | 'preparing'
    | 'ready'
    | 'rejected';

export type ProductionOrderAction
  = | 'accept_order'
    | 'contact_customer'
    | 'delay_order'
    | 'mark_delivered'
    | 'mark_ready'
    | 'reject_order'
    | 'request_clarification'
    | 'report_problem'
    | 'start_preparing'
    | 'update_preparation_time'
    | 'view_summary';

export type OrderTimelineMilestone = {
  at?: Date | null;
  key: 'accepted' | 'cancelled' | 'created' | 'delivered' | 'notifications' | 'preparing' | 'ready' | 'rejected';
  status: 'done' | 'failed' | 'pending' | 'skipped';
};

type OrderEventLike = {
  createdAt?: Date | null;
  eventType: string;
  metadata?: unknown;
  toStatus?: null | string;
};

const statusRank: Record<ProductionOrderState, number> = {
  accepted: 2,
  cancelled: 7,
  completed: 6,
  needs_customer_confirmation: 1,
  new: 0,
  out_for_delivery: 5,
  preparing: 3,
  ready: 4,
  rejected: 7,
};

export const mapOrderStatusToProductionState = (status: string): ProductionOrderState => {
  switch (status) {
    case ORDER_STATUS.DRAFT:
    case ORDER_STATUS.PENDING_STORE_REVIEW:
      return 'new';
    case ORDER_STATUS.SENT_TO_CUSTOMER:
    case ORDER_STATUS.WAITING_PAYMENT:
      return 'needs_customer_confirmation';
    case ORDER_STATUS.APPROVED_BY_STORE:
    case ORDER_STATUS.CONFIRMED:
      return 'accepted';
    case ORDER_STATUS.PREPARING:
      return 'preparing';
    case ORDER_STATUS.READY_FOR_PICKUP:
      return 'ready';
    case ORDER_STATUS.OUT_FOR_DELIVERY:
      return 'out_for_delivery';
    case ORDER_STATUS.COMPLETED:
      return 'completed';
    case ORDER_STATUS.CANCELLED:
      return 'cancelled';
    default:
      return 'new';
  }
};

export const getProductionOrderActions = (state: ProductionOrderState): ProductionOrderAction[] => {
  switch (state) {
    case 'new':
      return ['accept_order', 'reject_order', 'request_clarification'];
    case 'needs_customer_confirmation':
      return ['contact_customer', 'reject_order'];
    case 'accepted':
      return ['start_preparing', 'update_preparation_time'];
    case 'preparing':
      return ['mark_ready', 'delay_order', 'report_problem'];
    case 'ready':
    case 'out_for_delivery':
      return ['mark_delivered', 'contact_customer'];
    case 'completed':
      return ['view_summary'];
    case 'cancelled':
    case 'rejected':
      return ['view_summary'];
    default:
      return [];
  }
};

export const getOrderAgeMinutes = (createdAt: Date, now = new Date()) => {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 60_000));
};

export const getOrderPriority = (params: {
  createdAt: Date;
  now?: Date;
  status: string;
  updatedAt?: Date | null;
}) => {
  const state = mapOrderStatusToProductionState(params.status);
  const ageMinutes = getOrderAgeMinutes(params.createdAt, params.now);
  const staleMinutes = params.updatedAt
    ? getOrderAgeMinutes(params.updatedAt, params.now)
    : ageMinutes;

  if (state === 'new' && ageMinutes >= 10) {
    return 'high' as const;
  }

  if ((state === 'accepted' || state === 'preparing') && staleMinutes >= 45) {
    return 'high' as const;
  }

  if (statusRank[state] < statusRank.completed && ageMinutes >= 30) {
    return 'medium' as const;
  }

  return 'normal' as const;
};

export const formatOrderAge = (minutes: number) => {
  if (minutes < 60) {
    return `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest > 0 ? `${hours}h ${rest}m` : `${hours}h`;
};

const getFirstEventDate = (
  events: OrderEventLike[],
  predicate: (event: OrderEventLike) => boolean,
) => {
  return events
    .filter(predicate)
    .map(event => event.createdAt)
    .filter((value): value is Date => value instanceof Date)
    .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
};

const metadataHasFailedNotification = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }

  const data = metadata as Record<string, unknown>;
  return data.notificationStatus === 'failed'
    || data.customerNotificationStatus === 'failed';
};

const metadataHasSentNotification = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }

  const data = metadata as Record<string, unknown>;
  return data.notificationStatus === 'sent'
    || data.customerNotificationStatus === 'sent'
    || Boolean(data.reviewConversationThreadId);
};

export const buildOrderTimeline = (params: {
  createdAt: Date;
  events: OrderEventLike[];
  status: string;
}): OrderTimelineMilestone[] => {
  const state = mapOrderStatusToProductionState(params.status);
  const acceptedAt = getFirstEventDate(params.events, event => (
    event.eventType === ORDER_EVENT_TYPE.ORDER_APPROVED
    || event.toStatus === ORDER_STATUS.APPROVED_BY_STORE
    || event.toStatus === ORDER_STATUS.CONFIRMED
  ));
  const preparingAt = getFirstEventDate(params.events, event => event.toStatus === ORDER_STATUS.PREPARING);
  const readyAt = getFirstEventDate(params.events, event => (
    event.toStatus === ORDER_STATUS.READY_FOR_PICKUP
    || event.toStatus === ORDER_STATUS.OUT_FOR_DELIVERY
  ));
  const deliveredAt = getFirstEventDate(params.events, event => (
    event.eventType === ORDER_EVENT_TYPE.ORDER_COMPLETED
    || event.toStatus === ORDER_STATUS.COMPLETED
  ));
  const cancelledAt = getFirstEventDate(params.events, event => event.toStatus === ORDER_STATUS.CANCELLED);
  const notificationFailed = params.events.some(event => metadataHasFailedNotification(event.metadata));
  const notificationSent = params.events.some(event => metadataHasSentNotification(event.metadata));

  return [
    {
      at: params.createdAt,
      key: 'created',
      status: 'done',
    },
    {
      at: acceptedAt,
      key: 'accepted',
      status: acceptedAt || statusRank[state] >= statusRank.accepted ? 'done' : 'pending',
    },
    {
      at: preparingAt,
      key: 'preparing',
      status: preparingAt || statusRank[state] >= statusRank.preparing ? 'done' : 'pending',
    },
    {
      at: readyAt,
      key: 'ready',
      status: readyAt || statusRank[state] >= statusRank.ready ? 'done' : 'pending',
    },
    {
      at: deliveredAt,
      key: 'delivered',
      status: deliveredAt || state === 'completed' ? 'done' : 'pending',
    },
    {
      at: cancelledAt,
      key: state === 'cancelled' ? 'cancelled' : 'rejected',
      status: cancelledAt || state === 'cancelled' || state === 'rejected' ? 'done' : 'skipped',
    },
    {
      key: 'notifications',
      status: notificationFailed ? 'failed' : notificationSent ? 'done' : 'pending',
    },
  ];
};
