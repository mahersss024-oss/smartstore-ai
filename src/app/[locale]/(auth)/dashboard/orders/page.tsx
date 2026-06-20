import { auth } from '@clerk/nextjs/server';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { PendingSubmitButton } from '@/components/PendingSubmitButton';
import { DashboardPagination } from '@/features/dashboard/DashboardPagination';
import {
  approveOrderForCustomer,
  completeOrderAndRequestReview,
  deleteOrderFromDashboard,
  updateOrderStatusFromDashboard,
} from '@/features/dashboard/OrderActions';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { formatDatabaseDateTime } from '@/libs/DateTime';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { normalizeOrderItems } from '@/libs/OrderDataNormalization';
import {
  buildOrderTimeline,
  formatOrderAge,
  getOrderAgeMinutes,
  getOrderPriority,
  getProductionOrderActions,
  mapOrderStatusToProductionState,
} from '@/libs/OrderOperations';
import { ORDER_EVENT_TYPE, ORDER_STATUS, PAYMENT_STATUS } from '@/libs/OrderWorkflow';
import {
  conversationsTable,
  deliveryMethodsTable,
  invoicesTable,
  orderEventsTable,
  ordersTable,
} from '@/models/Schema';

type OrderFulfillmentKey
  = | 'fulfillment_delivery'
    | 'fulfillment_dine_in'
    | 'fulfillment_pickup'
    | 'fulfillment_unknown';

type OrderAIAnalysis = {
  conversationId?: unknown;
  customerDetails?: {
    deliveryPreference?: unknown;
    fulfillmentType?: unknown;
  };
  deliveryPreference?: unknown;
  fulfillment?: {
    deliveryPreference?: unknown;
    type?: unknown;
  };
  fulfillmentType?: unknown;
};

const productionStateTranslationKeys = {
  accepted: 'production_state_accepted',
  cancelled: 'production_state_cancelled',
  completed: 'production_state_completed',
  needs_customer_confirmation: 'production_state_needs_customer_confirmation',
  new: 'production_state_new',
  out_for_delivery: 'production_state_out_for_delivery',
  preparing: 'production_state_preparing',
  ready: 'production_state_ready',
  rejected: 'production_state_rejected',
} as const;

const priorityTranslationKeys = {
  high: 'priority_high',
  medium: 'priority_medium',
  normal: 'priority_normal',
} as const;

const timelineTranslationKeys = {
  accepted: 'timeline_accepted',
  cancelled: 'timeline_cancelled',
  created: 'timeline_created',
  delivered: 'timeline_delivered',
  notifications: 'timeline_notifications',
  preparing: 'timeline_preparing',
  ready: 'timeline_ready',
  rejected: 'timeline_rejected',
} as const;

const getComplaintMessage = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object') {
    return null;
  }

  const data = metadata as { customerMessage?: unknown };

  return typeof data.customerMessage === 'string'
    ? data.customerMessage
    : null;
};

const getAIAnalysisObject = (aiAnalysis: unknown): OrderAIAnalysis => {
  if (!aiAnalysis || typeof aiAnalysis !== 'object') {
    return {};
  }

  return aiAnalysis as OrderAIAnalysis;
};

const getOrderConversationId = (aiAnalysis: unknown) => {
  const value = getAIAnalysisObject(aiAnalysis).conversationId;

  return typeof value === 'number' ? value : undefined;
};

const getFulfillmentKeyFromDeliveryMethodType = (
  type?: null | string,
): OrderFulfillmentKey | undefined => {
  if (!type) {
    return undefined;
  }

  if (type === 'dine_in') {
    return 'fulfillment_dine_in';
  }

  if (type === 'pickup' || type === 'curbside_pickup') {
    return 'fulfillment_pickup';
  }

  if (
    type === 'local_delivery'
    || type === 'scheduled_delivery'
    || type === 'courier_shipping'
    || type === 'digital'
  ) {
    return 'fulfillment_delivery';
  }

  return undefined;
};

