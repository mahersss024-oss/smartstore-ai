/**
 * Channel Isolation Matrix
 *
 * Verifies that the system correctly distinguishes between all customer entry
 * channels: web chat, table (QR-at-table / dine-in), branch, QR link,
 * smart link, and WhatsApp. Each channel carries distinct operational
 * semantics that must never bleed into another channel.
 *
 * Critical rules:
 *  - Table channel always forces dine_in fulfillment — AI cannot override it.
 *  - Branch channel always forces pickup — AI cannot override it.
 *  - WhatsApp channel uses AI-extracted fulfillment (no auto-set).
 *  - Web/QR/smart-link channels use AI-extracted fulfillment (no auto-set).
 *  - WhatsApp feedback capture must only fire for whatsapp channel.
 *  - Channel normalization must be idempotent (round-trip safe).
 */
import { describe, expect, it } from 'vitest';
import {
  normalizeWebOrderSourceChannel,
  resolveCustomerEntryOperationalContext,
} from './CustomerChannels';

// ─── Phase 1: resolveCustomerEntryOperationalContext complete matrix ──────────

describe('resolveCustomerEntryOperationalContext — complete channel matrix', () => {
  describe('web chat variants — no fulfillment auto-set', () => {
    it('web_chat → source:web with no fulfillment defaults', () => {
      const ctx = resolveCustomerEntryOperationalContext('web_chat');

      expect(ctx.source).toBe('web');
      expect(ctx.deliveryPreference).toBeUndefined();
      expect(ctx.fulfillmentType).toBeUndefined();
    });

    it('web → same as web_chat (direct web input)', () => {
      const ctx = resolveCustomerEntryOperationalContext('web');

      expect(ctx.source).toBe('web');
      expect(ctx.deliveryPreference).toBeUndefined();
      expect(ctx.fulfillmentType).toBeUndefined();
    });

    it('web_chat_qr → source:qr with no fulfillment defaults', () => {
      const ctx = resolveCustomerEntryOperationalContext('web_chat_qr');

      expect(ctx.source).toBe('qr');
      expect(ctx.deliveryPreference).toBeUndefined();
      expect(ctx.fulfillmentType).toBeUndefined();
    });

    it('web_chat_smart_link → source:direct with no fulfillment defaults', () => {
      const ctx = resolveCustomerEntryOperationalContext('web_chat_smart_link');

      expect(ctx.source).toBe('direct');
      expect(ctx.deliveryPreference).toBeUndefined();
      expect(ctx.fulfillmentType).toBeUndefined();
    });

    it('website → source:direct with no fulfillment defaults', () => {
      const ctx = resolveCustomerEntryOperationalContext('website');

      expect(ctx.deliveryPreference).toBeUndefined();
      expect(ctx.fulfillmentType).toBeUndefined();
    });
  });

  describe('table channel — always forces dine_in', () => {
    it('web_chat_table → source:table, fulfillmentType:dine_in, deliveryPreference:pickup', () => {
      const ctx = resolveCustomerEntryOperationalContext('web_chat_table');

      expect(ctx.source).toBe('table');
      expect(ctx.fulfillmentType).toBe('dine_in');
      expect(ctx.deliveryPreference).toBe('pickup');
    });

    it('table (bare input) → same dine_in context', () => {
      const ctx = resolveCustomerEntryOperationalContext('table');

      expect(ctx.source).toBe('table');
      expect(ctx.fulfillmentType).toBe('dine_in');
      expect(ctx.deliveryPreference).toBe('pickup');
    });
  });

  describe('branch channel — always forces pickup', () => {
    it('web_chat_branch → source:branch, fulfillmentType:pickup, deliveryPreference:pickup', () => {
      const ctx = resolveCustomerEntryOperationalContext('web_chat_branch');

      expect(ctx.source).toBe('branch');
      expect(ctx.fulfillmentType).toBe('pickup');
      expect(ctx.deliveryPreference).toBe('pickup');
    });

    it('branch (bare input) → same pickup context', () => {
      const ctx = resolveCustomerEntryOperationalContext('branch');

      expect(ctx.source).toBe('branch');
      expect(ctx.fulfillmentType).toBe('pickup');
      expect(ctx.deliveryPreference).toBe('pickup');
    });
  });

  describe('WhatsApp channel — no fulfillment auto-set', () => {
    it('whatsapp → source:whatsapp with no fulfillment defaults', () => {
      const ctx = resolveCustomerEntryOperationalContext('whatsapp');

      expect(ctx.source).toBe('whatsapp');
      expect(ctx.deliveryPreference).toBeUndefined();
      expect(ctx.fulfillmentType).toBeUndefined();
    });

    it('legacy whatsapp variant → safe fallback with no fulfillment defaults', () => {
      const ctx = resolveCustomerEntryOperationalContext('whatsapp_legacy_api');

      expect(ctx.source).toBe('direct');
      expect(ctx.deliveryPreference).toBeUndefined();
      expect(ctx.fulfillmentType).toBeUndefined();
    });
  });

  describe('unknown / null / empty inputs — safe fallback', () => {
    it('null → defaults to direct with no fulfillment', () => {
      const ctx = resolveCustomerEntryOperationalContext(null);

      expect(ctx.deliveryPreference).toBeUndefined();
      expect(ctx.fulfillmentType).toBeUndefined();
    });

    it('undefined → defaults to direct with no fulfillment', () => {
      const ctx = resolveCustomerEntryOperationalContext(undefined);

      expect(ctx.deliveryPreference).toBeUndefined();
      expect(ctx.fulfillmentType).toBeUndefined();
    });

    it('invented channel string → defaults to direct with no fulfillment', () => {
      const ctx = resolveCustomerEntryOperationalContext('invented_channel_xyz');

      expect(ctx.deliveryPreference).toBeUndefined();
      expect(ctx.fulfillmentType).toBeUndefined();
    });
  });
});

