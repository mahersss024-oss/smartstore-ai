import { describe, expect, it } from 'vitest';
import {
  buildTwilioOutboundBody,
  resolveTwilioSemanticHints,
} from './TwilioConversationAdapter';

describe('TwilioConversationAdapter', () => {
  it('maps a unique partial product name to the trusted product selection event', () => {
    expect(resolveTwilioSemanticHints({
      message: 'ابي نص مضغوط',
      metadata: {
        lastSuggestedProducts: [
          {
            availability: 'available',
            id: 15,
            name: 'نص مضغوط دجاج',
            price: '15.00',
          },
        ],
        visibleSystemActions: ['product_choices'],
      },
    })).toEqual({
      selectedProductId: 15,
      systemEvent: {
        source: 'web_order_ui',
        type: 'product_selected',
      },
    });
  });

  it('maps fulfillment and payment text only when the matching step is active', () => {
    expect(resolveTwilioSemanticHints({
      message: 'توصيل',
      metadata: {
        visibleSystemActions: ['fulfillment_choices'],
      },
    })).toMatchObject({
      deliveryPreference: 'delivery',
      fulfillmentType: 'delivery',
    });

    expect(resolveTwilioSemanticHints({
      message: 'كاش',
      metadata: {
        customerDetails: {
          deliveryPreference: 'delivery',
        },
        visibleSystemActions: ['payment_choices'],
      },
    })).toMatchObject({
      paymentPreference: 'cash_on_delivery',
    });
  });

  it('does not treat a bare rejection as an order cancellation', () => {
    expect(resolveTwilioSemanticHints({
      message: 'لا',
      metadata: {
        currentCart: {
          items: [{ name: 'نص مضغوط دجاج', productId: 15 }],
          status: 'collecting',
        },
        visibleSystemActions: ['fulfillment_choices'],
      },
    })).toBeUndefined();
  });

  it('replaces web-only instructions and renders actionable WhatsApp choices', () => {
    expect(buildTwilioOutboundBody({
      availableFulfillmentTypes: ['delivery', 'pickup'],
      availablePaymentKinds: {
        delivery: ['cash', 'card'],
        pickup: ['cash'],
      },
      customerDetails: {},
      replyToCustomer: 'يرجى اختياره من الخيارات الظاهرة على الشاشة لإضافته.',
      suggestedProducts: [{
        availability: 'available',
        id: 15,
        name: 'نص مضغوط دجاج',
        price: '15.00',
      }],
      visibleSystemActions: ['product_choices'],
    })).toBe(
      'يرجى اختياره من الخيارات التالية لإضافته.\n\n'
      + 'لإضافة المنتج، اكتب اسمه كما هو:\n'
      + '1. نص مضغوط دجاج - 15.00 ريال',
    );
  });

  it('renders the current checkout action instead of referring to hidden web UI', () => {
    expect(buildTwilioOutboundBody({
      availableFulfillmentTypes: ['delivery', 'pickup'],
      customerDetails: {},
      replyToCustomer: 'السلة جاهزة.',
      visibleSystemActions: ['fulfillment_choices'],
    })).toContain('توصيل | استلام من الفرع');

    expect(buildTwilioOutboundBody({
      availablePaymentKinds: {
        delivery: ['cash', 'card'],
        pickup: ['cash'],
      },
      customerDetails: {
        deliveryPreference: 'delivery',
      },
      replyToCustomer: 'اختر طريقة الدفع.',
      visibleSystemActions: ['payment_choices'],
    })).toContain('كاش | بطاقة');
  });
});