const getOrderFulfillmentKey = (params: {
  aiAnalysis: unknown;
  conversationMetadata?: unknown;
  customerAddress?: null | string;
  deliveryMethodType?: null | string;
}): OrderFulfillmentKey => {
  const deliveryMethodKey = getFulfillmentKeyFromDeliveryMethodType(params.deliveryMethodType);

  if (deliveryMethodKey) {
    return deliveryMethodKey;
  }

  const aiAnalysis = getAIAnalysisObject(params.aiAnalysis);
  const fulfillmentType = aiAnalysis.fulfillment?.type
    ?? aiAnalysis.customerDetails?.fulfillmentType
    ?? aiAnalysis.fulfillmentType;

  if (fulfillmentType === 'dine_in') {
    return 'fulfillment_dine_in';
  }

  if (fulfillmentType === 'pickup') {
    return 'fulfillment_pickup';
  }

  if (fulfillmentType === 'delivery') {
    return 'fulfillment_delivery';
  }

  const deliveryPreference = aiAnalysis.fulfillment?.deliveryPreference
    ?? aiAnalysis.customerDetails?.deliveryPreference
    ?? aiAnalysis.deliveryPreference;

  if (deliveryPreference === 'pickup') {
    return 'fulfillment_pickup';
  }

  if (deliveryPreference === 'delivery' || params.customerAddress) {
    return 'fulfillment_delivery';
  }

  if (params.conversationMetadata) {
    return getOrderFulfillmentKey({
      aiAnalysis: params.conversationMetadata,
      customerAddress: params.customerAddress,
      deliveryMethodType: null,
    });
  }

  return 'fulfillment_unknown';
};

