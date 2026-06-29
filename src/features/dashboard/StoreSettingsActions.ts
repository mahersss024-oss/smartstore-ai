'use server';

import { randomBytes } from 'node:crypto';
import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { db } from '@/libs/DB';
import {
  extractGoogleMapsCoordinates,
  isValidGoogleMapsUrl,
} from '@/libs/GoogleMaps';
import {
  decryptSecret,
  encryptSecret,
  maskApiKey,
} from '@/libs/PlatformAIProviderConfig';
import { isStoredImageDataUrl, isUploadedFile, saveStoreLogo } from '@/libs/ProductImageStorage';
import { logSecretLengthDiagnostics } from '@/libs/SecretDiagnostics';
import { isValidHexColor } from '@/libs/StoreBrandTheme';
import {
  assertCanUseChannels,
  isSubscriptionFeatureError,
  isSubscriptionLimitError,
} from '@/libs/SubscriptionEntitlements';
import {
  channelConnectionsTable,
  storeSettingsTable,
} from '@/models/Schema';
import { buildWhatsAppChannelConfig } from '@/utils/CustomerChannels';
import { getI18nPath } from '@/utils/Helpers';

type StoreSettingsMetadata = {
  brandTheme?: {
    accentColor?: string;
    backgroundColor?: string;
    primaryColor?: string;
  };
  businessType?: string;
  contactChannels?: {
    email?: string;
    phone?: string;
    whatsapp?: string;
  };
  channelIntegrations?: {
    whatsapp?: {
      accessTokenPreview?: string | null;
      apiTokenPreview?: string | null;
      channelId?: string | null;
      connectionStatus?: string;
      displayPhoneNumber?: string | null;
      mode?: string;
      phoneNumber?: string | null;
      phoneNumberId?: string | null;
      provider?: string | null;
      wabaId?: string | null;
      webhookSecret?: string | null;
      webhookReady?: boolean;
      whatsappLink?: string | null;
      whatsappTarget?: string | null;
    };
  };
  customerEntry?: {
    defaultChannel?: 'web' | 'whatsapp';
    mode?: 'web_only' | 'whatsapp_only' | 'web_whatsapp';
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
  location?: {
    address?: string;
    branchName?: string;
    city?: string;
    deliveryNotes?: string;
    district?: string;
    latitude?: number;
    longitude?: number;
    mapsUrl?: string;
    phone?: string;
    pickupInstructions?: string;
  };
  platform?: Record<string, unknown>;
  subscription?: Record<string, unknown>;
  subscriptionPlan?: string;
};
type CustomerEntryMode = NonNullable<StoreSettingsMetadata['customerEntry']>['mode'];
type DefaultCustomerEntryChannel = NonNullable<StoreSettingsMetadata['customerEntry']>['defaultChannel'];
type ExistingWhatsappConfig = {
  accessTokenPreview?: string | null;
  apiTokenPreview?: string | null;
  channelId?: string | null;
  connectionStatus?: string | null;
  displayPhoneNumber?: string | null;
  encryptedAccessToken?: string | null;
  encryptedApiToken?: string | null;
  mode?: string | null;
  phoneNumber?: string | null;
  phoneNumberId?: string | null;
  provider?: string | null;
  wabaId?: string | null;
  webhookSecret?: string | null;
};

type ExistingStoreNameMetadata = {
  location?: {
    branchName?: string;
  };
};

type SettingsValidationErrorCode
  = | 'duplicate_name'
    | 'invalid_email'
    | 'invalid_logo_url'
    | 'invalid_map_url'
    | 'invalid_theme_color'
    | 'invalid_whatsapp_credentials'
    | 'invalid_store_description'
    | 'invalid_store_name';

const allowedBusinessTypes = new Set([
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
]);

const allowedCurrencies = new Set([
  'SAR',
  'USD',
  'AED',
  'KWD',
  'QAR',
  'BHD',
  'OMR',
  'EUR',
  'GBP',
  'EGP',
  'JOD',
  'TRY',
]);

const allowedTimezones = new Set([
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Kuwait',
  'Asia/Qatar',
  'Asia/Bahrain',
  'Asia/Muscat',
  'Asia/Amman',
  'Africa/Cairo',
  'Europe/Istanbul',
  'UTC',
  'Europe/London',
  'Europe/Paris',
  'America/New_York',
]);
const allowedCustomerEntryModes = new Set([
  'web_only',
  'whatsapp_only',
  'web_whatsapp',
]);
const allowedDefaultCustomerEntryChannels = new Set([
  'web',
  'whatsapp',
]);
const allowedWhatsAppProviders = new Set([
  'meta',
  'whapi',
]);

const getActiveOrganizationId = async () => {
  const { orgId } = await auth();

  if (!orgId) {
    throw new Error('No active organization selected');
  }

  return orgId;
};

const redirectValidationError = (
  locale: string,
  code: SettingsValidationErrorCode,
) => {
  redirect(getI18nPath(`/dashboard/settings?settingsError=${code}`, locale));
};

const getExistingWhatsappConfig = async (organizationId: string) => {
  const [existingWhatsappConnection] = await db
    .select({ config: channelConnectionsTable.config })
    .from(channelConnectionsTable)
    .where(
      and(
        eq(channelConnectionsTable.organizationId, organizationId),
        eq(channelConnectionsTable.channel, 'whatsapp'),
      ),
    )
    .limit(1);

  return existingWhatsappConnection?.config
    && typeof existingWhatsappConnection.config === 'object'
    ? existingWhatsappConnection.config as ExistingWhatsappConfig
    : {};
};

const resolveMetaConnectionInput = (
  formData: FormData,
  existing: ExistingWhatsappConfig,
) => {
  const submittedPhoneNumberId = String(formData.get('metaPhoneNumberId') ?? '').trim();
  const submittedAccessToken = String(formData.get('metaAccessToken') ?? '').trim();
  const submittedWabaId = String(formData.get('metaWabaId') ?? '').trim();
  const submittedDisplayPhone = String(formData.get('metaDisplayPhoneNumber') ?? '').trim();
  const phoneNumberId = submittedPhoneNumberId || existing.phoneNumberId?.trim() || null;
  const accessToken = submittedAccessToken
    || (existing.encryptedAccessToken
      ? decryptSecret(existing.encryptedAccessToken)
      : undefined);
  const encryptedAccessToken = submittedAccessToken
    ? encryptSecret(submittedAccessToken)
    : existing.encryptedAccessToken ?? null;
  const wabaId = submittedWabaId || existing.wabaId?.trim() || null;
  const displayPhoneNumber = submittedDisplayPhone || existing.displayPhoneNumber?.trim() || null;

  logSecretLengthDiagnostics('meta.access_token.save_store_settings', {
    decryptedLength: accessToken?.length ?? null,
    inputLength: submittedAccessToken.length || null,
    retrievedLength: existing.encryptedAccessToken?.length ?? null,
    storedLength: encryptedAccessToken?.length ?? null,
  });

  return {
    accessToken,
    accessTokenPreview: submittedAccessToken
      ? maskApiKey(submittedAccessToken)
      : existing.accessTokenPreview ?? null,
    displayPhoneNumber,
    encryptedAccessToken,
    hasAccessToken: Boolean(accessToken && encryptedAccessToken),
    phoneNumberId,
    submittedCredentials: Boolean(submittedPhoneNumberId || submittedAccessToken),
    wabaId,
  };
};

const isMetaConnectionShapeValid = (
  input: ReturnType<typeof resolveMetaConnectionInput>,
) => {
  return /^\d{6,20}$/.test(input.phoneNumberId ?? '')
    && Boolean(input.accessToken);
};

const normalizeWhatsAppProvider = (
  formData: FormData,
  existing: ExistingWhatsappConfig,
) => {
  const submittedProvider = String(formData.get('whatsappProvider') ?? '').trim();
  const provider = submittedProvider || existing.provider || existing.mode || 'meta';

  return allowedWhatsAppProviders.has(provider) ? provider as 'meta' | 'whapi' : 'meta';
};

const generateWebhookSecret = () => randomBytes(24).toString('hex');

const resolveWhapiConnectionInput = (
  formData: FormData,
  existing: ExistingWhatsappConfig,
) => {
  const submittedChannelId = String(formData.get('whapiChannelId') ?? '').trim();
  const submittedApiToken = String(formData.get('whapiApiToken') ?? '').trim();
  const submittedDisplayPhone = String(formData.get('whapiDisplayPhoneNumber') ?? '').trim();
  const submittedWebhookSecret = String(formData.get('whapiWebhookSecret') ?? '').trim();
  const channelId = submittedChannelId || existing.channelId?.trim() || null;
  const apiToken = submittedApiToken
    || (existing.encryptedApiToken
      ? decryptSecret(existing.encryptedApiToken)
      : undefined);
  const encryptedApiToken = submittedApiToken
    ? encryptSecret(submittedApiToken)
    : existing.encryptedApiToken ?? null;
  const displayPhoneNumber = submittedDisplayPhone || existing.displayPhoneNumber?.trim() || null;
  const webhookSecret = submittedWebhookSecret || existing.webhookSecret?.trim() || generateWebhookSecret();

  logSecretLengthDiagnostics('whapi.api_token.save_store_settings', {
    decryptedLength: apiToken?.length ?? null,
    inputLength: submittedApiToken.length || null,
    retrievedLength: existing.encryptedApiToken?.length ?? null,
    storedLength: encryptedApiToken?.length ?? null,
  });

  return {
    apiToken,
    apiTokenPreview: submittedApiToken
      ? maskApiKey(submittedApiToken)
      : existing.apiTokenPreview ?? null,
    channelId,
    displayPhoneNumber,
    encryptedApiToken,
    hasApiToken: Boolean(apiToken && encryptedApiToken),
    submittedCredentials: Boolean(submittedChannelId || submittedApiToken),
    webhookSecret,
  };
};

const isWhapiConnectionShapeValid = (
  input: ReturnType<typeof resolveWhapiConnectionInput>,
) => {
  return /^[\w.:-]{3,128}$/.test(input.channelId ?? '')
    && Boolean(input.apiToken)
    && /^[a-f0-9]{48}$/i.test(input.webhookSecret ?? '');
};

const normalizeStoreNameForComparison = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '');
};

