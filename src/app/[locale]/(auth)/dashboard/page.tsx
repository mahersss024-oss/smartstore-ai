import { auth } from '@clerk/nextjs/server';
import { and, count, countDistinct, eq, isNull, ne, sum } from 'drizzle-orm';
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  MessageCircle,
  PackagePlus,
  RadioTower,
  Settings,
  Share2,
  ShoppingBag,
  Sparkles,
  Users,
  Wallet,
} from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { getStoreReadiness, hasConfiguredValue, hasText } from '@/libs/StoreReadiness';
import {
  deliveryMethodsTable,
  ordersTable,
  paymentMethodsTable,
  productsTable,
  storeSettingsTable,
} from '@/models/Schema';

type StoreSettingsMetadata = {
  businessType?: string;
  contactChannels?: Record<string, unknown>;
  location?: {
    address?: unknown;
    city?: unknown;
    mapsUrl?: unknown;
    pickupInstructions?: unknown;
  };
};

export default async function DashboardIndexPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({
    locale,
    namespace: 'DashboardIndexPage',
  });
  const { orgId } = await auth();
  const [stats] = orgId
    ? await db
        .select({
          customers: countDistinct(ordersTable.customerPhone),
          orders: count(ordersTable.id),
          revenue: sum(ordersTable.totalPrice),
        })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.organizationId, orgId),
            isNull(ordersTable.archivedAt),
          ),
        )
    : [{ customers: 0, orders: 0, revenue: null }];
  const [productStats] = orgId
    ? await db
        .select({ products: count(productsTable.id) })
        .from(productsTable)
        .where(and(
          eq(productsTable.organizationId, orgId),
          eq(productsTable.isActive, true),
        ))
    : [{ products: 0 }];
  const [paymentStats] = orgId
    ? await db
        .select({ methods: count(paymentMethodsTable.id) })
        .from(paymentMethodsTable)
        .where(and(
          eq(paymentMethodsTable.organizationId, orgId),
          eq(paymentMethodsTable.isActive, true),
          ne(paymentMethodsTable.provider, 'bank_transfer'),
        ))
    : [{ methods: 0 }];
  const [deliveryStats] = orgId
    ? await db
        .select({ methods: count(deliveryMethodsTable.id) })
        .from(deliveryMethodsTable)
        .where(and(
          eq(deliveryMethodsTable.organizationId, orgId),
          eq(deliveryMethodsTable.isActive, true),
        ))
    : [{ methods: 0 }];
  const [storeSettings] = orgId
    ? await db
        .select({
          currency: storeSettingsTable.currency,
          metadata: storeSettingsTable.metadata,
          storeDescription: storeSettingsTable.storeDescription,
          storeName: storeSettingsTable.storeName,
          timezone: storeSettingsTable.timezone,
          welcomeMessage: storeSettingsTable.welcomeMessage,
        })
        .from(storeSettingsTable)
        .where(eq(storeSettingsTable.organizationId, orgId))
        .limit(1)
    : [];
  const metadata = storeSettings?.metadata as StoreSettingsMetadata | null;
  const contactChannels = metadata?.contactChannels ?? {};
  const revenue = Number(stats?.revenue ?? 0).toLocaleString(locale, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
  const readiness = getStoreReadiness({
    businessType: metadata?.businessType,
    contactChannels,
    currency: storeSettings?.currency,
    deliveryMethodsCount: deliveryStats?.methods ?? 0,
    location: metadata?.location,
    paymentMethodsCount: paymentStats?.methods ?? 0,
    productsCount: productStats?.products ?? 0,
    storeDescription: storeSettings?.storeDescription,
    storeName: storeSettings?.storeName,
    timezone: storeSettings?.timezone,
    welcomeMessage: storeSettings?.welcomeMessage,
  });
  const setupSteps = [
    {
      done: Boolean(storeSettings?.storeName?.trim()),
      href: '/dashboard/settings',
      label: t('setup_store_name'),
    },
    {
      done: Boolean(storeSettings?.storeDescription?.trim()),
      href: '/dashboard/settings',
      label: t('setup_store_description'),
    },
    {
      done: Boolean(metadata?.businessType?.trim()),
      href: '/dashboard/settings',
      label: t('setup_business_type'),
    },
    {
      done: Boolean(storeSettings?.welcomeMessage?.trim()),
      href: '/dashboard/settings',
      label: t('setup_welcome_message'),
    },
    {
      done: Object.values(contactChannels).some(hasConfiguredValue),
      href: '/dashboard/settings',
      label: t('setup_contact_channel'),
    },
    {
      done: [
        metadata?.location?.address,
        metadata?.location?.city,
        metadata?.location?.mapsUrl,
        metadata?.location?.pickupInstructions,
      ].some(hasText),
      href: '/dashboard/settings',
      label: t('setup_location'),
    },
    {
      done: (paymentStats?.methods ?? 0) > 0,
      href: '/dashboard/settings',
      label: t('setup_payment'),
    },
    {
      done: (deliveryStats?.methods ?? 0) > 0,
      href: '/dashboard/settings',
      label: t('setup_delivery'),
    },
    {
      done: (productStats?.products ?? 0) > 0,
      href: '/dashboard/products/new',
      label: t('setup_first_product'),
    },
  ];

  const statCards = [
    {
      accent: 'from-cyan-500/16 via-cyan-500/5 to-transparent',
      href: '/dashboard/orders',
      icon: ClipboardList,
      label: t('stats_orders'),
      sparkline: 'from-cyan-500 to-cyan-300',
      tone: 'bg-cyan-500/10 text-cyan-600',
      value: stats?.orders ?? 0,
    },
    {
      accent: 'from-emerald-500/16 via-emerald-500/5 to-transparent',
      href: '/dashboard/revenue',
      icon: Wallet,
      label: t('stats_revenue'),
      sparkline: 'from-emerald-500 to-emerald-300',
      tone: 'bg-emerald-500/10 text-emerald-600',
      value: revenue,
    },
    {
      accent: 'from-blue-500/16 via-blue-500/5 to-transparent',
      href: '/dashboard/customers',
      icon: Users,
      label: t('stats_customers'),
      sparkline: 'from-blue-500 to-blue-300',
      tone: 'bg-blue-500/10 text-blue-600',
      value: stats?.customers ?? 0,
    },
    {
      accent: 'from-violet-500/16 via-violet-500/5 to-transparent',
      href: '/dashboard/products',
      icon: ShoppingBag,
      label: t('stats_products'),
      sparkline: 'from-violet-500 to-violet-300',
      tone: 'bg-violet-500/10 text-violet-600',
      value: productStats?.products ?? 0,
    },
  ];

  const quickActions = [
    {
      description: t('quick_add_product_desc'),
      href: '/dashboard/products/new',
      icon: PackagePlus,
      title: t('quick_add_product'),
    },
    {
      description: t('quick_view_orders_desc'),
      href: '/dashboard/orders',
      icon: ClipboardList,
      title: t('quick_view_orders'),
    },
    {
      description: t('quick_payments_desc'),
      href: '/dashboard/settings',
      icon: CreditCard,
      title: t('quick_payments'),
    },
    {
      description: t('quick_settings_desc'),
      href: '/dashboard/settings',
      icon: Settings,
      title: t('quick_settings'),
    },
  ];

  const agentCapabilities = [
    {
      description: t('capability_understand_desc'),
      icon: MessageCircle,
      title: t('capability_understand_title'),
      tone: 'from-cyan-500/14 to-blue-500/8 text-cyan-600',
    },
    {
      description: t('capability_decide_desc'),
      icon: Bot,
      title: t('capability_decide_title'),
      tone: 'from-violet-500/14 to-cyan-500/8 text-violet-600',
    },
    {
      description: t('capability_follow_desc'),
      icon: CreditCard,
      title: t('capability_follow_title'),
      tone: 'from-emerald-500/14 to-cyan-500/8 text-emerald-600',
    },
  ];

  const workflowSteps = [
    {
      description: t('workflow_receive_desc'),
      icon: MessageCircle,
      imagePosition: 'left center',
      panelTone: 'from-cyan-500/12 via-transparent to-emerald-500/10',
      title: t('workflow_receive_title'),
    },
    {
      description: t('workflow_ai_desc'),
      icon: Bot,
      imagePosition: 'center center',
      panelTone: 'from-violet-500/12 via-transparent to-cyan-500/10',
      title: t('workflow_ai_title'),
    },
    {
      description: t('workflow_confirm_desc'),
      icon: CheckCircle2,
      imagePosition: 'right center',
      panelTone: 'from-emerald-500/12 via-transparent to-blue-500/10',
      title: t('workflow_confirm_title'),
    },
  ];

  const channels = [
    { isActive: true, label: t('channel_web') },
    { isActive: Boolean(orgId), label: t('channel_smart_link') },
    { isActive: hasConfiguredValue(contactChannels.whatsapp), label: 'WhatsApp' },
  ];
  const activeChannelsCount = channels.filter(channel => channel.isActive).length;

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      {readiness.status !== 'ready' && (
        <section className="mb-6 dashboard-panel rounded-xl border p-6">
          <div className="
            flex flex-col gap-4
            lg:flex-row lg:items-start lg:justify-between
          "
          >
            <div>
              <div className="text-sm font-semibold text-primary">
                {t('setup_eyebrow')}
              </div>
              <h2 className="mt-2 text-2xl font-bold tracking-normal">
                {t('setup_title')}
              </h2>
              <p className="mt-2 max-w-3xl text-sm/7 text-muted-foreground">
                {t('setup_description')}
              </p>
            </div>
            <div className="dashboard-surface rounded-xl border p-4 text-center">
              <div className="text-3xl font-bold">
                {readiness.score}
                %
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {readiness.completed}
                /
                {readiness.total}
              </div>
            </div>
          </div>

          <div className="mt-5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="
                h-full rounded-full bg-linear-to-r from-cyan-500 to-emerald-500
                transition-all
              "
              style={{ width: `${readiness.score}%` }}
            />
          </div>

          <div className="
            mt-5 grid gap-3
            md:grid-cols-2
            xl:grid-cols-3
          "
          >
            {setupSteps.map(step => (
              <Link
                key={step.label}
                href={step.href}
                className="
                  flex dashboard-surface items-center justify-between gap-3
                  rounded-xl border p-4 text-sm font-semibold transition-colors
                  hover:border-primary/35 hover:bg-accent/70
                "
              >
                <span>{step.label}</span>
                <span
                  className={
                    step.done
                      ? `
                        rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs
                        text-emerald-700
                      `
                      : `
                        rounded-full bg-amber-500/10 px-2.5 py-1 text-xs
                        text-amber-700
                      `
                  }
                >
                  {step.done ? t('setup_done') : t('setup_missing')}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="
        group relative mb-6 dashboard-panel overflow-hidden rounded-xl border
      "
      >
        <div className="
          pointer-events-none absolute inset-0 bg-linear-to-br from-cyan-500/10
          via-transparent to-emerald-500/10
        "
        />
        <div className="
          pointer-events-none absolute inset-x-0 top-0 h-px bg-linear-to-r
          from-transparent via-primary/45 to-transparent
        "
        />

        <div className="
          relative grid
          lg:grid-cols-[1.2fr_0.8fr]
        "
        >
          <div className="
            p-6
            lg:p-7
          "
          >
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <div className="
                inline-flex items-center gap-2 rounded-full border
                border-primary/20 bg-background/70 px-3 py-1 text-xs
                font-semibold text-primary shadow-sm backdrop-blur-sm
              "
              >
                <Sparkles className="size-3.5 text-amber-500" />
                {t('ai_badge')}
              </div>
              <div className="
                inline-flex items-center gap-2 rounded-full border
                border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs
                font-semibold text-emerald-700
              "
              >
                <span className="relative flex size-2">
                  <span className="
                    absolute inline-flex size-full animate-ping rounded-full
                    bg-emerald-500 opacity-60
                  "
                  />
                  <span className="
                    relative inline-flex size-2 rounded-full bg-emerald-500
                  "
                  />
                </span>
                {activeChannelsCount}
                /
                {channels.length}
              </div>
            </div>

            <h2 className="
              max-w-2xl text-2xl font-bold tracking-normal
              md:text-4xl
            "
            >
              {t('smart_hub_title')}
            </h2>

            <p className="mt-4 max-w-3xl text-sm/7 text-muted-foreground">
              {t('welcome_message')}
            </p>

            <div className="
              mt-6 grid gap-3
              sm:grid-cols-3
            "
            >
              {[
                { label: t('stats_orders'), value: stats?.orders ?? 0 },
                { label: t('stats_revenue'), value: revenue },
                { label: t('stats_products'), value: productStats?.products ?? 0 },
              ].map(item => (
                <div
                  key={item.label}
                  className="
                    dashboard-surface rounded-xl border p-4 transition-all
                    duration-200
                    hover:-translate-y-0.5 hover:border-primary/35
                  "
                >
                  <div className="text-xs font-medium text-muted-foreground">
                    {item.label}
                  </div>
                  <div className="mt-2 text-2xl font-bold">{item.value}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {channels.map(channel => (
                <span
                  key={channel.label}
                  className="
                    inline-flex items-center gap-1.5 rounded-full border
                    bg-background/75 px-3 py-1.5 text-xs font-semibold shadow-sm
                    backdrop-blur-sm transition-all duration-200
                    hover:-translate-y-px hover:border-primary/35
                  "
                >
                  <RadioTower
                    className={
                      channel.isActive
                        ? 'size-3.5 text-emerald-600'
                        : 'size-3.5 text-muted-foreground'
                    }
                  />
                  {channel.label}
                </span>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/dashboard/orders"
                className="
                  inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2
                  text-sm font-semibold text-primary-foreground shadow-sm
                  shadow-primary/20 transition-all duration-200
                  hover:-translate-y-px hover:bg-primary/90 hover:shadow-md
                "
              >
                {t('quick_view_orders')}
                <ArrowUpRight className="size-4" />
              </Link>
              <Link
                href="/dashboard/settings"
                className="
                  inline-flex dashboard-pill items-center gap-2 rounded-lg
                  border px-4 py-2 text-sm font-semibold transition-all
                  duration-200
                  hover:-translate-y-px hover:border-primary/35
                  hover:bg-accent/70
                "
              >
                {t('configure_channels')}
                <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>

          <div className="
            border-t bg-background/45 p-6 backdrop-blur-sm
            lg:border-t-0 lg:border-l lg:p-7
            rtl:lg:border-r rtl:lg:border-l-0
          "
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{t('automation_status')}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {t('workflow_desc')}
                </div>
              </div>
              <div className="
                flex size-10 dashboard-surface items-center justify-center
                rounded-full border
              "
              >
                <Bot className="size-5 text-primary" />
              </div>
            </div>

            <div className="mt-6 space-y-3">
              {workflowSteps.map((step, index) => {
                const Icon = step.icon;

                return (
                  <div
                    key={step.title}
                    className="
                      relative flex dashboard-surface gap-3 rounded-xl border
                      p-3 transition-all duration-200
                      hover:-translate-y-0.5 hover:border-primary/35
                    "
                  >
                    <div className="
                      flex size-10 shrink-0 items-center justify-center
                      rounded-full bg-primary/10
                    "
                    >
                      <Icon className="size-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{step.title}</span>
                        <span className="text-xs text-muted-foreground">
                          0
                          {index + 1}
                        </span>
                      </div>
                      <p className="mt-1 text-xs/5 text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-medium">{t('platforms_title')}</span>
                <span className="text-muted-foreground">
                  {activeChannelsCount}
                  /
                  {channels.length}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="
                    h-full rounded-full bg-linear-to-r from-cyan-500
                    to-emerald-500 transition-all duration-500
                  "
                  style={{ width: `${(activeChannelsCount / channels.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <div>
            <h3 className="text-lg font-semibold">{t('kpi_cards_title')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('kpi_cards_description')}
            </p>
          </div>
        </div>

        <div className="
          grid gap-4
          md:grid-cols-2
          lg:grid-cols-4
        "
        >
          {statCards.map((card) => {
            const Icon = card.icon;

            return (
              <Link
                key={card.label}
                href={card.href}
                className="
                  group relative dashboard-panel overflow-hidden rounded-xl
                  border p-5 transition-all
                  hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md
                "
              >
                <div className={`
                  pointer-events-none absolute inset-x-0 top-0 h-20
                  bg-linear-to-b
                  ${card.accent}
                `}
                />
                <div className="flex items-start justify-between gap-3">
                  <div className="relative">
                    <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                    <p className="mt-3 text-3xl font-bold tracking-tight">{card.value}</p>
                  </div>
                  <div className={`
                    relative rounded-full p-3 ring-1 ring-white/40 ring-inset
                    ${card.tone}
                  `}
                  >
                    <Icon className="size-5" />
                  </div>
                </div>
                <div className="
                  relative mt-5 flex h-8 items-end gap-1.5 border-b
                  border-dashed border-muted-foreground/20 pb-1
                "
                >
                  {[35, 58, 44, 72, 62, 86, 76].map(height => (
                    <span
                      key={`${card.label}-${height}`}
                      className={`
                        flex-1 rounded-t-sm bg-linear-to-t opacity-70
                        transition-all
                        group-hover:opacity-100
                        ${card.sparkline}
                      `}
                      style={{ height: `${height}%` }}
                    />
                  ))}
                </div>
                <div className="
                  relative mt-4 inline-flex items-center gap-1 text-xs
                  font-medium text-muted-foreground transition-colors
                  group-hover:text-primary
                "
                >
                  {t('open_details')}
                  <ArrowUpRight className="size-3.5" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="
        mt-6 grid gap-4
        lg:grid-cols-[0.8fr_1.2fr]
      "
      >
        <div className="dashboard-panel rounded-xl border p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{t('quick_actions_title')}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('quick_actions_desc')}
              </p>
            </div>
            <Share2 className="size-5 text-muted-foreground" />
          </div>

          <div className="mt-5 grid gap-3">
            {quickActions.map((action) => {
              const Icon = action.icon;

              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="
                    group flex dashboard-surface items-center justify-between
                    gap-3 rounded-xl border p-4 transition-all
                    hover:border-primary/40 hover:bg-accent/80
                  "
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="rounded-md bg-primary/10 p-2 text-primary">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold wrap-break-word">{action.title}</div>
                      <div className="
                        text-xs wrap-break-word text-muted-foreground
                      "
                      >
                        {action.description}
                      </div>
                    </div>
                  </div>
                  <ArrowUpRight className="
                    size-4 shrink-0 text-muted-foreground transition-transform
                    group-hover:translate-x-0.5 group-hover:-translate-y-0.5
                    rtl:group-hover:-translate-x-0.5
                  "
                  />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="
          relative dashboard-panel overflow-hidden rounded-xl border p-6
        "
        >
          <div className="
            pointer-events-none absolute inset-0 bg-linear-to-br from-cyan-500/8
            via-transparent to-emerald-500/8
          "
          />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{t('capabilities_title')}</h3>
              </div>
              <Bot className="size-5 text-muted-foreground" />
            </div>

            <div className="
              mt-6 grid gap-4
              md:grid-cols-3
            "
            >
              {agentCapabilities.map((capability) => {
                const Icon = capability.icon;

                return (
                  <div
                    key={capability.title}
                    className="
                      group dashboard-surface rounded-xl border p-5
                      transition-all duration-200
                      hover:-translate-y-0.5 hover:border-primary/35
                    "
                  >
                    <div className={`
                      mb-5 flex size-11 items-center justify-center rounded-xl
                      bg-linear-to-br
                      ${capability.tone}
                    `}
                    >
                      <Icon className="size-5" />
                    </div>
                    <div className="text-sm font-semibold">{capability.title}</div>
                    <p className="mt-2 text-xs/5 text-muted-foreground">
                      {capability.description}
                    </p>
                    <div className="
                      mt-5 h-1.5 overflow-hidden rounded-full bg-muted
                    "
                    >
                      <div className="
                        h-full w-3/4 rounded-full bg-linear-to-r from-cyan-500
                        to-emerald-500 transition-all duration-300
                        group-hover:w-full
                      "
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="
              mt-5 grid gap-3
              sm:grid-cols-3
            "
            >
              {[
                { label: t('stats_customers'), value: stats?.customers ?? 0 },
                { label: t('stats_orders'), value: stats?.orders ?? 0 },
                { label: t('active_channels_label'), value: activeChannelsCount },
              ].map(item => (
                <div
                  key={item.label}
                  className="rounded-xl border bg-background/55 px-4 py-3"
                >
                  <div className="text-xs text-muted-foreground">{item.label}</div>
                  <div className="mt-1 text-xl font-bold">{item.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mt-6 dashboard-panel rounded-xl border p-6">
        <div className="
          flex flex-col gap-4
          md:flex-row md:items-center md:justify-between
        "
        >
          <div>
            <h3 className="text-lg font-semibold">{t('platforms_title')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{t('platforms_desc')}</p>
          </div>

          <Link
            href="/dashboard/settings"
            className="
              inline-flex items-center justify-center gap-2 rounded-lg
              bg-primary px-4 py-2 text-sm font-medium text-primary-foreground
              transition-opacity
              hover:opacity-90
            "
          >
            {t('configure_channels')}
            <Settings className="size-4" />
          </Link>
        </div>

        <div className="
          mt-5 grid gap-3
          sm:grid-cols-2
          lg:grid-cols-3
        "
        >
          {channels.map(channel => (
            <div
              key={channel.label}
              className="
                flex dashboard-surface items-center justify-between rounded-xl
                border px-4 py-3 text-sm font-medium
              "
            >
              <span>{channel.label}</span>
              <span
                className={
                  channel.isActive
                    ? 'size-2 rounded-full bg-emerald-500'
                    : 'size-2 rounded-full bg-muted-foreground/30'
                }
              />
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
