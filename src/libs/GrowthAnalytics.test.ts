import { describe, expect, it } from 'vitest';
import {
  buildGrowthAnalytics,
  calculateConversionRate,
  normalizeAnalyticsSource,
} from './GrowthAnalytics';

describe('GrowthAnalytics', () => {
  it('normalizes traffic sources from order and conversation channels', () => {
    expect(normalizeAnalyticsSource('web_chat_instagram')).toBe('instagram');
    expect(normalizeAnalyticsSource('web_chat_qr')).toBe('qr');
    expect(normalizeAnalyticsSource('whatsapp')).toBe('whatsapp');
  });

  it('normalizes tiktok, google, smart_link, web, and unknown-or-null sources', () => {
    expect(normalizeAnalyticsSource('tiktok_shop')).toBe('tiktok');
    expect(normalizeAnalyticsSource('google_maps_link')).toBe('google_maps');
    expect(normalizeAnalyticsSource('smart_link_campaign')).toBe('smart_link');
    expect(normalizeAnalyticsSource('web_chat')).toBe('website');
    expect(normalizeAnalyticsSource(null)).toBe('direct');
    expect(normalizeAnalyticsSource(undefined)).toBe('direct');
    expect(normalizeAnalyticsSource('unknown_channel')).toBe('direct');
  });

  it('calculates conversion rate defensively', () => {
    expect(calculateConversionRate(5, 10)).toBe(50);
    expect(calculateConversionRate(1, 0)).toBe(100);
    expect(calculateConversionRate(0, 0)).toBe(0);
  });

  it('caps conversion rate at 100 when orders exceed conversations', () => {
    expect(calculateConversionRate(10, 5)).toBe(100);
  });

  it('builds growth analytics from existing order and conversation data', () => {
    expect(buildGrowthAnalytics({
      conversations: [
        { channel: 'web_chat_qr' },
        { channel: 'web_chat_instagram' },
      ],
      orders: [
        { source: 'web_chat_qr', status: 'completed' },
        { source: 'whatsapp', status: 'cancelled' },
      ],
    })).toMatchObject({
      cancelledOrders: 1,
      completedOrders: 1,
      conversations: 2,
      conversionRate: 100,
      orders: 2,
    });
  });

  it('accumulates conversation sources that have no matching orders', () => {
    const result = buildGrowthAnalytics({
      conversations: [{ channel: 'tiktok' }, { channel: 'google_maps_link' }],
      orders: [],
    });

    const sources = result.trafficSources.map(s => s.source);

    expect(sources).toContain('tiktok');
    expect(sources).toContain('google_maps');
    expect(result.conversionRate).toBe(0);
  });

  it('returns empty traffic sources when no orders or conversations exist', () => {
    const result = buildGrowthAnalytics({ conversations: [], orders: [] });

    expect(result.trafficSources).toHaveLength(0);
    expect(result.orders).toBe(0);
    expect(result.conversations).toBe(0);
  });
});
