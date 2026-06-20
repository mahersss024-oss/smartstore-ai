import { auth } from '@clerk/nextjs/server';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import {
  permanentlyDeleteArchivedOrderFromDashboard,
  restoreArchivedOrderFromDashboard,
} from '@/features/dashboard/OrderActions';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { formatDatabaseDateTime } from '@/libs/DateTime';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { normalizeOrderItems } from '@/libs/OrderDataNormalization';
import { ordersTable } from '@/models/Schema';

export default async function ArchivedOrdersPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
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
            isNotNull(ordersTable.archivedAt),
          ),
        )
        .orderBy(desc(ordersTable.archivedAt))
    : [];

  return (
    <>
      <TitleBar
        title={t('archive_title_bar')}
        description={t('archive_title_bar_description')}
      />

      <div className="mb-4">
        <Link
          href="/dashboard/orders"
          className="
            cursor-pointer text-sm font-medium text-primary underline-offset-4
            hover:underline
          "
        >
          {t('back_to_orders')}
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
          {orders.length > 0
            ? (
                <div className="grid gap-4">
                  {orders.map((order) => {
                    const orderItems = normalizeOrderItems(order.items);

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
                          </div>
                          <div className="rounded-full border px-3 py-1 text-xs">
                            {t('archived_status')}
                          </div>
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
                            {t('archived_at')}
                            {': '}
                            {order.archivedAt
                              ? (
                                  <time dateTime={order.archivedAt.toISOString()}>
                                    {formatDateTime(order.archivedAt)}
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
                          <div>
                            {t('total')}
                            {': '}
                            {order.totalPrice}
                          </div>
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
                                      key={`${item.name}-${item.quantity ?? 1}-${item.unitPrice ?? 0}`}
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

                        <div className="
                          mt-4 grid grid-cols-1 gap-2
                          sm:flex sm:flex-wrap
                        "
                        >
                          <form
                            className="
                              w-full
                              sm:w-auto
                            "
                            action={restoreArchivedOrderFromDashboard.bind(null, locale, order.id)}
                          >
                            <button
                              type="submit"
                              className="
                                min-h-10 w-full dashboard-pill rounded-lg border
                                px-4 py-2 text-sm font-medium transition-colors
                                hover:bg-accent
                                sm:w-auto
                              "
                            >
                              {t('restore_order')}
                            </button>
                          </form>
                          <form
                            className="
                              w-full
                              sm:w-auto
                            "
                            action={permanentlyDeleteArchivedOrderFromDashboard.bind(null, locale, order.id)}
                          >
                            <button
                              type="submit"
                              className="
                                min-h-10 w-full rounded-lg border border-red-200
                                px-4 py-2 text-sm font-medium text-red-700
                                transition-colors
                                hover:bg-red-50
                                sm:w-auto
                              "
                            >
                              {t('delete_archived_order')}
                            </button>
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
                    <h3 className="mb-2 text-lg font-semibold">{t('no_archived_orders_title')}</h3>
                    <p className="text-muted-foreground">{t('no_archived_orders_description')}</p>
                  </div>
                </div>
              )}
        </div>
      </div>
    </>
  );
}
