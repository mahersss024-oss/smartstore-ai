import { auth } from '@clerk/nextjs/server';
import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import NextLink from 'next/link';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import {
  archiveCustomerRecord,
  deleteCustomerConversation,
  deleteCustomerRecord,
  restoreCustomerRecord,
} from '@/features/dashboard/CustomerActions';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { getCustomerPhoneIdentityVariants } from '@/libs/CustomerIdentity';
import { formatDatabaseDateTime } from '@/libs/DateTime';
import { db } from '@/libs/DB';
import { normalizeOrderItems } from '@/libs/OrderDataNormalization';
import { ORDER_EVENT_TYPE } from '@/libs/OrderWorkflow';
import {
  conversationMessagesTable,
  conversationsTable,
  customerReviewsTable,
  customersTable,
  orderEventsTable,
  ordersTable,
} from '@/models/Schema';
import { getI18nPath } from '@/utils/Helpers';

type CustomerMetadata = {
  archivedAt?: unknown;
};

type OrderAIAnalysis = {
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
  customer: Pick<
    typeof customersTable.$inferSelect,
    'displayName' | 'email' | 'externalId' | 'phone'
  >,
  fallback: string,
) => {
  return customer.displayName?.trim()
    || customer.phone?.trim()
    || customer.email?.trim()
    || customer.externalId?.trim()
    || fallback;
};

const getOrderAIAnalysis = (value: unknown): OrderAIAnalysis => {
  return value && typeof value === 'object' ? value as OrderAIAnalysis : {};
};

const isDeliveryOrder = (aiAnalysis: unknown, customerAddress?: null | string) => {
  const analysis = getOrderAIAnalysis(aiAnalysis);
  const fulfillmentType = analysis.fulfillment?.type
    ?? analysis.customerDetails?.fulfillmentType
    ?? analysis.fulfillmentType;

  if (fulfillmentType === 'delivery') {
    return true;
  }

  if (fulfillmentType === 'pickup' || fulfillmentType === 'dine_in') {
    return false;
  }

  const deliveryPreference = analysis.fulfillment?.deliveryPreference
    ?? analysis.customerDetails?.deliveryPreference
    ?? analysis.deliveryPreference;

  return deliveryPreference === 'delivery'
    || (deliveryPreference !== 'pickup' && Boolean(customerAddress));
};

type ReviewSentiment = 'neutral' | 'satisfied' | 'unsatisfied';

const getReviewSentiment = (rating: number): ReviewSentiment => {
  if (rating >= 4) {
    return 'satisfied';
  }

  if (rating <= 2) {
    return 'unsatisfied';
  }

  return 'neutral';
};

const buildNormalizedPhoneCondition = (
  column: unknown,
  variants: string[],
) => {
  if (variants.length === 0) {
    return undefined;
  }

  return or(
    ...variants.map(variant => sql`
      regexp_replace(coalesce(${column}, ''), '[^0-9]', '', 'g') = ${variant}
    `),
  );
};

