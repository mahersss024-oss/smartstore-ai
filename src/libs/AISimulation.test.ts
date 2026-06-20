import { describe, expect, it } from 'vitest';
import { normalizeAIEmployeeSettings } from './AIEmployeeSettings';
import { matchAISimulationProducts, simulateAIEmployeeReply } from './AISimulation';

describe('AISimulation', () => {
  it('matches products from names, categories, descriptions, and tags', () => {
    const products = [
      {
        availability: 'available' as const,
        brand: undefined,
        category: 'Drinks',
        description: 'Hot coffee with milk',
        id: 1,
        image: null,
        name: 'Latte',
        price: '14.00',
        productType: undefined,
        tags: ['morning'],
        unit: undefined,
      },
      {
        availability: 'available' as const,
        brand: undefined,
        category: 'Bakery',
        description: 'Butter croissant',
        id: 2,
        image: null,
        name: 'Croissant',
        price: '9.00',
        productType: undefined,
        tags: ['breakfast'],
        unit: undefined,
      },
    ];

    expect(matchAISimulationProducts(products, 'I want hot coffee')).toMatchObject([
      { name: 'Latte' },
    ]);
  });

  it('does not match products from partial words inside the customer message', () => {
    const products = [
      {
        availability: 'available' as const,
        brand: undefined,
        category: 'Sides',
        description: 'Fresh q002 option',
        id: 1,
        image: null,
        name: 'p001 q002',
        price: '7.00',
        productType: undefined,
        tags: ['q002'],
        unit: undefined,
      },
    ];

    expect(matchAISimulationProducts(products, 'x000 q002x')).toEqual([]);
  });

  it('keeps the same relevance order used by the real conversation engine', () => {
    const products = [
      {
        availability: 'available' as const,
        brand: undefined,
        category: 'Drinks',
        description: 'Cold coffee',
        id: 1,
        image: null,
        name: 'Coffee drink',
        price: '8.00',
        productType: undefined,
        tags: [],
        unit: undefined,
      },
      {
        availability: 'available' as const,
        brand: undefined,
        category: 'Drinks',
        description: 'Hot coffee with milk',
        id: 2,
        image: null,
        name: 'Hot latte',
        price: '14.00',
        productType: undefined,
        tags: [],
        unit: undefined,
      },
    ];

    expect(matchAISimulationProducts(products, 'hot coffee')).toMatchObject([
      { id: 2 },
      { id: 1 },
    ]);
  });
});

const makeProduct = (id: number, name: string) => ({
  availability: 'available' as const,
  brand: undefined,
  category: 'Food',
  description: name,
  id,
  image: null,
  name,
  price: '10.00',
  productType: undefined,
  tags: [],
  unit: undefined,
});

const baseContext = {
  aiSettings: normalizeAIEmployeeSettings(undefined),
  conversation: null,
  knowledgeBase: {},
  organizationId: 'org_test',
  store: {
    businessType: undefined,
    currency: 'SAR',
    description: null,
    location: {},
    name: 'Test Store',
    timezone: 'Asia/Riyadh',
    welcomeMessage: null,
  },
};

describe('simulateAIEmployeeReply', () => {
  it('returns simulation_result_ready with a matched product when catalog has no delivery or payment methods', () => {
    const result = simulateAIEmployeeReply(
      {
        ...baseContext,
        catalog: [makeProduct(1, 'Shawarma')],
        deliveryMethods: [],
        paymentMethods: [],
      },
      'I want Shawarma',
    );

    expect(result.reply).toBe('simulation_result_ready');
    expect(result.recommendedProducts).toMatchObject([{ name: 'Shawarma' }]);
    expect(result.missingDetails).not.toContain('product');
    expect(result.missingDetails).not.toContain('delivery_preference');
    expect(result.missingDetails).not.toContain('payment_method');
  });

  it('includes product in missingDetails when no products match the message', () => {
    const result = simulateAIEmployeeReply(
      {
        ...baseContext,
        catalog: [makeProduct(1, 'Burger')],
        deliveryMethods: [],
        paymentMethods: [],
      },
      'hello',
    );

    expect(result.missingDetails).toContain('product');
    expect(result.recommendedProducts).toHaveLength(0);
  });

  it('includes delivery_preference in missingDetails when delivery methods exist', () => {
    const result = simulateAIEmployeeReply(
      {
        ...baseContext,
        catalog: [makeProduct(1, 'Pizza')],
        deliveryMethods: [{ config: null, displayName: 'Delivery', estimatedTime: null, fee: '10', type: 'delivery' }],
        paymentMethods: [],
      },
      'I want pizza',
    );

    expect(result.missingDetails).toContain('delivery_preference');
  });

  it('includes payment_method in missingDetails when payment methods exist', () => {
    const result = simulateAIEmployeeReply(
      {
        ...baseContext,
        catalog: [makeProduct(1, 'Falafel')],
        deliveryMethods: [],
        paymentMethods: [{ displayName: 'Cash', provider: 'cash', safeInstructions: null, supportedDeliveryPreferences: [], type: 'cash' }],
      },
      'I want falafel',
    );

    expect(result.missingDetails).toContain('payment_method');
  });

  it('caps recommended products at 4 even when more match', () => {
    const catalog = Array.from({ length: 6 }, (_, i) => makeProduct(i + 1, `Coffee ${i + 1}`));

    const result = simulateAIEmployeeReply(
      {
        ...baseContext,
        catalog,
        deliveryMethods: [],
        paymentMethods: [],
      },
      'coffee',
    );

    expect(result.recommendedProducts.length).toBeLessThanOrEqual(4);
  });
});
