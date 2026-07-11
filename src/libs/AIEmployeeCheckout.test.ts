import { describe, expect, it } from 'vitest';
import {
  applyAIEmployeeCartPricing,
  calculateAIEmployeeOrderPricing,
  constrainAIEmployeeSemanticUnderstandingToStoreMethods,
  extractAIEmployeeCustomerDetails,
  getAIEmployeeDeliveryCustomerAddress,
  getAllowedAIEmployeeDeliveryPreferences,
  getAllowedAIEmployeePaymentPreferences,
  getAvailableAIEmployeeServiceChoices,
  getMissingAIEmployeeOrderDetails,
  normalizeAIEmployeeFulfillmentType,
} from './AIEmployeeCheckout';

describe('AIEmployeeCheckout', () => {
  it('normalizes fulfillment without language-specific matching', () => {
    expect(normalizeAIEmployeeFulfillmentType('dine_in', 'pickup')).toBe('dine_in');
    expect(normalizeAIEmployeeFulfillmentType(undefined, 'delivery')).toBe('delivery');
  });

  it('keeps delivery addresses only for delivery orders', () => {
    const mapUrl = 'https://www.google.com/maps?q=24.713552,46.675296';
    const delivery = extractAIEmployeeCustomerDetails(
      undefined,
      'contact@example.com 0500000000',
      { name: 'Customer' },
      mapUrl,
      { deliveryPreference: 'delivery' },
    );
    const pickup = extractAIEmployeeCustomerDetails(
      delivery,
      '',
      {},
      undefined,
      { deliveryPreference: 'pickup' },
    );

    expect(delivery).toMatchObject({
      address: mapUrl,
      deliveryPreference: 'delivery',
      email: 'contact@example.com',
      name: 'Customer',
      phone: '0500000000',
    });
    expect(pickup.address).toBeUndefined();
    expect(getAIEmployeeDeliveryCustomerAddress(pickup)).toBeUndefined();
  });

  it('adds the configured delivery fee exactly once', () => {
    const cart = applyAIEmployeeCartPricing(
      {
        items: [],
        status: 'collecting',
        subtotal: 40,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      {
        customerDetails: {
          deliveryPreference: 'delivery',
          fulfillmentType: 'delivery',
        },
        storeContext: {
          deliveryMethods: [{
            fee: '20',
            type: 'local_delivery',
          }],
          paymentMethods: [],
        } as never,
      },
    );

    expect(cart).toMatchObject({
      deliveryFee: 20,
      subtotal: 40,
      total: 60,
    });
  });

  it('reports missing checkout facts as structured needs', () => {
    expect(getMissingAIEmployeeOrderDetails({
      cart: {
        items: [{
          name: 'Product',
          productId: 1,
          quantity: 1,
          unitPrice: 10,
        }],
      },
      customerDetails: {
        deliveryPreference: 'delivery',
        phone: '0500000000',
      },
    })).toEqual(['delivery_address', 'payment_method']);
  });

  it('derives customer-facing service choices from active store methods', () => {
    expect(getAvailableAIEmployeeServiceChoices({
      deliveryMethods: [
        { type: 'local_delivery' },
        { type: 'pickup' },
        { type: 'dine_in' },
      ],
      paymentMethods: [
        {
          provider: 'cash_on_pickup',
          supportedDeliveryPreferences: ['pickup'],
        },
        {
          provider: 'card_on_delivery',
          supportedDeliveryPreferences: ['delivery'],
        },
      ],
    } as never)).toEqual({
      availableFulfillmentTypes: ['delivery', 'pickup', 'dine_in'],
      availablePaymentKinds: {
        delivery: ['card'],
        pickup: ['cash'],
      },
    });
  });

  it('maps all supported delivery and payment methods without duplicates', () => {
    const context = {
      deliveryMethods: [
        { type: 'scheduled_delivery' },
        { type: 'courier_shipping' },
        { type: 'digital' },
        { type: 'curbside_pickup' },
      ],
      paymentMethods: [
        {
          provider: 'cash_on_delivery',
          supportedDeliveryPreferences: ['delivery'],
        },
        {
          provider: 'card_on_delivery',
          supportedDeliveryPreferences: ['delivery'],
        },
        {
          provider: 'cash_on_pickup',
          supportedDeliveryPreferences: ['pickup'],
        },
      ],
    } as never;

    expect(getAllowedAIEmployeeDeliveryPreferences(context)).toEqual([
      'delivery',
      'pickup',
    ]);
    expect(getAllowedAIEmployeePaymentPreferences(context, 'delivery')).toEqual([
      'cash_on_delivery',
      'card_on_delivery',
    ]);
    expect(getAllowedAIEmployeePaymentPreferences(context, 'pickup')).toEqual([
      'cash_on_pickup',
    ]);
    expect(getAllowedAIEmployeePaymentPreferences(context)).toEqual([
      'cash_on_delivery',
      'card_on_delivery',
      'cash_on_pickup',
    ]);
  });

  it('calculates pricing from fulfillment priority and clamps invalid fees', () => {
    const context = {
      deliveryMethods: [
        { fee: '4', type: 'curbside_pickup' },
        { fee: '8', type: 'pickup' },
        { fee: '12', type: 'scheduled_delivery' },
      ],
      paymentMethods: [],
    } as never;

    expect(calculateAIEmployeeOrderPricing({
      customerDetails: {
        deliveryPreference: 'pickup',
        fulfillmentType: 'pickup',
      },
      storeContext: context,
      subtotal: 20,
    })).toEqual({
      deliveryFee: 8,
      subtotal: 20,
      total: 28,
    });
    expect(calculateAIEmployeeOrderPricing({
      deliveryFee: '-9',
      subtotal: 20,
    })).toEqual({
      deliveryFee: 0,
      subtotal: 20,
      total: 20,
    });
    expect(applyAIEmployeeCartPricing(undefined, {
      storeContext: context,
    })).toBeUndefined();
  });

  it('filters unknown service providers and methods without exposing unusable choices', () => {
    expect(getAvailableAIEmployeeServiceChoices({
      deliveryMethods: [
        { type: 'local_delivery' },
        { type: 'unsupported' },
        { type: 'dine_in' },
      ],
      paymentMethods: [
        {
          provider: 'bank_transfer',
          supportedDeliveryPreferences: ['delivery'],
        },
        {
          provider: 'card_on_pickup',
          supportedDeliveryPreferences: ['pickup', 'pickup'],
        },
      ],
    } as never)).toEqual({
      availableFulfillmentTypes: ['dine_in'],
      availablePaymentKinds: {
        delivery: [],
        pickup: ['card'],
      },
    });
  });

  it('constrains model-selected checkout methods to active store configuration', () => {
    const context = {
      deliveryMethods: [{ type: 'pickup' }],
      paymentMethods: [{
        provider: 'cash_on_pickup',
        supportedDeliveryPreferences: ['pickup'],
      }],
    } as never;

    expect(constrainAIEmployeeSemanticUnderstandingToStoreMethods({
      deliveryPreference: 'delivery',
      fulfillmentType: 'delivery',
      paymentPreference: 'card_on_delivery',
    }, context)).toMatchObject({
      deliveryPreference: undefined,
      fulfillmentType: 'delivery',
      paymentPreference: undefined,
    });
    expect(constrainAIEmployeeSemanticUnderstandingToStoreMethods({
      deliveryPreference: 'pickup',
      fulfillmentType: 'pickup',
      paymentPreference: 'cash_on_pickup',
    }, context)).toMatchObject({
      deliveryPreference: 'pickup',
      fulfillmentType: 'pickup',
      paymentPreference: 'cash_on_pickup',
    });
  });

  it('uses shared location only for delivery addresses and preserves identity fallbacks', () => {
    const details = extractAIEmployeeCustomerDetails(
      {
        address: 'https://www.google.com/maps?q=28.356449,36.535398',
        email: 'old@example.com',
        name: 'Old name',
        phone: '0500000000',
      },
      'no new identity',
      {},
      undefined,
      {
        customerAddress: 'Al Nahdah',
        customerName: 'New name',
        deliveryPreference: 'delivery',
      },
    );

    expect(details).toMatchObject({
      address: 'https://www.google.com/maps?q=28.356449,36.535398',
      email: 'old@example.com',
      name: 'New name',
      phone: '0500000000',
    });
    expect(getAIEmployeeDeliveryCustomerAddress(details, 'Fallback')).toBe(details.address);
    expect(getAIEmployeeDeliveryCustomerAddress({
      deliveryPreference: 'delivery',
    }, ' Fallback ')).toBeUndefined();
    expect(getAIEmployeeDeliveryCustomerAddress({
      deliveryPreference: 'delivery',
    }, ' https://www.google.com/maps?q=24.713552,46.675296 ')).toBe(
      'https://www.google.com/maps?q=24.713552,46.675296',
    );
  });

  it('accepts a newly shared map URL as the delivery address', () => {
    const mapUrl = 'https://www.google.com/maps?q=24.713552,46.675296';
    const details = extractAIEmployeeCustomerDetails(
      undefined,
      'موقعي الحالي',
      {},
      mapUrl,
      {
        deliveryPreference: 'delivery',
      },
    );

    expect(details.address).toBe(mapUrl);
  });

  it('reports every missing checkout requirement for an empty order', () => {
    expect(getMissingAIEmployeeOrderDetails({})).toEqual([
      'requested_product',
      'customer_phone',
      'fulfillment_method',
      'payment_method',
    ]);
  });
});