const levenshteinDistance = (a: string, b: string) => {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let lastDiagonal = previous[0]!;
    previous[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const oldDiagonal = previous[j]!;
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      previous[j] = Math.min(
        previous[j]! + 1,
        previous[j - 1]! + 1,
        lastDiagonal + cost,
      );
      lastDiagonal = oldDiagonal;
    }
  }

  return previous[b.length]!;
};

const areStoreNamesTooSimilar = (first: string, second: string) => {
  const a = normalizeStoreNameForComparison(first);
  const b = normalizeStoreNameForComparison(second);

  if (!a || !b) {
    return false;
  }

  if (a === b) {
    return true;
  }

  const shorter = Math.min(a.length, b.length);
  const longer = Math.max(a.length, b.length);

  if (shorter < 5) {
    return false;
  }

  if (a.includes(b) || b.includes(a)) {
    return shorter / longer >= 0.75;
  }

  const distance = levenshteinDistance(a, b);
  const similarity = 1 - distance / longer;

  return similarity >= 0.86 || (longer <= 12 && distance <= 2);
};

const isValidStoreName = (value: string) => {
  const normalized = normalizeStoreNameForComparison(value);

  return value.length >= 3
    && value.length <= 60
    && normalized.length >= 3;
};

const isValidEmail = (value: string) => {
  const parts = value.split('@');

  if (parts.length !== 2) {
    return false;
  }

  const [localPart, domain] = parts;
  const domainParts = domain?.split('.') ?? [];

  return Boolean(localPart)
    && !/\s/.test(value)
    && domainParts.length >= 2
    && domainParts.every(Boolean)
    && domainParts.at(-1)!.length >= 2;
};

