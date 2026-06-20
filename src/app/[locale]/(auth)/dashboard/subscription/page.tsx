import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  HardDrive,
  MessageCircle,
  Package,
  Users,
} from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { AddOnCheckoutButton } from '@/features/billing/AddOnCheckoutButton';
import { PlanCheckoutButton } from '@/features/billing/PlanCheckoutButton';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { hasConfiguredValue } from '@/libs/StoreReadiness';
import { getSubscriptionEntitlements } from '@/libs/SubscriptionEntitlements';
import { storeSettingsTable } from '@/models/Schema';
import { AllPlans } from '@/utils/PricingPlans';
import { STRIPE_ADD_ON_PRICE } from '@/utils/StripeBillingPlans';

type StoreSettingsMetadata = {
  contactChannels?: Record<string, unknown>;
  subscription?: {
    addOns?: {
      aiOrders?: number;
      products?: number;
      storageMb?: number;
      teamMembers?: number;
    };
  };
};

const formatPercent = (used: number, limit: number) => {
  if (limit <= 0) {
    return 0;
  }

  return Math.min(Math.round((used / limit) * 100), 100);
};

export default async function SubscriptionPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({
    locale,
    namespace: 'SubscriptionPage',
  });
  const tPlans = await getTranslations({
    locale,
    namespace: 'PricingPlans',
  });

  const { orgId } = await auth();

  const [storeSettings] = orgId
    ? await db
        .select({ metadata: storeSettingsTable.metadata })
        .from(storeSettingsTable)
        .where(eq(storeSettingsTable.organizationId, orgId))
        .limit(1)
    : [];
  const entitlements = orgId ? await getSubscriptionEntitlements(orgId) : null;

  const metadata = storeSettings?.metadata as StoreSettingsMetadata | null;
  const currentPlan = entitlements?.plan ?? AllPlans[0]!;
  const isPaidSubscriptionActive = Boolean(entitlements?.isPaidSubscriptionActive);
  const contactChannels = metadata?.contactChannels ?? {};
  const activeAddOns = isPaidSubscriptionActive ? (metadata?.subscription?.addOns ?? {}) : {};
  const enabledWhatsapp = hasConfiguredValue(contactChannels.whatsapp);
  const usage = entitlements?.usage ?? {
    aiOrders: 0,
    products: 0,
    storageMb: 0,
    teamMembers: 0,
  };
  const limits = entitlements?.limits ?? {
    aiOrders: currentPlan.limits.aiOrders,
    channels: currentPlan.limits.channels,
    products: currentPlan.limits.products,
    storageMb: currentPlan.limits.storage,
    teamMembers: currentPlan.limits.teamMember,
  };
  const planFeatures = [
    {
      enabled: currentPlan.features.aiAgent,
      label: t('feature_ai_agent'),
    },
    {
      enabled: currentPlan.features.webOrders,
      label: t('feature_web_orders'),
    },
    {
      enabled: currentPlan.features.whatsapp,
      label: 'WhatsApp',
    },
    {
      enabled: currentPlan.features.onlinePayments,
      label: t('feature_online_payments'),
    },
    {
      enabled: currentPlan.features.invoices,
      label: t('feature_invoices'),
    },
    {
      enabled: currentPlan.features.advancedReports,
      label: t('feature_advanced_reports'),
    },
  ];

  const usageCounters = [
    {
      description: t('ai_orders_description'),
      icon: Bot,
      label: t('ai_orders'),
      limit: limits.aiOrders,
      unit: t('orders_unit'),
      used: usage.aiOrders,
    },
    {
      description: t('storage_description'),
      icon: HardDrive,
      label: t('image_storage'),
      limit: limits.storageMb,
      unit: 'MB',
      used: usage.storageMb,
    },
    {
      description: t('team_description'),
      icon: Users,
      label: t('team_members'),
      limit: limits.teamMembers,
      unit: t('members_unit'),
      used: usage.teamMembers,
    },
    {
      description: t('catalog_description'),
      icon: Package,
      label: t('catalog_items'),
      limit: limits.products,
      unit: t('products_unit'),
      used: usage.products,
    },
  ];
  const highUsageCounters = usageCounters.filter((counter) => {
    return formatPercent(counter.used, counter.limit) >= 80;
  });
  const addOns = [
    {
      addOnKey: STRIPE_ADD_ON_PRICE.EXTRA_AI_ORDERS,
      description: t('extra_ai_description'),
      icon: Bot,
      title: t('extra_ai_title'),
      value: t('extra_ai_value'),
    },
    {
      addOnKey: STRIPE_ADD_ON_PRICE.EXTRA_IMAGE_STORAGE,
      description: t('extra_storage_description'),
      icon: HardDrive,
      title: t('extra_storage_title'),
      value: t('extra_storage_value'),
    },
    {
      addOnKey: STRIPE_ADD_ON_PRICE.EXTRA_CATALOG_ITEMS,
      description: t('extra_catalog_description'),
      icon: Package,
      title: t('extra_catalog_title'),
      value: t('extra_catalog_value'),
    },
    {
      addOnKey: STRIPE_ADD_ON_PRICE.EXTRA_TEAM_MEMBER,
      description: t('extra_members_description'),
      icon: Users,
      title: t('extra_members_title'),
      value: t('extra_members_value'),
    },
  ];

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      <section className="
        mb-6 rounded-xl border border-primary/20 bg-primary/10 p-5
      "
      >
        <div className="text-sm font-semibold text-primary">
          {t('platform_managed_title')}
        </div>
        <p className="mt-2 text-sm/6 text-muted-foreground">
          {t('platform_managed_description')}
        </p>
      </section>

      <section className="
        grid gap-4
        lg:grid-cols-[0.9fr_1.1fr]
      "
      >
        <div className="dashboard-panel rounded-xl border p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-primary">{t('current_plan')}</p>
              <h2 className="mt-2 text-3xl font-bold tracking-normal">
                {tPlans(`${currentPlan.name}_plan_name`)}
              </h2>
              <p className="mt-2 text-sm/6 text-muted-foreground">
                {t('current_plan_description')}
              </p>
            </div>
            <div className="
              rounded-full border bg-primary/10 px-3 py-1 text-xs font-semibold
              text-primary
            "
            >
              {isPaidSubscriptionActive ? t('active_status') : t('not_enabled')}
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            <div className="
              flex dashboard-surface items-center justify-between rounded-xl
              border p-4
            "
            >
              <span className="text-sm text-muted-foreground">{t('monthly_price')}</span>
              <span className="text-xl font-bold">
                {t('price', { price: currentPlan.price.toLocaleString(locale) })}
              </span>
            </div>
            <div className="
              flex dashboard-surface items-center justify-between rounded-xl
              border p-4
            "
            >
              <span className="text-sm text-muted-foreground">{t('billing_cycle')}</span>
              <span className="text-sm font-semibold">{t('monthly_cycle')}</span>
            </div>
            <div className="
              flex dashboard-surface items-center justify-between rounded-xl
              border p-4
            "
            >
              <span className="text-sm text-muted-foreground">WhatsApp</span>
              <span className="text-sm font-semibold">
                {enabledWhatsapp ? t('enabled') : t('not_enabled')}
              </span>
            </div>
            <div className="
              flex dashboard-surface items-center justify-between rounded-xl
              border p-4
            "
            >
              <span className="text-sm text-muted-foreground">{t('channels_limit')}</span>
              <span className="text-sm font-semibold">
                {limits.channels.toLocaleString(locale)}
              </span>
            </div>
            <div
              className="dashboard-surface rounded-xl border p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">{t('active_add_ons')}</span>
                <span className="text-sm font-semibold">
                  {[
                    activeAddOns.aiOrders,
                    activeAddOns.products,
                    activeAddOns.storageMb,
                    activeAddOns.teamMembers,
                  ].some(value => Number(value ?? 0) > 0)
                    ? t('enabled')
                    : t('not_enabled')}
                </span>
              </div>
            </div>
          </div>

          <Link
            href="/dashboard/settings"
            className="
              mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-4
              py-2 text-sm font-semibold text-primary-foreground
              transition-opacity
              hover:opacity-90
            "
          >
            {enabledWhatsapp ? t('manage_settings') : t('enable_whatsapp')}
            <ArrowUpRight className="size-4" />
          </Link>
        </div>

        <div className="dashboard-panel rounded-xl border p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{t('usage_title')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('usage_description')}
              </p>
            </div>
            <MessageCircle className="size-5 text-muted-foreground" />
          </div>

          {highUsageCounters.length > 0 && (
            <div className="
              mt-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4
              text-sm
            "
            >
              <div className="font-semibold text-amber-700">
                {t('usage_warning_title')}
              </div>
              <p className="mt-1 text-muted-foreground">
                {t('usage_warning_description')}
              </p>
            </div>
          )}

          <div className="mt-5 grid gap-4">
            {usageCounters.map((counter) => {
              const Icon = counter.icon;
              const percent = formatPercent(counter.used, counter.limit);

              return (
                <div
                  key={counter.label}
                  className="dashboard-surface rounded-xl border p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 gap-3">
                      <div className="
                        flex size-10 shrink-0 items-center justify-center
                        rounded-lg bg-primary/10 text-primary
                      "
                      >
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold">{counter.label}</div>
                        <p className="mt-1 text-xs/5 text-muted-foreground">
                          {counter.description}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-end">
                      <div className="text-sm font-bold">
                        {counter.used.toLocaleString(locale)}
                        {' / '}
                        {counter.limit.toLocaleString(locale)}
                      </div>
                      <div className="text-xs text-muted-foreground">{counter.unit}</div>
                    </div>
                  </div>

                  <div className="
                    mt-4 h-2 overflow-hidden rounded-full bg-muted
                  "
                  >
                    <div
                      className="
                        h-full rounded-full bg-linear-to-r from-cyan-500
                        to-emerald-500 transition-all
                      "
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mt-6 dashboard-panel rounded-xl border p-6">
        <div className="mb-5">
          <h3 className="text-lg font-semibold">{t('features_title')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('features_description')}
          </p>
        </div>
        <div className="
          grid gap-3
          md:grid-cols-2
          xl:grid-cols-3
        "
        >
          {planFeatures.map(feature => (
            <div
              key={feature.label}
              className="
                flex dashboard-surface items-center justify-between rounded-xl
                border p-4
              "
            >
              <span className="text-sm font-medium">{feature.label}</span>
              <span
                className={
                  feature.enabled
                    ? `
                      rounded-full border border-emerald-500/30
                      bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold
                      text-emerald-700
                    `
                    : `
                      rounded-full border border-muted px-2.5 py-1 text-xs
                      font-semibold text-muted-foreground
                    `
                }
              >
                {feature.enabled ? t('feature_enabled') : t('feature_not_included')}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 dashboard-panel rounded-xl border p-6">
        <div className="mb-5">
          <h3 className="text-lg font-semibold">{t('add_ons_title')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('add_ons_description')}
          </p>
        </div>

        <div className="
          grid gap-4
          md:grid-cols-2
          xl:grid-cols-4
        "
        >
          {addOns.map((addOn) => {
            const Icon = addOn.icon;

            return (
              <div
                key={addOn.title}
                className="dashboard-surface rounded-xl border p-5"
              >
                <div className="flex items-start gap-3">
                  <div className="
                    flex size-10 shrink-0 items-center justify-center rounded-lg
                    bg-primary/10 text-primary
                  "
                  >
                    <Icon className="size-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">{addOn.title}</h4>
                    <p className="mt-1 text-xs/5 text-muted-foreground">
                      {addOn.description}
                    </p>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className="text-sm font-bold">{addOn.value}</span>
                  <AddOnCheckoutButton
                    addOnKey={addOn.addOnKey}
                    disabled
                    label={t('request_add_on')}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="mt-6 dashboard-panel rounded-xl border p-6">
        <div id="package-purchase" className="scroll-mt-24" />
        <div className="mb-5">
          <h3 className="text-lg font-semibold">{t('package_purchase_title')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('package_purchase_description')}
          </p>
        </div>
        <div className="
          grid gap-4
          md:grid-cols-3
        "
        >
          {AllPlans.filter(plan => plan.name !== 'free').map(plan => (
            <div
              key={plan.name}
              className="dashboard-surface rounded-xl border p-5"
            >
              <div>
                <h4 className="text-base font-bold">
                  {tPlans(`${plan.name}_plan_name`)}
                </h4>
                <div className="mt-2 text-2xl font-bold">
                  $
                  {plan.usdPrice.toLocaleString('en-US')}
                </div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {t('price', { price: plan.price.toLocaleString(locale) })}
                </div>
              </div>

              <div className="mt-5 grid gap-2 text-sm text-muted-foreground">
                <div>{t('plan_ai_orders', { count: plan.limits.aiOrders.toLocaleString(locale) })}</div>
                <div>{t('plan_products', { count: plan.limits.products.toLocaleString(locale) })}</div>
                <div>{t('plan_channels', { count: plan.limits.channels.toLocaleString(locale) })}</div>
                <div>{t('plan_storage', { count: plan.limits.storage.toLocaleString(locale) })}</div>
                <div>{t('plan_team', { count: plan.limits.teamMember.toLocaleString(locale) })}</div>
              </div>

              <div className="mt-5">
                <PlanCheckoutButton
                  active={plan.name === currentPlan.name && isPaidSubscriptionActive}
                  label={plan.name === currentPlan.name && isPaidSubscriptionActive
                    ? t('current_package_button')
                    : t('subscribe_package_button')}
                />
              </div>
            </div>
          ))}
          <p className="mt-4 text-sm text-muted-foreground">
            {t('electronic_payment_description')}
          </p>
        </div>
      </section>

      <section className="mt-6 dashboard-panel rounded-xl border p-6">
        <div className="mb-5">
          <h3 className="text-lg font-semibold">{t('plan_limits_title')}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{t('plans_description')}</p>
        </div>

        <div className="
          grid gap-4
          md:grid-cols-3
        "
        >
          {AllPlans.map(plan => (
            <div
              key={plan.name}
              className="
                dashboard-surface rounded-xl border p-5 transition-all
                hover:-translate-y-0.5 hover:border-primary/40
              "
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h4 className="text-base font-bold">
                    {tPlans(`${plan.name}_plan_name`)}
                  </h4>
                  <div className="mt-2 text-2xl font-bold">
                    {t('price', { price: plan.price.toLocaleString(locale) })}
                  </div>
                </div>
                {plan.name === currentPlan.name && (
                  <CheckCircle2 className="size-5 text-emerald-600" />
                )}
              </div>

              <div className="mt-5 grid gap-2 text-sm">
                <div>
                  {t('plan_ai_orders', {
                    count: plan.limits.aiOrders.toLocaleString(locale),
                  })}
                </div>
                <div>
                  {t('plan_products', {
                    count: plan.limits.products.toLocaleString(locale),
                  })}
                </div>
                <div>
                  {t('plan_channels', {
                    count: plan.limits.channels.toLocaleString(locale),
                  })}
                </div>
                <div>
                  {t('plan_storage', {
                    count: plan.limits.storage.toLocaleString(locale),
                  })}
                </div>
                <div>
                  {t('plan_team', {
                    count: plan.limits.teamMember.toLocaleString(locale),
                  })}
                </div>
              </div>

              {plan.name === currentPlan.name && (
                <div className="
                  mt-5 inline-flex w-full dashboard-pill items-center
                  justify-center gap-2 rounded-lg border px-4 py-2 text-sm
                  font-semibold text-muted-foreground
                "
                >
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  {t('current_package_button')}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
