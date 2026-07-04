import { describe, expect, it } from 'vitest';
import {
  buildWhatsAppChannelConfig,
  buildWhatsAppUrl,
  getCustomerChannelDisplayValue,
  getCustomerEntryChannels,
  normalizeCustomerChannelSource,
  normalizeCustomerEntryMode,
  normalizeDefaultCustomerEntryChannel,
  normalizeTrafficSource,
  normalizeWebOrderSourceChannel,
  normalizeWhatsAppTarget,
  resolveCustomerEntryOperationalContext,
  resolveCustomerEntryRoute,
  resolveWhatsAppTargetFromWhapiConnectionConfig,
} from './CustomerChannels';

describe('CustomerChannels', () => {
  it('normalizes WhatsApp targets from text values', () => {
    expect(normalizeWhatsAppTarget('  +966 54 976 4152  ')).toBe('https://wa.me/966549764152');
    expect(normalizeWhatsAppTarget('https://wa.me/966549764152')).toBe('https://wa.me/966549764152');
    expect(normalizeWhatsAppTarget('https://api.whatsapp.com/send?phone=966549764152')).toBe(
      'https://api.whatsapp.com/send?phone=966549764152',
    );
  });

  it('rejects non-WhatsApp or non-HTTPS direct targets', () => {
    expect(normalizeWhatsAppTarget('https://example.com/966549764152')).toBeNull();
    expect(normalizeWhatsAppTarget('https://wa.me.evil.example/966549764152')).toBeNull();
    expect(normalizeWhatsAppTarget('http://wa.me/966549764152')).toBeNull();
  });

  it('ignores non-text WhatsApp metadata values', () => {
    expect(normalizeWhatsAppTarget(true)).toBeNull();
    expect(normalizeWhatsAppTarget(966549764152)).toBeNull();
    expect(normalizeWhatsAppTarget(null)).toBeNull();
    expect(normalizeWhatsAppTarget(undefined)).toBeNull();
  });

  it('ignores legacy boolean strings from old settings', () => {
    expect(normalizeWhatsAppTarget('true')).toBeNull();
    expect(normalizeWhatsAppTarget(' false ')).toBeNull();
  });

  it('resolves WhatsApp targets from active Whapi connection config', () => {
    expect(resolveWhatsAppTargetFromWhapiConnectionConfig({
      displayPhoneNumber: '+966 54 976 4152',
    })).toBe('https://wa.me/966549764152');
    expect(resolveWhatsAppTargetFromWhapiConnectionConfig({
      displayPhoneNumber: '+966 54 976 4152',
      whatsappTarget: 'https://wa.me/14155552671',
    })).toBe('https://wa.me/14155552671');
    expect(resolveWhatsAppTargetFromWhapiConnectionConfig({
      phoneNumber: '+1 (555) 664-3746',
    })).toBe('https://wa.me/15556643746');
    expect(resolveWhatsAppTargetFromWhapiConnectionConfig(null)).toBeNull();
    expect(resolveWhatsAppTargetFromWhapiConnectionConfig({
      displayPhoneNumber: 'true',
    })).toBeNull();
  });

  it('formats customer channel display values without legacy boolean metadata', () => {
    expect(getCustomerChannelDisplayValue('  0549764152  ')).toBe('0549764152');
    expect(getCustomerChannelDisplayValue('true')).toBeUndefined();
    expect(getCustomerChannelDisplayValue(true)).toBeUndefined();
  });

  it('builds WhatsApp URLs with encoded messages', () => {
    expect(buildWhatsAppUrl('https://wa.me/966549764152', 'hello world')).toBe(
      'https://wa.me/966549764152?text=hello%20world',
    );
    expect(buildWhatsAppUrl('https://wa.me/966549764152?source=web', 'hello')).toBe(
      'https://wa.me/966549764152?source=web&text=hello',
    );
  });

  it('marks WhatsApp as pending setup when Whapi credentials are missing', () => {
    expect(buildWhatsAppChannelConfig({
      storeName: 'SmartStore',
    })).toMatchObject({
      connectionStatus: 'pending_setup',
      isActive: false,
      whatsappLink: null,
      whatsappTarget: null,
    });
  });

  it('prepares the Whapi connection from per-store credentials', () => {
    const config = buildWhatsAppChannelConfig({
      apiTokenPreview: 'whp...oken',
      channelId: 'CATWMN-B42ST',
      displayPhoneNumber: '+14155552671',
      encryptedApiToken: 'encrypted-token',
      hasApiToken: true,
      storeName: 'SmartStore',
      webhookSecret: 'secret',
    });

    expect(config).toMatchObject({
      connectionStatus: 'connected',
      isActive: true,
      mode: 'whapi',
      whatsappTarget: 'https://wa.me/14155552671',
    });
    expect(config.config).toMatchObject({
      apiTokenPreview: 'whp...oken',
      channelId: 'CATWMN-B42ST',
      connectionMethod: 'whapi_cloud_api',
      customerMapping: 'whatsapp_phone',
      eventArchitecture: 'webhook_ready',
      encryptedApiToken: 'encrypted-token',
      orderMapping: 'source_channel_order',
      provider: 'whapi',
      webhookReady: true,
      webhookSecret: 'secret',
    });
  });

  it('does not activate a store with an incomplete Whapi configuration', () => {
    const config = buildWhatsAppChannelConfig({
      channelId: 'CATWMN-B42ST',
      status: 'connected',
      storeName: 'SmartStore',
    });

    expect(config).toMatchObject({
      connectionStatus: 'pending_setup',
      isActive: false,
      mode: 'whapi',
    });
    expect(config.config).toMatchObject({
      channelId: 'CATWMN-B42ST',
      provider: 'whapi',
      webhookReady: false,
    });
  });

  it('normalizes customer entry settings defensively', () => {
    expect(normalizeCustomerEntryMode('web_only')).toBe('web_only');
    expect(normalizeCustomerEntryMode('unknown')).toBe('web_whatsapp');
    expect(normalizeDefaultCustomerEntryChannel('whatsapp')).toBe('whatsapp');
    expect(normalizeDefaultCustomerEntryChannel('sms')).toBe('web');
  });

  it('normalizes traffic source tracking values', () => {
    expect(normalizeTrafficSource('Google Maps')).toBe('google_maps');
    expect(normalizeTrafficSource('branch')).toBe('branch');
    expect(normalizeTrafficSource('qr')).toBe('qr');
    expect(normalizeTrafficSource('table')).toBe('table');
    expect(normalizeTrafficSource('bad-source')).toBe('direct');
    expect(normalizeTrafficSource(undefined)).toBe('direct');
  });

  it('keeps custom web order channel sources isolated while sanitizing unsafe characters', () => {
    expect(normalizeCustomerChannelSource('e2e-checkout')).toBe('e2e-checkout');
    expect(normalizeCustomerChannelSource('Instagram Campaign 01')).toBe('instagram_campaign_01');
    expect(normalizeCustomerChannelSource('', 'Smart Link')).toBe('smart_link');
  });

  it('normalizes web order chat channel names without double-prefixing older links', () => {
    expect(normalizeWebOrderSourceChannel('web')).toBe('web_chat');
    expect(normalizeWebOrderSourceChannel('website')).toBe('web_chat');
    expect(normalizeWebOrderSourceChannel('qr')).toBe('web_chat_qr');
    expect(normalizeWebOrderSourceChannel('web_chat_qr')).toBe('web_chat_qr');
  });

  it('resolves operational behavior from customer entry sources', () => {
    expect(resolveCustomerEntryOperationalContext('web_chat_table')).toEqual({
      deliveryPreference: 'pickup',
      fulfillmentType: 'dine_in',
      source: 'table',
    });
    expect(resolveCustomerEntryOperationalContext('web_chat_branch')).toEqual({
      deliveryPreference: 'pickup',
      fulfillmentType: 'pickup',
      source: 'branch',
    });
    expect(resolveCustomerEntryOperationalContext('whatsapp')).toEqual({
      source: 'whatsapp',
    });
    expect(resolveCustomerEntryOperationalContext('web_chat_qr')).toEqual({
      source: 'qr',
    });
  });

  it('resolves smart link channels from mode and availability', () => {
    expect(getCustomerEntryChannels({
      mode: 'web_whatsapp',
      webOrdersEnabled: true,
      whatsappTarget: 'https://wa.me/966549764152',
    })).toEqual(['web', 'whatsapp']);
    expect(getCustomerEntryChannels({
      mode: 'whatsapp_only',
      webOrdersEnabled: true,
      whatsappTarget: 'https://wa.me/966549764152',
    })).toEqual(['whatsapp']);
    expect(getCustomerEntryChannels({
      mode: 'web_only',
      webOrdersEnabled: true,
      whatsappTarget: 'https://wa.me/966549764152',
    })).toEqual(['web']);
    expect(getCustomerEntryChannels({
      mode: 'whatsapp_only',
      webOrdersEnabled: true,
      whatsappTarget: null,
    })).toEqual(['web']);
  });

  it('requires selector only when more than one entry channel is active', () => {
    expect(resolveCustomerEntryRoute({
      mode: 'web_whatsapp',
      webOrdersEnabled: true,
      whatsappTarget: 'https://wa.me/966549764152',
    })).toMatchObject({
      channels: ['web', 'whatsapp'],
      directChannel: null,
      selectorRequired: true,
    });
    expect(resolveCustomerEntryRoute({
      mode: 'web_only',
      webOrdersEnabled: true,
      whatsappTarget: 'https://wa.me/966549764152',
    })).toMatchObject({
      channels: ['web'],
      directChannel: 'web',
      selectorRequired: false,
    });
  });
});
