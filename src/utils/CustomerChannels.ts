export type CustomerEntryChannel = 'web' | 'whatsapp';
export type CustomerEntryMode = 'web_only' | 'whatsapp_only' | 'web_whatsapp';
export type CustomerTrafficSource
  = | 'branch'
    | 'direct'
    | 'google_maps'
    | 'instagram'
    | 'qr'
    | 'smart_link'
    | 'table'
    | 'tiktok'
    | 'website'
    | 'whatsapp';
export type CustomerEntryOperationalContext = {
  deliveryPreference?: 'delivery' | 'pickup';
  fulfillmentType?: 'delivery' | 'dine_in' | 'pickup';
  source: 'branch' | 'direct' | 'qr' | 'table' | 'web' | 'whatsapp';
};
export type WhatsAppConnectionStatus
  = | 'connected'
    | 'disconnected'
    | 'pending_setup';
export type WhatsAppProvider = 'meta' | 'whapi';

const validEntryModes = new Set<CustomerEntryMode>([
  'web_only',
  'whatsapp_only',
  'web_whatsapp',
]);
const validDefaultChannels = new Set<CustomerEntryChannel>(['web', 'whatsapp']);
const validTrafficSources = new Set<CustomerTrafficSource>([
  'branch',
  'direct',
  'google_maps',
  'instagram',
  'qr',
  'smart_link',
  'table',
  'tiktok',
  'website',
  'whatsapp',
]);

export const normalizeWhatsAppTarget = (value?: unknown) => {
  const target = typeof value === 'string' ? value.trim() : '';

  if (!target) {
    return null;
  }

  if (['true', 'false'].includes(target.toLowerCase())) {
    return null;
  }

  if (target.startsWith('http://') || target.startsWith('https://')) {
    try {
      const url = new URL(target);
      const host = url.hostname.toLowerCase();
      const allowedHosts = new Set([
        'api.whatsapp.com',
        'wa.me',
        'web.whatsapp.com',
      ]);

      return url.protocol === 'https:' && allowedHosts.has(host)
        ? url.toString()
        : null;
    } catch {
      return null;
    }
  }

  const digits = target.replace(/\D/g, '');

  if (!digits) {
    return null;
  }

  return `https://wa.me/${digits}`;
};

export const getCustomerChannelDisplayValue = (value?: unknown) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const textValue = value.trim();

  if (!textValue || ['true', 'false'].includes(textValue.toLowerCase())) {
    return undefined;
  }

  return textValue;
};

export const buildWhatsAppUrl = (target: string, message: string) => {
  const separator = target.includes('?') ? '&' : '?';

  return `${target}${separator}text=${encodeURIComponent(message)}`;
};

const normalizeWhatsAppConnectionStatus = (params: {
  hasCredentials: boolean;
  status?: unknown;
}): WhatsAppConnectionStatus => {
  const allowedStatuses = new Set<WhatsAppConnectionStatus>([
    'connected',
    'disconnected',
    'pending_setup',
  ]);

  if (!params.hasCredentials) {
    return 'pending_setup';
  }

  if (typeof params.status === 'string' && allowedStatuses.has(params.status as WhatsAppConnectionStatus)) {
    return params.status as WhatsAppConnectionStatus;
  }

  return 'connected';
};

const buildWhatsAppDirectMessage = (storeName: string) => {
  const name = storeName.trim() || 'SmartStore';

  return `Hello, I would like to place an order from ${name}.`;
};

export const buildWhatsAppChannelConfig = (params: {
  apiTokenPreview?: null | string;
  channelId?: null | string;
  displayPhoneNumber?: null | string;
  encryptedAccessToken?: null | string;
  encryptedApiToken?: null | string;
  hasAccessToken?: boolean;
  hasApiToken?: boolean;
  phoneNumberId?: null | string;
  provider?: WhatsAppProvider;
  status?: unknown;
  storeName: string;
  wabaId?: null | string;
  webhookReady?: boolean;
  webhookSecret?: null | string;
}) => {
  const provider = params.provider ?? 'meta';
  const phoneNumberId = params.phoneNumberId?.trim() || null;
  const wabaId = params.wabaId?.trim() || null;
  const channelId = params.channelId?.trim() || null;
  const displayPhoneNumber = params.displayPhoneNumber?.trim() || null;
  const whatsappTarget = normalizeWhatsAppTarget(displayPhoneNumber);
  const hasProviderCredentials = provider === 'whapi'
    ? Boolean(channelId && params.hasApiToken)
    : Boolean(
        phoneNumberId
        && /^\d{6,20}$/.test(phoneNumberId)
        && params.hasAccessToken,
      );
  const connectionStatus = normalizeWhatsAppConnectionStatus({
    hasCredentials: hasProviderCredentials,
    status: params.status,
  });
  const whatsappLink = whatsappTarget
    ? buildWhatsAppUrl(whatsappTarget, buildWhatsAppDirectMessage(params.storeName))
    : null;
  const providerConfig = provider === 'whapi'
    ? {
        apiTokenPreview: params.apiTokenPreview ?? null,
        channelId,
        connectionMethod: 'whapi_cloud_api',
        displayPhoneNumber,
        encryptedApiToken: params.encryptedApiToken ?? null,
        webhookProvider: 'whapi',
        webhookSecret: params.webhookSecret ?? null,
      }
    : {
        connectionMethod: 'meta_cloud_api',
        displayPhoneNumber,
        encryptedAccessToken: params.encryptedAccessToken ?? null,
        phoneNumberId,
        wabaId,
        webhookProvider: 'meta',
      };

  return {
    config: {
      connectionStatus,
      customerMapping: 'whatsapp_phone',
      directLinkStatus: whatsappTarget ? 'ready' : 'missing_number',
      eventArchitecture: 'webhook_ready',
      mode: provider,
      notificationRouting: ['web_chat', 'whatsapp'],
      orderMapping: 'source_channel_order',
      phoneNumber: displayPhoneNumber,
      provider,
      qrType: 'whatsapp',
      webhookReady: hasProviderCredentials && params.webhookReady !== false,
      whatsappLink,
      whatsappTarget,
      ...(hasProviderCredentials || provider === 'whapi' || phoneNumberId ? providerConfig : {}),
    },
    connectionStatus,
    isActive: hasProviderCredentials,
    mode: provider,
    whatsappLink,
    whatsappTarget,
  };
};

