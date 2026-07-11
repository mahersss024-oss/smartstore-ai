import { describe, expect, it } from 'vitest';
import { aiEmployeeSemanticHintsSchema } from './AIEmployeeSemanticHints';

describe('AIEmployeeSemanticHints', () => {
  it('accepts system controlled fulfillment, payment, and confirmation hints', () => {
    expect(aiEmployeeSemanticHintsSchema.parse({
      customerAddress: 'https://www.google.com/maps?q=28.356449,36.535398',
      customerConfirmedOrder: true,
      deliveryPreference: 'pickup',
      fulfillmentType: 'dine_in',
      paymentPreference: 'card_on_pickup',
      replaceExistingQuantity: true,
      requestedQuantity: 2,
      removeCartItemProductId: 456,
      restoreCancelledCart: true,
      selectedProductId: 123,
      startNewOrder: true,
      tableNumber: 'A12',
      systemEvent: {
        source: 'web_order_ui',
        type: 'new_order_started',
      },
    })).toEqual({
      customerAddress: 'https://www.google.com/maps?q=28.356449,36.535398',
      customerConfirmedOrder: true,
      deliveryPreference: 'pickup',
      fulfillmentType: 'dine_in',
      paymentPreference: 'card_on_pickup',
      replaceExistingQuantity: true,
      requestedQuantity: 2,
      removeCartItemProductId: 456,
      restoreCancelledCart: true,
      selectedProductId: 123,
      startNewOrder: true,
      tableNumber: 'A12',
      systemEvent: {
        source: 'web_order_ui',
        type: 'new_order_started',
      },
    });
  });

  it('rejects unsupported payment preferences', () => {
    expect(() => aiEmployeeSemanticHintsSchema.parse({
      paymentPreference: 'bank_transfer',
    })).toThrow();
  });

  it('rejects unsupported fulfillment labels', () => {
    expect(() => aiEmployeeSemanticHintsSchema.parse({
      fulfillmentType: 'local',
    })).toThrow();
  });
});
