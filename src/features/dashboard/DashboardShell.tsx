import type { CSSProperties } from 'react';
import { auth } from '@clerk/nextjs/server';
import { desc, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { formatDatabaseDateTime } from '@/libs/DateTime';
import { db } from '@/libs/DB';
import { hasPlatformPermission, PLATFORM_PERMISSIONS } from '@/libs/PlatformAdmin';
import { getStoreBrandThemeCssVariables } from '@/libs/StoreBrandTheme';
import { ensureStoreSettings } from '@/libs/StoreSettings';
import { platformAdminAuditLogsTable, storeSettingsTable } from '@/models/Schema';
import { DashboardHeader } from './DashboardHeader';
import { DashboardMobileBottomNav } from './DashboardMobileBottomNav';
import { PlatformAdminNotice } from './PlatformAdminNotice';
import { RealtimeDashboardStatus } from './RealtimeDashboardStatus';

type StoreSettingsMetadata = {
  brandTheme?: unknown;
};

type PlatformAdminNotification = {
  action: string;
  createdAt: Date;
  id: number;
  metadata: unknown;
  summary: string;
};

const text = (locale: string, ar: string, en: string) => {
  if (locale === 'ar') {
    return ar;
  }

  return en;
};

const translateAdminValue = (locale: string, value: string) => {
  if (locale !== 'ar') {
    return value;
  }

  const labels: Record<string, string> = {
    active: 'نشط',
    basic: 'أساسي',
    enterprise: 'مؤسسي',
    free: 'مجاني',
    pro: 'احترافي',
    suspended: 'معلق',
    trial: 'تجريبي',
    trialing: 'تجريبي',
  };

  return labels[value] ?? value;
};

const getPlatformAdminNotificationTitle = (locale: string, action: string) => {
  const labels: Record<string, { ar: string; en: string }> = {
    store_archived: {
      ar: 'تم تعليق المتجر من إدارة المنصة',
      en: 'Store suspended by platform administration',
    },
    store_controls_updated: {
      ar: 'تم تحديث إعدادات المتجر من إدارة المنصة',
      en: 'Store controls updated by platform administration',
    },
    store_subscription_cancelled: {
      ar: 'تم تحديث اشتراك المتجر من إدارة المنصة',
      en: 'Store subscription updated by platform administration',
    },
    stripe_billing_synced: {
      ar: 'تم تحديث بيانات الاشتراك',
      en: 'Subscription data was updated',
    },
  };
  const label = labels[action];

  if (label) {
    return text(locale, label.ar, label.en);
  }

  return text(
    locale,
    'تم تنفيذ إجراء إداري على المتجر',
    'A platform administration action was applied to the store',
  );
};

const getPlatformAdminNotificationDescription = (
  locale: string,
  notification: PlatformAdminNotification,
) => {
  if (notification.action === 'store_controls_updated') {
    const metadata = notification.metadata && typeof notification.metadata === 'object'
      ? notification.metadata as {
        plan?: unknown;
        status?: unknown;
      }
      : {};
    const details = [
      typeof metadata.status === 'string'
        ? `${text(locale, 'حالة الخدمة', 'Service status')}: ${translateAdminValue(locale, metadata.status)}`
        : undefined,
      typeof metadata.plan === 'string'
        ? `${text(locale, 'الباقة', 'Plan')}: ${translateAdminValue(locale, metadata.plan)}`
        : undefined,
    ].filter(Boolean);

    if (details.length > 0) {
      return details.join(' - ');
    }

    return text(
      locale,
      'راجع إعدادات الخدمة والباقة من لوحة المتجر.',
      'Review service and plan settings in the dashboard.',
    );
  }

  if (notification.action === 'store_archived') {
    return text(
      locale,
      'تم تعليق تشغيل المتجر مؤقتاً. تواصل مع إدارة المنصة عند الحاجة.',
      'Store operations were suspended. Contact platform administration if needed.',
    );
  }

  if (notification.action === 'store_subscription_cancelled') {
    return text(
      locale,
      'تم تحديث حالة الاشتراك. راجع صفحة الاشتراك لمعرفة التفاصيل.',
      'Subscription status was updated. Review the subscription page for details.',
    );
  }

  if (notification.action === 'stripe_billing_synced') {
    return text(
      locale,
      'تمت مزامنة بيانات الفاتورة والاشتراك.',
      'Billing and subscription data was synchronized.',
    );
  }

  if (locale === 'ar') {
    return 'راجع تفاصيل الإجراء من إدارة المنصة عند الحاجة.';
  }

  return notification.summary;
};

export const DashboardShell = async (props: {
  children: React.ReactNode;
  locale: string;
}) => {
  setRequestLocale(props.locale);

  const t = await getTranslations({
    locale: props.locale,
    namespace: 'DashboardLayout',
  });
  const { orgId, userId } = await auth();

  let storeIdentity: {
    brandTheme?: unknown;
    logo?: null | string;
    storeName?: null | string;
    timezone?: null | string;
  } | null = null;
  let platformNotification: null | PlatformAdminNotification = null;

  if (orgId) {
    await ensureStoreSettings(orgId);
    const [[settings], [latestAdminLog]] = await Promise.all([
      db
        .select({
          logo: storeSettingsTable.logo,
          metadata: storeSettingsTable.metadata,
          storeName: storeSettingsTable.storeName,
          timezone: storeSettingsTable.timezone,
        })
        .from(storeSettingsTable)
        .where(eq(storeSettingsTable.organizationId, orgId))
        .limit(1),
      db
        .select({
          action: platformAdminAuditLogsTable.action,
          createdAt: platformAdminAuditLogsTable.createdAt,
          id: platformAdminAuditLogsTable.id,
          metadata: platformAdminAuditLogsTable.metadata,
          summary: platformAdminAuditLogsTable.summary,
        })
        .from(platformAdminAuditLogsTable)
        .where(eq(platformAdminAuditLogsTable.organizationId, orgId))
        .orderBy(desc(platformAdminAuditLogsTable.createdAt))
        .limit(1),
    ]);
    storeIdentity = settings
      ? {
          brandTheme: (settings.metadata as StoreSettingsMetadata | null)?.brandTheme,
          logo: settings.logo,
          storeName: settings.storeName,
          timezone: settings.timezone,
        }
      : null;
    platformNotification = latestAdminLog ?? null;
  }
  const themeStyle = getStoreBrandThemeCssVariables(storeIdentity?.brandTheme) as CSSProperties | undefined;

  const menu = [
    {
      href: '/dashboard',
      label: t('home'),
    },
    {
      href: '/dashboard/products',
      label: t('products'),
    },
    {
      href: '/dashboard/orders',
      label: t('orders'),
    },
    {
      href: '/dashboard/customers',
      label: t('customers'),
    },
    {
      href: '/dashboard/revenue',
      label: t('revenue'),
    },
    {
      href: '/dashboard/subscription',
      label: t('subscription'),
    },
    {
      href: '/dashboard/ai-operations',
      label: t('ai_operations'),
    },
    {
      href: '/dashboard/launch-readiness',
      label: t('launch_readiness'),
    },
    {
      href: '/dashboard/settings',
      label: t('settings'),
    },
  ];

  if (await hasPlatformPermission(userId, PLATFORM_PERMISSIONS.VIEW_STORES)) {
    menu.push({
      href: '/admin',
      label: t('platform_admin'),
    });
  }

  return (
    <div style={themeStyle} className="min-h-screen bg-background">
      <div className="
        sticky top-0 z-40 border-b border-border/70 bg-background/82
        shadow-[0_12px_42px_oklch(0.29_0.08_245/10%)] backdrop-blur-xl
      "
      >
        <div className="
          mx-auto flex max-w-7xl items-center justify-between px-4 py-3
          sm:px-6
        "
        >
          <DashboardHeader
            menu={menu}
            locale={props.locale}
            localeSwitcherLabel={t('locale_switcher')}
            mobileMenuLabel={t('mobile_menu')}
            storeLogoUrl={storeIdentity?.logo?.trim() || null}
            storeName={storeIdentity?.storeName?.trim() || null}
          />
        </div>
      </div>

      <div className="min-h-[calc(100vh-72px)] bg-transparent">
        <div className="
          mx-auto max-w-7xl px-4 pt-6
          pb-[calc(7rem+env(safe-area-inset-bottom))]
          sm:px-6
          md:pt-7 md:pb-16
        "
        >
          {platformNotification && orgId && (
            <PlatformAdminNotice
              createdAt={formatDatabaseDateTime(platformNotification.createdAt, props.locale) ?? ''}
              description={getPlatformAdminNotificationDescription(props.locale, platformNotification)}
              dismissLabel={text(props.locale, 'إغلاق التنبيه', 'Dismiss notification')}
              notificationKey={`platform-admin-notice:${orgId}:${platformNotification.id}`}
              title={getPlatformAdminNotificationTitle(props.locale, platformNotification.action)}
            />
          )}
          {props.children}
        </div>
      </div>
      <RealtimeDashboardStatus
        labels={{
          live: t('realtime_live'),
          offline: t('realtime_offline'),
          sync: t('realtime_sync'),
        }}
      />
      <DashboardMobileBottomNav
        ariaLabel={t('mobile_bottom_navigation')}
        labels={{
          home: t('home'),
          orders: t('orders'),
          products: t('products'),
          revenue: t('revenue'),
          settings: t('settings'),
        }}
      />
    </div>
  );
};
