import { Buffer } from 'node:buffer';
import { auth } from '@clerk/nextjs/server';
import { asc, eq } from 'drizzle-orm';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { headers } from 'next/headers';
import QRCode from 'qrcode';
import { PendingSubmitButton } from '@/components/PendingSubmitButton';
import { CopyTextButton } from '@/features/dashboard/CopyTextButton';
import { GoogleMapsLocationPicker } from '@/features/dashboard/GoogleMapsLocationPicker';
import { savePaymentAndDeliverySettings } from '@/features/dashboard/PaymentDeliveryActions';
import { disconnectWhatsApp, saveStoreSettings, saveWhatsAppSettings } from '@/features/dashboard/StoreSettingsActions';
import { TitleBar } from '@/features/dashboard/TitleBar';
import { WhapiQrConnectButton } from '@/features/dashboard/WhapiQrConnectButton';
import { WhatsAppSettingsSubmit } from '@/features/dashboard/WhatsAppSettingsSubmit';
import { db } from '@/libs/DB';
import { normalizeStoreBrandTheme } from '@/libs/StoreBrandTheme';
import {
  channelConnectionsTable,
  deliveryMethodsTable,
  paymentMethodsTable,
  storeSettingsTable,
} from '@/models/Schema';
import { buildWhatsAppChannelConfig } from '@/utils/CustomerChannels';

const contactChannelKeys = [
  'email',
  'phone',
] as const;

const contactChannelAutocomplete = {
  email: 'email',
  phone: 'tel',
} satisfies Record<typeof contactChannelKeys[number], string>;

const currencyOptions = [
  { code: 'SAR', label: 'SAR - Saudi Riyal' },
  { code: 'USD', label: 'USD - US Dollar' },
  { code: 'AED', label: 'AED - UAE Dirham' },
  { code: 'KWD', label: 'KWD - Kuwaiti Dinar' },
  { code: 'QAR', label: 'QAR - Qatari Riyal' },
  { code: 'BHD', label: 'BHD - Bahraini Dinar' },
  { code: 'OMR', label: 'OMR - Omani Rial' },
  { code: 'EUR', label: 'EUR - Euro' },
  { code: 'GBP', label: 'GBP - British Pound' },
  { code: 'EGP', label: 'EGP - Egyptian Pound' },
  { code: 'JOD', label: 'JOD - Jordanian Dinar' },
  { code: 'TRY', label: 'TRY - Turkish Lira' },
] as const;

const timezoneOptions = [
  { code: 'Asia/Riyadh', label: 'Asia/Riyadh - Saudi Arabia' },
  { code: 'Asia/Dubai', label: 'Asia/Dubai - UAE' },
  { code: 'Asia/Kuwait', label: 'Asia/Kuwait - Kuwait' },
  { code: 'Asia/Qatar', label: 'Asia/Qatar - Qatar' },
  { code: 'Asia/Bahrain', label: 'Asia/Bahrain - Bahrain' },
  { code: 'Asia/Muscat', label: 'Asia/Muscat - Oman' },
  { code: 'Asia/Amman', label: 'Asia/Amman - Jordan' },
  { code: 'Africa/Cairo', label: 'Africa/Cairo - Egypt' },
  { code: 'Europe/Istanbul', label: 'Europe/Istanbul - Turkey' },
  { code: 'UTC', label: 'UTC - Coordinated Universal Time' },
  { code: 'Europe/London', label: 'Europe/London - London' },
  { code: 'Europe/Paris', label: 'Europe/Paris - Paris' },
  { code: 'America/New_York', label: 'America/New_York - New York' },
] as const;

const businessTypeOptions = [
  'restaurant',
  'juice_shop',
  'bakery_sweets',
  'coffee_shop',
  'grocery',
  'pharmacy',
  'retail_store',
  'fashion_store',
  'electronics_store',
  'furniture_store',
  'flowers_gifts',
  'beauty_store',
  'home_business',
  'subscription_store',
  'booking_services',
  'field_services',
  'digital_services',
  'general_store',
] as const;

const paymentOptions = [
  'cash_on_delivery',
  'card_on_delivery',
  'cash_on_pickup',
  'card_on_pickup',
] as const;
const customerEntryModeOptions = [
  { labelKey: 'customer_entry_web_only', value: 'web_only' },
  { labelKey: 'customer_entry_whatsapp_only', value: 'whatsapp_only' },
  { labelKey: 'customer_entry_web_whatsapp', value: 'web_whatsapp' },
] as const;
const defaultCustomerEntryChannelOptions = [
  { labelKey: 'default_channel_web', value: 'web' },
  { labelKey: 'default_channel_whatsapp', value: 'whatsapp' },
] as const;
const paymentGroups = [
  {
    options: ['cash_on_delivery', 'card_on_delivery'],
    preference: 'delivery',
    titleKey: 'payment_for_delivery',
  },
  {
    options: ['cash_on_pickup', 'card_on_pickup'],
    preference: 'pickup',
    titleKey: 'payment_for_pickup',
  },
] as const;

type DeliveryConfig = {
  instructions?: string;
};

type PaymentConfig = {
  instructions?: string;
};
type PaymentDeliveryPreference = 'delivery' | 'pickup';
const paymentDeliveryPreferencesByOption: Record<
  typeof paymentOptions[number],
  PaymentDeliveryPreference[]
