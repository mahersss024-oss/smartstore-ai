import { describe, expect, it } from 'vitest';
import { buildAIEmployeeSystemEventContext } from './AIEmployeeSystemEventBridge';

describe('AIEmployeeSystemEventBridge', () => {
  it('describes product selections as internal customer turns', () => {
    expect(buildAIEmployeeSystemEventContext(
      {
        selectedProductId: 15,
        systemEvent: {
          source: 'web_order_ui',
          type: 'product_selected',
        },
      },
      {
        findProductName: productId => (productId === 15 ? 'Mandi chicken' : undefined),
      },
    )).toEqual({
      customerMeaning: 'The customer selected "Mandi chicken" from the visible product choices.',
      source: 'web_order_ui',
      type: 'product_selected',
    });
  });

  it('describes cart quantity changes without exposing UI internals to the customer', () => {
    expect(buildAIEmployeeSystemEventContext(
      {
        replaceExistingQuantity: true,
        requestedQuantity: 3,
        selectedProductId: 7,
        systemEvent: {
          source: 'web_order_ui',
          type: 'cart_quantity_changed',
        },
      },
      {
        findCartItemName: productId => (productId === 7 ? 'Kabsa meat' : undefined),
      },
    )?.customerMeaning).toBe('The customer changed "Kabsa meat" quantity to 3 using cart controls.');
  });

  it('describes starting a new order instead of restoring a cancelled cart', () => {
    expect(buildAIEmployeeSystemEventContext({
      startNewOrder: true,
      systemEvent: {
        source: 'web_order_ui',
        type: 'new_order_started',
      },
    })).toEqual({
      customerMeaning: 'The customer chose to start a new order instead of restoring the cancelled cart.',
      source: 'web_order_ui',
      type: 'new_order_started',
    });
  });

  it('ignores ordinary semantic hints when no platform UI event exists', () => {
    expect(buildAIEmployeeSystemEventContext({
      deliveryPreference: 'delivery',
      fulfillmentType: 'delivery',
    })).toBeUndefined();
  });

  it('describes a cart_item_removed event with the item name', () => {
    expect(buildAIEmployeeSystemEventContext(
      { removeCartItemProductId: 3, systemEvent: { source: 'web_order_ui', type: 'cart_item_removed' } },
      { findCartItemName: id => (id === 3 ? 'Bread' : undefined) },
    )?.customerMeaning).toContain('"Bread"');
  });

  it('describes a cart_item_removed event without a name when the product is not found', () => {
    expect(buildAIEmployeeSystemEventContext(
      { removeCartItemProductId: 99, systemEvent: { source: 'web_order_ui', type: 'cart_item_removed' } },
      {},
    )?.customerMeaning).toContain('removed an item');
  });

  it('describes a cart_restored event', () => {
    expect(buildAIEmployeeSystemEventContext({
      systemEvent: { source: 'web_order_ui', type: 'cart_restored' },
    })?.customerMeaning).toContain('restored');
  });

  it('describes fulfillment_selected as delivery when deliveryPreference is set', () => {
    expect(buildAIEmployeeSystemEventContext({
      deliveryPreference: 'delivery',
      systemEvent: { source: 'web_order_ui', type: 'fulfillment_selected' },
    })?.customerMeaning).toContain('delivery');
  });

  it('describes fulfillment_selected as dine-in', () => {
    expect(buildAIEmployeeSystemEventContext({
      fulfillmentType: 'dine_in',
      systemEvent: { source: 'web_order_ui', type: 'fulfillment_selected' },
    })?.customerMeaning).toContain('dine-in');
  });

  it('describes fulfillment_selected as pickup when no delivery or dine-in is specified', () => {
    expect(buildAIEmployeeSystemEventContext({
      fulfillmentType: 'pickup',
      systemEvent: { source: 'web_order_ui', type: 'fulfillment_selected' },
    })?.customerMeaning).toContain('pickup');
  });

  it('describes a location_shared event', () => {
    expect(buildAIEmployeeSystemEventContext({
      systemEvent: { source: 'web_order_ui', type: 'location_shared' },
    })?.customerMeaning).toContain('location');
  });

  it('describes payment_selected with card payment', () => {
    expect(buildAIEmployeeSystemEventContext({
      paymentPreference: 'card_on_delivery',
      systemEvent: { source: 'web_order_ui', type: 'payment_selected' },
    })?.customerMeaning).toContain('card payment');
  });

  it('describes payment_selected with cash payment', () => {
    expect(buildAIEmployeeSystemEventContext({
      paymentPreference: 'cash_on_delivery',
      systemEvent: { source: 'web_order_ui', type: 'payment_selected' },
    })?.customerMeaning).toContain('cash payment');
  });

  it('describes an order_confirmed event', () => {
    expect(buildAIEmployeeSystemEventContext({
      systemEvent: { source: 'web_order_ui', type: 'order_confirmed' },
    })?.customerMeaning).toContain('confirmed');
  });

  it('describes an order_cancelled event', () => {
    expect(buildAIEmployeeSystemEventContext({
      systemEvent: { source: 'web_order_ui', type: 'order_cancelled' },
    })?.customerMeaning).toContain('cancelled');
  });

  it('describes product_selected without a name when the lookup returns nothing', () => {
    expect(buildAIEmployeeSystemEventContext(
      { selectedProductId: 5, systemEvent: { source: 'web_order_ui', type: 'product_selected' } },
      {},
    )?.customerMeaning).toContain('selected a product');
  });

  it('describes cart_quantity_changed without a name when the lookup returns nothing', () => {
    expect(buildAIEmployeeSystemEventContext(
      { requestedQuantity: 2, selectedProductId: 5, systemEvent: { source: 'web_order_ui', type: 'cart_quantity_changed' } },
      {},
    )?.customerMeaning).toContain('an item quantity to 2');
  });
});