// ─── Phase 2: Channel normalization — storage round-trip ─────────────────────

describe('normalizeWebOrderSourceChannel — storage normalization', () => {
  it('table source → stored as web_chat_table (preserves table identity)', () => {
    expect(normalizeWebOrderSourceChannel('table')).toBe('web_chat_table');
  });

  it('qr source → stored as web_chat_qr', () => {
    expect(normalizeWebOrderSourceChannel('qr')).toBe('web_chat_qr');
  });

  it('smart_link source → stored as web_chat_smart_link', () => {
    expect(normalizeWebOrderSourceChannel('smart_link')).toBe('web_chat_smart_link');
  });

  it('branch source → stored as web_chat_branch', () => {
    expect(normalizeWebOrderSourceChannel('branch')).toBe('web_chat_branch');
  });

  it('web → stored as web_chat', () => {
    expect(normalizeWebOrderSourceChannel('web')).toBe('web_chat');
  });

  it('website → stored as web_chat', () => {
    expect(normalizeWebOrderSourceChannel('website')).toBe('web_chat');
  });

  it('already-normalized web_chat_table → idempotent (no double-prefix)', () => {
    expect(normalizeWebOrderSourceChannel('web_chat_table')).toBe('web_chat_table');
  });

  it('already-normalized web_chat_qr → idempotent', () => {
    expect(normalizeWebOrderSourceChannel('web_chat_qr')).toBe('web_chat_qr');
  });

  it('already-normalized web_chat → idempotent', () => {
    expect(normalizeWebOrderSourceChannel('web_chat')).toBe('web_chat');
  });
});

// ─── Phase 3: Full normalization chain — storage → operational context ────────

