import { and, asc, eq, isNull } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { OrderTrackingFeedbackPanel } from '@/features/customer/OrderTrackingFeedbackPanel';
import { Section } from '@/features/landing/Section';
import { customerPhonesMatch } from '@/libs/CustomerIdentity';
import { formatDatabaseDateTime } from '@/libs/DateTime';
import { db } from '@/libs/DB';
import {
  buildOrderTimeline,
  mapOrderStatusToProductionState,
} from '@/libs/OrderOperations';
import {
  orderEventsTable,
  ordersTable,
  storeSettingsTable,
} from '@/models/Schema';

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

export default async function OrderTrackingPage(props: {
  params: Promise<{
    locale: string;
    orderId: string;
    organizationId: string;
  }>;
  searchParams: Promise<{
    phone?: string;
  }>;
}) {
  const { locale, orderId, organizationId } = await props.params;
  const { phone } = await props.searchParams;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'OrderTrackingPage',
  });
  const orderT = await getTranslations({
    locale,
    namespace: 'OrdersPage',
  });

  const numericOrderId = Number.parseInt(orderId, 10);
  const [settings] = await db
    .select({
      logo: storeSettingsTable.logo,
      storeName: storeSettingsTable.storeName,
    })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);
  const [order] = Number.isFinite(numericOrderId)
    ? await db
        .select()
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.organizationId, organizationId),
            eq(ordersTable.id, numericOrderId),
            isNull(ordersTable.archivedAt),
          ),
        )
        .limit(1)
    : [];
  const isAuthorized = Boolean(order && customerPhonesMatch(phone, order.customerPhone));
  const events = isAuthorized
    ? await db
        .select()
        .from(orderEventsTable)
        .where(
          and(
            eq(orderEventsTable.organizationId, organizationId),
            eq(orderEventsTable.orderId, numericOrderId),
          ),
        )
        .orderBy(asc(orderEventsTable.createdAt))
    : [];
  const timeline = order && isAuthorized
    ? buildOrderTimeline({
        createdAt: order.createdAt,
        events,
        status: order.status,
      })
    : [];

  return (
    <Section className="py-10">
      <div className="mx-auto grid max-w-2xl gap-6">
        <div className="text-center">
          {settings?.logo && (
            // eslint-disable-next-line next/no-img-element -- Store logos can be merchant-provided external URLs.
            <img
              alt={settings.storeName ?? t('store_logo_alt')}
              src={settings.logo}
              className="mx-auto mb-3 size-14 rounded-xl object-cover"
            />
          )}
          <h1 className="text-3xl font-bold tracking-normal">
            {t('title')}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('description')}
          </p>
        </div>

        <form className="rounded-xl border bg-background p-4 shadow-sm">
          <label htmlFor="phone" className="text-sm font-semibold">
            {t('customer_phone')}
          </label>
          <div className="
            mt-2 flex flex-col gap-2
            sm:flex-row
          "
          >
            <input
              id="phone"
              name="phone"
              defaultValue={phone ?? ''}
              autoComplete="tel"
              className="min-h-11 flex-1 rounded-lg border px-3 py-2 text-sm"
              placeholder={t('phone_placeholder')}
            />
            <button
              type="submit"
              className="
                min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-semibold
                text-primary-foreground
              "
            >
              {t('track_order')}
            </button>
          </div>
        </form>

        {order && isAuthorized
          ? (
              <>
                <div className="rounded-xl border bg-background p-5 shadow-sm">
                  <div className="
                    flex flex-wrap items-start justify-between gap-3
                  "
                  >
                    <div>
                      <div className="text-sm text-muted-foreground">{t('order')}</div>
                      <div className="text-2xl font-bold">
                        #
                        {order.id}
                      </div>
                    </div>
                    <div className="
                      rounded-full border px-3 py-1 text-sm font-semibold
                      capitalize
                    "
                    >
                      {orderT(productionStateTranslationKeys[mapOrderStatusToProductionState(order.status)])}
                    </div>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm text-muted-foreground">
                    <div>
                      {t('created')}
                      {': '}
                      {' '}
                      {formatDatabaseDateTime(order.createdAt, locale)}
                    </div>
                    <div>
                      {t('updated')}
                      {': '}
                      {' '}
                      {formatDatabaseDateTime(order.updatedAt, locale)}
                    </div>
                    <div>
                      {t('total')}
                      {': '}
                      {' '}
                      {order.totalPrice}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3">
                    {timeline
                      .filter(item => item.status !== 'skipped')
                      .map(item => (
                        <div key={item.key} className="flex items-center gap-3">
                          <span className={`
                            size-3 rounded-full
                            ${item.status === 'done' ? 'bg-emerald-500' : ''}
                            ${item.status === 'failed' ? 'bg-red-500' : ''}
                            ${item.status === 'pending' ? 'bg-slate-300' : ''}
                          `}
                          />
                          <span className="text-sm font-medium capitalize">
                            {orderT(timelineTranslationKeys[item.key])}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
                <OrderTrackingFeedbackPanel
                  description={t('feedback_description')}
                  errorLabel={t('feedback_error')}
                  messageLabel={t('feedback_message_label')}
                  orderId={order.id}
                  organizationId={organizationId}
                  phone={phone ?? ''}
                  placeholder={t('feedback_placeholder')}
                  ratingLabel={t('feedback_rating_label')}
                  ratingOptionalLabel={t('feedback_rating_optional')}
                  sendLabel={t('feedback_send')}
                  successLabel={t('feedback_success')}
                  title={t('feedback_title')}
                />
              </>
            )
          : (
              <div className="
                rounded-xl border bg-background p-5 text-center text-sm
                text-muted-foreground
              "
              >
                {phone
                  ? t('not_found')
                  : t('phone_required')}
              </div>
            )}
      </div>
    </Section>
  );
}
