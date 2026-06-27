import { clerkClient } from '@clerk/nextjs/server';
import {
  and,
  count,
  countDistinct,
  eq,
  inArray,
  isNotNull,
  isNull,
  sql,
} from 'drizzle-orm';
import {
  Activity,
  Bot,
  HardDrive,
  KeyRound,
  Package,
  PauseCircle,
  ShieldCheck,
  Store,
  Users,
} from 'lucide-react';
import { setRequestLocale } from 'next-intl/server';
import { PendingSubmitButton } from '@/components/PendingSubmitButton';
import {
  updatePlatformAIProviderConfig,
  updatePlatformRuntimeConfig,
  updatePlatformStoreControls,
} from '@/features/admin/PlatformAdminActions';
import { PlatformAIProviderSettingsForm } from '@/features/admin/PlatformAIProviderSettingsForm';
import { PlatformRuntimeSettingsForm } from '@/features/admin/PlatformRuntimeSettingsForm';
import { DashboardPagination } from '@/features/dashboard/DashboardPagination';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { PLATFORM_PERMISSIONS, requirePlatformAdmin } from '@/libs/PlatformAdmin';
import {
  getStoredPlatformAIProviderConfig,
} from '@/libs/PlatformAIProviderConfig';
import { getPlatformRuntimeConfigStatus } from '@/libs/PlatformRuntimeConfig';
import { getStoreReadiness } from '@/libs/StoreReadiness';
import {
  aiActionLogsTable,
  customersTable,
  deliveryMethodsTable,
  ordersTable,
  paymentMethodsTable,
  productsTable,
  storeSettingsTable,
} from '@/models/Schema';
import { getCustomerChannelDisplayValue } from '@/utils/CustomerChannels';
import { AllPlans, PLAN_NAME } from '@/utils/PricingPlans';

type AdminPageProps = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ page?: string }>;
};

type StoreMetadata = {
  businessType?: string;
  contactChannels?: Record<string, unknown>;
  location?: {
    address?: string;
    branchName?: string;
    city?: string;
    district?: string;
    phone?: string;
  };
  platform?: {
    partialSuspensions?: {
      ai?: boolean;
      productPublishing?: boolean;
      webOrders?: boolean;
      whatsapp?: boolean;
    };
    serviceNotes?: string;
    status?: string;
  };
  subscription?: {
    addOns?: {
      aiOrders?: number;
      products?: number;
      storageMb?: number;
      teamMembers?: number;
    };
    adminOverride?: {
      enabled?: boolean;
      plan?: string;
    };
    plan?: string;
    status?: string;
  };
};

const text = (locale: string, ar: string, en: string) => locale === 'ar' ? ar : en;

const getContactChannelDisplay = (_locale: string, value: unknown) =>
  getCustomerChannelDisplayValue(value);

const getClerkOrganizationNames = async (organizationIds: string[]) => {
  const client = await clerkClient();
  const entries = await Promise.all(
    organizationIds.map(async (organizationId) => {
      try {
        const organization = await client.organizations.getOrganization({
          organizationId,
        });

        return [organizationId, organization.name?.trim() || null] as const;
      } catch {
        return [organizationId, null] as const;
      }
    }),
  );

  return new Map(entries);
};

const getServiceStatusDisplay = (locale: string, status: string) => {
  const normalizedStatus = ['active', 'limited', 'paused', 'suspended'].includes(status)
    ? status
    : 'active';
  const labels = {
    active: text(locale, 'نشط', 'Active'),
    limited: text(locale, 'محدود', 'Limited'),
    paused: text(locale, 'موقوف مؤقتاً', 'Paused'),
    suspended: text(locale, 'محظور', 'Suspended'),
  };
  const classes = {
    active: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700',
    limited: 'border-sky-500/30 bg-sky-500/10 text-sky-700',
    paused: 'border-amber-500/30 bg-amber-500/10 text-amber-700',
    suspended: 'border-red-500/30 bg-red-500/10 text-red-700',
  };
  const dotClasses = {
    active: 'bg-emerald-500',
    limited: 'bg-sky-500',
    paused: 'bg-amber-500',
    suspended: 'bg-red-500',
  };

  return {
    className: classes[normalizedStatus as keyof typeof classes],
    dotClassName: dotClasses[normalizedStatus as keyof typeof dotClasses],
    label: labels[normalizedStatus as keyof typeof labels],
  };
};