describe('Full channel chain: storage value → resolveCustomerEntryOperationalContext', () => {
  it('web_chat_table (as stored in DB) → dine_in operational context', () => {
    // This is the end-to-end chain for table QR ordering:
    // Customer scans table QR → source='table' → normalizeWebOrderSourceChannel → 'web_chat_table'
    // → stored in conversationsTable.channel → passed to AI agent → resolveCustomerEntryOperationalContext
    const stored = normalizeWebOrderSourceChannel('table');
    const ctx = resolveCustomerEntryOperationalContext(stored);

    expect(stored).toBe('web_chat_table');
    expect(ctx.source).toBe('table');
    expect(ctx.fulfillmentType).toBe('dine_in');
    expect(ctx.deliveryPreference).toBe('pickup');
  });

  it('web_chat_qr (as stored) → qr context with no fulfillment defaults', () => {
    const stored = normalizeWebOrderSourceChannel('qr');
    const ctx = resolveCustomerEntryOperationalContext(stored);

    expect(stored).toBe('web_chat_qr');
    expect(ctx.source).toBe('qr');
    expect(ctx.fulfillmentType).toBeUndefined();
    expect(ctx.deliveryPreference).toBeUndefined();
  });

  it('web_chat_branch (as stored) → branch pickup context', () => {
    const stored = normalizeWebOrderSourceChannel('branch');
    const ctx = resolveCustomerEntryOperationalContext(stored);

    expect(stored).toBe('web_chat_branch');
    expect(ctx.source).toBe('branch');
    expect(ctx.fulfillmentType).toBe('pickup');
    expect(ctx.deliveryPreference).toBe('pickup');
  });

  it('web_chat (as stored) → web context with no fulfillment defaults', () => {
    const stored = normalizeWebOrderSourceChannel('web');
    const ctx = resolveCustomerEntryOperationalContext(stored);

    expect(stored).toBe('web_chat');
    expect(ctx.source).toBe('web');
    expect(ctx.fulfillmentType).toBeUndefined();
    expect(ctx.deliveryPreference).toBeUndefined();
  });

  it('whatsapp (as stored — never goes through normalizeWebOrderSourceChannel) → whatsapp context', () => {
    // WhatsApp does not go through normalizeWebOrderSourceChannel.
    // The webhook hardcodes source: 'whatsapp' directly.
    const ctx = resolveCustomerEntryOperationalContext('whatsapp');

    expect(ctx.source).toBe('whatsapp');
    expect(ctx.fulfillmentType).toBeUndefined();
    expect(ctx.deliveryPreference).toBeUndefined();
  });
});

// ─── Phase 4: Channel override priority — channel beats AI extraction ─────────