export default async function OrdersPage(props: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ page?: string }>;
}) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const requestedPage = Number.parseInt(searchParams?.page ?? '1', 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const pageSize = 25;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'OrdersPage',
  });
  const { orgId } = await auth();
  const formatDateTime = (value?: Date | null) => {
    return formatDatabaseDateTime(value, locale) ?? t('not_available');
  };
  const orders = orgId
    ? await db
        .select()
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.organizationId, orgId),
            isNull(ordersTable.archivedAt),
          ),
        )
        .orderBy(desc(ordersTable.createdAt))
        .limit(pageSize + 1)
        .offset((currentPage - 1) * pageSize)
    : [];
  const hasNextPage = orders.length > pageSize;
  const visibleOrders = hasNextPage ? orders.slice(0, pageSize) : orders;
  const orderIds = visibleOrders.map(order => order.id);
  const conversationIds = visibleOrders
    .map(order => getOrderConversationId(order.aiAnalysis))
    .filter((id): id is number => typeof id === 'number');
  const invoices = orgId && orderIds.length > 0
    ? await db
        .select()
        .from(invoicesTable)
        .where(
          and(
            eq(invoicesTable.organizationId, orgId),
            inArray(invoicesTable.orderId, orderIds),
          ),
        )
    : [];
  const deliveryMethods = orgId
    ? await db
        .select({
          id: deliveryMethodsTable.id,
          type: deliveryMethodsTable.type,
        })
        .from(deliveryMethodsTable)
        .where(eq(deliveryMethodsTable.organizationId, orgId))
    : [];
  const conversations = orgId && conversationIds.length > 0
    ? await db
        .select({
          id: conversationsTable.id,
          metadata: conversationsTable.metadata,
        })
        .from(conversationsTable)
        .where(
          and(
            eq(conversationsTable.organizationId, orgId),
            inArray(conversationsTable.id, conversationIds),
          ),
        )
    : [];
  const complaintEvents = orgId && orderIds.length > 0
    ? await db
        .select()
        .from(orderEventsTable)
        .where(
          and(
            eq(orderEventsTable.organizationId, orgId),
            inArray(orderEventsTable.orderId, orderIds),
          ),
        )
        .orderBy(desc(orderEventsTable.createdAt))
    : [];

  const getInvoice = (orderId: number) => {
    return invoices.find(invoice => invoice.orderId === orderId);
  };
  const getDeliveryMethodType = (deliveryMethodId?: null | number) => {
    return deliveryMethods.find(method => method.id === deliveryMethodId)?.type;
  };
  const getConversationMetadata = (aiAnalysis: unknown) => {
    const conversationId = getOrderConversationId(aiAnalysis);

    if (!conversationId) {
      return undefined;
    }

    return conversations.find(conversation => conversation.id === conversationId)?.metadata;
  };
  const getComplaintEvents = (orderId: number) => {
    return complaintEvents.filter((event) => {
      return event.orderId === orderId
        && event.eventType === ORDER_EVENT_TYPE.CUSTOMER_COMPLAINT;
    });
  };
  const getOrderStatusLabel = (status: string) => {
    switch (status) {
      case 'draft':
        return t('status_draft');
      case 'pending_store_review':
        return t('status_pending_store_review');
      case 'approved_by_store':
        return t('status_approved_by_store');
      case 'sent_to_customer':
        return t('status_sent_to_customer');
      case 'waiting_payment':
        return t('status_waiting_payment');
      case 'confirmed':
        return t('status_confirmed');
      case 'preparing':
        return t('status_preparing');
      case 'out_for_delivery':
        return t('status_out_for_delivery');
      case 'ready_for_pickup':
        return t('status_ready_for_pickup');
      case 'completed':
        return t('status_completed');
      case 'cancelled':
        return t('status_cancelled');
      default:
        return status;
    }
  };
  const getPaymentStatusLabel = (status: string) => {
    switch (status) {
      case 'unpaid':
        return t('payment_unpaid');
      case 'paid':
        return t('payment_paid');
      case 'pending':
        return t('payment_pending');
      case 'failed':
        return t('payment_failed');
      case 'refunded':
        return t('payment_refunded');
      default:
        return status;
    }
  };
  const getEffectivePaymentStatus = (order: {
    paymentStatus: string;
    status: string;
  }) => {
    if (
      order.status === ORDER_STATUS.COMPLETED
      && order.paymentStatus === PAYMENT_STATUS.UNPAID
    ) {
      return PAYMENT_STATUS.PAID;
    }

    return order.paymentStatus;
  };
  const statusesThatCanStartPreparing = new Set<string>([
    ORDER_STATUS.APPROVED_BY_STORE,
    ORDER_STATUS.CONFIRMED,
  ]);
  const statusesThatCanComplete = new Set<string>([
    ORDER_STATUS.APPROVED_BY_STORE,
    ORDER_STATUS.CONFIRMED,
    ORDER_STATUS.PREPARING,
    ORDER_STATUS.OUT_FOR_DELIVERY,
    ORDER_STATUS.READY_FOR_PICKUP,
    ORDER_STATUS.SENT_TO_CUSTOMER,
  ]);
  const statusesThatHideQuickCancel = new Set<string>([
    ORDER_STATUS.OUT_FOR_DELIVERY,
    ORDER_STATUS.CANCELLED,
    ORDER_STATUS.COMPLETED,
  ]);
  const getProductionStateLabel = (state: string) => {
    return t(productionStateTranslationKeys[state as keyof typeof productionStateTranslationKeys] ?? 'production_state_new');
  };
  const getPriorityClassName = (priority: 'high' | 'medium' | 'normal') => {
    if (priority === 'high') {
      return 'border-red-500/40 bg-red-500/10 text-red-700';
    }

    if (priority === 'medium') {
      return 'border-amber-500/40 bg-amber-500/10 text-amber-700';
    }

    return 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700';
  };
  const getTimelineLabel = (key: string) => {
    return t(timelineTranslationKeys[key as keyof typeof timelineTranslationKeys] ?? 'timeline_created');
  };

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      <div className="mb-4">
        <Link
          href="/dashboard/orders/archive"
          className="
            cursor-pointer text-sm font-medium text-primary underline-offset-4
            hover:underline
          "
        >
          {t('view_archive')}
        </Link>
      </div>

      <div className="
        dashboard-panel rounded-xl border
        [&_a]:cursor-pointer
        [&_button]:cursor-pointer
      "
      >
        <div className="
          p-4
          sm:p-6
        "
        >
          {visibleOrders.length > 0
            ? (
                <div className="grid gap-4">
                  {visibleOrders.map((order) => {
                    const invoice = getInvoice(order.id);
                    const orderComplaintEvents = getComplaintEvents(order.id);
                    const orderFulfillmentKey = getOrderFulfillmentKey({
                      aiAnalysis: order.aiAnalysis,
                      conversationMetadata: getConversationMetadata(order.aiAnalysis),
                      customerAddress: order.customerAddress,
                      deliveryMethodType: getDeliveryMethodType(order.deliveryMethodId),
                    });
                    const orderItems = normalizeOrderItems(order.items);
                    const orderEvents = complaintEvents.filter(event => event.orderId === order.id);
                    const productionState = mapOrderStatusToProductionState(order.status);
                    const orderAge = formatOrderAge(getOrderAgeMinutes(order.createdAt));
                    const priority = getOrderPriority({
                      createdAt: order.createdAt,
                      status: order.status,
                      updatedAt: order.updatedAt,
                    });
                    const availableOperations = getProductionOrderActions(productionState);
                    const timeline = buildOrderTimeline({
                      createdAt: order.createdAt,
                      events: orderEvents,
                      status: order.status,
                    });

                    return (
                      <div
                        key={order.id}
                        className="dashboard-surface rounded-xl border p-4"
                      >
                        <div className="
                          flex flex-col gap-4
                          sm:flex-row sm:items-start sm:justify-between
                        "
                        >
                          <div className="min-w-0">
                            <div className="font-semibold">
                              {t('order_number')}
                              {' #'}
                              {order.id}
                            </div>
                            <div className="
                              mt-1 text-sm wrap-break-word text-muted-foreground
                            "
                            >
                              {order.customerName ?? order.customerPhone ?? t('unknown_customer')}
                              {'  '}
                              {order.source ?? 'web'}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2 text-xs">
                              <span className="
                                rounded-full border px-2.5 py-1 font-semibold
                              "
                              >
                                {getProductionStateLabel(productionState)}
                              </span>
                              <span className="rounded-full border px-2.5 py-1">
                                {t('order_age')}
                                {': '}
                                {' '}
                                {orderAge}
                              </span>
                              <span className={`
                                rounded-full border px-2.5 py-1 font-semibold
                                ${getPriorityClassName(priority)}
                              `}
                              >
                                {t(priorityTranslationKeys[priority])}
                                {' '}
                                {t('priority')}
                              </span>
                              <span className="rounded-full border px-2.5 py-1">
                                {t('available_actions')}
                                {': '}
                                {' '}
                                {availableOperations.length}
                              </span>
                            </div>
                          </div>
                          <div className="
                            flex w-full flex-wrap gap-2
                            sm:w-auto sm:justify-end
                          "
                          >
                            {orderComplaintEvents.length > 0 && (
                              <div
                                className="
                                  rounded-full border border-amber-500/40
                                  bg-amber-500/10 px-3 py-1 text-xs
                                  font-semibold text-amber-800
                                "
                              >
                                {t('complaint_badge')}
                              </div>
                            )}
                            <div className="
                              rounded-full border px-3 py-1 text-xs
                            "
                            >
                              {getOrderStatusLabel(order.status)}
                            </div>
                          </div>
                        </div>

                        <div className="
                          mt-4 grid gap-2 rounded-lg border p-3 text-xs
                          sm:grid-cols-2
                          lg:grid-cols-7
                        "
                        >
                          {timeline.map(item => (
                            <div
                              key={item.key}
                              className="flex min-w-0 items-center gap-2"
                            >
                              <span className={`
                                size-2.5 rounded-full
                                ${item.status === 'done' ? 'bg-emerald-500' : ''}
                                ${item.status === 'failed' ? 'bg-red-500' : ''}
                                ${item.status === 'pending' ? 'bg-slate-300' : ''}
                                ${item.status === 'skipped' ? 'bg-slate-200' : ''}
                              `}
                              />
                              <span className="
                                font-medium wrap-break-word capitalize
                              "
                              >
                                {getTimelineLabel(item.key)}
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="mt-4 grid gap-2 text-sm wrap-break-word">
                          <div>
                            {t('order_created_at')}
                            {': '}
                            <time dateTime={order.createdAt.toISOString()}>
                              {formatDateTime(order.createdAt)}
                            </time>
                          </div>
                          <div>
                            {t('customer_confirmed_at')}
                            {': '}
                            {order.customerConfirmationAt
                              ? (
                                  <time dateTime={order.customerConfirmationAt.toISOString()}>
                                    {formatDateTime(order.customerConfirmationAt)}
                                  </time>
                                )
                              : t('not_available')}
                          </div>
                          <div>
                            {t('last_updated_at')}
                            {': '}
                            <time dateTime={order.updatedAt.toISOString()}>
                              {formatDateTime(order.updatedAt)}
                            </time>
                          </div>
                          <div>
                            {t('customer_phone')}
                            {': '}
                            {order.customerPhone || t('not_available')}
                          </div>
                          {orderFulfillmentKey === 'fulfillment_delivery' && (
                            <div>
                              {t('customer_address')}
                              {': '}
                              {order.customerAddress || t('not_available')}
                            </div>
                          )}
                          <div>
                            {t('fulfillment_type')}
                            {': '}
                            {t(orderFulfillmentKey)}
                          </div>
                          <div>
                            {t('total')}
                            {': '}
                            {order.totalPrice}
                          </div>
                          <div>
                            {t('payment_status')}
                            {': '}
                            {getPaymentStatusLabel(getEffectivePaymentStatus(order))}
                          </div>
                          {invoice && (
                            <div>
                              {t('invoice')}
                              {': '}
                              {invoice.invoiceNumber}
                              {'  '}
                              {invoice.status}
                            </div>
                          )}
                          {invoice?.paymentLink && (
                            <a
                              href={invoice.paymentLink}
                              target="_blank"
                              rel="noreferrer"
                              className="
                                w-fit max-w-full text-sm font-semibold break-all
                                text-primary underline-offset-4
                                hover:underline
                              "
                            >
                              {t('open_payment_link')}
                            </a>
                          )}
                          {orgId && order.customerPhone && (
                            <Link
                              href={`/track/${orgId}/${order.id}?phone=${encodeURIComponent(order.customerPhone)}`}
                              className="
                                w-fit max-w-full text-sm font-semibold break-all
                                text-primary underline-offset-4
                                hover:underline
                              "
                            >
                              {t('open_tracking_page')}
                            </Link>
                          )}
                        </div>

                        <div className="mt-4 rounded-lg border p-3 text-sm">
                          <div className="font-semibold">
                            {t('order_items')}
                          </div>
                          {orderItems.length > 0
                            ? (
                                <div className="mt-2 grid gap-2">
                                  {orderItems.map(item => (
                                    <div
                                      key={`${item.productId ?? item.name}-${item.quantity ?? 1}-${item.unitPrice ?? 0}`}
                                      className="
                                        flex flex-col gap-1
                                        text-muted-foreground
                                        sm:flex-row sm:items-center
                                        sm:justify-between sm:gap-3
                                      "
                                    >
                                      <span className="wrap-break-word">{item.name}</span>
                                      <span className="shrink-0">
                                        x
                                        {item.quantity ?? 1}
                                        {item.unitPrice !== undefined
                                          ? ` - ${item.unitPrice}`
                                          : ''}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )
                            : (
                                <div className="mt-2 text-muted-foreground">
                                  {t('no_order_items_saved')}
                                </div>
                              )}
                        </div>

                        {orderComplaintEvents.length > 0 && (
                          <div className="
                            mt-4 rounded-lg border border-amber-500/30
                            bg-amber-500/10 p-3 text-sm
                          "
                          >
                            <div className="
                              flex flex-wrap items-center justify-between gap-2
                            "
                            >
                              <div className="font-semibold text-amber-800">
                                {t('customer_complaints')}
                              </div>
                              <div className="
                                rounded-full bg-amber-500/15 px-2 py-1 text-xs
                                font-semibold text-amber-800
                              "
                              >
                                {t('complaint_requires_attention')}
                              </div>
                            </div>
                            <div className="mt-2 grid gap-2">
                              {orderComplaintEvents.map(event => (
                                <div
                                  key={event.id}
                                  className="
                                    rounded-lg border bg-background/60 p-3
                                    text-muted-foreground
                                  "
                                >
                                  <div className="
                                    text-xs font-medium text-amber-800
                                  "
                                  >
                                    {t('complaint_time')}
                                    {': '}
                                    {formatDateTime(event.createdAt)}
                                  </div>
                                  <div className="mt-1 text-foreground">
                                    {getComplaintMessage(event.metadata) ?? event.summary}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="
                          mt-4 grid grid-cols-1 gap-2
                          sm:flex sm:flex-wrap
                        "
                        >
                          {order.status === ORDER_STATUS.PENDING_STORE_REVIEW && (
                            <form
                              className="
                                w-full
                                sm:w-auto
                              "
                              action={approveOrderForCustomer.bind(null, locale, order.id)}
                            >
                              <PendingSubmitButton
                                className="
                                  min-h-10 w-full rounded-lg bg-primary px-4
                                  py-2 text-sm font-medium
                                  text-primary-foreground
                                  sm:w-auto
                                "
                              >
                                {t('approve_order')}
                              </PendingSubmitButton>
                            </form>
                          )}

                          {statusesThatCanStartPreparing.has(order.status) && (
                            <form
                              className="
                                w-full
                                sm:w-auto
                              "
                              action={updateOrderStatusFromDashboard.bind(
                                null,
                                locale,
                                order.id,
                                ORDER_STATUS.PREPARING,
                              )}
                            >
                              <PendingSubmitButton
                                className="
                                  min-h-10 w-full dashboard-pill rounded-lg
                                  border px-4 py-2 text-sm font-medium
                                  transition-colors
                                  hover:bg-accent
                                  sm:w-auto
                                "
                              >
                                {t('mark_preparing')}
                              </PendingSubmitButton>
                            </form>
                          )}

                          {order.status === ORDER_STATUS.PREPARING
                            && orderFulfillmentKey === 'fulfillment_delivery' && (
                            <form
                              className="
                                w-full
                                sm:w-auto
                              "
                              action={updateOrderStatusFromDashboard.bind(
                                null,
                                locale,
                                order.id,
                                ORDER_STATUS.OUT_FOR_DELIVERY,
                              )}
                            >
                              <PendingSubmitButton
                                className="
                                  min-h-10 w-full dashboard-pill rounded-lg
                                  border px-4 py-2 text-sm font-medium
                                  transition-colors
                                  hover:bg-accent
                                  sm:w-auto
                                "
                              >
                                {t('mark_out_for_delivery')}
                              </PendingSubmitButton>
                            </form>
                          )}

                          {order.status === ORDER_STATUS.PREPARING
                            && orderFulfillmentKey !== 'fulfillment_delivery' && (
                            <form
                              className="
                                w-full
                                sm:w-auto
                              "
                              action={updateOrderStatusFromDashboard.bind(
                                null,
                                locale,
                                order.id,
                                ORDER_STATUS.READY_FOR_PICKUP,
                              )}
                            >
                              <PendingSubmitButton
                                className="
                                  min-h-10 w-full dashboard-pill rounded-lg
                                  border px-4 py-2 text-sm font-medium
                                  transition-colors
                                  hover:bg-accent
                                  sm:w-auto
                                "
                              >
                                {t('mark_ready_for_pickup')}
                              </PendingSubmitButton>
                            </form>
                          )}

                          {statusesThatCanComplete.has(order.status) && (
                            <form
                              className="
                                w-full
                                sm:w-auto
                              "
                              action={completeOrderAndRequestReview.bind(null, locale, order.id)}
                            >
                              <PendingSubmitButton
                                className="
                                  min-h-10 w-full dashboard-pill rounded-lg
                                  border px-4 py-2 text-sm font-medium
                                  transition-colors
                                  hover:bg-accent
                                  sm:w-auto
                                "
                              >
                                {t('complete_order_request_review')}
                              </PendingSubmitButton>
                            </form>
                          )}

                          {!statusesThatHideQuickCancel.has(order.status) && (
                            <form
                              className="
                                w-full
                                sm:w-auto
                              "
                              action={updateOrderStatusFromDashboard.bind(
                                null,
                                locale,
                                order.id,
                                ORDER_STATUS.CANCELLED,
                              )}
                            >
                              <PendingSubmitButton
                                className="
                                  min-h-10 w-full rounded-lg border
                                  border-destructive/40 px-4 py-2 text-sm
                                  font-medium text-destructive transition-colors
                                  hover:bg-destructive/10
                                  sm:w-auto
                                "
                              >
                                {t('cancel_order')}
                              </PendingSubmitButton>
                            </form>
                          )}

                          <form
                            className="
                              w-full
                              sm:w-auto
                            "
                            action={deleteOrderFromDashboard.bind(null, locale, order.id)}
                          >
                            <PendingSubmitButton
                              className="
                                min-h-10 w-full rounded-lg border
                                border-destructive/40 px-4 py-2 text-sm
                                font-medium text-destructive transition-colors
                                hover:bg-destructive/10
                                sm:w-auto
                              "
                            >
                              {t('delete_order')}
                            </PendingSubmitButton>
                          </form>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            : (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="mx-auto mb-4 size-12 text-muted-foreground"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <h3 className="mb-2 text-lg font-semibold">{t('no_orders_title')}</h3>
                    <p className="text-muted-foreground">{t('no_orders_description')}</p>
                  </div>
                </div>
              )}
          <DashboardPagination
            basePath="/dashboard/orders"
            currentPage={currentPage}
            hasNextPage={hasNextPage}
            locale={locale}
          />
        </div>
      </div>
    </>
  );
}
