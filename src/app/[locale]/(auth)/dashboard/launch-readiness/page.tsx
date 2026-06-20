import { auth } from '@clerk/nextjs/server';
import { and, count, eq, ne } from 'drizzle-orm';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Rocket,
} from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { normalizeAIEmployeeSettings } from '@/libs/AIEmployeeSettings';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { getPlatformAIProviderConfig } from '@/libs/PlatformAIProviderConfig';
import { hasConfiguredValue, hasText } from '@/libs/StoreReadiness';
import {
  deliveryMethodsTable,
  paymentMethodsTable,
  productsTable,
  storeSettingsTable,
} from '@/models/Schema';

type StoreSettingsMetadata = {
  aiEmployee?: unknown;
  businessType?: string;
  contactChannels?: Record<string, unknown>;
  location?: {
    address?: unknown;
    city?: unknown;
    mapsUrl?: unknown;
    pickupInstructions?: unknown;
  };
};

const readinessClass = (isReady: boolean) =>
  isReady
    ? 'border-emerald-500/20 bg-emerald-500/8 text-emerald-700'
    : 'border-amber-500/25 bg-amber-500/8 text-amber-700';

export default async function LaunchReadinessPage(props: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await props.params;
  setRequestLocale(locale);

  const t = await getTranslations({
    locale,
    namespace: 'LaunchReadinessPage',
  });
  const { orgId } = await auth();

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
  const [productStats] = orgId
    ? await db
        .select({ count: count(productsTable.id) })
        .from(productsTable)
        .where(and(
          eq(productsTable.organizationId, orgId),
          eq(productsTable.isActive, true),
        ))
    : [{ count: 0 }];
  const [paymentStats] = orgId
    ? await db
        .select({ count: count(paymentMethodsTable.id) })
        .from(paymentMethodsTable)
        .where(and(
          eq(paymentMethodsTable.organizationId, orgId),
          eq(paymentMethodsTable.isActive, true),
          ne(paymentMethodsTable.provider, 'bank_transfer'),
        ))
    : [{ count: 0 }];
  const [deliveryStats] = orgId
    ? await db
        .select({ count: count(deliveryMethodsTable.id) })
        .from(deliveryMethodsTable)
        .where(and(
          eq(deliveryMethodsTable.organizationId, orgId),
          eq(deliveryMethodsTable.isActive, true),
        ))
    : [{ count: 0 }];
  const aiProviderConfig = await getPlatformAIProviderConfig();
  const metadata = storeSettings?.metadata as StoreSettingsMetadata | null;
  const aiEmployeeSettings = normalizeAIEmployeeSettings(metadata?.aiEmployee);
  const contactChannels = metadata?.contactChannels ?? {};
  const productCount = Number(productStats?.count ?? 0);
  const paymentCount = Number(paymentStats?.count ?? 0);
  const deliveryCount = Number(deliveryStats?.count ?? 0);
  const hasCustomerEntry = Object.values(contactChannels).some(hasConfiguredValue);
  const location = metadata?.location ?? {};
  const hasStoreLocation = [
    location.address,
    location.city,
    location.mapsUrl,
    location.pickupInstructions,
  ].some(hasText);
  const readinessItems = [
    {
      action: t('store_action'),
      description: t('store_description'),
      href: '/dashboard/settings',
      isReady: Boolean(
        storeSettings?.storeName?.trim()
        && storeSettings.storeDescription?.trim()
        && hasText(metadata?.businessType)
        && storeSettings.welcomeMessage?.trim()
        && storeSettings.currency?.trim()
        && storeSettings.timezone?.trim(),
      ),
      title: t('store_title'),
    },
    {
      action: t('location_action'),
      description: t('location_description'),
      href: '/dashboard/settings',
      isReady: hasStoreLocation,
      title: t('location_title'),
    },
    {
      action: t('products_action'),
      description: t('products_description', { count: productCount }),
      href: '/dashboard/products/new',
      isReady: productCount > 0,
      title: t('products_title'),
    },
    {
      action: t('payments_action'),
      description: t('payments_description', { count: paymentCount }),
      href: '/dashboard/settings',
      isReady: paymentCount > 0,
      title: t('payments_title'),
    },
    {
      action: t('delivery_action'),
      description: t('delivery_description', { count: deliveryCount }),
      href: '/dashboard/settings',
      isReady: deliveryCount > 0,
      title: t('delivery_title'),
    },
    {
      action: t('channels_action'),
      description: t('channels_description'),
      href: '/dashboard/ai-operations',
      isReady: hasCustomerEntry,
      title: t('channels_title'),
    },
    {
      action: t('ai_action'),
      description: t('ai_description'),
      href: '/dashboard/ai-operations',
      isReady: aiProviderConfig.enabled && aiEmployeeSettings.enabled,
      title: t('ai_title'),
    },
    {
      action: t('legal_action'),
      description: t('legal_description'),
      href: '/terms',
      isReady: true,
      title: t('legal_title'),
    },
  ];
  const readyCount = readinessItems.filter(item => item.isReady).length;
  const readinessPercent = Math.round((readyCount / readinessItems.length) * 100);
  const isReadyToLaunch = readyCount === readinessItems.length;

  return (
    <>
      <TitleBar
        title={t('title_bar')}
        description={t('title_bar_description')}
      />

      <div className="
        mb-6 grid gap-4
        lg:grid-cols-[0.9fr_1.1fr]
      "
      >
        <section className="dashboard-panel rounded-2xl p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-3 text-primary">
              <Rocket className="size-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-muted-foreground">
                {t('score_label')}
              </p>
              <h2 className="text-4xl font-bold">
                {readinessPercent}
                %
              </h2>
            </div>
          </div>

          <div className="mt-6 h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="
                h-full rounded-full bg-linear-to-r from-cyan-500 to-emerald-500
              "
              style={{ width: `${readinessPercent}%` }}
            />
          </div>

          <p className="mt-4 text-sm/6 text-muted-foreground">
            {isReadyToLaunch ? t('ready_summary') : t('pending_summary')}
          </p>
        </section>

        <section className="dashboard-panel rounded-2xl p-6">
          <div className="flex items-start gap-3">
            <ClipboardCheck className="mt-1 size-5 text-cyan-600" />
            <div>
              <h2 className="text-xl font-bold">{t('next_title')}</h2>
              <p className="mt-2 text-sm/6 text-muted-foreground">
                {t('next_description')}
              </p>
            </div>
          </div>
        </section>
      </div>

      <div className="grid gap-4">
        {readinessItems.map((item) => {
          const Icon = item.isReady ? CheckCircle2 : AlertTriangle;

          return (
            <article
              key={item.title}
              className="
                flex dashboard-surface flex-col gap-4 rounded-2xl border p-5
                md:flex-row md:items-center md:justify-between
              "
            >
              <div className="flex gap-4">
                <div className={`
                  h-fit rounded-xl border p-2.5
                  ${readinessClass(item.isReady)}
                `}
                >
                  <Icon className="size-5" />
                </div>
                <div>
                  <h3 className="font-bold">{item.title}</h3>
                  <p className="mt-1 text-sm/6 text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>

              <Link
                href={item.href}
                className="
                  rounded-full border border-border/70 px-4 py-2 text-sm
                  font-semibold transition-all
                  hover:border-primary/30 hover:bg-background/90
                "
              >
                {item.action}
              </Link>
            </article>
          );
        })}
      </div>
    </>
  );
}