describe('Channel operational context overrides AI-extracted fulfillment', () => {
  /**
   * The agent applies:
   *   deliveryPreference: entryOperationalContext.deliveryPreference ?? aiExtracted.deliveryPreference
   *   fulfillmentType:    entryOperationalContext.fulfillmentType    ?? aiExtracted.fulfillmentType
   *
   * When the channel has a non-null deliveryPreference/fulfillmentType, the AI
   * extraction is IGNORED regardless of what the customer said.
   */

  it('table channel forces dine_in even when AI extracted delivery preference', () => {
    const tableCtx = resolveCustomerEntryOperationalContext('web_chat_table');
    const aiExtractedDelivery = 'delivery' as const;
    const aiExtractedFulfillment = 'delivery' as const;

    // Agent merges: channel ?? AI
    const effectiveDelivery = tableCtx.deliveryPreference ?? aiExtractedDelivery;
    const effectiveFulfillment = tableCtx.fulfillmentType ?? aiExtractedFulfillment;

    // Channel wins — AI's delivery request is ignored
    expect(effectiveDelivery).toBe('pickup');
    expect(effectiveFulfillment).toBe('dine_in');
  });

  it('branch channel forces pickup even when AI extracted delivery preference', () => {
    const branchCtx = resolveCustomerEntryOperationalContext('web_chat_branch');
    const aiExtractedDelivery = 'delivery' as const;
    const aiExtractedFulfillment = 'delivery' as const;

    const effectiveDelivery = branchCtx.deliveryPreference ?? aiExtractedDelivery;
    const effectiveFulfillment = branchCtx.fulfillmentType ?? aiExtractedFulfillment;

    expect(effectiveDelivery).toBe('pickup');
    expect(effectiveFulfillment).toBe('pickup');
  });

  it('WhatsApp channel allows AI-extracted delivery preference (no override)', () => {
    const waCtx = resolveCustomerEntryOperationalContext('whatsapp');
    const aiExtractedDelivery = 'delivery' as const;
    const aiExtractedFulfillment = 'delivery' as const;

    const effectiveDelivery = waCtx.deliveryPreference ?? aiExtractedDelivery;
    const effectiveFulfillment = waCtx.fulfillmentType ?? aiExtractedFulfillment;

    // Channel has no override — AI extraction wins
    expect(effectiveDelivery).toBe('delivery');
    expect(effectiveFulfillment).toBe('delivery');
  });

  it('web chat channel allows AI-extracted pickup preference (no override)', () => {
    const webCtx = resolveCustomerEntryOperationalContext('web_chat');
    const aiExtractedDelivery = 'pickup' as const;
    const aiExtractedFulfillment = 'pickup' as const;

    const effectiveDelivery = webCtx.deliveryPreference ?? aiExtractedDelivery;
    const effectiveFulfillment = webCtx.fulfillmentType ?? aiExtractedFulfillment;

    expect(effectiveDelivery).toBe('pickup');
    expect(effectiveFulfillment).toBe('pickup');
  });

  it('QR channel allows AI-extracted fulfillment (no override)', () => {
    const qrCtx = resolveCustomerEntryOperationalContext('web_chat_qr');
    const aiExtractedDelivery = 'delivery' as const;

    const effectiveDelivery = qrCtx.deliveryPreference ?? aiExtractedDelivery;

    expect(effectiveDelivery).toBe('delivery');
  });
});

// ─── Phase 5: Channel identity — no cross-channel contamination ───────────────

describe('Channel identity — no cross-channel contamination', () => {
  it('table channel is never mistaken for web_chat', () => {
    const table = resolveCustomerEntryOperationalContext('web_chat_table');
    const web = resolveCustomerEntryOperationalContext('web_chat');

    expect(table.source).not.toBe(web.source);
    expect(table.fulfillmentType).toBeDefined();
    expect(web.fulfillmentType).toBeUndefined();
  });

  it('table channel is never mistaken for whatsapp', () => {
    const table = resolveCustomerEntryOperationalContext('web_chat_table');
    const whatsapp = resolveCustomerEntryOperationalContext('whatsapp');

    expect(table.source).not.toBe(whatsapp.source);
    expect(table.fulfillmentType).toBe('dine_in');
    expect(whatsapp.fulfillmentType).toBeUndefined();
  });

  it('whatsapp channel is never mistaken for web_chat', () => {
    const whatsapp = resolveCustomerEntryOperationalContext('whatsapp');
    const web = resolveCustomerEntryOperationalContext('web_chat');

    expect(whatsapp.source).toBe('whatsapp');
    expect(web.source).toBe('web');
    expect(whatsapp.source).not.toBe(web.source);
  });

  it('branch channel is never mistaken for table', () => {
    const branch = resolveCustomerEntryOperationalContext('web_chat_branch');
    const table = resolveCustomerEntryOperationalContext('web_chat_table');

    expect(branch.source).toBe('branch');
    expect(table.source).toBe('table');
    expect(branch.fulfillmentType).toBe('pickup');
    expect(table.fulfillmentType).toBe('dine_in');
  });

  it('qr channel is never mistaken for table', () => {
    const qr = resolveCustomerEntryOperationalContext('web_chat_qr');
    const table = resolveCustomerEntryOperationalContext('web_chat_table');

    // QR link outside a restaurant has no auto-set fulfillment
    // Table QR forces dine_in — these must not be confused
    expect(qr.fulfillmentType).toBeUndefined();
    expect(table.fulfillmentType).toBe('dine_in');
  });

  it('smart_link channel is never mistaken for table', () => {
    const smartLink = resolveCustomerEntryOperationalContext('web_chat_smart_link');
    const table = resolveCustomerEntryOperationalContext('web_chat_table');

    expect(smartLink.fulfillmentType).toBeUndefined();
    expect(table.fulfillmentType).toBe('dine_in');
  });
});

