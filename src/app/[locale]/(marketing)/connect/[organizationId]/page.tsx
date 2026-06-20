import { eq } from 'drizzle-orm';
import { MessageCircle, MonitorSmartphone } from 'lucide-react';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';
import { buttonVariants } from '@/components/ui/buttonVariants';
import { Section } from '@/features/landing/Section';
import { db } from '@/libs/DB';
import { Link } from '@/libs/I18nNavigation';
import { isStoreFeatureEnabled } from '@/libs/StoreServiceControls';
import { storeSettingsTable } from '@/models/Schema';
import {
  buildWhatsAppUrl,
  normalizeTrafficSource,
  normalizeWhatsAppTarget,
  resolveCustomerEntryRoute,
} from '@/utils/CustomerChannels';

type StoreSettingsMetadata = {
  contactChannels?: Record<string, unknown>;
  customerEntry?: {
    defaultChannel?: unknown;
    mode?: unknown;
  };
};

export default async function CustomerConnectPage(props: {
  params: Promise<{ locale: string; organizationId: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { locale, organizationId } = await props.params;
  const { source } = await props.searchParams;
  const trafficSource = normalizeTrafficSource(source ?? 'smart_link');
  setRequestLocale(locale);

  const t = await getTranslations({
    locale,
    namespace: 'CustomerConnectPage',
  });
  const [settings] = await db
    .select({
      metadata: storeSettingsTable.metadata,
      storeName: storeSettingsTable.storeName,
    })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);
  const metadata = settings?.metadata as StoreSettingsMetadata | null;
  const whatsappTarget = normalizeWhatsAppTarget(metadata?.contactChannels?.whatsapp);
  const webOrdersEnabled = await isStoreFeatureEnabled(organizationId, 'webOrders');
  const entryRoute = resolveCustomerEntryRoute({
    defaultChannel: metadata?.customerEntry?.defaultChannel,
    mode: metadata?.customerEntry?.mode,
    webOrdersEnabled,
    whatsappTarget,
  });

  if (entryRoute.directChannel === 'web') {
    redirect(`/${locale}/web-order/${organizationId}?source=${encodeURIComponent(trafficSource)}`);
  }

  const storeName = settings?.storeName?.trim() || t('fallback_store_name');
  const whatsappUrl = whatsappTarget
    ? buildWhatsAppUrl(
        whatsappTarget,
        t('whatsapp_message', { storeName }),
      )
    : null;

  if (entryRoute.directChannel === 'whatsapp' && whatsappUrl) {
    redirect(whatsappUrl);
  }

  return (
    <Section
      subtitle={t('subtitle')}
      title={t('title', { storeName })}
      description={t('description')}
    >
      <div className="
        mx-auto grid max-w-3xl gap-4
        md:grid-cols-2
      "
      >
        {whatsappUrl && entryRoute.channels.includes('whatsapp') && (
          <a
            href={whatsappUrl}
            className="
              rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-start
              shadow-sm transition-all
              hover:-translate-y-1 hover:border-emerald-400 hover:bg-emerald-100
            "
          >
            <MessageCircle className="mb-4 size-7 text-emerald-700" />
            <div className="text-lg font-bold text-emerald-950">{t('whatsapp_title')}</div>
            <p className="mt-2 text-sm/6 text-emerald-900">{t('whatsapp_description')}</p>
          </a>
        )}

        {entryRoute.channels.includes('web') && (
          <Link
            href={`/web-order/${organizationId}?source=${encodeURIComponent(trafficSource)}`}
            className="
              rounded-xl border border-cyan-200 bg-cyan-50 p-6 text-start
              shadow-sm transition-all
              hover:-translate-y-1 hover:border-cyan-400 hover:bg-cyan-100
            "
          >
            <MonitorSmartphone className="mb-4 size-7 text-cyan-700" />
            <div className="text-lg font-bold text-cyan-950">{t('web_title')}</div>
            <p className="mt-2 text-sm/6 text-cyan-900">{t('web_description')}</p>
          </Link>
        )}
      </div>

      <div className="mt-8 text-center">
        <Link
          href="/"
          className={buttonVariants({ variant: 'ghost', size: 'sm' })}
        >
          {t('back_home')}
        </Link>
      </div>
    </Section>
  );
}