const isValidImageUrl = (value: string) => {
  if (value.startsWith('/uploads/')) {
    return true;
  }

  if (isStoredImageDataUrl(value)) {
    return true;
  }

  try {
    const url = new URL(value);

    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
};

const isValidOptionalText = (value: string, maxLength: number) => {
  return value.length <= maxLength;
};

const assertStoreNameIsUniqueEnough = async (
  organizationId: string,
  storeName: string,
) => {
  const stores = await db
    .select({
      metadata: storeSettingsTable.metadata,
      organizationId: storeSettingsTable.organizationId,
      storeName: storeSettingsTable.storeName,
    })
    .from(storeSettingsTable);

  return !stores.some((store) => {
    if (store.organizationId === organizationId) {
      return false;
    }

    const metadata = (store.metadata ?? {}) as ExistingStoreNameMetadata;
    const names = [
      store.storeName,
      metadata.location?.branchName,
    ].filter((name): name is string => Boolean(name?.trim()));

    return names.some(existingName => areStoreNamesTooSimilar(storeName, existingName));
  });
};

export const saveStoreSettings = async (locale: string, formData: FormData) => {
  const organizationId = await getActiveOrganizationId();
  const storeName = String(formData.get('storeName') ?? '').trim();
  const uploadedLogo = formData.get('logoFile');
  const submittedLogoUrl = String(formData.get('logo') ?? '').trim();
  const shouldRemoveLogo = formData.get('removeLogo') === 'on';
  const storeDescription = String(formData.get('storeDescription') ?? '').trim();
  const welcomeMessage = String(formData.get('welcomeMessage') ?? '').trim();
  const submittedBusinessType = String(formData.get('businessType') ?? 'general_store').trim();
  const submittedCurrency = String(formData.get('currency') ?? 'SAR').trim().toUpperCase();
  const submittedTimezone = String(formData.get('timezone') ?? 'Asia/Riyadh').trim();
  const primaryColor = String(formData.get('primaryColor') ?? '').trim();
  const accentColor = String(formData.get('accentColor') ?? '').trim();
  const backgroundColor = String(formData.get('backgroundColor') ?? '').trim();
  const restoreDefaultTheme = formData.get('restoreDefaultTheme') === 'on';
  const currency = allowedCurrencies.has(submittedCurrency) ? submittedCurrency : 'SAR';
  const timezone = allowedTimezones.has(submittedTimezone) ? submittedTimezone : 'Asia/Riyadh';
  const businessType = allowedBusinessTypes.has(submittedBusinessType)
    ? submittedBusinessType
    : 'general_store';
  const submittedWhatsapp = formData.has('whatsapp')
    ? String(formData.get('whatsapp') ?? '').trim()
    : undefined;
  const submittedWhatsappStatus = String(formData.get('whatsappConnectionStatus') ?? '').trim();
  const submittedCustomerEntryMode = String(formData.get('customerEntryMode') ?? 'web_whatsapp').trim();
  const submittedDefaultCustomerEntryChannel = String(formData.get('defaultCustomerEntryChannel') ?? 'web').trim();
  const customerEntryMode = allowedCustomerEntryModes.has(submittedCustomerEntryMode)
    ? submittedCustomerEntryMode as CustomerEntryMode
    : 'web_whatsapp';
  const defaultCustomerEntryChannel = allowedDefaultCustomerEntryChannels.has(submittedDefaultCustomerEntryChannel)
    ? submittedDefaultCustomerEntryChannel as DefaultCustomerEntryChannel
    : 'web';
  const email = String(formData.get('email') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const knowledgeBase = {
    deliveryAreas: String(formData.get('knowledgeDeliveryAreas') ?? '').trim() || undefined,
    faqs: String(formData.get('knowledgeFaqs') ?? '').trim() || undefined,
    paymentInstructions: String(formData.get('knowledgePaymentInstructions') ?? '').trim() || undefined,
    returnPolicy: String(formData.get('knowledgeReturnPolicy') ?? '').trim() || undefined,
    serviceNotes: String(formData.get('knowledgeServiceNotes') ?? '').trim() || undefined,
    warrantyPolicy: String(formData.get('knowledgeWarrantyPolicy') ?? '').trim() || undefined,
    workingHoursNotes: String(formData.get('knowledgeWorkingHoursNotes') ?? '').trim() || undefined,
  };
  const location = {
    address: String(formData.get('locationAddress') ?? '').trim() || undefined,
    branchName: String(formData.get('branchName') ?? '').trim() || undefined,
    city: String(formData.get('locationCity') ?? '').trim() || undefined,
    deliveryNotes: String(formData.get('deliveryNotes') ?? '').trim() || undefined,
    district: String(formData.get('locationDistrict') ?? '').trim() || undefined,
    mapsUrl: String(formData.get('mapsUrl') ?? '').trim() || undefined,
    phone: String(formData.get('locationPhone') ?? '').trim() || undefined,
    pickupInstructions: String(formData.get('pickupInstructions') ?? '').trim() || undefined,
  };
  const mapsCoordinates = location.mapsUrl
    ? extractGoogleMapsCoordinates(location.mapsUrl)
    : undefined;
  const existingSettings = await db
    .select({
      id: storeSettingsTable.id,
      logo: storeSettingsTable.logo,
      metadata: storeSettingsTable.metadata,
    })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);
  const currentLogo = existingSettings[0]?.logo?.trim() ?? '';

  if (!isValidStoreName(storeName)) {
    redirectValidationError(locale, 'invalid_store_name');
  }

  if (
    !isValidOptionalText(storeDescription, 1000)
    || !isValidOptionalText(welcomeMessage, 1000)
    || !isValidOptionalText(knowledgeBase.deliveryAreas ?? '', 1000)
    || !isValidOptionalText(knowledgeBase.faqs ?? '', 2000)
    || !isValidOptionalText(knowledgeBase.paymentInstructions ?? '', 1000)
    || !isValidOptionalText(knowledgeBase.returnPolicy ?? '', 1000)
    || !isValidOptionalText(knowledgeBase.serviceNotes ?? '', 1000)
    || !isValidOptionalText(knowledgeBase.warrantyPolicy ?? '', 1000)
    || !isValidOptionalText(knowledgeBase.workingHoursNotes ?? '', 1000)
  ) {
    redirectValidationError(locale, 'invalid_store_description');
  }

  if (email && !isValidEmail(email)) {
    redirectValidationError(locale, 'invalid_email');
  }

  if (
    !shouldRemoveLogo
    && (
      (submittedLogoUrl && !isValidImageUrl(submittedLogoUrl))
      || (!submittedLogoUrl && currentLogo && !isValidImageUrl(currentLogo))
    )
  ) {
    redirectValidationError(locale, 'invalid_logo_url');
  }

  if (
    !restoreDefaultTheme
    && (
      (primaryColor && !isValidHexColor(primaryColor))
      || (accentColor && !isValidHexColor(accentColor))
      || (backgroundColor && !isValidHexColor(backgroundColor))
    )
  ) {
    redirectValidationError(locale, 'invalid_theme_color');
  }

  if (location.mapsUrl && !isValidGoogleMapsUrl(location.mapsUrl)) {
    redirectValidationError(locale, 'invalid_map_url');
  }

  if (!await assertStoreNameIsUniqueEnough(organizationId, storeName)) {
    redirectValidationError(locale, 'duplicate_name');
  }

  const activeContactChannels = [submittedWhatsapp, email, phone].filter(Boolean).length;

  await assertCanUseChannels(organizationId, activeContactChannels).catch((error: unknown) => {
    if (isSubscriptionLimitError(error) && error.feature === 'channels') {
      redirect(getI18nPath('/dashboard/settings?limit=channels', locale));
    }

    if (isSubscriptionFeatureError(error)) {
      redirect(getI18nPath('/dashboard/subscription?required=paid', locale));
    }

    throw error;
  });

  let logo = shouldRemoveLogo ? '' : submittedLogoUrl || currentLogo;
  if (isUploadedFile(uploadedLogo)) {
    try {
      logo = (await saveStoreLogo(uploadedLogo, organizationId)).url;
    } catch {
      redirectValidationError(locale, 'invalid_logo_url');
    }
  }

  const existingWhatsappConfig = await getExistingWhatsappConfig(organizationId);
  const whatsappProvider = normalizeWhatsAppProvider(formData, existingWhatsappConfig);
  const meta = resolveMetaConnectionInput(formData, existingWhatsappConfig);
  const whapi = resolveWhapiConnectionInput(formData, existingWhatsappConfig);
  const hasAnyWhatsAppSetting = whatsappProvider === 'whapi'
    ? Boolean(whapi.channelId || whapi.apiToken)
    : Boolean(meta.phoneNumberId || meta.accessToken);

  if (
    hasAnyWhatsAppSetting
    && (
      whatsappProvider === 'whapi'
        ? !isWhapiConnectionShapeValid(whapi)
        : !isMetaConnectionShapeValid(meta)
    )
  ) {
    redirectValidationError(locale, 'invalid_whatsapp_credentials');
  }

  const whatsappChannel = whatsappProvider === 'whapi'
    ? buildWhatsAppChannelConfig({
        apiTokenPreview: whapi.apiTokenPreview,
        channelId: whapi.channelId,
        displayPhoneNumber: whapi.displayPhoneNumber,
        encryptedApiToken: whapi.encryptedApiToken,
        hasApiToken: whapi.hasApiToken,
        provider: 'whapi',
        status: submittedWhatsappStatus,
        storeName,
        webhookSecret: whapi.webhookSecret,
      })
    : buildWhatsAppChannelConfig({
        displayPhoneNumber: meta.displayPhoneNumber,
        encryptedAccessToken: meta.encryptedAccessToken,
        hasAccessToken: meta.hasAccessToken,
        phoneNumberId: meta.phoneNumberId,
        provider: 'meta',
        status: submittedWhatsappStatus,
        storeName,
        wabaId: meta.wabaId,
      });

  // Store settings metadata and the WhatsApp channel connection must move
  // together: inbound routing reads channel_connections while the dashboard reads
  // metadata, so a partial write would leave them inconsistent.
  // The FOR UPDATE re-read inside the transaction prevents a concurrent save from
  // silently clobbering another writer's metadata keys (last-writer-wins race).
  await db.transaction(async (tx) => {
    const [lockedSettings] = await tx
      .select({ metadata: storeSettingsTable.metadata })
      .from(storeSettingsTable)
      .where(eq(storeSettingsTable.organizationId, organizationId))
      .limit(1)
      .for('update');

    const lockedMetadata = (lockedSettings?.metadata ?? existingSettings[0]?.metadata ?? {}) as StoreSettingsMetadata;
    const metadata: StoreSettingsMetadata = {
      ...lockedMetadata,
      businessType,
      channelIntegrations: {
        ...(lockedMetadata.channelIntegrations ?? {}),
        whatsapp: {
          accessTokenPreview: whatsappProvider === 'meta' ? meta.accessTokenPreview : null,
          apiTokenPreview: whatsappProvider === 'whapi' ? whapi.apiTokenPreview : null,
          channelId: whatsappProvider === 'whapi' ? whapi.channelId : null,
          connectionStatus: whatsappChannel.connectionStatus,
          displayPhoneNumber: whatsappProvider === 'whapi' ? whapi.displayPhoneNumber : meta.displayPhoneNumber,
          mode: whatsappChannel.mode,
          phoneNumber: whatsappProvider === 'whapi' ? whapi.displayPhoneNumber : meta.displayPhoneNumber,
          phoneNumberId: whatsappProvider === 'meta' ? meta.phoneNumberId : null,
          provider: whatsappProvider,
          wabaId: whatsappProvider === 'meta' ? meta.wabaId : null,
          webhookSecret: whatsappProvider === 'whapi' ? whapi.webhookSecret : null,
          webhookReady: whatsappChannel.connectionStatus === 'connected',
          whatsappLink: whatsappChannel.whatsappLink,
          whatsappTarget: whatsappChannel.whatsappTarget,
        },
      },
      contactChannels: {
        ...(lockedMetadata.contactChannels ?? {}),
        whatsapp: (whatsappProvider === 'whapi' ? whapi.displayPhoneNumber : meta.displayPhoneNumber) || undefined,
        email: email || undefined,
        phone: phone || undefined,
      },
      customerEntry: {
        ...(lockedMetadata.customerEntry ?? {}),
        defaultChannel: defaultCustomerEntryChannel,
        mode: customerEntryMode,
      },
      knowledgeBase,
      location: {
        ...location,
        latitude: mapsCoordinates?.latitude,
        longitude: mapsCoordinates?.longitude,
      },
    };
    if (restoreDefaultTheme) {
      delete metadata.brandTheme;
    } else {
      metadata.brandTheme = {
        ...(lockedMetadata.brandTheme ?? {}),
        accentColor: accentColor || undefined,
        backgroundColor: backgroundColor || undefined,
        primaryColor: primaryColor || undefined,
      };
    }

    if (lockedSettings || existingSettings[0]) {
      await tx
        .update(storeSettingsTable)
        .set({
          storeName: storeName || null,
          logo: logo || null,
          storeDescription: storeDescription || null,
          welcomeMessage: welcomeMessage || null,
          currency,
          timezone,
          metadata,
        })
        .where(eq(storeSettingsTable.organizationId, organizationId));
    } else {
      await tx.insert(storeSettingsTable).values({
        organizationId,
        storeName: storeName || null,
        logo: logo || null,
        storeDescription: storeDescription || null,
        welcomeMessage: welcomeMessage || null,
        currency,
        timezone,
        metadata,
      });
    }

    await tx
      .insert(channelConnectionsTable)
      .values({
        aiMode: 'assist',
        channel: 'whatsapp',
        config: whatsappChannel.config,
        connectionStatus: whatsappChannel.connectionStatus,
        displayName: 'WhatsApp',
        isActive: whatsappChannel.isActive,
        organizationId,
      })
      .onConflictDoUpdate({
        set: {
          aiMode: 'assist',
          config: whatsappChannel.config,
          connectionStatus: whatsappChannel.connectionStatus,
          displayName: 'WhatsApp',
          isActive: whatsappChannel.isActive,
        },
        target: [
          channelConnectionsTable.organizationId,
          channelConnectionsTable.channel,
        ],
      });
  });

  revalidatePath(getI18nPath('/dashboard/settings', locale));
  revalidatePath(getI18nPath('/dashboard/launch-readiness', locale));
  revalidatePath(getI18nPath('/admin', locale));
  revalidatePath(getI18nPath(`/admin/stores/${organizationId}`, locale));
};

export type WhatsAppSettingsActionState = {
  message?: string;
  status: 'error' | 'idle' | 'success';
};

export const saveWhatsAppSettings = async (
  locale: string,
  _previousState: WhatsAppSettingsActionState,
  formData: FormData,
): Promise<WhatsAppSettingsActionState> => {
  const organizationId = await getActiveOrganizationId();

  const [existingSettings] = await db
    .select({
      id: storeSettingsTable.id,
      metadata: storeSettingsTable.metadata,
      storeName: storeSettingsTable.storeName,
    })
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, organizationId))
    .limit(1);

  const existingWhatsappConfig = await getExistingWhatsappConfig(organizationId);
  const whatsappProvider = normalizeWhatsAppProvider(formData, existingWhatsappConfig);
  const meta = resolveMetaConnectionInput(formData, existingWhatsappConfig);
  const whapi = resolveWhapiConnectionInput(formData, existingWhatsappConfig);

  if (
    whatsappProvider === 'whapi'
      ? !isWhapiConnectionShapeValid(whapi)
      : !isMetaConnectionShapeValid(meta)
  ) {
    return {
      message: 'invalid_whatsapp_credentials',
      status: 'error',
    };
  }

  const storeName = existingSettings?.storeName
    || String(formData.get('storeName') ?? '').trim()
    || 'SmartStore';
  const whatsappChannel = whatsappProvider === 'whapi'
    ? buildWhatsAppChannelConfig({
        apiTokenPreview: whapi.apiTokenPreview,
        channelId: whapi.channelId,
        displayPhoneNumber: whapi.displayPhoneNumber,
        encryptedApiToken: whapi.encryptedApiToken,
        hasApiToken: whapi.hasApiToken,
        provider: 'whapi',
        storeName,
        webhookSecret: whapi.webhookSecret,
      })
    : buildWhatsAppChannelConfig({
        displayPhoneNumber: meta.displayPhoneNumber,
        encryptedAccessToken: meta.encryptedAccessToken,
        hasAccessToken: meta.hasAccessToken,
        phoneNumberId: meta.phoneNumberId,
        provider: 'meta',
        storeName,
        wabaId: meta.wabaId,
      });

  // Keep metadata and the WhatsApp channel connection atomic (see saveStoreSettings).
  // Re-read the metadata row with FOR UPDATE inside the transaction so a concurrent
  // settings save cannot silently clobber other metadata keys (race condition fix).
  await db.transaction(async (tx) => {
    const [lockedSettings] = await tx
      .select({ metadata: storeSettingsTable.metadata })
      .from(storeSettingsTable)
      .where(eq(storeSettingsTable.organizationId, organizationId))
      .limit(1)
      .for('update');

    const lockedMetadata = (lockedSettings?.metadata ?? existingSettings?.metadata ?? {}) as StoreSettingsMetadata;
    const metadata: StoreSettingsMetadata = {
      ...lockedMetadata,
      channelIntegrations: {
        ...(lockedMetadata.channelIntegrations ?? {}),
        whatsapp: {
          accessTokenPreview: whatsappProvider === 'meta' ? meta.accessTokenPreview : null,
          apiTokenPreview: whatsappProvider === 'whapi' ? whapi.apiTokenPreview : null,
          channelId: whatsappProvider === 'whapi' ? whapi.channelId : null,
          connectionStatus: whatsappChannel.connectionStatus,
          displayPhoneNumber: whatsappProvider === 'whapi' ? whapi.displayPhoneNumber : meta.displayPhoneNumber,
          mode: whatsappChannel.mode,
          phoneNumber: whatsappProvider === 'whapi' ? whapi.displayPhoneNumber : meta.displayPhoneNumber,
          phoneNumberId: whatsappProvider === 'meta' ? meta.phoneNumberId : null,
          provider: whatsappProvider,
          wabaId: whatsappProvider === 'meta' ? meta.wabaId : null,
          webhookSecret: whatsappProvider === 'whapi' ? whapi.webhookSecret : null,
          webhookReady: whatsappChannel.connectionStatus === 'connected',
          whatsappLink: whatsappChannel.whatsappLink,
          whatsappTarget: whatsappChannel.whatsappTarget,
        },
      },
      contactChannels: {
        ...(lockedMetadata.contactChannels ?? {}),
        whatsapp: (whatsappProvider === 'whapi' ? whapi.displayPhoneNumber : meta.displayPhoneNumber) || undefined,
      },
    };

    if (lockedSettings || existingSettings) {
      await tx
        .update(storeSettingsTable)
        .set({ metadata })
        .where(eq(storeSettingsTable.organizationId, organizationId));
    } else {
      await tx.insert(storeSettingsTable).values({
        metadata,
        organizationId,
        storeName: String(formData.get('storeName') ?? '').trim() || null,
      });
    }

    await tx
      .insert(channelConnectionsTable)
      .values({
        aiMode: 'assist',
        channel: 'whatsapp',
        config: whatsappChannel.config,
        connectionStatus: whatsappChannel.connectionStatus,
        displayName: 'WhatsApp',
        isActive: whatsappChannel.isActive,
        organizationId,
      })
      .onConflictDoUpdate({
        set: {
          aiMode: 'assist',
          config: whatsappChannel.config,
          connectionStatus: whatsappChannel.connectionStatus,
          displayName: 'WhatsApp',
          isActive: whatsappChannel.isActive,
        },
        target: [
          channelConnectionsTable.organizationId,
          channelConnectionsTable.channel,
        ],
      });
  });

  revalidatePath(getI18nPath('/dashboard/settings', locale));
  revalidatePath(getI18nPath('/dashboard/launch-readiness', locale));
  revalidatePath(getI18nPath('/admin', locale));
  revalidatePath(getI18nPath(`/admin/stores/${organizationId}`, locale));

  return {
    message: 'whatsapp_settings_saved',
    status: 'success',
  };
};