> = {
  card_on_delivery: ['delivery'],
  card_on_pickup: ['pickup'],
  cash_on_delivery: ['delivery'],
  cash_on_pickup: ['pickup'],
};

type StoreLocation = {
  address?: string;
  branchName?: string;
  city?: string;
  deliveryNotes?: string;
  district?: string;
  mapsUrl?: string;
  phone?: string;
  pickupInstructions?: string;
};

const deliveryOptionsByBusinessType = {
  bakery_sweets: ['local_delivery', 'pickup', 'scheduled_delivery', 'curbside_pickup'],
  beauty_store: ['local_delivery', 'pickup', 'courier_shipping', 'scheduled_delivery'],
  booking_services: ['scheduled_delivery', 'digital'],
  coffee_shop: ['local_delivery', 'pickup', 'curbside_pickup', 'scheduled_delivery'],
  digital_services: ['digital', 'scheduled_delivery'],
  electronics_store: ['courier_shipping', 'local_delivery', 'pickup', 'scheduled_delivery'],
  fashion_store: ['courier_shipping', 'local_delivery', 'pickup', 'scheduled_delivery'],
  field_services: ['scheduled_delivery', 'local_delivery'],
  flowers_gifts: ['local_delivery', 'scheduled_delivery', 'pickup'],
  furniture_store: ['scheduled_delivery', 'courier_shipping', 'pickup'],
  general_store: ['local_delivery', 'pickup', 'courier_shipping', 'digital'],
  grocery: ['local_delivery', 'scheduled_delivery', 'pickup'],
  home_business: ['local_delivery', 'pickup', 'scheduled_delivery', 'digital'],
  juice_shop: ['local_delivery', 'pickup', 'curbside_pickup', 'scheduled_delivery'],
  pharmacy: ['local_delivery', 'scheduled_delivery', 'pickup'],
  restaurant: ['local_delivery', 'pickup', 'dine_in', 'scheduled_delivery'],
  retail_store: ['local_delivery', 'pickup', 'courier_shipping', 'scheduled_delivery'],
  subscription_store: ['scheduled_delivery', 'courier_shipping', 'digital'],
} as const;

