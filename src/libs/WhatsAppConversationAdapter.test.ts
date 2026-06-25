import { describe, expect, it } from 'vitest';
import {
  buildWhatsAppOutboundBody,
  resolveWhatsAppSemanticHints,
} from './WhatsAppConversationAdapter';

describe('WhatsAppConversationAdapter', () => {
  it('maps a unique partial product name to the trusted product selection event', () => {
    expect(resolveWhatsAppSemanticHints({
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

  it('maps a numeric reply to the suggestion at that position', () => {
    const metadata = {
      lastSuggestedProducts: [
        { availability: 'available' as const, id: 11, name: 'برجر دجاج', price: '15.00' },
        { availability: 'available' as const, id: 22, name: 'برجر لحم', price: '20.00' },
      ],
      visibleSystemActions: ['product_choices' as const],
    };

    expect(resolveWhatsAppSemanticHints({ message: '2', metadata })?.selectedProductId).toBe(22);
    expect(resolveWhatsAppSemanticHints({ message: '١', metadata })?.selectedProductId).toBe(11);
    expect(resolveWhatsAppSemanticHints({ message: 'رقم 2', metadata })?.selectedProductId).toBe(22);
    expect(resolveWhatsAppSemanticHints({ message: 'الخيار ١.', metadata })?.selectedProductId).toBe(11);
  });

  it('ignores out-of-range numbers and quantities embedded in a sentence', () => {
    const metadata = {
      lastSuggestedProducts: [
        { availability: 'available' as const, id: 11, name: 'برجر دجاج', price: '15.00' },
        { availability: 'available' as const, id: 22, name: 'برجر لحم', price: '20.00' },
      ],
      visibleSystemActions: ['product_choices' as const],
    };

    // Out of range → no numeric selection (and no unique name match) → undefined.
    expect(resolveWhatsAppSemanticHints({ message: '9', metadata })).toBeUndefined();
    // A quantity inside a sentence must not be read as choosing option #2.
    expect(resolveWhatsAppSemanticHints({ message: 'ابي ٢ برجر دجاج', metadata })?.selectedProductId).not.toBe(22);
  });

  it('maps fulfillment and payment text only when the matching step is active', () => {
    expect(resolveWhatsAppSemanticHints({
      message: 'توصيل',
      metadata: {
        visibleSystemActions: ['fulfillment_choices'],
      },
    })).toMatchObject({
      deliveryPreference: 'delivery',
      fulfillmentType: 'delivery',
    });

    expect(resolveWhatsAppSemanticHints({
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
    expect(resolveWhatsAppSemanticHints({
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

  it('maps a product name preceded by an affirmative word to the product selection event', () => {
    expect(resolveWhatsAppSemanticHints({
      message: 'ايوه نص مضغوط',
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

  it('replaces web-only instructions and renders actionable WhatsApp choices', () => {
    expect(buildWhatsAppOutboundBody({
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

  it('replaces "الخيارات الظاهرة لك قدامك على الشاشة" and "بالضغط عليها" patterns', () => {
    const result = buildWhatsAppOutboundBody({
      replyToCustomer: 'لاحظت الخيارات الظاهرة لك قدامك على الشاشة—تقدر تختار نص مضغوط دجاج بالضغط عليها.',
      suggestedProducts: [{
        availability: 'available',
        id: 15,
        name: 'نص مضغوط دجاج',
        price: '15.00',
      }],
      visibleSystemActions: ['product_choices'],
    });

    expect(result).not.toContain('الشاشة');
    expect(result).not.toContain('قدامك');
    expect(result).not.toContain('بالضغط');
    expect(result).toContain('الخيارات التالية');
  });

  it('replaces "من الخيارات الظاهرة لك" without leaving trailing "لك"', () => {
    const result = buildWhatsAppOutboundBody({
      replyToCustomer: 'اختر المنتج المناسب من الخيارات الظاهرة لك، أو اكتب توضيحاً.',
      visibleSystemActions: [],
    });

    expect(result).not.toContain('الظاهرة');
    expect(result).toContain('من الخيارات التالية');
    expect(result).not.toMatch(/التاليةلك/);
  });

  it('renders the current checkout action instead of referring to hidden web UI', () => {
    expect(buildWhatsAppOutboundBody({
      availableFulfillmentTypes: ['delivery', 'pickup'],
      customerDetails: {},
      replyToCustomer: 'السلة جاهزة.',
      visibleSystemActions: ['fulfillment_choices'],
    })).toContain('توصيل | استلام من الفرع');

    expect(buildWhatsAppOutboundBody({
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