export const normalizeCustomerEntryMode = (value: unknown): CustomerEntryMode => {
  return typeof value === 'string' && validEntryModes.has(value as CustomerEntryMode)
    ? value as CustomerEntryMode
    : 'web_whatsapp';
};

export const normalizeDefaultCustomerEntryChannel = (value: unknown): CustomerEntryChannel => {
  return typeof value === 'string' && validDefaultChannels.has(value as CustomerEntryChannel)
    ? value as CustomerEntryChannel
    : 'web';
};

export const normalizeTrafficSource = (value: unknown): CustomerTrafficSource => {
  const source = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[\s-]+/g, '_')
    : '';

  return validTrafficSources.has(source as CustomerTrafficSource)
    ? source as CustomerTrafficSource
    : 'direct';
};

export const normalizeCustomerChannelSource = (
  value: unknown,
  fallback = 'website',
) => {
  const normalizedFallback = fallback.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_')
    || 'website';
  const source = typeof value === 'string'
    ? value.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '_')
    : '';

  return (source || normalizedFallback).slice(0, 50);
};

export const normalizeWebOrderSourceChannel = (value: unknown) => {
  const source = normalizeCustomerChannelSource(value, 'website');

  if (source === 'web' || source === 'website') {
    return 'web_chat';
  }

  if (source.startsWith('web_chat')) {
    return source.slice(0, 50);
  }

  return `web_chat_${source}`.slice(0, 50);
};

const normalizeOperationalSource = (value: unknown) => {
  const source = normalizeCustomerChannelSource(value, 'direct');

  if (source === 'web_chat') {
    return 'web';
  }

  if (source.startsWith('web_chat_')) {
    return source.replace(/^web_chat_/, '');
  }

  return source;
};

export const resolveCustomerEntryOperationalContext = (
  value: unknown,
): CustomerEntryOperationalContext => {
  const source = normalizeOperationalSource(value);

  if (source === 'whatsapp' || source.startsWith('whatsapp_')) {
    return {
      source: 'whatsapp',
    };
  }

  if (source === 'table') {
    return {
      deliveryPreference: 'pickup',
      fulfillmentType: 'dine_in',
      source: 'table',
    };
  }

  if (source === 'branch') {
    return {
      deliveryPreference: 'pickup',
      fulfillmentType: 'pickup',
      source: 'branch',
    };
  }

  if (source === 'qr') {
    return {
      source: 'qr',
    };
  }

  return {
    source: source === 'web' ? 'web' : 'direct',
  };
};

export const getCustomerEntryChannels = (params: {
  mode?: unknown;
  webOrdersEnabled?: boolean;
  whatsappTarget?: null | string;
}) => {
  const mode = normalizeCustomerEntryMode(params.mode);
  const webEnabled = params.webOrdersEnabled !== false;
  const whatsappEnabled = Boolean(params.whatsappTarget);
  const channels = new Set<CustomerEntryChannel>();

  if (webEnabled && mode !== 'whatsapp_only') {
    channels.add('web');
  }

  if (whatsappEnabled && mode !== 'web_only') {
    channels.add('whatsapp');
  }

  if (channels.size === 0 && webEnabled) {
    channels.add('web');
  }

  return [...channels];
};

export const resolveCustomerEntryRoute = (params: {
  defaultChannel?: unknown;
  mode?: unknown;
  webOrdersEnabled?: boolean;
  whatsappTarget?: null | string;
}) => {
  const channels = getCustomerEntryChannels(params);
  const defaultChannel = normalizeDefaultCustomerEntryChannel(params.defaultChannel);

  if (channels.length !== 1) {
    return {
      channels,
      directChannel: null,
      selectorRequired: true,
    };
  }

  return {
    channels,
    directChannel: channels[0] ?? defaultChannel,
    selectorRequired: false,
  };
};