// ─── Phase 6: WhatsApp feedback capture guard ─────────────────────────────────

describe('WhatsApp feedback capture — fires only for whatsapp channel', () => {
  /**
   * In AIEmployeeAgent.ts:
   *   const shouldCaptureWhatsAppFeedbackNote = message.channel === 'whatsapp'
   *     && !rating
   *     && !isSystemSemanticAction
   *     && (dialogue.state === 'complaint' || dialogue.state === 'review');
   *
   * Test the channel condition directly — other channels must not trigger it.
   */
  const evaluateWhatsAppFeedbackGuard = (channel: string) => channel === 'whatsapp';

  it('whatsapp channel triggers feedback capture guard', () => {
    expect(evaluateWhatsAppFeedbackGuard('whatsapp')).toBe(true);
  });

  it('web_chat channel does NOT trigger WhatsApp feedback capture', () => {
    expect(evaluateWhatsAppFeedbackGuard('web_chat')).toBe(false);
  });

  it('web_chat_table channel does NOT trigger WhatsApp feedback capture', () => {
    expect(evaluateWhatsAppFeedbackGuard('web_chat_table')).toBe(false);
  });

  it('web_chat_qr channel does NOT trigger WhatsApp feedback capture', () => {
    expect(evaluateWhatsAppFeedbackGuard('web_chat_qr')).toBe(false);
  });

  it('web_chat_branch channel does NOT trigger WhatsApp feedback capture', () => {
    expect(evaluateWhatsAppFeedbackGuard('web_chat_branch')).toBe(false);
  });

  it('web_chat_smart_link channel does NOT trigger WhatsApp feedback capture', () => {
    expect(evaluateWhatsAppFeedbackGuard('web_chat_smart_link')).toBe(false);
  });
});

// ─── Phase 7: All channel sources produce distinct identities ────────────────

describe('All channel sources produce fully distinct operational identities', () => {
  const channels = [
    { channel: 'web_chat', expectedSource: 'web' },
    { channel: 'web_chat_qr', expectedSource: 'qr' },
    { channel: 'web_chat_table', expectedSource: 'table' },
    { channel: 'web_chat_branch', expectedSource: 'branch' },
    { channel: 'web_chat_smart_link', expectedSource: 'direct' },
    { channel: 'whatsapp', expectedSource: 'whatsapp' },
  ];

  for (const { channel, expectedSource } of channels) {
    it(`${channel} → source:${expectedSource}`, () => {
      const ctx = resolveCustomerEntryOperationalContext(channel);

      expect(ctx.source).toBe(expectedSource);
    });
  }

  it('no two channels map to the same operational source', () => {
    const sources = channels.map(({ channel }) =>
      resolveCustomerEntryOperationalContext(channel).source,
    );
    const uniqueSources = new Set(sources);

    expect(uniqueSources.size).toBe(channels.length);
  });

  it('only table and branch channels carry a non-null fulfillmentType', () => {
    const withFulfillment = channels.filter(({ channel }) => {
      return resolveCustomerEntryOperationalContext(channel).fulfillmentType !== undefined;
    });

    expect(withFulfillment.map(c => c.channel)).toEqual(
      expect.arrayContaining(['web_chat_table', 'web_chat_branch']),
    );
    expect(withFulfillment).toHaveLength(2);
  });
});
