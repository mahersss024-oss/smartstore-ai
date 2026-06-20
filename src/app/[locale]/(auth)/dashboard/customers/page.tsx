import { auth } from '@clerk/nextjs/server';
import { and, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import NextLink from 'next/link';
import { DashboardPagination } from '@/features/dashboard/DashboardPagination';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { buildCustomerSummaries } from '@/libs/CustomerSummaries';
import { formatDatabaseDateTime } from '@/libs/DateTime';
import { db } from '@/libs/DB';
import {
  customerReviewsTable,
  customersTable,
  orderEventsTable,
  ordersTable,
} from '@/models/Schema';
import { getI18nPath } from '@/utils/Helpers';

export default async function CustomersPage(props: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ archived?: string; page?: string }>;
}) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const showArchived = searchParams?.archived === '1';
  const requestedPage = Number.parseInt(searchParams?.page ?? '1', 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const pageSize = 25;

  setRequestLocale(locale);

  const t = await getTranslations({
    locale,
    namespace: 'CustomersPage',
  });
  const { orgId } = await auth();
  const formatDateTime = (value?: Date | null) => {
    return formatDatabaseDateTime(value, locale) ?? t('not_available');
  };
  const customerProfiles = orgId
    ? await db
        .select()
        .from(customersTable)
        .where(
          and(
            eq(customersTable.organizationId, orgId),
            showArchived
              ? sql`${customersTable.metadata}->>'archivedAt' is not null`
              : sql`${customersTable.metadata}->>'archivedAt' is null`,
          ),
        )
        .orderBy(desc(customersTable.lastContactAt))
        .limit(pageSize + 1)
        .offset((currentPage - 1) * pageSize)
    : [];
  const hasNextPage = customerProfiles.length > pageSize;
  const visibleCustomerProfiles = hasNextPage
    ? customerProfiles.slice(0, pageSize)
    : customerProfiles;
  const customerIds = visibleCustomerProfiles.map(customer => customer.id);
  const customerPhones = visibleCustomerProfiles
    .map(customer => customer.phone?.trim())
    .filter((phone): phone is string => Boolean(phone));
  const customerEmails = visibleCustomerProfiles
    .map(customer => customer.email?.trim())
    .filter((email): email is string => Boolean(email));
  const reviews = orgId && customerIds.length > 0
    ? await db
        .select({
          customerId: customerReviewsTable.customerId,
          createdAt: customerReviewsTable.createdAt,
          orderId: customerReviewsTable.orderId,
          rating: customerReviewsTable.rating,
        })
        .from(customerReviewsTable)
        .where(
          and(
            eq(customerReviewsTable.organizationId, orgId),
            inArray(customerReviewsTable.customerId, customerIds),
          ),
        )
        .orderBy(desc(customerReviewsTable.createdAt))
    : [];
  const reviewOrderIds = reviews
    .map(review => review.orderId)
    .filter((orderId): orderId is number => typeof orderId === 'number');
  const identityConditions = [
    customerPhones.length > 0
      ? inArray(ordersTable.customerPhone, customerPhones)
      : null,
    customerEmails.length > 0
      ? inArray(ordersTable.customerEmail, customerEmails)
      : null,
    reviewOrderIds.length > 0
      ? inArray(ordersTable.id, reviewOrderIds)
      : null,
  ].filter(condition => condition !== null);
  const customerIdentityCondition = identityConditions.length === 1
    ? identityConditions[0]
    : identityConditions.length > 1
      ? or(...identityConditions)
      : null;
  const orders = orgId && customerIdentityCondition
    ? await db
        .select({
          archivedAt: ordersTable.archivedAt,
          createdAt: ordersTable.createdAt,
          customerEmail: ordersTable.customerEmail,
          customerPhone: ordersTable.customerPhone,
          id: ordersTable.id,
          totalPrice: ordersTable.totalPrice,
        })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.organizationId, orgId),
            customerIdentityCondition,
          ),
        )
        .orderBy(desc(ordersTable.createdAt))
    : [];
  const orderIds = orders.map(order => order.id);
  const feedbackEvents = orgId && orderIds.length > 0
    ? await db
        .select({
          eventType: orderEventsTable.eventType,
          createdAt: orderEventsTable.createdAt,
          metadata: orderEventsTable.metadata,
          orderId: orderEventsTable.orderId,
        })
        .from(orderEventsTable)
        .where(
          and(
            eq(orderEventsTable.organizationId, orgId),
            inArray(orderEventsTable.orderId, orderIds),
          ),
        )
        .orderBy(desc(orderEventsTable.createdAt))
    : [];

  const customers = buildCustomerSummaries({
    customerProfiles: visibleCustomerProfiles,
    fallbackName: t('unknown_customer'),
    feedbackEvents,
    orders,
    reviews,
    showArchived,
  });

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      <div className="dashboard-panel rounded-xl border p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted-foreground">
            {showArchived ? t('archived_customers_view') : t('active_customers_view')}
          </div>
          <NextLink
            href={getI18nPath(
              showArchived ? '/dashboard/customers' : '/dashboard/customers?archived=1',
              locale,
            )}
            className="
              rounded-full border px-3 py-1.5 text-sm font-medium
              hover:bg-background
            "
          >
            {showArchived ? t('show_active_customers') : t('show_archived_customers')}
          </NextLink>
        </div>

        {customers.length > 0
          ? (
              <div className="grid gap-4">
                {customers.map(customer => (
                  <div
                    key={customer.id}
                    className="dashboard-surface rounded-xl border p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="font-semibold">{customer.name}</div>
                          {customer.isArchived && (
                            <span className="
                              rounded-full border px-2 py-0.5 text-xs
                            "
                            >
                              {t('archived_badge')}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {customer.phone}
                          {customer.email && (
                            <>
                              {' - '}
                              {customer.email}
                            </>
                          )}
                        </div>
                      </div>
                      <NextLink
                        href={getI18nPath(`/dashboard/customers/${customer.id}`, locale)}
                        className="
                          rounded-full border px-3 py-1 text-xs font-medium
                          hover:bg-background
                        "
                      >
                        {t('view_details')}
                      </NextLink>
                    </div>

                    <div className="
                      mt-4 grid gap-3 text-sm
                      md:grid-cols-4
                    "
                    >
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
                        <span className="text-muted-foreground">{t('last_order_at')}</span>
                        {': '}
                        {customer.lastOrderAt
                          ? (
                              <time dateTime={customer.lastOrderAt.toISOString()}>
                                {formatDateTime(customer.lastOrderAt)}
                              </time>
                            )
                          : t('not_available')}
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('orders_count_label')}</span>
                        {': '}
                        {customer.ordersCount}
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('total_spent')}</span>
                        {': '}
                        {customer.totalSpent.toLocaleString(locale, {
                          maximumFractionDigits: 2,
                          minimumFractionDigits: 2,
                        })}
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('average_rating')}</span>
                        {': '}
                        {customer.averageRating
                          ? `${customer.averageRating.toFixed(1)}/5`
                          : t('not_available')}
                      </div>
                      <div>
                        <span className="text-muted-foreground">{t('feedback_count')}</span>
                        {': '}
                        {customer.feedbackCount}
                      </div>
                    </div>

                    <div className="
                      mt-4 grid gap-3 text-sm
                      lg:grid-cols-3
                    "
                    >
                      <div className="rounded-lg border bg-background/50 p-3">
                        <div className="font-medium">{t('order_numbers')}</div>
                        <div className="mt-1 text-muted-foreground">
                          {customer.orderIds.length > 0
                            ? customer.orderIds.slice(0, 8).map(orderId => `#${orderId}`).join(', ')
                            : t('no_orders_yet')}
                        </div>
                      </div>
                      <div className="rounded-lg border bg-background/50 p-3">
                        <div className="font-medium">{t('latest_rating')}</div>
                        <div className="mt-1 text-muted-foreground">
                          {customer.latestRating
                            ? (
                                <>
                                  {customer.latestRating.rating}
                                  /5
                                  {customer.latestRating.orderId
                                    ? ` - ${t('order_number')} #${customer.latestRating.orderId}`
                                    : ''}
                                  <br />
                                  <time dateTime={customer.latestRating.createdAt.toISOString()}>
                                    {formatDateTime(customer.latestRating.createdAt)}
                                  </time>
                                </>
                              )
                            : t('not_available')}
                        </div>
                      </div>
                      <div className="rounded-lg border bg-background/50 p-3">
                        <div className="font-medium">{t('latest_feedback')}</div>
                        <div className="mt-1 line-clamp-2 text-muted-foreground">
                          {customer.latestFeedback
                            ? (
                                <>
                                  {t('order_number')}
                                  {' #'}
                                  {customer.latestFeedback.orderId}
                                  {': '}
                                  {customer.latestFeedback.message}
                                  <br />
                                  <time dateTime={customer.latestFeedback.createdAt.toISOString()}>
                                    {formatDateTime(customer.latestFeedback.createdAt)}
                                  </time>
                                </>
                              )
                            : t('not_available')}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          : (
              <div className="py-12 text-center">
                <h3 className="mb-2 text-lg font-semibold">{t('empty_title')}</h3>
                <p className="text-muted-foreground">{t('empty_description')}</p>
              </div>
            )}

        <DashboardPagination
          basePath="/dashboard/customers"
          currentPage={currentPage}
          hasNextPage={hasNextPage}
          locale={locale}
          query={{
            archived: showArchived ? '1' : undefined,
          }}
        />
      </div>
    </>
  );
}