export default async function CustomerDetailsPage(props: {
  params: Promise<{ customerId: string; locale: string }>;
}) {
  const { customerId, locale } = await props.params;
  const numericCustomerId = Number(customerId);

  setRequestLocale(locale);

  const t = await getTranslations({
    locale,
    namespace: 'CustomersPage',
  });
  const reviewSentimentLabels: Record<ReviewSentiment, string> = {
    neutral: t('review_sentiment_neutral'),
    satisfied: t('review_sentiment_satisfied'),
    unsatisfied: t('review_sentiment_unsatisfied'),
  };
  const { orgId } = await auth();

  if (!orgId || !Number.isInteger(numericCustomerId)) {
    return null;
  }

  const formatDateTime = (value?: Date | null) => {
    return formatDatabaseDateTime(value, locale) ?? t('not_available');
  };

  const [customer] = await db
    .select()
    .from(customersTable)
    .where(
      and(
        eq(customersTable.id, numericCustomerId),
        eq(customersTable.organizationId, orgId),
      ),
    )
    .limit(1);

  if (!customer) {
    return (
      <>
        <TitleBar
          title={t('customer_not_found_title')}
          description={t('customer_not_found_description')}
        />
        <NextLink
          href={getI18nPath('/dashboard/customers', locale)}
          className="rounded-full border px-3 py-1.5 text-sm font-medium"
        >
          {t('back_to_customers')}
        </NextLink>
      </>
    );
  }

  const phoneVariants = getCustomerPhoneIdentityVariants(customer.phone)
    .concat(getCustomerPhoneIdentityVariants(customer.externalId));
  const uniquePhoneVariants = Array.from(new Set(phoneVariants));
  const customerEmail = customer.email?.trim().toLowerCase();
  const customerExternalId = customer.externalId?.trim();
  const relatedCustomerConditions = [
    customerEmail
      ? sql`lower(coalesce(${customersTable.email}, '')) = ${customerEmail}`
      : undefined,
    customerExternalId ? eq(customersTable.externalId, customerExternalId) : undefined,
    buildNormalizedPhoneCondition(customersTable.phone, uniquePhoneVariants),
    buildNormalizedPhoneCondition(customersTable.externalId, uniquePhoneVariants),
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const relatedCustomers = relatedCustomerConditions.length > 0
    ? await db
        .select({
          email: customersTable.email,
          externalId: customersTable.externalId,
          id: customersTable.id,
          phone: customersTable.phone,
        })
        .from(customersTable)
        .where(
          and(
            eq(customersTable.organizationId, orgId),
            relatedCustomerConditions.length === 1
              ? relatedCustomerConditions[0]
              : or(...relatedCustomerConditions),
          ),
        )
    : [customer];
  const relatedCustomerIds = Array.from(new Set([
    customer.id,
    ...relatedCustomers.map(relatedCustomer => relatedCustomer.id),
  ]));
  const relatedPhones = Array.from(new Set(
    relatedCustomers.flatMap((relatedCustomer) => {
      return [
        relatedCustomer.phone?.trim(),
        ...getCustomerPhoneIdentityVariants(relatedCustomer.phone),
        ...getCustomerPhoneIdentityVariants(relatedCustomer.externalId),
      ].filter((value): value is string => Boolean(value));
    }),
  ));
  const relatedEmails = Array.from(new Set(
    relatedCustomers
      .map(relatedCustomer => relatedCustomer.email?.trim())
      .filter((value): value is string => Boolean(value)),
  ));
  const directCustomerReviews = await db
    .select()
    .from(customerReviewsTable)
    .where(
      and(
        eq(customerReviewsTable.organizationId, orgId),
        inArray(customerReviewsTable.customerId, relatedCustomerIds),
      ),
    )
    .orderBy(desc(customerReviewsTable.createdAt));
  const reviewedOrderIds = directCustomerReviews
    .map(review => review.orderId)
    .filter((orderId): orderId is number => typeof orderId === 'number');
  const orderIdentityConditions = [
    buildNormalizedPhoneCondition(ordersTable.customerPhone, relatedPhones),
    relatedEmails.length > 0 ? inArray(ordersTable.customerEmail, relatedEmails) : undefined,
    reviewedOrderIds.length > 0 ? inArray(ordersTable.id, reviewedOrderIds) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const orders = orderIdentityConditions.length > 0
    ? await db
        .select()
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.organizationId, orgId),
            orderIdentityConditions.length === 1
              ? orderIdentityConditions[0]
              : or(...orderIdentityConditions),
          ),
        )
        .orderBy(desc(ordersTable.createdAt))
    : [];
  const orderIds = new Set(orders.map(order => order.id));
  const orderIdList = Array.from(orderIds);
  const reviewConditions = [
    eq(customerReviewsTable.customerId, customer.id),
    orderIdList.length > 0 ? inArray(customerReviewsTable.orderId, orderIdList) : undefined,
  ].filter((condition): condition is NonNullable<typeof condition> => Boolean(condition));
  const customerReviews = reviewConditions.length > 0
    ? await db
        .select()
        .from(customerReviewsTable)
        .where(
          and(
            eq(customerReviewsTable.organizationId, orgId),
            reviewConditions.length === 1 ? reviewConditions[0] : or(...reviewConditions),
          ),
        )
        .orderBy(desc(customerReviewsTable.createdAt))
    : [];
  const feedbackEvents = orderIdList.length > 0
    ? (await db
        .select()
        .from(orderEventsTable)
        .where(
          and(
            eq(orderEventsTable.organizationId, orgId),
            eq(orderEventsTable.eventType, ORDER_EVENT_TYPE.CUSTOMER_COMPLAINT),
            inArray(orderEventsTable.orderId, orderIdList),
          ),
        )
        .orderBy(desc(orderEventsTable.createdAt)))
        .map(event => ({
          ...event,
          message: getCustomerFeedbackMessage(event.metadata),
        }))
        .filter((event): event is typeof event & { message: string } => Boolean(event.message))
    : [];
  const conversations = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.organizationId, orgId),
        inArray(conversationsTable.customerId, relatedCustomerIds),
      ),
    )
    .orderBy(desc(conversationsTable.lastMessageAt));
  const conversationIds = new Set(conversations.map(conversation => conversation.id));
  const chatMessages = conversations.length > 0
    ? await db
        .select()
        .from(conversationMessagesTable)
        .where(
          and(
            eq(conversationMessagesTable.organizationId, orgId),
            inArray(conversationMessagesTable.conversationId, Array.from(conversationIds)),
          ),
        )
        .orderBy(asc(conversationMessagesTable.createdAt), asc(conversationMessagesTable.id))
    : [];
  const chatMessagesByConversation = new Map<number, typeof chatMessages>();

  for (const message of chatMessages) {
    const messages = chatMessagesByConversation.get(message.conversationId) ?? [];

    messages.push(message);
    chatMessagesByConversation.set(message.conversationId, messages);
  }
  const isArchived = isCustomerArchived(customer.metadata);
  const customerName = getCustomerDisplayLabel(customer, t('unknown_customer'));
  const averageRating = customerReviews.length > 0
    ? customerReviews.reduce((sum, review) => sum + review.rating, 0) / customerReviews.length
    : null;

  return (
    <>
      <TitleBar
        title={customerName}
        description={t('customer_details_description')}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <NextLink
          href={getI18nPath('/dashboard/customers', locale)}
          className="rounded-full border px-3 py-1.5 text-sm font-medium"
        >
          {t('back_to_customers')}
        </NextLink>

        <div className="flex flex-wrap gap-2">
          {isArchived
            ? (
                <form action={restoreCustomerRecord.bind(null, locale, customer.id)}>
                  <button
                    type="submit"
                    className="
                      rounded-full border px-3 py-1.5 text-sm font-medium
                    "
                  >
                    {t('restore_customer')}
                  </button>
                </form>
              )
            : (
                <form action={archiveCustomerRecord.bind(null, locale, customer.id)}>
                  <button
                    type="submit"
                    className="
                      rounded-full border px-3 py-1.5 text-sm font-medium
                    "
                  >
                    {t('archive_customer')}
                  </button>
                </form>
              )}
          <form action={deleteCustomerRecord.bind(null, locale, customer.id)}>
            <button
              type="submit"
              className="
                rounded-full border border-red-200 px-3 py-1.5 text-sm
                font-medium text-red-700
              "
            >
              {t('delete_customer')}
            </button>
          </form>
        </div>
      </div>

      <div className="grid gap-4">
        <section className="dashboard-panel rounded-xl border p-5">
          <div className="
            grid gap-3 text-sm
            md:grid-cols-4
          "
          >
            <div>
              <span className="text-muted-foreground">{t('phone')}</span>
              {': '}
              {customer.phone || customer.externalId || t('not_available')}
            </div>
            <div>
              <span className="text-muted-foreground">{t('email')}</span>
              {': '}
              {customer.email || t('not_available')}
            </div>
            <div>
              <span className="text-muted-foreground">{t('customer_created_at')}</span>
              {': '}
              <time dateTime={customer.createdAt.toISOString()}>
                {formatDateTime(customer.createdAt)}
              </time>
            </div>
            <div>
              <span className="text-muted-foreground">{t('last_contact_at')}</span>
              {': '}
              {customer.lastContactAt
                ? (
                    <time dateTime={customer.lastContactAt.toISOString()}>
                      {formatDateTime(customer.lastContactAt)}
                    </time>
                  )
                : t('not_available')}
            </div>
            <div>
              <span className="text-muted-foreground">{t('customer_updated_at')}</span>
              {': '}
              <time dateTime={customer.updatedAt.toISOString()}>
                {formatDateTime(customer.updatedAt)}
              </time>
            </div>
            <div>
              <span className="text-muted-foreground">{t('average_rating')}</span>
              {': '}
              {averageRating ? `${averageRating.toFixed(1)}/5` : t('not_available')}
            </div>
            <div>
              <span className="text-muted-foreground">{t('feedback_count')}</span>
              {': '}
              {feedbackEvents.length}
            </div>
          </div>
        </section>

        <section className="dashboard-panel rounded-xl border p-5">
          <h2 className="mb-3 text-base font-semibold">{t('orders_section')}</h2>
          <div className="grid gap-3">
            {orders.length > 0
              ? orders.map(order => (
                  <div
                    key={order.id}
                    className="rounded-lg border bg-background/50 p-3"
                  >
                    <div className="
                      flex flex-wrap items-center justify-between gap-2
                    "
                    >
                      <div className="font-medium">
                        {t('order_number')}
                        {' '}
                        #
                        {order.id}
                      </div>
                      <div className="
                        flex flex-wrap items-center gap-2 text-sm
                        text-muted-foreground
                      "
                      >
                        {order.archivedAt && (
                          <span className="
                            rounded-full border px-2 py-0.5 text-xs
                          "
                          >
                            {t('archived_order_status')}
                          </span>
                        )}
                        <span>{formatDateTime(order.createdAt)}</span>
                      </div>
                    </div>
                    <div className="
                      mt-2 grid gap-2 text-sm
                      md:grid-cols-3
                    "
                    >
                      <div>
                        <span className="text-muted-foreground">{t('order_created_at')}</span>
                        {': '}
                        <time dateTime={order.createdAt.toISOString()}>
                          {formatDateTime(order.createdAt)}
                        </time>
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('customer_confirmed_at')}</span>
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
                        <span className="text-muted-foreground">{t('last_updated_at')}</span>
                        {': '}
                        <time dateTime={order.updatedAt.toISOString()}>
                          {formatDateTime(order.updatedAt)}
                        </time>
                      </div>
                      {order.archivedAt && (
                        <div>
                          <span className="text-muted-foreground">{t('archived_at')}</span>
                          {': '}
                          <time dateTime={order.archivedAt.toISOString()}>
                            {formatDateTime(order.archivedAt)}
                          </time>
                        </div>
                      )}
                      <div>
                        <span className="text-muted-foreground">{t('order_status')}</span>
                        {': '}
                        {order.status}
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('total_spent')}</span>
                        {': '}
                        {order.totalPrice}
                      </div>
                      {isDeliveryOrder(order.aiAnalysis, order.customerAddress) && (
                        <div>
                          <span className="text-muted-foreground">{t('customer_address')}</span>
                          {': '}
                          {order.customerAddress || t('not_available')}
                        </div>
                      )}
                    </div>
                    <div className="
                      mt-3 rounded-md border bg-background/60 p-3 text-sm
                    "
                    >
                      {normalizeOrderItems(order.items).map(item => (
                        <div
                          key={[
                            order.id,
                            String(item.name ?? ''),
                            String(item.quantity ?? ''),
                            String(item.unitPrice ?? ''),
                          ].join('-')}
                          className="flex justify-between gap-3"
                        >
                          <span>{String(item.name ?? t('not_available'))}</span>
                          <span className="text-muted-foreground">
                            x
                            {String(item.quantity ?? 1)}
                            {' - '}
                            {String(item.unitPrice ?? '')}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              : <p className="text-sm text-muted-foreground">{t('no_orders_yet')}</p>}
          </div>
        </section>

        <section className="dashboard-panel rounded-xl border p-5">
          <h2 className="mb-3 text-base font-semibold">{t('reviews_title')}</h2>
          <div className="grid gap-3">
            {customerReviews.length > 0
              ? customerReviews.map(review => (
                  <div
                    key={review.id}
                    className="rounded-lg border bg-background/50 p-3"
                  >
                    <div className="
                      flex flex-wrap items-center justify-between gap-2
                    "
                    >
                      <div className="font-medium">
                        {t('rating_label')}
                        {': '}
                        {review.rating}
                        /5
                      </div>
                      <div className="
                        rounded-full border px-2 py-0.5 text-xs font-medium
                      "
                      >
                        {reviewSentimentLabels[getReviewSentiment(review.rating)]}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {review.orderId
                          ? `${t('order_number')} #${review.orderId}`
                          : t('order_not_linked')}
                      </div>
                    </div>
                    {review.comment && (
                      <p className="
                        mt-2 text-sm whitespace-pre-wrap text-muted-foreground
                      "
                      >
                        {review.comment}
                      </p>
                    )}
                    <div className="mt-2 text-xs text-muted-foreground">
                      {formatDateTime(review.createdAt)}
                    </div>
                  </div>
                ))
              : <p className="text-sm text-muted-foreground">{t('no_reviews')}</p>}
          </div>
        </section>

        <section className="dashboard-panel rounded-xl border p-5">
          <h2 className="mb-3 text-base font-semibold">{t('feedback_title')}</h2>
          <div className="grid gap-3">
            {feedbackEvents.length > 0
              ? feedbackEvents.map(event => (
                  <div
                    key={event.id}
                    className="rounded-lg border bg-background/50 p-3"
                  >
                    <div className="
                      flex flex-wrap items-center justify-between gap-2
                    "
                    >
                      <div className="font-medium">
                        {t('order_number')}
                        {' '}
                        #
                        {event.orderId}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {formatDateTime(event.createdAt)}
                      </div>
                    </div>
                    <p className="
                      mt-2 text-sm whitespace-pre-wrap text-muted-foreground
                    "
                    >
                      {event.message}
                    </p>
                  </div>
                ))
              : <p className="text-sm text-muted-foreground">{t('no_feedback')}</p>}
          </div>
        </section>

        <section className="dashboard-panel rounded-xl border p-5">
          <h2 className="mb-3 text-base font-semibold">{t('chat_history_title')}</h2>
          <div className="grid gap-3">
            {conversations.length > 0
              ? conversations.map(conversation => (
                  <div
                    key={conversation.id}
                    className="rounded-lg border bg-background/50 p-3"
                  >
                    <div className="
                      flex flex-wrap items-center justify-between gap-2
                    "
                    >
                      <div>
                        <div className="font-medium">
                          {t('conversation_number', { number: conversation.id })}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {conversation.channel}
                          {' · '}
                          {formatDateTime(conversation.createdAt)}
                        </div>
                      </div>
                      <form
                        action={deleteCustomerConversation.bind(
                          null,
                          locale,
                          customer.id,
                          conversation.id,
                        )}
                      >
                        <ConfirmSubmitButton
                          className="
                            rounded-full border border-red-200 px-3 py-1.5
                            text-xs font-medium text-red-700
                          "
                          label={t('delete_conversation')}
                          confirmLabel={t('confirm_delete_conversation')}
                        />
                      </form>
                    </div>
                    <div className="mt-3 grid gap-2">
                      {(chatMessagesByConversation.get(conversation.id) ?? []).length > 0
                        ? (chatMessagesByConversation.get(conversation.id) ?? []).map(message => (
                            <div
                              key={message.id}
                              className="rounded-md border bg-background/70 p-3"
                            >
                              <div className="
                                flex flex-wrap items-center justify-between
                                gap-2
                              "
                              >
                                <div className="font-medium">
                                  {message.direction === 'inbound'
                                    ? t('chat_customer')
                                    : t('chat_store')}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {formatDateTime(message.createdAt)}
                                </div>
                              </div>
                              <p className="
                                mt-2 text-sm whitespace-pre-wrap
                                text-muted-foreground
                              "
                              >
                                {message.body}
                              </p>
                            </div>
                          ))
                        : (
                            <p className="text-sm text-muted-foreground">
                              {t('no_messages_in_conversation')}
                            </p>
                          )}
                    </div>
                  </div>
                ))
              : <p className="text-sm text-muted-foreground">{t('no_chat_history')}</p>}
          </div>
        </section>
      </div>
    </>
  );
}