export default async function SettingsPage(props: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    limit?: string;
    settingsError?: string;
    whatsappSaved?: string;
  }>;
}) {
  const { locale } = await props.params;
  const { limit, settingsError, whatsappSaved } = await props.searchParams;
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: 'StoreSettingsPage',
  });
  const paymentsT = await getTranslations({
    locale,
    namespace: 'PaymentsPage',
  });
  const { orgId } = await auth();
  const settings = orgId
    ? await db
        .select()
        .from(storeSettingsTable)
        .where(eq(storeSettingsTable.organizationId, orgId))
        .limit(1)
    : [];
  const paymentMethods = orgId
    ? await db
        .select()
        .from(paymentMethodsTable)
        .where(eq(paymentMethodsTable.organizationId, orgId))
        .orderBy(asc(paymentMethodsTable.id))
    : [];
  const deliveryMethods = orgId
    ? await db
        .select()
        .from(deliveryMethodsTable)
        .where(eq(deliveryMethodsTable.organizationId, orgId))
        .orderBy(asc(deliveryMethodsTable.id))
    : [];
  const channelConnections = orgId
    ? await db
        .select()
        .from(channelConnectionsTable)
        .where(eq(channelConnectionsTable.organizationId, orgId))
        .orderBy(asc(channelConnectionsTable.id))
    : [];
  const currentSettings = settings[0];
  const metadata = currentSettings?.metadata as {
    brandTheme?: unknown;
    businessType?: string;
    channelIntegrations?: {
      whatsapp?: {
        apiTokenPreview?: string | null;
        channelId?: string | null;
        connectionStatus?: string;
        displayPhoneNumber?: string | null;
        mode?: string;
        phoneNumber?: string | null;
        provider?: string | null;
        webhookSecret?: string | null;
        whatsappLink?: string | null;
        whatsappTarget?: string | null;
      };
    };
    contactChannels?: Record<string, unknown>;
    customerEntry?: {
      defaultChannel?: string;
      mode?: string;
    };
    knowledgeBase?: {
      deliveryAreas?: string;
      faqs?: string;
      paymentInstructions?: string;
      returnPolicy?: string;
      serviceNotes?: string;
      warrantyPolicy?: string;
      workingHoursNotes?: string;
    };
    location?: StoreLocation;
  } | null;
  const contactChannels = metadata?.contactChannels ?? {};
  const selectedCustomerEntryMode = customerEntryModeOptions.some(option => option.value === metadata?.customerEntry?.mode)
    ? metadata?.customerEntry?.mode
    : 'web_whatsapp';
  const selectedDefaultCustomerEntryChannel = defaultCustomerEntryChannelOptions.some(option => option.value === metadata?.customerEntry?.defaultChannel)
    ? metadata?.customerEntry?.defaultChannel
    : 'web';
  const brandTheme = normalizeStoreBrandTheme(metadata?.brandTheme);
  const knowledgeBase = metadata?.knowledgeBase ?? {};
  const location = metadata?.location ?? {};
  const selectedBusinessType = businessTypeOptions.includes(
    metadata?.businessType as typeof businessTypeOptions[number],
  )
    ? metadata?.businessType as typeof businessTypeOptions[number]
    : 'general_store';
  const selectedCurrency = currentSettings?.currency ?? 'SAR';
  const selectedTimezone = currentSettings?.timezone ?? 'Asia/Riyadh';
  const deliveryOptions = deliveryOptionsByBusinessType[selectedBusinessType];
  const getContactChannelInputValue = (channel: string) => {
    const value = contactChannels[channel];

    if (value === true || value === false || value === 'true' || value === 'false') {
      return '';
    }

    return typeof value === 'string' ? value : '';
  };
  const whatsappConnection = channelConnections.find(connection => connection.channel === 'whatsapp');
  const whatsappConfig = (whatsappConnection?.config ?? {}) as {
    apiTokenPreview?: string | null;
    channelId?: string | null;
    connectionStatus?: string;
    displayPhoneNumber?: string | null;
    encryptedApiToken?: string | null;
    provider?: string | null;
    webhookSecret?: string | null;
    whatsappLink?: string | null;
    whatsappTarget?: string | null;
  };
  const whapiChannelId = whatsappConfig.channelId
    ?? metadata?.channelIntegrations?.whatsapp?.channelId
    ?? '';
  const whapiDisplayPhoneNumber = whatsappConfig.displayPhoneNumber
    ?? metadata?.channelIntegrations?.whatsapp?.displayPhoneNumber
    ?? '';
  const whapiApiTokenPreview = whatsappConfig.apiTokenPreview
    ?? metadata?.channelIntegrations?.whatsapp?.apiTokenPreview
    ?? '';
  const whapiWebhookSecret = whatsappConfig.webhookSecret
    ?? metadata?.channelIntegrations?.whatsapp?.webhookSecret
    ?? '';
  const whatsappProvider = whatsappConfig.provider === 'evolution'
    || metadata?.channelIntegrations?.whatsapp?.provider === 'evolution'
    ? 'evolution'
    : 'whapi';
  const whatsappChannel = buildWhatsAppChannelConfig({
    apiTokenPreview: whapiApiTokenPreview,
    channelId: whapiChannelId,
    displayPhoneNumber: whapiDisplayPhoneNumber,
    encryptedApiToken: null,
    hasApiToken: Boolean(whapiChannelId),
    provider: whatsappProvider,
    status: whatsappConfig.connectionStatus ?? metadata?.channelIntegrations?.whatsapp?.connectionStatus,
    storeName: currentSettings?.storeName ?? 'SmartStore',
    webhookSecret: whapiWebhookSecret,
  });
  const isPaymentActive = (provider: string) => {
    return paymentMethods.find(method => method.provider === provider)?.isActive ?? false;
  };
  const getPaymentConfig = (provider: string) => {
    return (paymentMethods.find(method => method.provider === provider)?.config ?? {}) as PaymentConfig;
  };
  const getPaymentInstructionsForPreference = (preference: PaymentDeliveryPreference) => {
    const option = paymentOptions.find((provider) => {
      return paymentDeliveryPreferencesByOption[provider].includes(preference)
        && getPaymentConfig(provider).instructions;
    });

    return option ? getPaymentConfig(option).instructions : undefined;
  };
  const getDeliveryMethod = (type: string) => {
    return deliveryMethods.find(method => method.type === type);
  };
  const getDeliveryConfig = (type: string) => {
    return (getDeliveryMethod(type)?.config ?? {}) as DeliveryConfig;
  };
  const validationErrorKeys = [
    'duplicate_name',
    'invalid_email',
    'invalid_logo_url',
    'invalid_map_url',
    'invalid_theme_color',
    'invalid_whatsapp_credentials',
    'invalid_store_description',
    'invalid_store_name',
  ] as const;
  const validationError = validationErrorKeys.includes(
    settingsError as typeof validationErrorKeys[number],
  )
    ? settingsError as typeof validationErrorKeys[number]
    : null;
  const limitWarning = limit === 'onlinePayments' || limit === 'channels'
    ? limit
    : null;
  const requestHeaders = await headers();
  const requestHost = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');
  const requestProtocol = requestHeaders.get('x-forwarded-proto')
    ?? (requestHost?.startsWith('localhost') || requestHost?.startsWith('127.0.0.1') ? 'http' : 'https');
  const buildAbsoluteLink = (path: string) => {
    return requestHost ? `${requestProtocol}://${requestHost}${path}` : path;
  };

  const buildConnectLink = (source: string) => {
    return buildAbsoluteLink(`/${locale}/connect/${orgId}?source=${source}`);
  };
  const buildWebOrderLink = (source: string) => {
    return buildAbsoluteLink(`/${locale}/web-order/${orgId}?source=${source}`);
  };
  const buildQrDataUri = async (value: string, dark = '#0f172a') => {
    const svg = await QRCode.toString(value, {
      color: {
        dark,
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
      margin: 1,
      type: 'svg',
      width: 220,
    });

    return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
  };
  const smartEntryLink = buildConnectLink('smart_link');
  const qrEntries = [
    {
      color: '#0f172a',
      downloadName: 'smart-customer-entry-qr.svg',
      labelKey: 'qr_permanent',
      link: smartEntryLink,
    },
    {
      color: '#0369a1',
      downloadName: 'web-order-qr.svg',
      labelKey: 'qr_web',
      link: buildWebOrderLink('qr'),
    },
    {
      color: '#047857',
      downloadName: 'whatsapp-order-qr.svg',
      labelKey: 'qr_whatsapp',
      link: whatsappChannel.whatsappLink,
    },
    {
      color: '#a16207',
      downloadName: 'table-qr.svg',
      labelKey: 'qr_table',
      link: buildWebOrderLink('table'),
    },
  ] as const;
  const qrCards = await Promise.all(qrEntries
    .filter(entry => Boolean(entry.link))
    .map(async entry => ({
      ...entry,
      link: entry.link!,
      dataUri: await buildQrDataUri(entry.link!, entry.color),
    })));
  const smartEntryQrDataUri = qrCards.find(card => card.labelKey === 'qr_permanent')?.dataUri ?? '';
  const whatsappQrDataUri = qrCards.find(card => card.labelKey === 'qr_whatsapp')?.dataUri ?? null;

  return (
    <>
      <TitleBar
        title={t('title_bar')}
      />

      {limitWarning && (
        <div className="
          mb-5 rounded-xl border border-amber-500/25 bg-amber-500/10 p-4 text-sm
        "
        >
          <div className="font-semibold text-amber-700">
            {t('subscription_limit_title')}
          </div>
          <p className="mt-1 text-muted-foreground">
            {limitWarning === 'onlinePayments'
              ? t('subscription_limit_online_payments')
              : t('subscription_limit_channels')}
          </p>
        </div>
      )}

      {validationError && (
        <div className="
          mb-5 rounded-xl border border-destructive/25 bg-destructive/10 p-4
          text-sm
        "
        >
          <div className="font-semibold text-destructive">
            {t('validation_error_title')}
          </div>
          <p className="mt-1 text-muted-foreground">
            {t(`validation_error_${validationError}`)}
          </p>
        </div>
      )}

      {whatsappSaved === '1' && (
        <div className="
          mb-5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-4
          text-sm
        "
        >
          <div className="font-semibold text-emerald-700">
            {t('whatsapp_saved_title')}
          </div>
          <p className="mt-1 text-muted-foreground">
            {t('whatsapp_saved_description')}
          </p>
        </div>
      )}

      <form
        action={saveStoreSettings.bind(null, locale)}
        className="
          dashboard-panel space-y-6 rounded-xl border p-4
          sm:p-6
        "
      >
        <div className="
          grid gap-4
          md:grid-cols-2
        "
        >
          <div className="grid gap-2">
            <label htmlFor="storeName" className="text-sm font-medium">
              {t('store_name')}
            </label>
            <input
              id="storeName"
              name="storeName"
              autoComplete="organization"
              defaultValue={currentSettings?.storeName ?? ''}
              className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
            />
          </div>

          <div className="grid gap-2">
            <label htmlFor="currency" className="text-sm font-medium">
              {t('currency')}
            </label>
            <select
              id="currency"
              name="currency"
              defaultValue={selectedCurrency}
              className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
            >
              {!currencyOptions.some(option => option.code === selectedCurrency) && (
                <option value={selectedCurrency}>{selectedCurrency}</option>
              )}
              {currencyOptions.map(option => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-2">
          <label htmlFor="logo" className="text-sm font-medium">
            {t('store_logo')}
          </label>
          {currentSettings?.logo && (
            <div className="
              flex dashboard-surface items-center gap-3 rounded-xl border p-3
              max-sm:flex-col max-sm:items-start
            "
            >
              {/* eslint-disable-next-line next/no-img-element -- Merchant logos can be external URLs or local uploads. */}
              <img
                alt={t('store_logo')}
                src={currentSettings.logo}
                className="size-14 rounded-lg object-cover"
              />
              <label className="
                flex items-center gap-2 text-sm text-muted-foreground
              "
              >
                <input
                  type="checkbox"
                  name="removeLogo"
                  className="size-4 accent-primary"
                />
                {t('store_logo_remove')}
              </label>
            </div>
          )}
          <input
            id="logoFile"
            name="logoFile"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
          />
          <input
            id="logo"
            name="logo"
            type="url"
            autoComplete="url"
            defaultValue={currentSettings?.logo?.startsWith('/uploads/')
              || currentSettings?.logo?.startsWith('data:image/')
              ? ''
              : currentSettings?.logo ?? ''}
            placeholder={t('store_logo_placeholder')}
            className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold">{t('store_theme')}</h3>
          <div className="
            mt-4 grid gap-4
            md:grid-cols-3
          "
          >
            <div className="grid gap-2">
              <label htmlFor="primaryColor" className="text-sm font-medium">
                {t('primary_color')}
              </label>
              <input
                id="primaryColor"
                type="color"
                defaultValue={brandTheme.primaryColor ?? '#0088cc'}
                name="primaryColor"
                className="h-10 w-24 dashboard-pill rounded-lg border p-1"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="accentColor" className="text-sm font-medium">
                {t('accent_color')}
              </label>
              <input
                id="accentColor"
                type="color"
                defaultValue={brandTheme.accentColor ?? '#dff7ef'}
                name="accentColor"
                className="h-10 w-24 dashboard-pill rounded-lg border p-1"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="backgroundColor" className="text-sm font-medium">
                {t('background_color')}
              </label>
              <input
                id="backgroundColor"
                type="color"
                defaultValue={brandTheme.backgroundColor ?? '#effaff'}
                name="backgroundColor"
                className="h-10 w-24 dashboard-pill rounded-lg border p-1"
              />
            </div>
          </div>
          <label className="
            mt-4 flex items-center gap-2 text-sm text-muted-foreground
          "
          >
            <input
              type="checkbox"
              name="restoreDefaultTheme"
              className="size-4 accent-primary"
            />
            {t('restore_default_colors')}
          </label>
        </div>

        <div className="grid gap-2">
          <label htmlFor="businessType" className="text-sm font-medium">
            {t('business_type')}
          </label>
          <select
            id="businessType"
            name="businessType"
            defaultValue={selectedBusinessType}
            className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
          >
            {businessTypeOptions.map(option => (
              <option key={option} value={option}>
                {t(option)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <label htmlFor="storeDescription" className="text-sm font-medium">
            {t('store_description')}
          </label>
          <textarea
            id="storeDescription"
            name="storeDescription"
            autoComplete="off"
            rows={3}
            defaultValue={currentSettings?.storeDescription ?? ''}
            className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor="welcomeMessage" className="text-sm font-medium">
            {t('welcome_message')}
          </label>
          <textarea
            id="welcomeMessage"
            name="welcomeMessage"
            autoComplete="off"
            rows={3}
            defaultValue={currentSettings?.welcomeMessage ?? ''}
            className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-2">
          <label htmlFor="timezone" className="text-sm font-medium">
            {t('timezone')}
          </label>
          <select
            id="timezone"
            name="timezone"
            defaultValue={selectedTimezone}
            className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
          >
            {!timezoneOptions.some(option => option.code === selectedTimezone) && (
              <option value={selectedTimezone}>{selectedTimezone}</option>
            )}
            {timezoneOptions.map(option => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold">{t('contact_channels')}</h3>
          <div className="
            mt-4 grid gap-4
            md:grid-cols-2
          "
          >
            {contactChannelKeys.map(channel => (
              <div key={channel} className="grid gap-2">
                <label htmlFor={channel} className="text-sm font-medium">
                  {t(channel)}
                </label>
                <input
                  id={channel}
                  name={channel}
                  autoComplete={contactChannelAutocomplete[channel]}
                  defaultValue={getContactChannelInputValue(channel)}
                  className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
                />
              </div>
            ))}
          </div>
          <div className="
            mt-5 grid gap-4 rounded-xl border border-emerald-500/20
            bg-emerald-500/5 p-4
          "
          >
            <div className="
              flex flex-col gap-3
              md:flex-row md:items-start md:justify-between
            "
            >
              <div>
                <h4 className="text-sm font-bold text-emerald-950">
                  {t('whatsapp_readiness_title')}
                </h4>
              </div>
              <div className="flex items-center gap-2">
                <span className="
                  w-fit rounded-full border border-emerald-600/25 bg-white px-3
                  py-1 text-xs font-semibold text-emerald-700
                "
                >
                  {t(`whatsapp_status_${whatsappChannel.connectionStatus}`)}
                </span>
                {whatsappChannel.isActive && (
                  <PendingSubmitButton
                    formAction={disconnectWhatsApp.bind(null, locale)}
                    className="
                      rounded-full border border-red-200 bg-white px-3 py-1
                      text-xs font-semibold text-red-600 transition
                      hover:bg-red-50
                      disabled:cursor-wait disabled:opacity-65
                    "
                  >
                    فصل الربط
                  </PendingSubmitButton>
                )}
              </div>
            </div>

            <input
              type="hidden"
              name="whatsappConnectionStatus"
              value={whatsappChannel.connectionStatus}
            />

            <WhapiQrConnectButton
              title={t('whapi_qr_connect_title')}
              buttonLabel={t('whapi_qr_connect_button')}
              endpoint="/api/evolution/connect/qr"
              errorLabel={t('whapi_qr_connect_error')}
              issueLabels={{
                channel_preparing: t('whapi_qr_connect_channel_preparing'),
                qr_pending: t('whapi_qr_connect_qr_pending'),
                restart_pending: t('whapi_qr_connect_restart_pending'),
                subscription_expired: t('whapi_qr_connect_subscription_expired'),
                temporary_unavailable: t('whapi_qr_connect_temporary_unavailable'),
                webhook_pending: t('whapi_qr_connect_webhook_pending'),
              }}
              pendingLabel={t('whapi_qr_connect_pending')}
              refreshLabel={t('whapi_qr_connect_refresh')}
            />

            {whatsappQrDataUri && (
              <div className="
                grid gap-4
                lg:grid-cols-[minmax(0,1fr)_auto]
              "
              >
                <div className="
                  grid justify-items-center gap-2 rounded-xl border bg-white p-3
                  text-center text-slate-900 shadow-sm
                "
                >
                  {/* eslint-disable-next-line next/no-img-element -- Inline SVG data URI generated server-side for the WhatsApp QR. */}
                  <img
                    alt="WhatsApp QR"
                    src={whatsappQrDataUri}
                    className="size-28"
                  />
                  <a
                    download="whatsapp-order-qr.svg"
                    href={whatsappQrDataUri}
                    className="
                      inline-flex min-h-10 w-full items-center justify-center
                      rounded-lg border px-3 py-2 text-xs font-semibold
                      text-emerald-700 transition
                      hover:bg-emerald-50
                      sm:w-auto
                    "
                  >
                    {t('download_whatsapp_qr')}
                  </a>
                </div>
              </div>
            )}

            <div className="
              flex justify-end border-t border-emerald-600/15 pt-4
            "
            >
              <WhatsAppSettingsSubmit
                action={saveWhatsAppSettings.bind(null, locale)}
                errorLabel={t('validation_error_invalid_whatsapp_credentials')}
                pendingLabel={t('save_whatsapp_settings')}
                saveLabel={t('save_whatsapp_settings')}
                successLabel={t('whatsapp_saved_description')}
              />
            </div>
          </div>
          {orgId && (
            <div className="
              mt-5 grid dashboard-surface gap-4 rounded-xl border p-4
            "
            >
              <div className="
                grid gap-4
                md:grid-cols-2
              "
              >
                <div className="grid gap-2">
                  <label
                    htmlFor="customerEntryMode"
                    className="text-sm font-medium"
                  >
                    {t('channel_mode')}
                  </label>
                  <select
                    id="customerEntryMode"
                    name="customerEntryMode"
                    defaultValue={selectedCustomerEntryMode}
                    className="
                      dashboard-pill rounded-lg border px-3 py-2 text-sm
                    "
                  >
                    {customerEntryModeOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid gap-2">
                  <label
                    htmlFor="defaultCustomerEntryChannel"
                    className="text-sm font-medium"
                  >
                    {t('default_channel')}
                  </label>
                  <select
                    id="defaultCustomerEntryChannel"
                    name="defaultCustomerEntryChannel"
                    defaultValue={selectedDefaultCustomerEntryChannel}
                    className="
                      dashboard-pill rounded-lg border px-3 py-2 text-sm
                    "
                  >
                    {defaultCustomerEntryChannelOptions.map(option => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="
                grid gap-4
                lg:grid-cols-[minmax(0,1fr)_auto]
              "
              >
                <div className="grid gap-2">
                  <label className="text-sm font-medium" htmlFor="smartEntryLink">
                    {t('smart_entry_link')}
                  </label>
                  <input
                    id="smartEntryLink"
                    readOnly
                    autoComplete="off"
                    value={smartEntryLink}
                    className="
                      w-full dashboard-pill rounded-lg border px-3 py-2 text-sm
                    "
                  />
                </div>

                <div className="
                  grid justify-items-center gap-2 rounded-xl border bg-white p-3
                  text-center text-slate-900 shadow-sm
                "
                >
                  {/* eslint-disable-next-line next/no-img-element -- Inline SVG data URI generated server-side for the smart entry QR. */}
                  <img
                    alt={t('smart_entry_qr_alt')}
                    src={smartEntryQrDataUri}
                    className="size-36"
                  />
                  <a
                    download="smart-customer-entry-qr.svg"
                    href={smartEntryQrDataUri}
                    className="
                      inline-flex min-h-10 w-full items-center justify-center
                      rounded-lg border px-3 py-2 text-xs font-semibold
                      text-primary transition
                      hover:bg-primary/10
                      sm:w-auto
                    "
                  >
                    {t('download_smart_entry_qr')}
                  </a>
                  <div className="
                    grid w-full gap-2
                    sm:flex sm:justify-center
                  "
                  >
                    <CopyTextButton
                      text={smartEntryLink}
                      label={t('copy_link')}
                      copiedLabel={t('copied_link')}
                      failedLabel={t('copy_failed')}
                    />
                    <a
                      href={smartEntryLink}
                      target="_blank"
                      rel="noreferrer"
                      className="
                        inline-flex min-h-10 w-full items-center justify-center
                        rounded-lg border px-3 py-2 text-xs font-semibold
                        text-primary transition
                        hover:bg-primary/10
                        sm:w-auto
                      "
                    >
                      {t('preview_link')}
                    </a>
                  </div>
                </div>
              </div>

              <div className="grid gap-3">
                <div>
                  <h4 className="text-sm font-bold">{t('qr_control_panel')}</h4>
                </div>
                <div className="
                  grid gap-3
                  sm:grid-cols-2
                  lg:grid-cols-3
                "
                >
                  {qrCards.map(card => (
                    <div
                      key={card.labelKey}
                      className="
                        rounded-xl border bg-white p-3 text-slate-900 shadow-sm
                      "
                    >
                      <div className="
                        flex flex-col items-center gap-3 text-center
                        sm:flex-row sm:items-start sm:justify-between
                        sm:text-start
                      "
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-bold">{t(card.labelKey)}</div>
                        </div>
                        {/* eslint-disable-next-line next/no-img-element -- Inline SVG data URI generated server-side for QR control panel. */}
                        <img
                          alt={t(card.labelKey)}
                          src={card.dataUri}
                          className="size-16 shrink-0"
                        />
                      </div>
                      <div className="
                        mt-3 grid gap-2
                        sm:flex sm:flex-wrap
                      "
                      >
                        <CopyTextButton
                          text={card.link}
                          label={t('copy_link')}
                          copiedLabel={t('copied_link')}
                          failedLabel={t('copy_failed')}
                        />
                        <a
                          href={card.link}
                          target="_blank"
                          rel="noreferrer"
                          className="
                            inline-flex min-h-10 w-full items-center
                            justify-center rounded-lg border px-3 py-2 text-xs
                            font-semibold text-primary transition
                            hover:bg-primary/10
                            sm:w-auto
                          "
                        >
                          {t('preview_link')}
                        </a>
                        <a
                          download={card.downloadName}
                          href={card.dataUri}
                          className="
                            inline-flex min-h-10 w-full items-center
                            justify-center rounded-lg border px-3 py-2 text-xs
                            font-semibold text-primary transition
                            hover:bg-primary/10
                            sm:w-auto
                          "
                        >
                          {t('download_qr')}
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold">{t('store_location')}</h3>
          <div className="
            mt-4 grid gap-4
            md:grid-cols-2
          "
          >
            <div className="grid gap-2">
              <label htmlFor="branchName" className="text-sm font-medium">
                {t('branch_name')}
              </label>
              <input
                id="branchName"
                name="branchName"
                autoComplete="organization"
                defaultValue={location.branchName ?? ''}
                className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="locationPhone" className="text-sm font-medium">
                {t('location_phone')}
              </label>
              <input
                id="locationPhone"
                name="locationPhone"
                autoComplete="tel"
                defaultValue={location.phone ?? ''}
                className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="locationCity" className="text-sm font-medium">
                {t('location_city')}
              </label>
              <input
                id="locationCity"
                name="locationCity"
                autoComplete="address-level2"
                defaultValue={location.city ?? ''}
                className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-2">
              <label htmlFor="locationDistrict" className="text-sm font-medium">
                {t('location_district')}
              </label>
              <input
                id="locationDistrict"
                name="locationDistrict"
                autoComplete="address-level3"
                defaultValue={location.district ?? ''}
                className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="locationAddress" className="text-sm font-medium">
                {t('location_address')}
              </label>
              <input
                id="locationAddress"
                name="locationAddress"
                autoComplete="street-address"
                defaultValue={location.address ?? ''}
                className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-2">
              <div className="text-sm font-medium">
                {t('google_maps_url')}
              </div>
              <GoogleMapsLocationPicker
                changeLabel={t('google_maps_change')}
                currentValue={location.mapsUrl ?? ''}
                inputPlaceholder={t('google_maps_placeholder')}
                locateLabel={t('google_maps_locate')}
                locatingLabel={t('google_maps_locating')}
                manualLabel={t('google_maps_open')}
                permissionError={t('google_maps_permission_error')}
                selectedLabel={t('google_maps_selected')}
                unsupportedError={t('google_maps_unsupported_error')}
                viewLabel={t('google_maps_view')}
              />
            </div>

            <div className="
              grid gap-4
              md:grid-cols-2
            "
            >
              <div className="grid gap-2">
                <label
                  htmlFor="pickupInstructions"
                  className="text-sm font-medium"
                >
                  {t('pickup_instructions')}
                </label>
                <textarea
                  id="pickupInstructions"
                  name="pickupInstructions"
                  autoComplete="off"
                  rows={3}
                  defaultValue={location.pickupInstructions ?? ''}
                  className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
                />
              </div>

              <div className="grid gap-2">
                <label htmlFor="deliveryNotes" className="text-sm font-medium">
                  {t('delivery_notes')}
                </label>
                <textarea
                  id="deliveryNotes"
                  name="deliveryNotes"
                  autoComplete="off"
                  rows={3}
                  defaultValue={location.deliveryNotes ?? ''}
                  className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <h3 className="text-lg font-semibold">{t('knowledge_base')}</h3>

          <div className="mt-4 grid gap-4">
            <div className="
              grid gap-4
              md:grid-cols-2
            "
            >
              <label className="grid gap-2 text-sm font-medium">
                {t('knowledge_working_hours')}
                <textarea
                  name="knowledgeWorkingHoursNotes"
                  autoComplete="off"
                  rows={3}
                  defaultValue={knowledgeBase.workingHoursNotes ?? ''}
                  className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium">
                {t('knowledge_delivery_areas')}
                <textarea
                  name="knowledgeDeliveryAreas"
                  autoComplete="off"
                  rows={3}
                  defaultValue={knowledgeBase.deliveryAreas ?? ''}
                  className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm font-medium">
              {t('knowledge_faqs')}
              <textarea
                name="knowledgeFaqs"
                autoComplete="off"
                rows={4}
                defaultValue={knowledgeBase.faqs ?? ''}
                className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
              />
            </label>

            <div className="
              grid gap-4
              md:grid-cols-2
            "
            >
              <label className="grid gap-2 text-sm font-medium">
                {t('knowledge_return_policy')}
                <textarea
                  name="knowledgeReturnPolicy"
                  autoComplete="off"
                  rows={3}
                  defaultValue={knowledgeBase.returnPolicy ?? ''}
                  className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium">
                {t('knowledge_warranty_policy')}
                <textarea
                  name="knowledgeWarrantyPolicy"
                  autoComplete="off"
                  rows={3}
                  defaultValue={knowledgeBase.warrantyPolicy ?? ''}
                  className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="
              grid gap-4
              md:grid-cols-2
            "
            >
              <label className="grid gap-2 text-sm font-medium">
                {t('knowledge_payment_instructions')}
                <textarea
                  name="knowledgePaymentInstructions"
                  autoComplete="off"
                  rows={3}
                  defaultValue={knowledgeBase.paymentInstructions ?? ''}
                  className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium">
                {t('knowledge_service_notes')}
                <textarea
                  name="knowledgeServiceNotes"
                  autoComplete="off"
                  rows={3}
                  defaultValue={knowledgeBase.serviceNotes ?? ''}
                  className="dashboard-pill rounded-lg border px-3 py-2 text-sm"
                />
              </label>
            </div>
          </div>
        </div>

        <PendingSubmitButton
          className="
            rounded-lg bg-primary px-4 py-2 text-sm font-medium
            text-primary-foreground
            disabled:cursor-wait disabled:opacity-65
          "
        >
          {t('save_settings')}
        </PendingSubmitButton>
      </form>

      <form
        action={savePaymentAndDeliverySettings.bind(null, locale)}
        className="
          mt-6 dashboard-panel space-y-8 rounded-xl border p-4
          sm:p-6
        "
      >
        <section>
          <h3 className="text-lg font-semibold">{paymentsT('payment_methods')}</h3>
          <div className="mt-4 grid gap-4">
            {paymentGroups.map((group) => {
              const instructions = getPaymentInstructionsForPreference(group.preference);

              return (
                <div
                  key={group.preference}
                  className="dashboard-surface rounded-xl border p-4 text-sm"
                >
                  <h4 className="font-semibold">{paymentsT(group.titleKey)}</h4>

                  <div className="
                    mt-3 grid gap-3
                    md:grid-cols-2
                  "
                  >
                    {group.options.map(option => (
                      <label
                        key={option}
                        className="
                          flex dashboard-pill items-center gap-3 rounded-lg
                          border px-3 py-2 font-medium
                        "
                      >
                        <input
                          name={`payment_${option}`}
                          type="checkbox"
                          defaultChecked={isPaymentActive(option)}
                        />
                        <input
                          name={`payment_${group.preference}_${option}`}
                          type="hidden"
                          value="on"
                        />
                        <span>{paymentsT(option)}</span>
                      </label>
                    ))}
                  </div>

                  <textarea
                    name={`payment_instructions_${group.preference}`}
                    autoComplete="off"
                    rows={2}
                    placeholder={paymentsT('payment_instructions')}
                    defaultValue={instructions ?? ''}
                    className="
                      mt-3 w-full dashboard-pill rounded-lg border px-3 py-2
                      text-sm
                    "
                  />
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h3 className="text-lg font-semibold">{paymentsT('delivery_methods')}</h3>
          <div className="mt-4 grid gap-4">
            {deliveryOptions.map((option) => {
              const method = getDeliveryMethod(option);
              const config = getDeliveryConfig(option);

              return (
                <div
                  key={option}
                  className="dashboard-surface rounded-xl border p-4"
                >
                  <label className="flex items-center gap-3 text-sm font-medium">
                    <input
                      name={`delivery_${option}`}
                      type="checkbox"
                      defaultChecked={method?.isActive ?? false}
                    />
                    <span>{paymentsT(option)}</span>
                  </label>

                  <div className="
                    mt-3 grid gap-3
                    md:grid-cols-2
                  "
                  >
                    <div className="grid gap-2">
                      <label
                        htmlFor={`delivery_fee_${option}`}
                        className="text-sm font-medium"
                      >
                        {paymentsT('delivery_fee')}
                      </label>
                      <input
                        id={`delivery_fee_${option}`}
                        name={`delivery_fee_${option}`}
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={method?.fee ?? '0'}
                        className="
                          dashboard-pill rounded-lg border px-3 py-2 text-sm
                        "
                      />
                    </div>

                    <div className="grid gap-2">
                      <label
                        htmlFor={`delivery_time_${option}`}
                        className="text-sm font-medium"
                      >
                        {paymentsT('estimated_time')}
                      </label>
                      <input
                        id={`delivery_time_${option}`}
                        name={`delivery_time_${option}`}
                        autoComplete="off"
                        defaultValue={method?.estimatedTime ?? ''}
                        className="
                          dashboard-pill rounded-lg border px-3 py-2 text-sm
                        "
                      />
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2">
                    <label
                      htmlFor={`delivery_instructions_${option}`}
                      className="text-sm font-medium"
                    >
                      {paymentsT('delivery_instructions')}
                    </label>
                    <textarea
                      id={`delivery_instructions_${option}`}
                      name={`delivery_instructions_${option}`}
                      autoComplete="off"
                      rows={2}
                      defaultValue={config.instructions ?? ''}
                      className="
                        dashboard-pill rounded-lg border px-3 py-2 text-sm
                      "
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <PendingSubmitButton
          className="
            rounded-lg bg-primary px-4 py-2 text-sm font-medium
            text-primary-foreground
            disabled:cursor-wait disabled:opacity-65
          "
        >
          {paymentsT('save_settings')}
        </PendingSubmitButton>
      </form>
    </>
  );
}