export default async function PlatformAdminPage(props: AdminPageProps) {
  const { locale } = await props.params;
  const searchParams = await props.searchParams;
  const requestedPage = Number.parseInt(searchParams?.page ?? '1', 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0
    ? requestedPage
    : 1;
  const pageSize = 50;
  setRequestLocale(locale);
  const admin = await requirePlatformAdmin();
  const permissions = admin.platformAccess.permissions;
  const canManagePlatformService = permissions.includes(PLATFORM_PERMISSIONS.MANAGE_SERVICE);
  const canManageService = permissions.includes(PLATFORM_PERMISSIONS.MANAGE_SERVICE)
    || permissions.includes(PLATFORM_PERMISSIONS.MANAGE_STORES);
  const canManageBilling = permissions.includes(PLATFORM_PERMISSIONS.MANAGE_BILLING)
    || permissions.includes(PLATFORM_PERMISSIONS.MANAGE_STORES);
  const canUpdateStore = canManageService || canManageBilling;
  const aiProviderConfig = await getStoredPlatformAIProviderConfig();
  const runtimeConfigStatus = await getPlatformRuntimeConfigStatus();

  const [storeSummary] = await db
    .select({
      active: sql<number>`count(*) filter (
        where coalesce(${storeSettingsTable.metadata}->'platform'->>'status', 'active') = 'active'
      )`,
      total: count(storeSettingsTable.id),
    })
    .from(storeSettingsTable);
  const pagedStores = await db
    .select()
    .from(storeSettingsTable)
    .orderBy(storeSettingsTable.createdAt)
    .limit(pageSize + 1)
    .offset((currentPage - 1) * pageSize);
  const hasNextPage = pagedStores.length > pageSize;
  const stores = hasNextPage ? pagedStores.slice(0, pageSize) : pagedStores;
  const organizationIds = stores.map(store => store.organizationId);
  const clerkOrganizationNames = await getClerkOrganizationNames(
    organizationIds,
  );
  const [
    orderCounts,
    productCounts,
    paymentMethodCounts,
    deliveryMethodCounts,
    customerCounts,
    aiConversationCounts,
  ] = organizationIds.length > 0
    ? await Promise.all([
        db
          .select({
            organizationId: ordersTable.organizationId,
            total: count(ordersTable.id),
          })
          .from(ordersTable)
          .where(
            and(
              inArray(ordersTable.organizationId, organizationIds),
              isNull(ordersTable.archivedAt),
            ),
          )
          .groupBy(ordersTable.organizationId),
        db
          .select({
            images: sql<number>`count(*) filter (where ${productsTable.image} is not null)`,
            organizationId: productsTable.organizationId,
            total: count(productsTable.id),
          })
          .from(productsTable)
          .where(inArray(productsTable.organizationId, organizationIds))
          .groupBy(productsTable.organizationId),
        db
          .select({
            organizationId: paymentMethodsTable.organizationId,
            total: count(paymentMethodsTable.id),
          })
          .from(paymentMethodsTable)
          .where(
            and(
              inArray(paymentMethodsTable.organizationId, organizationIds),
              eq(paymentMethodsTable.isActive, true),
            ),
          )
          .groupBy(paymentMethodsTable.organizationId),
        db
          .select({
            organizationId: deliveryMethodsTable.organizationId,
            total: count(deliveryMethodsTable.id),
          })
          .from(deliveryMethodsTable)
          .where(
            and(
              inArray(deliveryMethodsTable.organizationId, organizationIds),
              eq(deliveryMethodsTable.isActive, true),
            ),
          )
          .groupBy(deliveryMethodsTable.organizationId),
        db
          .select({
            organizationId: customersTable.organizationId,
            total: count(customersTable.id),
          })
          .from(customersTable)
          .where(inArray(customersTable.organizationId, organizationIds))
          .groupBy(customersTable.organizationId),
        db
          .select({
            organizationId: aiActionLogsTable.organizationId,
            total: countDistinct(aiActionLogsTable.conversationId),
          })
          .from(aiActionLogsTable)
          .where(
            and(
              inArray(aiActionLogsTable.organizationId, organizationIds),
              eq(aiActionLogsTable.actionType, 'reply'),
              eq(aiActionLogsTable.allowed, true),
              isNotNull(aiActionLogsTable.conversationId),
            ),
          )
          .groupBy(aiActionLogsTable.organizationId),
      ])
    : [[], [], [], [], [], []];

  const toCountMap = (rows: Array<{ organizationId: string; total: number }>) => {
    return new Map(rows.map(row => [row.organizationId, Number(row.total)]));
  };
  const ordersByOrg = toCountMap(orderCounts);
  const productsByOrg = toCountMap(productCounts);
  const paymentMethodsByOrg = toCountMap(paymentMethodCounts);
  const deliveryMethodsByOrg = toCountMap(deliveryMethodCounts);
  const customersByOrg = toCountMap(customerCounts);
  const aiConversationsByOrg = toCountMap(aiConversationCounts);
  const imageStorageByOrg = new Map(
    productCounts.map(row => [row.organizationId, Number(row.images)]),
  );

  const totalStores = Number(storeSummary?.total ?? 0);
  const activeStores = Number(storeSummary?.active ?? 0);
  const suspendedStores = totalStores - activeStores;
  const aiProviderStatusClass = aiProviderConfig.encryptedApiKey
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
    : 'border-amber-500/30 bg-amber-500/10 text-amber-700';
  const runtimeKeysReady = runtimeConfigStatus.internal.aiEmployeeWebhookSecretAvailable
    && runtimeConfigStatus.internal.maintenanceSecretAvailable;
  const runtimeKeysStatusClass = runtimeKeysReady
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700'
    : 'border-amber-500/30 bg-amber-500/10 text-amber-700';

  const summaryCards = [
    {
      icon: Store,
      label: text(locale, 'إجمالي المتاجر', 'Total stores'),
      value: totalStores,
    },
    {
      icon: ShieldCheck,
      label: text(locale, 'متاجر نشطة', 'Active stores'),
      value: activeStores,
    },
    {
      icon: PauseCircle,
      label: text(locale, 'متاجر موقوفة أو محدودة', 'Paused or limited'),
      value: suspendedStores,
    },
    {
      icon: Bot,
      label: text(locale, 'محادثات الذكاء الاصطناعي', 'AI conversations'),
      value: Array.from(aiConversationsByOrg.values())
        .reduce((total, conversations) => total + conversations, 0),
    },
  ];

  return (
    <>
      <TitleBar
        title={text(locale, 'إدارة المنصة', 'Platform administration')}
        description={text(
          locale,
          'لوحة مالك المنصة لمراقبة المتاجر والتحكم في الباقات والسعات وحالة الخدمة.',
          'Platform owner console for monitoring stores and controlling plans, capacity, and service status.',
        )}
      />

      <section className="
        mb-6 grid gap-4
        md:grid-cols-4
      "
      >
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <div
              key={card.label}
              className="dashboard-panel rounded-xl border p-5"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm text-muted-foreground">{card.label}</div>
                  <div className="mt-2 text-3xl font-bold">{card.value}</div>
                </div>
                <div className="rounded-lg bg-primary/10 p-3 text-primary">
                  <Icon className="size-5" />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <section className="mb-6 dashboard-panel rounded-xl border p-6">
        <div className="
          flex flex-col gap-4
          lg:flex-row lg:items-start lg:justify-between
        "
        >
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-3 text-primary">
                <KeyRound className="size-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">
                  {text(locale, 'مفتاح نموذج الذكاء الاصطناعي', 'AI model API key')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {text(
                    locale,
                    'يحفظ المفتاح مشفرا ولا يظهر مرة أخرى بعد الحفظ.',
                    'The key is stored encrypted and is never shown again after saving.',
                  )}
                </p>
              </div>
            </div>
          </div>
          <span className={`
            inline-flex rounded-full border px-3 py-1 text-xs font-semibold
            ${aiProviderStatusClass}
          `}
          >
            {aiProviderConfig.encryptedApiKey
              ? text(locale, 'مفتاح محفوظ', 'Key saved')
              : text(locale, 'غير مربوط', 'Not connected')}
          </span>
        </div>

        <PlatformAIProviderSettingsForm
          action={updatePlatformAIProviderConfig.bind(null, locale)}
          apiKeyPreview={aiProviderConfig.apiKeyPreview}
          baseUrl={aiProviderConfig.baseUrl}
          canManageService={canManagePlatformService}
          enabled={aiProviderConfig.enabled}
          hasApiKey={Boolean(aiProviderConfig.encryptedApiKey)}
          labels={{
            activation: text(locale, 'التفعيل', 'Activation'),
            apiBaseUrl: text(locale, 'رابط API', 'API base URL'),
            apiKey: text(locale, 'API key', 'API key'),
            apiKeyHint: text(
              locale,
              'المفتاح المحفوظ: {preview}. اترك الحقل فارغاً للإبقاء عليه، أو أدخل مفتاحاً جديداً لاستبداله.',
              'Saved key: {preview}. Leave this field blank to keep it, or enter a new key to replace it.',
            ),
            clearApiKey: text(locale, 'حذف المفتاح المحفوظ', 'Remove saved key'),
            enableModel: text(locale, 'تفعيل النموذج الحقيقي', 'Enable real model'),
            model: text(locale, 'النموذج', 'Model'),
            provider: text(locale, 'المزود', 'Provider'),
            save: text(locale, 'حفظ إعدادات النموذج', 'Save model settings'),
            systemPrompt: text(locale, 'System prompt', 'System prompt'),
          }}
          model={aiProviderConfig.model}
          provider={aiProviderConfig.provider}
          systemPrompt={aiProviderConfig.systemPrompt}
        />
      </section>

      <section className="mb-6 dashboard-panel rounded-xl border p-6">
        <div className="
          flex flex-col gap-4
          lg:flex-row lg:items-start lg:justify-between
        "
        >
          <div>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-3 text-primary">
                <KeyRound className="size-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold">
                  {text(locale, 'مفاتيح الإنتاج التشغيلية', 'Production runtime keys')}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {text(
                    locale,
                    'أسرار التشغيل الداخلية تحفظ مشفرة هنا. بيانات واتساب لكل متجر تحفظ مشفرة في إعدادات المتجر.',
                    'Internal runtime secrets are stored encrypted here. Per-store WhatsApp credentials are stored encrypted from the store settings page.',
                  )}
                </p>
              </div>
            </div>
          </div>
          <span className={`
            inline-flex rounded-full border px-3 py-1 text-xs font-semibold
            ${runtimeKeysStatusClass}
          `}
          >
            {runtimeKeysReady
              ? text(locale, 'مفاتيح التشغيل جاهزة', 'Runtime keys ready')
              : text(locale, 'تحتاج مراجعة', 'Needs review')}
          </span>
        </div>

        <PlatformRuntimeSettingsForm
          action={updatePlatformRuntimeConfig.bind(null, locale)}
          canManageService={canManagePlatformService}
          labels={{
            aiEmployeeWebhookSecret: text(locale, 'سر Webhook لموظف الذكاء', 'AI employee webhook secret'),
            clear: text(locale, 'حذف المفتاح المحفوظ داخل المنصة', 'Remove the key saved in platform settings'),
            configuredFromEnvironment: text(locale, 'من Render', 'From Render'),
            maintenanceSecret: text(locale, 'سر الصيانة المجدولة', 'Scheduled maintenance secret'),
            missing: text(locale, 'ناقص', 'Missing'),
            productionOnlyHint: text(
              locale,
              'هذه حقول تشغيل إنتاج فقط. اترك الحقل فارغا للإبقاء على المفتاح الحالي، أو أدخل قيمة جديدة للاستبدال.',
              'These are production runtime fields only. Leave a field empty to keep the current key, or enter a new value to replace it.',
            ),
            save: text(locale, 'حفظ مفاتيح الإنتاج', 'Save production keys'),
            savedInPlatform: text(locale, 'محفوظ في المنصة', 'Saved in platform'),
            secretHint: text(
              locale,
              'القيمة الحالية: {preview}. لن تظهر القيمة كاملة بعد الحفظ.',
              'Current value: {preview}. The full value is never shown after saving.',
            ),
          }}
          secrets={{
            aiEmployeeWebhookSecret: {
              available: runtimeConfigStatus.internal.aiEmployeeWebhookSecretAvailable,
              preview: runtimeConfigStatus.internal.aiEmployeeWebhookSecretPreview,
              stored: runtimeConfigStatus.internal.aiEmployeeWebhookSecretStored,
            },
            maintenanceSecret: {
              available: runtimeConfigStatus.internal.maintenanceSecretAvailable,
              preview: runtimeConfigStatus.internal.maintenanceSecretPreview,
              stored: runtimeConfigStatus.internal.maintenanceSecretStored,
            },
          }}
        />
      </section>

      <section className="grid gap-4">
        {stores.map((store) => {
          const metadata = (store.metadata ?? {}) as StoreMetadata;
          const platform = metadata.platform ?? {};
          const subscription = metadata.subscription ?? {};
          const contactChannels = metadata.contactChannels ?? {};
          const phoneContact = getContactChannelDisplay(locale, contactChannels.phone);
          const emailContact = getContactChannelDisplay(locale, contactChannels.email);
          const whatsappContact = getContactChannelDisplay(locale, contactChannels.whatsapp);
          const location = metadata.location ?? {};
          const displayStoreName = store.storeName?.trim()
            || location.branchName?.trim()
            || clerkOrganizationNames.get(store.organizationId)
            || text(locale, 'متجر بدون اسم', 'Unnamed store');
          const status = platform.status ?? 'active';
          const statusDisplay = getServiceStatusDisplay(locale, status);
          const displayPlan = subscription.adminOverride?.enabled
            ? subscription.adminOverride.plan
            : subscription.plan;
          const plan = AllPlans.some(item => item.name === displayPlan)
            ? displayPlan!
            : PLAN_NAME.FREE;
          const partialSuspensions = platform.partialSuspensions ?? {};
          const readiness = getStoreReadiness({
            businessType: metadata.businessType,
            contactChannels: metadata.contactChannels,
            currency: store.currency,
            deliveryMethodsCount: deliveryMethodsByOrg.get(store.organizationId) ?? 0,
            location: metadata.location,
            paymentMethodsCount: paymentMethodsByOrg.get(store.organizationId) ?? 0,
            productsCount: productsByOrg.get(store.organizationId) ?? 0,
            storeDescription: store.storeDescription,
            storeName: store.storeName,
            timezone: store.timezone,
            welcomeMessage: store.welcomeMessage,
          });
          const readinessLabel = {
            incomplete: text(locale, 'إعداد ناقص', 'Incomplete setup'),
            not_started: text(locale, 'لم يبدأ الإعداد', 'Setup not started'),
            ready: text(locale, 'جاهز', 'Ready'),
          }[readiness.status];

          const metrics = [
            {
              icon: Activity,
              label: text(locale, 'الطلبات', 'Orders'),
              value: ordersByOrg.get(store.organizationId) ?? 0,
            },
            {
              icon: Bot,
              label: text(locale, 'محادثات الذكاء الاصطناعي', 'AI conversations'),
              value: aiConversationsByOrg.get(store.organizationId) ?? 0,
            },
            {
              icon: Package,
              label: text(locale, 'المنتجات', 'Products'),
              value: productsByOrg.get(store.organizationId) ?? 0,
            },
            {
              icon: HardDrive,
              label: text(locale, 'صور تقديرية', 'Image MB est.'),
              value: imageStorageByOrg.get(store.organizationId) ?? 0,
            },
            {
              icon: Users,
              label: text(locale, 'العملاء', 'Customers'),
              value: customersByOrg.get(store.organizationId) ?? 0,
            },
          ];

          const suspensionOptions = [
            ['pauseAi', partialSuspensions.ai, text(locale, 'إيقاف الذكاء الاصطناعي', 'Pause AI')],
            ['pauseWhatsapp', partialSuspensions.whatsapp, text(locale, 'إيقاف WhatsApp', 'Pause WhatsApp')],
            ['pauseWebOrders', partialSuspensions.webOrders, text(locale, 'إيقاف طلبات الويب', 'Pause web orders')],
            ['pauseProductPublishing', partialSuspensions.productPublishing, text(locale, 'إيقاف نشر المنتجات', 'Pause product publishing')],
          ] as const;

          return (
            <div
              key={store.organizationId}
              className="dashboard-panel rounded-xl border p-6"
            >
              <div className="
                flex flex-col gap-4
                lg:flex-row lg:items-start lg:justify-between
              "
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-bold">
                      {displayStoreName}
                    </h2>
                    <span
                      className={`
                        inline-flex items-center gap-2 rounded-full border px-3
                        py-1 text-xs font-semibold
                        ${statusDisplay.className}
                      `}
                    >
                      <span className={`
                        size-2 rounded-full
                        ${statusDisplay.dotClassName}
                      `}
                      />
                      {statusDisplay.label}
                    </span>
                    <span className="
                      rounded-full border px-3 py-1 text-xs font-semibold
                    "
                    >
                      {plan}
                    </span>
                    <span className="
                      rounded-full border px-3 py-1 text-xs font-semibold
                    "
                    >
                      {readinessLabel}
                      {' '}
                      {readiness.score}
                      %
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {store.organizationId}
                  </p>
                  {store.storeDescription && (
                    <p className="
                      mt-2 max-w-3xl text-sm/6 text-muted-foreground
                    "
                    >
                      {store.storeDescription}
                    </p>
                  )}
                  <div className="
                    mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground
                  "
                  >
                    {metadata.businessType && (
                      <span className="rounded-full border px-2.5 py-1">
                        {metadata.businessType}
                      </span>
                    )}
                    {phoneContact && (
                      <span className="rounded-full border px-2.5 py-1">
                        {phoneContact}
                      </span>
                    )}
                    {emailContact && (
                      <span className="rounded-full border px-2.5 py-1">
                        {emailContact}
                      </span>
                    )}
                    {whatsappContact && (
                      <span className="rounded-full border px-2.5 py-1">
                        WhatsApp:
                        {' '}
                        {whatsappContact}
                      </span>
                    )}
                    {[location.city, location.district, location.address]
                      .filter(Boolean)
                      .length > 0 && (
                      <span className="rounded-full border px-2.5 py-1">
                        {[location.city, location.district, location.address]
                          .filter(Boolean)
                          .join(' - ')}
                      </span>
                    )}
                  </div>
                </div>
                <Link
                  href={`/admin/stores/${store.organizationId}`}
                  className="
                    inline-flex dashboard-pill shrink-0 items-center
                    justify-center rounded-lg border px-4 py-2 text-sm
                    font-semibold transition-colors
                    hover:bg-accent
                  "
                >
                  {text(locale, 'تفاصيل المتجر', 'Store details')}
                </Link>
              </div>

              <div className="
                mt-5 grid gap-3
                md:grid-cols-5
              "
              >
                {metrics.map((metric) => {
                  const Icon = metric.icon;

                  return (
                    <div
                      key={metric.label}
                      className="dashboard-surface rounded-xl border p-4"
                    >
                      <Icon className="mb-3 size-4 text-primary" />
                      <div className="text-xs text-muted-foreground">{metric.label}</div>
                      <div className="mt-1 text-2xl font-bold">{metric.value}</div>
                    </div>
                  );
                })}
              </div>

              <form
                action={updatePlatformStoreControls.bind(null, locale)}
                className="
                  mt-5 grid dashboard-surface gap-4 rounded-xl border p-4
                  lg:grid-cols-4
                "
              >
                <input type="hidden" name="organizationId" value={store.organizationId} />

                <label className="grid gap-2 text-sm font-medium">
                  {text(locale, 'حالة الخدمة', 'Service status')}
                  <select
                    name="status"
                    defaultValue={status}
                    disabled={!canManageService}
                    className="
                      dashboard-pill rounded-lg border px-3 py-2 text-sm
                      disabled:cursor-not-allowed disabled:opacity-55
                    "
                  >
                    <option value="active">{text(locale, 'نشط', 'Active')}</option>
                    <option value="limited">{text(locale, 'محدود', 'Limited')}</option>
                    <option value="paused">{text(locale, 'موقوف مؤقتاً', 'Paused')}</option>
                    <option value="suspended">{text(locale, 'محظور', 'Suspended')}</option>
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  {text(locale, 'الباقة', 'Plan')}
                  <select
                    name="plan"
                    defaultValue={plan}
                    disabled={!canManageBilling}
                    className="
                      dashboard-pill rounded-lg border px-3 py-2 text-sm
                      disabled:cursor-not-allowed disabled:opacity-55
                    "
                  >
                    {AllPlans.map(item => (
                      <option key={item.name} value={item.name}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  {text(locale, 'محادثات ذكاء اصطناعي إضافية', 'Extra AI conversations')}
                  <input
                    name="extraAiOrders"
                    type="number"
                    min="0"
                    defaultValue={subscription.addOns?.aiOrders ?? 0}
                    disabled={!canManageBilling}
                    className="
                      dashboard-pill rounded-lg border px-3 py-2 text-sm
                      disabled:cursor-not-allowed disabled:opacity-55
                    "
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  {text(locale, 'تخزين إضافي MB', 'Extra storage MB')}
                  <input
                    name="extraStorageMb"
                    type="number"
                    min="0"
                    defaultValue={subscription.addOns?.storageMb ?? 0}
                    disabled={!canManageBilling}
                    className="
                      dashboard-pill rounded-lg border px-3 py-2 text-sm
                      disabled:cursor-not-allowed disabled:opacity-55
                    "
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  {text(locale, 'عناصر كتالوج إضافية', 'Extra catalog items')}
                  <input
                    name="extraCatalogItems"
                    type="number"
                    min="0"
                    defaultValue={subscription.addOns?.products ?? 0}
                    disabled={!canManageBilling}
                    className="
                      dashboard-pill rounded-lg border px-3 py-2 text-sm
                      disabled:cursor-not-allowed disabled:opacity-55
                    "
                  />
                </label>

                <label className="grid gap-2 text-sm font-medium">
                  {text(locale, 'أعضاء إضافيون', 'Extra members')}
                  <input
                    name="extraTeamMembers"
                    type="number"
                    min="0"
                    defaultValue={subscription.addOns?.teamMembers ?? 0}
                    disabled={!canManageBilling}
                    className="
                      dashboard-pill rounded-lg border px-3 py-2 text-sm
                      disabled:cursor-not-allowed disabled:opacity-55
                    "
                  />
                </label>

                <div className="grid gap-2 text-sm font-medium">
                  {text(locale, 'إيقاف جزئي', 'Partial suspension')}
                  <div className="grid gap-2 text-xs">
                    {suspensionOptions.map(([name, checked, label]) => (
                      <label
                        key={name}
                        className="flex items-center gap-2"
                      >
                        <input
                          name={name}
                          type="checkbox"
                          defaultChecked={Boolean(checked)}
                          disabled={!canManageService}
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>

                <label className="
                  grid gap-2 text-sm font-medium
                  lg:col-span-2
                "
                >
                  {text(locale, 'ملاحظات إدارية', 'Admin notes')}
                  <textarea
                    name="serviceNotes"
                    defaultValue={platform.serviceNotes ?? ''}
                    rows={4}
                    disabled={!canManageService}
                    className="
                      dashboard-pill rounded-lg border px-3 py-2 text-sm
                      disabled:cursor-not-allowed disabled:opacity-55
                    "
                  />
                </label>

                <div className="flex items-end">
                  <PendingSubmitButton
                    disabled={!canUpdateStore}
                    className="
                      w-full rounded-lg bg-primary px-4 py-2 text-sm
                      font-semibold text-primary-foreground transition-opacity
                      hover:opacity-90
                      disabled:cursor-not-allowed disabled:opacity-55
                    "
                  >
                    {text(locale, 'حفظ تحكم المتجر', 'Save store controls')}
                  </PendingSubmitButton>
                </div>
              </form>
            </div>
          );
        })}
      </section>

      <DashboardPagination
        basePath="/admin"
        currentPage={currentPage}
        hasNextPage={hasNextPage}
        locale={locale}
      />
    </>
  );
}

export const dynamic = 'force-dynamic';
