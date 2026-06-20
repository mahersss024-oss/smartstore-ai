import { clerkClient } from '@clerk/nextjs/server';
import {
  and,
  count,
  countDistinct,
  desc,
  eq,
  gte,
  isNotNull,
  sql,
} from 'drizzle-orm';
import {
  Archive,
  Bot,
  CreditCard,
  HardDrive,
  MapPin,
  Package,
  ReceiptText,
  ShieldAlert,
  ShoppingBag,
  Truck,
  Users,
} from 'lucide-react';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { PendingSubmitButton } from '@/components/PendingSubmitButton';
import {
  archivePlatformStore,
  cancelPlatformStoreSubscription,
  permanentlyDeletePlatformStore,
} from '@/features/admin/PlatformAdminActions';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { formatDatabaseDateTime } from '@/libs/DateTime';
import { db } from '@/libs/DB';
import { PLATFORM_PERMISSIONS, requirePlatformAdmin } from '@/libs/PlatformAdmin';
import { ensureStoreSettings } from '@/libs/StoreSettings';
import {
  aiActionLogsTable,
  customersTable,
  deliveryMethodsTable,
  ordersTable,
  paymentMethodsTable,
  platformAdminAuditLogsTable,
  productsTable,
  storeSettingsTable,
} from '@/models/Schema';
import { getCustomerChannelDisplayValue } from '@/utils/CustomerChannels';
import { AllPlans, PLAN_NAME } from '@/utils/PricingPlans';

type StoreDetailsPageProps = {
  params: Promise<{
    locale: string;
    organizationId: string;
  }>;
  searchParams: Promise<{
    deleteError?: string;
  }>;
};

