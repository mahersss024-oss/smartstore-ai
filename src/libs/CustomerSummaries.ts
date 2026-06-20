import { getCustomerIdentityKeys } from './CustomerIdentity';
import { ORDER_EVENT_TYPE } from './OrderWorkflow';

type CustomerMetadata = {
  archivedAt?: unknown;
};

export type CustomerSummaryInputProfile = {
  displayName?: null | string;
  email?: null | string;
  externalId?: null | string;
  id: number;
  lastContactAt?: Date | null;
  metadata?: unknown;
  phone?: null | string;
};

export type CustomerSummaryInputOrder = {
  archivedAt?: Date | null;
  createdAt: Date;
  customerEmail?: null | string;
  customerPhone?: null | string;
  id: number;
  totalPrice?: null | string;
};

export type CustomerSummaryInputReview = {
  createdAt: Date;
  customerId?: null | number;
  orderId?: null | number;
  rating: number;
};

export type CustomerSummaryInputEvent = {
  createdAt: Date;
  eventType: string;
  metadata?: unknown;
  orderId: number;
};

export type CustomerSummary = {
  averageRating: null | number;
  email: null | string;
  feedbackCount: number;
  id: number;
  isArchived: boolean;
  lastContactAt: Date | null;
  lastOrderAt: Date | null;
  latestFeedback?: {
    createdAt: Date;
    message: string;
    orderId: number;
  };
  latestRating?: {
    createdAt: Date;
    orderId: null | number;
    rating: number;
  };
  name: string;
  orderIds: number[];
  ordersCount: number;
  phone: string;
  totalSpent: number;
};

const isCustomerArchived = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object') {
    return false;
  }

  return typeof (metadata as CustomerMetadata).archivedAt === 'string';
};

const getCustomerFeedbackMessage = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const data = metadata as { customerMessage?: unknown };

  return typeof data.customerMessage === 'string' && data.customerMessage.trim()
    ? data.customerMessage.trim()
    : null;
};

const getCustomerDisplayLabel = (
  customer: Pick<CustomerSummaryInputProfile, 'displayName' | 'email' | 'externalId' | 'phone'>,
  fallback: string,
) => {
  return customer.displayName?.trim()
    || customer.phone?.trim()
    || customer.email?.trim()
    || customer.externalId?.trim()
    || fallback;
};

export const buildCustomerSummaries = (params: {
  customerProfiles: CustomerSummaryInputProfile[];
  fallbackName: string;
  feedbackEvents: CustomerSummaryInputEvent[];
  orders: CustomerSummaryInputOrder[];
  reviews: CustomerSummaryInputReview[];
  showArchived: boolean;
}) => {
  const customerMap = new Map<number, CustomerSummary>();
  const customerIdToSummary = new Map<number, CustomerSummary>();
  const identityToCustomerId = new Map<string, number>();
  const orderIdToCustomerId = new Map<number, number>();

  for (const customer of params.customerProfiles) {
    const isArchived = isCustomerArchived(customer.metadata);

    if (isArchived !== params.showArchived) {
      continue;
    }

    const identityKeys = getCustomerIdentityKeys(customer);
    const existingCustomerId = identityKeys
      .map(identity => identityToCustomerId.get(identity))
      .find((id): id is number => typeof id === 'number');
    const existingSummary = existingCustomerId
      ? customerMap.get(existingCustomerId)
      : undefined;

    if (existingSummary) {
      customerIdToSummary.set(customer.id, existingSummary);

      if (
        customer.lastContactAt
        && (
          !existingSummary.lastContactAt
          || customer.lastContactAt > existingSummary.lastContactAt
        )
      ) {
        existingSummary.lastContactAt = customer.lastContactAt;
      }

      existingSummary.email ??= customer.email ?? null;
      if (
        existingSummary.phone === params.fallbackName
        || existingSummary.phone.startsWith('guest-')
        || existingSummary.phone.startsWith('web-chat-')
      ) {
        existingSummary.phone = customer.phone?.trim()
          || customer.externalId?.trim()
          || existingSummary.phone;
      }

      for (const identity of identityKeys) {
        identityToCustomerId.set(identity, existingSummary.id);
      }

      continue;
    }

    const summary: CustomerSummary = {
      averageRating: null,
      email: customer.email ?? null,
      feedbackCount: 0,
      id: customer.id,
      isArchived,
      lastContactAt: customer.lastContactAt ?? null,
      lastOrderAt: null,
      name: getCustomerDisplayLabel(customer, params.fallbackName),
      orderIds: [],
      ordersCount: 0,
      phone: customer.phone?.trim() || customer.externalId?.trim() || params.fallbackName,
      totalSpent: 0,
    };

    customerMap.set(customer.id, summary);
    customerIdToSummary.set(customer.id, summary);

    for (const identity of identityKeys) {
      identityToCustomerId.set(identity, customer.id);
    }
  }

  for (const review of params.reviews) {
    if (!review.orderId || !review.customerId) {
      continue;
    }

    const summary = customerIdToSummary.get(review.customerId);

    if (summary) {
      orderIdToCustomerId.set(review.orderId, summary.id);
    }
  }

  for (const order of params.orders) {
    const customerId = orderIdToCustomerId.get(order.id)
      ?? getCustomerIdentityKeys({
        email: order.customerEmail,
        phone: order.customerPhone,
      })
        .map(identity => identityToCustomerId.get(identity))
        .find((id): id is number => typeof id === 'number');
    const summary = customerId ? customerMap.get(customerId) : undefined;

    if (!customerId || !summary) {
      continue;
    }

    orderIdToCustomerId.set(order.id, customerId);
    summary.orderIds.push(order.id);

    if (order.archivedAt) {
      continue;
    }

    summary.ordersCount += 1;
    summary.totalSpent += Number(order.totalPrice ?? 0);

    if (!summary.lastOrderAt || order.createdAt > summary.lastOrderAt) {
      summary.lastOrderAt = order.createdAt;
    }
  }

  const ratingTotals = new Map<number, { count: number; total: number }>();
  for (const review of params.reviews) {
    const customerId = (review.customerId
      ? customerIdToSummary.get(review.customerId)?.id
      : undefined)
    ?? (review.orderId ? orderIdToCustomerId.get(review.orderId) : undefined);
    const summary = customerId ? customerMap.get(customerId) : undefined;

    if (!customerId || !summary) {
      continue;
    }

    const total = ratingTotals.get(customerId) ?? { count: 0, total: 0 };
    total.count += 1;
    total.total += review.rating;
    ratingTotals.set(customerId, total);

    if (!summary.latestRating) {
      summary.latestRating = {
        createdAt: review.createdAt,
        orderId: review.orderId ?? null,
        rating: review.rating,
      };
    }
  }

  for (const [customerId, total] of ratingTotals) {
    const summary = customerMap.get(customerId);

    if (summary) {
      summary.averageRating = total.total / total.count;
    }
  }

  for (const event of params.feedbackEvents) {
    if (event.eventType !== ORDER_EVENT_TYPE.CUSTOMER_COMPLAINT) {
      continue;
    }

    const customerId = orderIdToCustomerId.get(event.orderId);
    const summary = customerId ? customerMap.get(customerId) : undefined;
    const message = getCustomerFeedbackMessage(event.metadata);

    if (!summary || !message) {
      continue;
    }

    summary.feedbackCount += 1;
    summary.latestFeedback ??= {
      createdAt: event.createdAt,
      message,
      orderId: event.orderId,
    };
  }

  return Array.from(customerMap.values());
};
