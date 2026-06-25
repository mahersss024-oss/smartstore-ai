import { describe, expect, it } from 'vitest';
import { buildMetaOutboundMessage, resolveMetaInteractiveHints } from './MetaInteractiveMessage';

describe('MetaInteractiveMessage', () => {
  describe('buildMetaOutboundMessage', () => {
    it('renders product choices as a list picker with product payload ids', () => {
      const message = buildMetaOutboundMessage({
        replyToCustomer: 'اختر منتجاً',
        suggestedProducts: [
          { id: 15, name: 'برجر دجاج', price: '20.00' },
          { id: 16, name: 'برجر لحم', price: '25.00' },
        ],
        visibleSystemActions: ['product_choices'],
      });

      expect(message.kind).toBe('list');

      if (message.kind === 'list') {
        expect(message.rows).toHaveLength(2);
        expect(message.rows[0]).toMatchObject({ description: '20.00 ريال', id: 'product:15', title: 'برجر دجاج' });
      }
    });

    it('renders fulfillment choices as reply buttons', () => {
      const message = buildMetaOutboundMessage({
        availableFulfillmentTypes: ['delivery', 'pickup'],
        replyToCustomer: 'كيف تستلم؟',
        visibleSystemActions: ['fulfillment_choices'],
      });

      expect(message.kind).toBe('buttons');

      if (message.kind === 'buttons') {
        expect(message.buttons.map(button => button.id)).toEqual(['fulfillment:delivery', 'fulfillment:pickup']);
      }
    });

    it('renders payment choices scoped to the delivery preference', () => {
      const message = buildMetaOutboundMessage({
        availablePaymentKinds: { delivery: ['cash', 'card'], pickup: ['cash'] },
        customerDetails: { deliveryPreference: 'delivery' },
        replyToCustomer: 'الدفع؟',
        visibleSystemActions: ['payment_choices'],
      });

      expect(message.kind).toBe('buttons');

      if (message.kind === 'buttons') {
        expect(message.buttons.map(button => button.id)).toEqual(['payment:cash', 'payment:card']);
      }
    });

    it('renders a single confirmation button', () => {
      const message = buildMetaOutboundMessage({
        replyToCustomer: 'تأكيد؟',
        visibleSystemActions: ['final_confirmation'],
      });

      expect(message.kind).toBe('buttons');

      if (message.kind === 'buttons') {
        expect(message.buttons).toEqual([{ id: 'confirm:order', title: 'تأكيد الطلب' }]);
      }
    });

    it('falls back to text when no interactive element applies', () => {
      const message = buildMetaOutboundMessage({
        replyToCustomer: 'أهلاً بك',
        visibleSystemActions: [],
      });

      expect(message.kind).toBe('text');
      expect(message.body).toContain('أهلاً بك');
    });
  });

  describe('resolveMetaInteractiveHints', () => {
    it('maps a product payload to the selected product id', () => {
      expect(resolveMetaInteractiveHints('product:15')).toEqual({
        selectedProductId: 15,
        systemEvent: { source: 'web_order_ui', type: 'product_selected' },
      });
    });

    it('maps fulfillment payloads', () => {
      expect(resolveMetaInteractiveHints('fulfillment:delivery')?.fulfillmentType).toBe('delivery');
      expect(resolveMetaInteractiveHints('fulfillment:dine_in')?.deliveryPreference).toBe('pickup');
    });

    it('maps payment payloads using the conversation delivery preference', () => {
      expect(resolveMetaInteractiveHints('payment:cash', { customerDetails: { deliveryPreference: 'delivery' } })?.paymentPreference)
        .toBe('cash_on_delivery');
      expect(resolveMetaInteractiveHints('payment:card', { customerDetails: { deliveryPreference: 'pickup' } })?.paymentPreference)
        .toBe('card_on_pickup');
    });

    it('maps the confirmation payload and ignores unknown payloads', () => {
      expect(resolveMetaInteractiveHints('confirm:order')?.customerConfirmedOrder).toBe(true);
      expect(resolveMetaInteractiveHints('unknown:value')).toBeUndefined();
    });
  });
});