export const disconnectWhatsApp = async (locale: string) => {
  const organizationId = await getActiveOrganizationId();

  // Channel disconnect + metadata clearing must be atomic; the metadata row is
  // locked FOR UPDATE so a concurrent settings save cannot clobber the change.
  await db.transaction(async (tx) => {
    await tx
      .insert(channelConnectionsTable)
      .values({
        aiMode: 'assist',
        channel: 'whatsapp',
        config: {},
        connectionStatus: 'not_connected',
        displayName: 'WhatsApp',
        isActive: false,
        organizationId,
      })
      .onConflictDoUpdate({
        set: {
          config: {},
          connectionStatus: 'not_connected',
          isActive: false,
        },
        target: [
          channelConnectionsTable.organizationId,
          channelConnectionsTable.channel,
        ],
      });

    const [existingSettings] = await tx
      .select({ metadata: storeSettingsTable.metadata })
      .from(storeSettingsTable)
      .where(eq(storeSettingsTable.organizationId, organizationId))
      .limit(1)
      .for('update');

    if (existingSettings) {
      const existingMetadata = (existingSettings.metadata ?? {}) as StoreSettingsMetadata;
      await tx
        .update(storeSettingsTable)
        .set({
          metadata: {
            ...existingMetadata,
            channelIntegrations: {
              ...(existingMetadata.channelIntegrations ?? {}),
              whatsapp: {},
            },
          },
        })
        .where(eq(storeSettingsTable.organizationId, organizationId));
    }
  });

  revalidatePath(getI18nPath('/dashboard/settings', locale));
  revalidatePath(getI18nPath('/dashboard/launch-readiness', locale));
  redirect(getI18nPath('/dashboard/settings', locale));
};