type StoreMetadata = {
  brandTheme?: {
    accentColor?: string;
    backgroundColor?: string;
    primaryColor?: string;
  };
  businessType?: string;
  contactChannels?: Record<string, unknown>;
  location?: {
    address?: string;
    branchName?: string;
    city?: string;
    deliveryNotes?: string;
    district?: string;
    mapsUrl?: string;
    phone?: string;
    pickupInstructions?: string;
  };
  platform?: {
    archivedAt?: string;
    archivedBy?: string;
    partialSuspensions?: Record<string, boolean | undefined>;
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

type DeliveryConfig = {
  instructions?: string;
};

type PaymentConfig = {
  gatewayProvider?: string;
  instructions?: string;
  merchantId?: string;
  paymentLink?: string;
  productionDomain?: string;
  publishableKey?: string;
};

const text = (locale: string, ar: string, en: string) => locale === 'ar' ? ar : en;

const getBusinessTypeLabel = (locale: string, value?: string) => {
  const labels: Record<string, { ar: string; en: string }> = {
    bakery_sweets: { ar: 'مخبز أو حلويات', en: 'Bakery or sweets' },
    beauty_store: { ar: 'متجر تجميل', en: 'Beauty store' },
    booking_services: { ar: 'خدمات حجز', en: 'Booking services' },
    coffee_shop: { ar: 'مقهى', en: 'Coffee shop' },
    digital_services: { ar: 'خدمات رقمية', en: 'Digital services' },
    electronics_store: { ar: 'متجر إلكترونيات', en: 'Electronics store' },
    fashion_store: { ar: 'متجر أزياء', en: 'Fashion store' },
    field_services: { ar: 'خدمات ميدانية', en: 'Field services' },
    flowers_gifts: { ar: 'زهور وهدايا', en: 'Flowers and gifts' },
    furniture_store: { ar: 'متجر أثاث', en: 'Furniture store' },
    general_store: { ar: 'متجر عام', en: 'General store' },
    grocery: { ar: 'بقالة أو سوبر ماركت', en: 'Grocery' },
    home_business: { ar: 'مشروع منزلي', en: 'Home business' },
    juice_shop: { ar: 'محل عصائر', en: 'Juice shop' },
    pharmacy: { ar: 'صيدلية', en: 'Pharmacy' },
    restaurant: { ar: 'مطعم', en: 'Restaurant' },
    retail_store: { ar: 'متجر تجزئة', en: 'Retail store' },
    subscription_store: { ar: 'متجر اشتراكات', en: 'Subscription store' },
  };

  const label = value ? labels[value] : undefined;

  return label ? text(locale, label.ar, label.en) : value;
};

const getSubscriptionStatusLabel = (locale: string, value?: string) => {
  const labels: Record<string, { ar: string; en: string }> = {
    active: { ar: 'نشط', en: 'Active' },
    canceled: { ar: 'ملغى', en: 'Canceled' },
    incomplete: { ar: 'غير مكتمل', en: 'Incomplete' },
    past_due: { ar: 'متأخر الدفع', en: 'Past due' },
    trialing: { ar: 'تجريبي', en: 'Trialing' },
    unpaid: { ar: 'غير مدفوع', en: 'Unpaid' },
  };
  const status = value ?? 'active';
  const label = labels[status];

  return label ? text(locale, label.ar, label.en) : status;
};

const getPaymentMethodLabel = (
  locale: string,
  provider: string,
  fallback: string,
) => {
  const labels: Record<string, { ar: string; en: string }> = {
    apple_pay: { ar: 'Apple Pay', en: 'Apple Pay' },
    card_on_delivery: { ar: 'بطاقة عند التوصيل', en: 'Card on delivery' },
    card_on_pickup: { ar: 'بطاقة عند الاستلام من المتجر', en: 'Card at pickup' },
    cash_on_delivery: { ar: 'الدفع عند التوصيل', en: 'Cash on delivery' },
    cash_on_pickup: { ar: 'الدفع عند الاستلام من المتجر', en: 'Pay at pickup' },
    custom_payment_link: { ar: 'رابط دفع مخصص', en: 'Custom payment link' },
    google_pay: { ar: 'Google Pay', en: 'Google Pay' },
    moyasar: { ar: 'بوابة دفع إلكتروني', en: 'Online payment gateway' },
    stripe: { ar: 'بطاقات / Apple Pay / Google Pay', en: 'Cards / Apple Pay / Google Pay' },
  };
  const label = labels[provider];

  return label ? text(locale, label.ar, label.en) : fallback;
};

const getPaymentTypeLabel = (locale: string, type: string) => {
  const labels: Record<string, { ar: string; en: string }> = {
    offline: { ar: 'دفع عند الاستلام', en: 'Pay on receipt' },
    online: { ar: 'دفع إلكتروني', en: 'Online payment' },
    wallet: { ar: 'محفظة رقمية', en: 'Digital wallet' },
  };
  const label = labels[type];

  return label ? text(locale, label.ar, label.en) : type;
};

const getDeliveryMethodLabel = (
  locale: string,
  type: string,
  fallback: string,
) => {
  const labels: Record<string, { ar: string; en: string }> = {
    courier_shipping: { ar: 'شحن عبر شركة توصيل', en: 'Courier shipping' },
    curbside_pickup: { ar: 'استلام من السيارة', en: 'Curbside pickup' },
    digital: { ar: 'تسليم رقمي', en: 'Digital delivery' },
    dine_in: { ar: 'تناول داخل الفرع / خدمة طاولة', en: 'Dine-in / table service' },
    local_delivery: { ar: 'توصيل محلي', en: 'Local delivery' },
    pickup: { ar: 'استلام من المتجر', en: 'Store pickup' },
    scheduled_delivery: { ar: 'توصيل مجدول', en: 'Scheduled delivery' },
  };
  const label = labels[type];

  return label ? text(locale, label.ar, label.en) : fallback;
};

const getContactChannelDisplay = (_locale: string, value: unknown) =>
  getCustomerChannelDisplayValue(value);

const getAuditActionLabel = (locale: string, action: string) => {
  const labels: Record<string, { ar: string; en: string }> = {
    store_archived: {
      ar: 'إيقاف المتجر',
      en: 'Store suspended',
    },
    store_controls_updated: {
      ar: 'تحديث صلاحيات المتجر',
      en: 'Store controls updated',
    },
    store_permanently_deleted: {
      ar: 'حذف المتجر نهائياً',
      en: 'Store permanently deleted',
    },
    store_subscription_cancelled: {
      ar: 'إلغاء اشتراك المتجر',
      en: 'Store subscription cancelled',
    },
  };
  const label = labels[action];

  return label ? text(locale, label.ar, label.en) : action.replaceAll('_', ' ');
};

const getAuditSummaryLabel = (locale: string, summary: string) => {
  const labels: Record<string, { ar: string; en: string }> = {
    'Store controls were updated': {
      ar: 'تم تحديث حالة المتجر وصلاحيات التشغيل.',
      en: 'Store status and operating controls were updated.',
    },
    'Store was archived and suspended': {
      ar: 'تم إيقاف المتجر وإيقاف تشغيله مؤقتاً.',
      en: 'The store was suspended and paused.',
    },
    'Store subscription was cancelled immediately': {
      ar: 'تم إلغاء اشتراك المتجر فوراً.',
      en: 'Store subscription was cancelled immediately.',
    },
    'Store subscription was scheduled for cancellation': {
      ar: 'تم جدولة إلغاء اشتراك المتجر.',
      en: 'Store subscription cancellation was scheduled.',
    },
    'Store was permanently deleted from the platform': {
      ar: 'تم حذف المتجر نهائياً من المنصة.',
      en: 'Store was permanently deleted from the platform.',
    },
    'Store was permanently deleted from the platform; external account was already missing': {
      ar: 'تم حذف المتجر نهائياً من المنصة، وكان حسابه الخارجي غير موجود مسبقاً.',
      en: 'Store was permanently deleted from the platform; its external account was already missing.',
    },
  };
  const label = labels[summary];

  if (label) {
    return text(locale, label.ar, label.en);
  }

  return summary
    .replaceAll('Clerk subscription item', 'store subscription')
    .replaceAll('application data and Clerk', 'the platform')
    .replaceAll('application data; Clerk organization', 'the platform; external account');
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

const getMonthStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
};

const percent = (used: number, limit: number) => {
  if (limit <= 0) {
    return 0;
  }

  return Math.min(Math.round((used / limit) * 100), 100);
};

const formatMoney = (value: number, locale: string) => {
  return new Intl.NumberFormat(locale, {
    currency: 'SAR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: 'currency',
  }).format(value);
};

const getClerkOrganizationName = async (organizationId: string) => {
  try {
    const client = await clerkClient();
    const organization = await client.organizations.getOrganization({
      organizationId,
    });

    return organization.name?.trim() || null;
  } catch {
    return null;
  }
};

const Field = (props: {
  label: string;
  value?: React.ReactNode;
}) => {
  if (
    props.value === null
    || props.value === undefined
    || String(props.value).trim() === ''
  ) {
    return null;
  }

  return (
    <div className="dashboard-surface rounded-xl border p-4">
      <div className="text-xs font-medium text-muted-foreground">{props.label}</div>
      <div className="mt-2 text-sm font-semibold wrap-break-word">{props.value}</div>
    </div>
  );
};

const PaymentMethodCard = (props: {
  locale: string;
  method: {
    config: unknown;
    displayName: string;
    id: number;
    isActive: boolean;
    provider: string;
    requiresOnlinePayment: boolean;
    type: string;
  };
}) => {
  const { locale, method } = props;
  const config = (method.config ?? {}) as PaymentConfig;

  return (
    <div
      key={method.id}
      className="dashboard-surface rounded-xl border p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">
            {getPaymentMethodLabel(locale, method.provider, method.displayName)}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {getPaymentTypeLabel(locale, method.type)}
          </div>
        </div>
        <span className="rounded-full border px-2.5 py-1 text-xs">
          {method.isActive ? text(locale, 'نشط', 'Active') : text(locale, 'غير نشط', 'Inactive')}
        </span>
      </div>
      <div className="mt-3 text-xs text-muted-foreground">
        {text(locale, 'يتطلب دفعاً إلكترونياً', 'Requires online payment')}
        {': '}
        {method.requiresOnlinePayment ? text(locale, 'نعم', 'Yes') : text(locale, 'لا', 'No')}
      </div>
      <div className="
        mt-3 grid gap-2 text-xs text-muted-foreground
        md:grid-cols-2
      "
      >
        <Field label={text(locale, 'بوابة الدفع', 'Payment gateway')} value={config.gatewayProvider} />
        <Field label={text(locale, 'رقم حساب الدفع', 'Payment account number')} value={config.merchantId} />
        <Field label={text(locale, 'مفتاح الربط العام', 'Public payment key')} value={config.publishableKey} />
        <Field label={text(locale, 'رابط المتجر', 'Store website URL')} value={config.productionDomain} />
        <Field label={text(locale, 'رابط الدفع', 'Payment link')} value={config.paymentLink} />
        <Field label={text(locale, 'تعليمات الدفع', 'Payment instructions')} value={config.instructions} />
      </div>
    </div>
  );
};

const DeliveryMethodCard = (props: {
  locale: string;
  method: {
    config: unknown;
    displayName: string;
    estimatedTime: null | string;
    fee: string;
    id: number;
    isActive: boolean;
    type: string;
  };
}) => {
  const { locale, method } = props;
  const config = (method.config ?? {}) as DeliveryConfig;

  return (
    <div
      key={method.id}
      className="dashboard-surface rounded-xl border p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">
            {getDeliveryMethodLabel(locale, method.type, method.displayName)}
          </div>
          {method.displayName !== method.type && (
            <div className="mt-1 text-xs text-muted-foreground">
              {method.displayName}
            </div>
          )}
        </div>
        <span className="rounded-full border px-2.5 py-1 text-xs">
          {method.isActive ? text(locale, 'نشط', 'Active') : text(locale, 'غير نشط', 'Inactive')}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
        <div>
          {text(locale, 'الرسوم', 'Fee')}
          {': '}
          {method.fee}
        </div>
        <div>
          {text(locale, 'المدة المتوقعة', 'Estimated time')}
          {': '}
          {method.estimatedTime || text(locale, 'غير محددة', 'Not set')}
        </div>
        {config.instructions && (
          <div>
            {text(locale, 'تعليمات التوصيل', 'Delivery instructions')}
            {': '}
            {config.instructions}
          </div>
        )}
      </div>
    </div>
  );
};

export default async function StoreDetailsPage(props: StoreDetailsPageProps) {
  const { locale, organizationId } = await props.params;
  const { deleteError } = await props.searchParams;
  setRequestLocale(locale);
  const admin = await requirePlatformAdmin();
  const canArchive = admin.platformAccess.permissions.includes(
    PLATFORM_PERMISSIONS.MANAGE_STORES,
  );
  const canCancelSubscription = admin.platformAccess.permissions.includes(
    PLATFORM_PERMISSIONS.MANAGE_BILLING,
  ) || canArchive;

  let [store] = await db
    .select()
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);

  if (!store) {
    await ensureStoreSettings(organizationId);
    [store] = await db
      .select()
      .from(storeSettingsTable)
      .where(eq(storeSettingsTable.organizationId, organizationId))
      .limit(1);
  }

  if (!store) {
    notFound();
  }

  const [
    products,
    orders,
    productStats,
    orderStats,
    customerStats,
    paymentMethods,
    deliveryMethods,
    auditLogs,
    monthlyAiStats,
  ] = await Promise.all([
    db
      .select()
      .from(productsTable)
      .where(eq(productsTable.organizationId, organizationId))
      .orderBy(desc(productsTable.createdAt))
      .limit(8),
    db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.organizationId, organizationId))
      .orderBy(desc(ordersTable.createdAt))
      .limit(8),
    db
      .select({
        imageBytes: sql<number>`coalesce(sum(${productsTable.imageSizeBytes}), 0)`,
        total: count(productsTable.id),
      })
      .from(productsTable)
      .where(eq(productsTable.organizationId, organizationId))
      .then(rows => rows[0]),
    db
      .select({
        active: sql<number>`count(*) filter (where ${ordersTable.archivedAt} is null)`,
        archived: sql<number>`count(*) filter (where ${ordersTable.archivedAt} is not null)`,
        completed: sql<number>`count(*) filter (
          where ${ordersTable.archivedAt} is null
          and ${ordersTable.status} = 'completed'
        )`,
        revenue: sql<number>`coalesce(sum(${ordersTable.totalPrice}) filter (
          where ${ordersTable.archivedAt} is null
        ), 0)`,
      })
      .from(ordersTable)
      .where(eq(ordersTable.organizationId, organizationId))
      .then(rows => rows[0]),
    db
      .select({ total: count(customersTable.id) })
      .from(customersTable)
      .where(eq(customersTable.organizationId, organizationId))
      .then(rows => rows[0]),
    db
      .select()
      .from(paymentMethodsTable)
      .where(eq(paymentMethodsTable.organizationId, organizationId))
      .orderBy(desc(paymentMethodsTable.createdAt)),
    db
      .select()
      .from(deliveryMethodsTable)
      .where(eq(deliveryMethodsTable.organizationId, organizationId))
      .orderBy(desc(deliveryMethodsTable.createdAt)),
    db
      .select()
      .from(platformAdminAuditLogsTable)
      .where(eq(platformAdminAuditLogsTable.organizationId, organizationId))
      .orderBy(desc(platformAdminAuditLogsTable.createdAt))
      .limit(12),
    db
      .select({
        total: countDistinct(aiActionLogsTable.conversationId),
      })
      .from(aiActionLogsTable)
      .where(
        and(
          eq(aiActionLogsTable.organizationId, organizationId),
          eq(aiActionLogsTable.actionType, 'reply'),
          eq(aiActionLogsTable.allowed, true),
          isNotNull(aiActionLogsTable.conversationId),
          gte(aiActionLogsTable.createdAt, getMonthStart()),
        ),
      )
      .then(rows => rows[0]),
  ]);

  const metadata = (store.metadata ?? {}) as StoreMetadata;
  const clerkOrganizationName = await getClerkOrganizationName(organizationId);
  const location = metadata.location ?? {};
  const displayStoreName = store.storeName?.trim()
    || location.branchName?.trim()
    || clerkOrganizationName
    || text(locale, 'تفاصيل متجر بدون اسم', 'Unnamed store details');
  const platform = metadata.platform ?? {};
  const statusDisplay = getServiceStatusDisplay(locale, platform.status ?? 'active');
  const subscription = metadata.subscription ?? {};
  const contactChannels = metadata.contactChannels ?? {};
  const whatsappContact = getContactChannelDisplay(locale, contactChannels.whatsapp);
  const emailContact = getContactChannelDisplay(locale, contactChannels.email);
  const phoneContact = getContactChannelDisplay(locale, contactChannels.phone);
  const displayPlan = subscription.adminOverride?.enabled
    ? subscription.adminOverride.plan
    : subscription.plan;
  const planName = AllPlans.some(plan => plan.name === displayPlan)
    ? displayPlan!
    : PLAN_NAME.FREE;
  const currentPlan = AllPlans.find(plan => plan.name === planName) ?? AllPlans[0]!;
  const addOns = currentPlan.name === PLAN_NAME.FREE ? {} : (subscription.addOns ?? {});
  const activeOrderCount = Number(orderStats?.active ?? 0);
  const archivedOrderCount = Number(orderStats?.archived ?? 0);
  const monthlyAiConversations = Number(monthlyAiStats?.total ?? 0);
  const imageStorageUsed = Number(productStats?.imageBytes ?? 0) / 1024 / 1024;
  const productCount = Number(productStats?.total ?? 0);
  const customerCount = Number(customerStats?.total ?? 0);
  const totalRevenue = Number(orderStats?.revenue ?? 0);
  const completedOrders = Number(orderStats?.completed ?? 0);
  const conversionPercent = percent(completedOrders, activeOrderCount);
  const usageCounters = [
    {
      icon: Bot,
      label: text(locale, 'محادثات AI الشهرية', 'Monthly AI conversations'),
      limit: currentPlan.limits.aiOrders + (addOns.aiOrders ?? 0),
      unit: text(locale, 'محادثة', 'conversations'),
      used: monthlyAiConversations,
    },
    {
      icon: HardDrive,
      label: text(locale, 'تخزين الصور', 'Image storage'),
      limit: currentPlan.limits.storage + (addOns.storageMb ?? 0),
      unit: 'MB',
      used: imageStorageUsed,
    },
    {
      icon: Users,
      label: text(locale, 'أعضاء الفريق', 'Team members'),
      limit: currentPlan.limits.teamMember + (addOns.teamMembers ?? 0),
      unit: text(locale, 'عضو', 'members'),
      used: 1,
    },
    {
      icon: Package,
      label: text(locale, 'عناصر الكتالوج', 'Catalog items'),
      limit: currentPlan.limits.products + (addOns.products ?? 0),
      unit: text(locale, 'منتج', 'products'),
      used: productCount,
    },
  ];

  const kpis = [
    {
      icon: ShoppingBag,
      label: text(locale, 'الطلبات النشطة', 'Active orders'),
      value: activeOrderCount.toLocaleString(locale),
    },
    {
      icon: ReceiptText,
      label: text(locale, 'الإيرادات', 'Revenue'),
      value: formatMoney(totalRevenue, locale),
    },
    {
      icon: Users,
      label: text(locale, 'العملاء', 'Customers'),
      value: customerCount.toLocaleString(locale),
    },
    {
      icon: ShieldAlert,
      label: text(locale, 'نسبة الإكمال', 'Completion rate'),
      value: `${conversionPercent.toLocaleString(locale)}%`,
    },
  ];

  return (
    <>
      <TitleBar
        title={displayStoreName}
        description={text(
          locale,
          'مراقبة بيانات المتجر، أدائه، منتجاته، طلباته، واستهلاك الباقة من لوحة مالك المنصة.',
          'Monitor this store data, performance, products, orders, and plan usage from the platform owner console.',
        )}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span
          className={`
            inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm
            font-semibold
            ${statusDisplay.className}
          `}
        >
          <span className={`
            size-2.5 rounded-full
            ${statusDisplay.dotClassName}
          `}
          />
          {statusDisplay.label}
        </span>
        <span className="text-sm text-muted-foreground">{organizationId}</span>
      </div>

      {deleteError === 'clerk' && (
        <div className="
          mb-6 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm
        "
        >
          <div className="font-semibold text-amber-700">
            {text(locale, 'تعذر حذف حساب المتجر', 'Could not delete store account')}
          </div>
          <p className="mt-1 text-muted-foreground">
            {text(
              locale,
              'لم يتم حذف بيانات المتجر لأن خدمة الحسابات رفضت حذف الحساب. تحقق من الصلاحيات ثم أعد المحاولة.',
              'Store data was kept because the account service rejected the deletion. Check permissions, then try again.',
            )}
          </p>
        </div>
      )}

      <section className="
        mb-6 grid gap-4
        md:grid-cols-4
      "
      >
        {kpis.map((kpi) => {
          const Icon = kpi.icon;

          return (
            <div
              key={kpi.label}
              className="dashboard-panel rounded-xl border p-5"
            >
              <Icon className="mb-3 size-5 text-primary" />
              <div className="text-sm text-muted-foreground">{kpi.label}</div>
              <div className="mt-2 text-2xl font-bold">{kpi.value}</div>
            </div>
          );
        })}
      </section>

      <section className="mb-6 dashboard-panel rounded-xl border p-6">
        <div className="mb-5 flex items-center gap-3">
          <MapPin className="size-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">
              {text(locale, 'بيانات المتجر المدخلة', 'Submitted store data')}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {text(locale, 'تظهر هنا أي بيانات قام التاجر بإدخالها في إعدادات المتجر.', 'Any data entered by the merchant in store settings appears here.')}
            </p>
          </div>
        </div>

        <div className="
          grid gap-4
          md:grid-cols-2
          xl:grid-cols-3
        "
        >
          <Field label={text(locale, 'اسم المتجر', 'Store name')} value={displayStoreName} />
          <Field label={text(locale, 'وصف المتجر', 'Store description')} value={store.storeDescription} />
          <Field label={text(locale, 'رسالة الترحيب', 'Welcome message')} value={store.welcomeMessage} />
          <Field
            label={text(locale, 'نوع النشاط', 'Business type')}
            value={getBusinessTypeLabel(locale, metadata.businessType)}
          />
          <Field label={text(locale, 'العملة', 'Currency')} value={store.currency} />
          <Field label={text(locale, 'المنطقة الزمنية', 'Timezone')} value={store.timezone} />
          <Field label="WhatsApp" value={whatsappContact} />
          <Field label={text(locale, 'البريد الإلكتروني', 'Email')} value={emailContact} />
          <Field label={text(locale, 'الهاتف', 'Phone')} value={phoneContact} />
          <Field label={text(locale, 'اسم الفرع', 'Branch name')} value={location.branchName} />
          <Field label={text(locale, 'هاتف الفرع', 'Branch phone')} value={location.phone} />
          <Field label={text(locale, 'مدينة الفرع', 'Branch city')} value={location.city} />
          <Field label={text(locale, 'حي الفرع', 'Branch district')} value={location.district} />
          <Field label={text(locale, 'عنوان الفرع', 'Branch address')} value={location.address} />
          <Field
            label={text(locale, 'رابط الخريطة', 'Map link')}
            value={location.mapsUrl
              ? (
                  <a
                    href={location.mapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="
                      text-primary underline-offset-4
                      hover:underline
                    "
                  >
                    {location.mapsUrl}
                  </a>
                )
              : undefined}
          />
          <Field label={text(locale, 'تعليمات الاستلام', 'Pickup instructions')} value={location.pickupInstructions} />
          <Field label={text(locale, 'ملاحظات التوصيل', 'Delivery notes')} value={location.deliveryNotes} />
          <Field
            label={text(locale, 'الشعار', 'Logo')}
            value={store.logo
              ? (
                  <div className="flex items-center gap-3">
                    {/* eslint-disable-next-line next/no-img-element -- Store logos can be merchant-provided external URLs. */}
                    <img
                      alt={store.storeName ?? 'Store logo'}
                      src={store.logo}
                      className="size-14 rounded-lg object-cover"
                    />
                    <a
                      href={store.logo}
                      target="_blank"
                      rel="noreferrer"
                      className="
                        text-xs font-semibold text-primary underline-offset-4
                        hover:underline
                      "
                    >
                      {text(locale, 'فتح الشعار', 'Open logo')}
                    </a>
                  </div>
                )
              : undefined}
          />
          <Field
            label={text(locale, 'ألوان المتجر', 'Store colors')}
            value={metadata.brandTheme?.primaryColor || metadata.brandTheme?.accentColor
              || metadata.brandTheme?.backgroundColor
              ? (
                  <div className="flex flex-wrap gap-3">
                    {metadata.brandTheme?.primaryColor && (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-5 rounded-full border border-border"
                          style={{ backgroundColor: metadata.brandTheme.primaryColor }}
                        />
                        <span>{metadata.brandTheme.primaryColor}</span>
                      </span>
                    )}
                    {metadata.brandTheme?.accentColor && (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-5 rounded-full border border-border"
                          style={{ backgroundColor: metadata.brandTheme.accentColor }}
                        />
                        <span>{metadata.brandTheme.accentColor}</span>
                      </span>
                    )}
                    {metadata.brandTheme?.backgroundColor && (
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-5 rounded-full border border-border"
                          style={{ backgroundColor: metadata.brandTheme.backgroundColor }}
                        />
                        <span>{metadata.brandTheme.backgroundColor}</span>
                      </span>
                    )}
                  </div>
                )
              : undefined}
          />
          <Field
            label={text(locale, 'ساعات العمل', 'Working hours')}
            value={store.workingHours ? JSON.stringify(store.workingHours) : undefined}
          />
          <Field
            label={text(locale, 'إعدادات التنبيهات', 'Notification settings')}
            value={store.notificationSettings ? JSON.stringify(store.notificationSettings) : undefined}
          />
          <Field label={text(locale, 'ملاحظات الإدارة', 'Admin notes')} value={platform.serviceNotes} />
          <Field
            label={text(locale, 'حالة الخدمة', 'Service status')}
            value={(
              <span
                className={`
                  inline-flex items-center gap-2 rounded-full border px-2.5 py-1
                  text-xs font-semibold
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
            )}
          />
          <Field
            label={text(locale, 'حالة الاشتراك', 'Subscription status')}
            value={getSubscriptionStatusLabel(locale, subscription.status)}
          />
        </div>
      </section>

      <section className="
        mb-6 grid gap-4
        lg:grid-cols-2
      "
      >
        <div className="dashboard-panel rounded-xl border p-6">
          <div className="mb-5 flex items-center gap-3">
            <CreditCard className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {text(locale, 'طرق الدفع المدخلة', 'Submitted payment methods')}
            </h2>
          </div>

          <div className="grid gap-3">
            {paymentMethods.filter(method => method.provider !== 'bank_transfer').map(method => (
              <PaymentMethodCard
                key={method.id}
                locale={locale}
                method={method}
              />
            ))}
            {paymentMethods.filter(method => method.provider !== 'bank_transfer').length === 0 && (
              <div className="
                dashboard-surface rounded-xl border p-6 text-center text-sm
                text-muted-foreground
              "
              >
                {text(locale, 'لم يضف التاجر طرق دفع بعد.', 'The merchant has not added payment methods yet.')}
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-panel rounded-xl border p-6">
          <div className="mb-5 flex items-center gap-3">
            <Truck className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {text(locale, 'طرق التوصيل والاستلام', 'Delivery and pickup methods')}
            </h2>
          </div>

          <div className="grid gap-3">
            {deliveryMethods.map(method => (
              <DeliveryMethodCard
                key={method.id}
                locale={locale}
                method={method}
              />
            ))}
            {deliveryMethods.length === 0 && (
              <div className="
                dashboard-surface rounded-xl border p-6 text-center text-sm
                text-muted-foreground
              "
              >
                {text(locale, 'لم يضف التاجر طرق توصيل أو استلام بعد.', 'The merchant has not added delivery or pickup methods yet.')}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="
        grid gap-4
        lg:grid-cols-[1fr_0.85fr]
      "
      >
        <div className="dashboard-panel rounded-xl border p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold">
                {text(locale, 'استهلاك الباقة', 'Plan usage')}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {text(locale, 'الباقة الحالية', 'Current plan')}
                {': '}
                <span className="font-semibold text-foreground">{currentPlan.name}</span>
              </p>
            </div>
            <span className="
              rounded-full border px-3 py-1 text-xs font-semibold
            "
            >
              {statusDisplay.label}
            </span>
          </div>

          <div className="mt-5 grid gap-4">
            {usageCounters.map((counter) => {
              const Icon = counter.icon;
              const width = percent(counter.used, counter.limit);

              return (
                <div
                  key={counter.label}
                  className="dashboard-surface rounded-xl border p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="
                        flex size-10 shrink-0 items-center justify-center
                        rounded-lg bg-primary/10 text-primary
                      "
                      >
                        <Icon className="size-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold">{counter.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {counter.used.toLocaleString(locale)}
                          {' / '}
                          {counter.limit.toLocaleString(locale)}
                          {' '}
                          {counter.unit}
                        </div>
                      </div>
                    </div>
                    <div className="text-sm font-bold">
                      {width.toLocaleString(locale)}
                      %
                    </div>
                  </div>
                  <div className="
                    mt-4 h-2 overflow-hidden rounded-full bg-muted
                  "
                  >
                    <div
                      className="
                        h-full rounded-full bg-linear-to-r from-cyan-500
                        to-emerald-500
                      "
                      style={{ width: `${width}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="dashboard-panel rounded-xl border p-6">
          <h2 className="text-lg font-semibold">
            {text(locale, 'تحكمات حساسة', 'Sensitive controls')}
          </h2>
          <p className="mt-1 text-sm/6 text-muted-foreground">
            {text(
              locale,
              'الأرشفة توقف المتجر وتعلّق اشتراكه بدون حذف البيانات نهائياً.',
              'Archiving suspends the store and subscription without permanently deleting data.',
            )}
          </p>

          <div className="mt-5 grid gap-3 text-sm">
            <div className="dashboard-surface rounded-xl border p-4">
              <div className="text-muted-foreground">{text(locale, 'معرّف المنظمة', 'Organization ID')}</div>
              <div className="mt-1 font-mono text-xs break-all">{organizationId}</div>
            </div>
            {platform.archivedAt && (
              <div className="
                rounded-xl border border-destructive/25 bg-destructive/8 p-4
              "
              >
                <div className="font-semibold text-destructive">
                  {text(locale, 'المتجر مؤرشف', 'Store archived')}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{platform.archivedAt}</div>
              </div>
            )}
          </div>

          <form
            action={archivePlatformStore.bind(null, locale, organizationId)}
            className="mt-5"
          >
            <PendingSubmitButton
              disabled={!canArchive}
              className="
                inline-flex w-full items-center justify-center gap-2 rounded-lg
                bg-destructive px-4 py-2 text-sm font-semibold text-white
                transition-opacity
                hover:opacity-90
                disabled:cursor-not-allowed disabled:opacity-55
              "
            >
              <Archive className="size-4" />
              {text(locale, 'أرشفة وتعليق المتجر', 'Archive and suspend store')}
            </PendingSubmitButton>
          </form>

          <form
            action={cancelPlatformStoreSubscription.bind(null, locale, organizationId)}
            className="
              mt-3 rounded-xl border border-amber-500/25 bg-amber-500/8 p-4
            "
          >
            <h3 className="text-sm font-semibold text-amber-800">
              {text(locale, 'إلغاء الاشتراك', 'Cancel subscription')}
            </h3>
            <p className="mt-1 text-xs/5 text-muted-foreground">
              {text(
                locale,
                'يلغي اشتراك المتجر من نظام الفوترة. اكتب معرف المنظمة للتأكيد.',
                'Cancels the store subscription from the billing system. Type the organization ID to confirm.',
              )}
            </p>
            <label className="mt-3 grid gap-2 text-xs font-medium">
              {text(locale, 'معرف المنظمة', 'Organization ID')}
              <input
                name="confirmOrganizationId"
                placeholder={organizationId}
                disabled={!canCancelSubscription}
                className="
                  dashboard-pill rounded-lg border px-3 py-2 font-mono text-xs
                  disabled:cursor-not-allowed disabled:opacity-55
                "
              />
            </label>
            <label className="mt-3 flex items-center gap-2 text-xs">
              <input
                name="cancelNow"
                type="checkbox"
                disabled={!canCancelSubscription}
              />
              {text(locale, 'إلغاء فوري وتعليق المتجر', 'Cancel immediately and suspend store')}
            </label>
            <PendingSubmitButton
              disabled={!canCancelSubscription}
              className="
                mt-3 inline-flex w-full items-center justify-center rounded-lg
                bg-amber-600 px-4 py-2 text-sm font-semibold text-white
                transition-opacity
                hover:opacity-90
                disabled:cursor-not-allowed disabled:opacity-55
              "
            >
              {text(locale, 'إلغاء الاشتراك', 'Cancel subscription')}
            </PendingSubmitButton>
          </form>
        </div>
      </section>

      <section className="
        mt-6 rounded-xl border border-destructive/35 bg-destructive/5 p-6
      "
      >
        <div className="
          flex flex-col gap-4
          lg:flex-row lg:items-start lg:justify-between
        "
        >
          <div>
            <h2 className="text-lg font-semibold text-destructive">
              {text(locale, 'حذف المتجر نهائياً', 'Permanently delete store')}
            </h2>
            <p className="mt-2 max-w-3xl text-sm/6 text-muted-foreground">
              {text(
                locale,
                'هذا الإجراء يحذف حساب المتجر وبياناته من المنصة: الإعدادات، المنتجات، الطلبات، الفواتير، العملاء، القنوات، المحادثات، والتقييمات. لا يمكن التراجع عنه.',
                'This deletes the store account and store data from the platform: settings, products, orders, invoices, customers, channels, conversations, and reviews. It cannot be undone.',
              )}
            </p>
          </div>
          <div className="
            rounded-full border border-destructive/35 px-3 py-1 text-xs
            font-semibold text-destructive
          "
          >
            {text(locale, 'يتطلب صلاحية كاملة', 'Full permission required')}
          </div>
        </div>

        <form
          action={permanentlyDeletePlatformStore.bind(null, locale, organizationId)}
          className="
            mt-5 grid gap-4
            lg:grid-cols-[1fr_1fr_auto]
          "
        >
          <label className="grid gap-2 text-sm font-medium">
            {text(locale, 'اكتب معرّف المنظمة للتأكيد', 'Type the organization ID to confirm')}
            <input
              name="confirmOrganizationId"
              placeholder={organizationId}
              disabled={!canArchive}
              className="
                dashboard-pill rounded-lg border px-3 py-2 font-mono text-sm
                disabled:cursor-not-allowed disabled:opacity-55
              "
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            {text(locale, 'اكتب DELETE STORE', 'Type DELETE STORE')}
            <input
              name="confirmDeleteText"
              placeholder="DELETE STORE"
              disabled={!canArchive}
              className="
                dashboard-pill rounded-lg border px-3 py-2 font-mono text-sm
                disabled:cursor-not-allowed disabled:opacity-55
              "
            />
          </label>

          <div className="flex items-end">
            <PendingSubmitButton
              disabled={!canArchive}
              className="
                inline-flex w-full items-center justify-center gap-2 rounded-lg
                bg-destructive px-4 py-2 text-sm font-semibold text-white
                transition-opacity
                hover:opacity-90
                disabled:cursor-not-allowed disabled:opacity-55
                lg:w-auto
              "
            >
              <Archive className="size-4" />
              {text(locale, 'حذف نهائي', 'Delete permanently')}
            </PendingSubmitButton>
          </div>
        </form>

        <p className="mt-3 text-xs text-muted-foreground">
          {text(
            locale,
            'ملاحظة: يتم حذف حساب المتجر أولاً، ثم حذف بيانات التطبيق. إذا فشل حذف حساب المتجر لن يتم حذف بياناته من قاعدة التطبيق.',
            'Note: the store account is deleted first, then application data is removed. If account deletion fails, application data is kept.',
          )}
        </p>
      </section>

      <section className="
        mt-6 grid gap-4
        lg:grid-cols-2
      "
      >
        <div className="dashboard-panel rounded-xl border p-6">
          <h2 className="text-lg font-semibold">{text(locale, 'المنتجات', 'Products')}</h2>
          <div className="mt-5 grid gap-3">
            {products.slice(0, 8).map(product => (
              <div
                key={product.id}
                className="
                  flex dashboard-surface items-center gap-3 rounded-xl border
                  p-3
                "
              >
                {product.image?.trim() && (
                  <div className="
                    size-12 shrink-0 overflow-hidden rounded-lg border bg-muted
                  "
                  >
                    {/* eslint-disable-next-line next/no-img-element -- Admin preview supports merchant image URLs. */}
                    <img
                      src={product.image}
                      alt={product.name}
                      className="size-full object-cover"
                    />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{product.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {product.price}
                    {' SAR'}
                    {product.category ? ` - ${product.category}` : ''}
                  </div>
                </div>
              </div>
            ))}
            {productCount === 0 && (
              <div className="
                dashboard-surface rounded-xl border p-6 text-center text-sm
                text-muted-foreground
              "
              >
                {text(locale, 'لا توجد منتجات بعد.', 'No products yet.')}
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-panel rounded-xl border p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">{text(locale, 'آخر الطلبات', 'Recent orders')}</h2>
            {archivedOrderCount > 0 && (
              <span className="
                rounded-full border px-3 py-1 text-xs font-semibold
                text-muted-foreground
              "
              >
                {text(locale, 'المؤرشفة', 'Archived')}
                {': '}
                {archivedOrderCount.toLocaleString(locale)}
              </span>
            )}
          </div>
          <div className="mt-5 grid gap-3">
            {orders.slice(0, 8).map(order => (
              <div
                key={order.id}
                className="dashboard-surface rounded-xl border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold">
                      {text(locale, 'طلب', 'Order')}
                      {' #'}
                      {order.id}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {order.customerName ?? text(locale, 'عميل غير معروف', 'Unknown customer')}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    {order.archivedAt && (
                      <span className="rounded-full border px-2.5 py-1 text-xs">
                        {text(locale, 'مؤرشف', 'Archived')}
                      </span>
                    )}
                    <span className="rounded-full border px-2.5 py-1 text-xs">
                      {order.status}
                    </span>
                  </div>
                </div>
                <div className="mt-3 text-sm font-semibold">
                  {formatMoney(Number(order.totalPrice ?? 0), locale)}
                </div>
                {order.archivedAt && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    {text(locale, 'تاريخ الأرشفة', 'Archived at')}
                    {': '}
                    {formatDatabaseDateTime(order.archivedAt, locale)}
                  </div>
                )}
              </div>
            ))}
            {orders.length === 0 && (
              <div className="
                dashboard-surface rounded-xl border p-6 text-center text-sm
                text-muted-foreground
              "
              >
                {text(locale, 'لا توجد طلبات بعد.', 'No orders yet.')}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-6 dashboard-panel rounded-xl border p-6">
        <h2 className="text-lg font-semibold">
          {text(locale, 'سجل إجراءات الإدارة', 'Admin audit log')}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {text(locale, 'آخر الإجراءات التي تمت على هذا المتجر من لوحة إدارة المنصة.', 'Recent platform-admin actions performed on this store.')}
        </p>

        <div className="mt-5 grid gap-3">
          {auditLogs.slice(0, 12).map(log => (
            <div
              key={log.id}
              className="dashboard-surface rounded-xl border p-4"
            >
              <div className="
                flex flex-col gap-2
                md:flex-row md:items-start md:justify-between
              "
              >
                <div>
                  <div className="text-sm font-semibold">{getAuditActionLabel(locale, log.action)}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{getAuditSummaryLabel(locale, log.summary)}</div>
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatDatabaseDateTime(log.createdAt, locale)}
                </div>
              </div>
              <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                <div>
                  {text(locale, 'المستخدم', 'User')}
                  {': '}
                  <span className="font-mono">{log.actorUserId}</span>
                </div>
              </div>
            </div>
          ))}
          {auditLogs.length === 0 && (
            <div className="
              dashboard-surface rounded-xl border p-6 text-center text-sm
              text-muted-foreground
            "
            >
              {text(locale, 'لا توجد إجراءات إدارية مسجلة بعد.', 'No admin actions have been recorded yet.')}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

export const dynamic = 'force-dynamic';
