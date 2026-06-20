import { auth } from '@clerk/nextjs/server';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { formatDatabaseDateTime } from '@/libs/DateTime';
import { db } from '@/libs/DB';
import { buildGrowthAnalytics } from '@/libs/GrowthAnalytics';
import {
  conversationsTable,
  ordersTable,
} from '@/models/Schema';

export default async function RevenuePage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({
    locale,
    namespace: 'RevenuePage',
  });
  const { orgId } = await auth();
  const orders = orgId
    ? await db
        .select({
          createdAt: ordersTable.createdAt,
          customerName: ordersTable.customerName,
          id: ordersTable.id,
          paymentStatus: ordersTable.paymentStatus,
          source: ordersTable.source,
          status: ordersTable.status,
          totalPrice: ordersTable.totalPrice,
        })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.organizationId, orgId),
            isNull(ordersTable.archivedAt),
          ),
        )
        .orderBy(desc(ordersTable.createdAt))
    : [];
  const conversations = orgId
    ? await db
        .select({
          channel: conversationsTable.channel,
        })
        .from(conversationsTable)
        .where(eq(conversationsTable.organizationId, orgId))
    : [];

  const totalRevenue = orders.reduce((sum, order) => {
    return sum + Number(order.totalPrice ?? 0);
  }, 0);
  const paidRevenue = orders
    .filter(order => order.paymentStatus === 'paid')
    .reduce((sum, order) => sum + Number(order.totalPrice ?? 0), 0);
  const pendingRevenue = totalRevenue - paidRevenue;
  const growthAnalytics = buildGrowthAnalytics({
    conversations,
    orders,
  });

  const formatAmount = (amount: number) => amount.toLocaleString(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
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

  const summaryCards = [
    {
      label: t('total_revenue'),
      value: formatAmount(totalRevenue),
    },
    {
      label: t('paid_revenue'),
      value: formatAmount(paidRevenue),
    },
    {
      label: t('pending_revenue'),
      value: formatAmount(pendingRevenue),
    },
    {
      label: t('conversion_rate'),
      value: `${growthAnalytics.conversionRate}%`,
    },
    {
      label: t('completed_orders'),
      value: growthAnalytics.completedOrders.toLocaleString(locale),
    },
    {
      label: t('cancelled_orders'),
      value: growthAnalytics.cancelledOrders.toLocaleString(locale),
    },
  ];

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      <div className="
        mb-6 grid gap-4
        md:grid-cols-3
      "
      >
        {summaryCards.map(card => (
          <div
            key={card.label}
            className="dashboard-panel rounded-xl border p-5"
          >
            <div className="text-sm text-muted-foreground">{card.label}</div>
            <div className="mt-2 text-3xl font-bold">{card.value}</div>
          </div>
        ))}
      </div>

      <div className="
        mb-6 grid gap-4
        lg:grid-cols-[1fr_1fr]
      "
      >
        <div className="dashboard-panel rounded-xl border p-5">
          <div className="text-sm font-semibold">{t('traffic_sources')}</div>
          <div className="mt-4 grid gap-2">
            {growthAnalytics.trafficSources.length > 0
              ? growthAnalytics.trafficSources.map(source => (
                  <div
                    key={source.source}
                    className="flex items-center justify-between gap-3 text-sm"
                  >
                    <span className="text-muted-foreground capitalize">
                      {source.source.replaceAll('_', ' ')}
                    </span>
                    <span className="font-semibold">{source.count}</span>
                  </div>
                ))
              : (
                  <div className="text-sm text-muted-foreground">
                    {t('no_traffic_sources')}
                  </div>
                )}
          </div>
        </div>

        <div className="dashboard-panel rounded-xl border p-5">
          <div className="text-sm font-semibold">{t('growth_funnel')}</div>
          <div className="mt-4 grid gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('conversations')}</span>
              <span className="font-semibold">{growthAnalytics.conversations}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('orders')}</span>
              <span className="font-semibold">{growthAnalytics.orders}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t('conversion')}</span>
              <span className="font-semibold">
                {growthAnalytics.conversionRate}
                %
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-panel rounded-xl border p-6">
        {orders.length > 0
          ? (
              <div className="grid gap-4">
                {orders.map(order => (
                  <div
                    key={order.id}
                    className="dashboard-surface rounded-xl border p-4"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="font-semibold">
                          {t('order')}
                          {' #'}
                          {order.id}
                        </div>
                        <div className="mt-1 text-sm text-muted-foreground">
                          {order.customerName ?? t('unknown_customer')}
                        </div>
                      </div>
                      <div className="text-xl font-bold">
                        {formatAmount(Number(order.totalPrice ?? 0))}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full border px-3 py-1">
                        {getOrderStatusLabel(order.status)}
                      </span>
                      <span className="rounded-full border px-3 py-1">
                        {getPaymentStatusLabel(order.paymentStatus)}
                      </span>
                      <span className="rounded-full border px-3 py-1">
                        {formatDatabaseDateTime(order.createdAt, locale)}
                      </span>
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
      </div>
    </>
  );
}
