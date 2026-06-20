import { describe, expect, it } from 'vitest';
import {
  buildConversationDecision,
  extractConversationRating,
  findAlternativeProducts,
  findUnavailableRequestedProduct,
  isAlternativeRequest,
  matchConversationCatalogItems,
  matchExplicitConversationCatalogItems,
} from './ConversationEngine';

describe('ConversationEngine', () => {
  it('matches customer messages against the store catalog', () => {
    const items = matchConversationCatalogItems([
      {
        category: 'Drinks',
        description: 'Hot coffee with milk',
        id: 1,
        name: 'Latte',
        price: '14.00',
        tags: ['morning'],
      },
    ], 'I want hot coffee');

    expect(items).toEqual([
      {
        name: 'Latte',
        productId: 1,
        quantity: 1,
        unitPrice: 14,
      },
    ]);
  });

  it('does not add products to the cart from description-only matches', () => {
    const catalog = [
      {
        category: 'Add-ons',
        description: 'Good side option with rice',
        id: 1,
        name: 'Yogurt',
        price: '2.00',
      },
    ];

    expect(matchConversationCatalogItems(catalog, 'I want a good side option')).toEqual([
      {
        name: 'Yogurt',
        productId: 1,
        quantity: 1,
        unitPrice: 2,
      },
    ]);
    expect(matchExplicitConversationCatalogItems(catalog, 'I want a good side option')).toEqual([]);
    expect(matchExplicitConversationCatalogItems(catalog, 'Add Yogurt')).toEqual([]);
    expect(matchExplicitConversationCatalogItems(catalog, 'Yogurt')).toEqual([
      {
        name: 'Yogurt',
        productId: 1,
        quantity: 1,
        unitPrice: 2,
      },
    ]);
  });

  it('prefers the exact product name over shared words and tags', () => {
    const items = matchConversationCatalogItems([
      {
        category: 'Salads',
        id: 1,
        name: 'Green salad',
        price: '8.00',
        tags: ['salad', 'greens'],
      },
      {
        category: 'Salads',
        id: 2,
        name: 'Spicy salad',
        price: '5.00',
        tags: ['salad', 'spicy'],
      },
      {
        category: 'Salads',
        id: 3,
        name: 'Cucumber yogurt salad',
        price: '7.00',
        tags: ['salad', 'cucumber', 'yogurt'],
      },
      {
        category: 'Drinks',
        id: 4,
        name: 'Yogurt drink',
        price: '4.00',
        tags: ['yogurt', 'drink'],
      },
    ], 'Cucumber yogurt salad');

    expect(items).toEqual([
      {
        name: 'Cucumber yogurt salad',
        productId: 3,
        quantity: 1,
        unitPrice: 7,
      },
    ]);
  });

  it('does not replace a complete short product request with a longer containing product', () => {
    const catalog = [
      {
        category: 'Drinks',
        id: 1,
        name: 'p001',
        price: '4.00',
      },
      {
        category: 'Salads',
        id: 2,
        name: 'x002 y003 p001',
        price: '7.00',
      },
    ];

    expect(matchConversationCatalogItems(catalog, 'p001')).toEqual([
      {
        name: 'p001',
        productId: 1,
        quantity: 1,
        unitPrice: 4,
      },
    ]);
    expect(matchExplicitConversationCatalogItems(catalog, 'p001')).toEqual([
      {
        name: 'p001',
        productId: 1,
        quantity: 1,
        unitPrice: 4,
      },
    ]);
  });

  it('does not treat a close single-token product as the requested qualified product', () => {
    const catalog = [
      {
        category: 'Drinks',
        id: 1,
        name: 'Pepsi',
        price: '5.00',
        productType: 'Soda',
      },
    ];

    expect(matchExplicitConversationCatalogItems(catalog, 'Diet Pepsi')).toEqual([]);
    expect(matchExplicitConversationCatalogItems(catalog, 'Pepsi')).toEqual([
      {
        name: 'Pepsi',
        productId: 1,
        quantity: 1,
        unitPrice: 5,
      },
    ]);
  });

  it('never matches unavailable catalog products into cart items', () => {
    const catalog = [
      {
        availability: 'unavailable' as const,
        category: 'Drinks',
        id: 1,
        name: 'Diet Pepsi',
        price: '5.00',
      },
      {
        availability: 'available' as const,
        category: 'Drinks',
        id: 2,
        name: 'Pepsi',
        price: '5.00',
      },
    ];

    expect(matchConversationCatalogItems(catalog, 'Diet Pepsi')).toEqual([]);
    expect(matchExplicitConversationCatalogItems(catalog, 'Diet Pepsi')).toEqual([]);
  });

  it('separates similar names when product metadata clarifies the type', () => {
    const catalog = [
      {
        category: 'Drinks',
        id: 1,
        name: 'Yogurt drink',
        price: '4.00',
        productType: 'Drink',
        tags: ['yogurt'],
      },
      {
        category: 'Salads',
        id: 2,
        name: 'Cucumber yogurt salad',
        price: '7.00',
        productType: 'Salad',
        tags: ['yogurt', 'cucumber'],
      },
    ];

    expect(matchExplicitConversationCatalogItems(catalog, 'Yogurt drink')).toEqual([
      {
        name: 'Yogurt drink',
        productId: 1,
        quantity: 1,
        unitPrice: 4,
      },
    ]);
    expect(matchExplicitConversationCatalogItems(catalog, 'Cucumber yogurt salad')).toEqual([
      {
        name: 'Cucumber yogurt salad',
        productId: 2,
        quantity: 1,
        unitPrice: 7,
      },
    ]);
  });

  it('normalizes script variants before falling back to shared product tokens', () => {
    const firstVariantName = '\u0633\u0629 \u0644\u0627';
    const secondVariantMessage = '\u0633\u0647 \u0644\u0627';
    const items = matchConversationCatalogItems([
      {
        category: 'Meals',
        id: 1,
        name: firstVariantName,
        price: '28.00',
      },
      {
        category: 'Meals',
        id: 2,
        name: 'x001 y002',
        price: '27.00',
      },
    ], secondVariantMessage);

    expect(items).toEqual([
      {
        name: firstVariantName,
        productId: 1,
        quantity: 1,
        unitPrice: 28,
      },
    ]);
  });

  it('matches exact product names when the customer reverses word order', () => {
    const items = matchConversationCatalogItems([
      {
        category: 'Meals',
        id: 1,
        name: 'q002 p001',
        price: '27.00',
      },
      {
        category: 'Meals',
        id: 2,
        name: 'r003 p001',
        price: '28.00',
      },
    ], 'p001 q002');

    expect(items).toEqual([
      {
        name: 'q002 p001',
        productId: 1,
        quantity: 1,
        unitPrice: 27,
      },
    ]);
  });

  it('prefers the more specific product when its name contains generic product tokens', () => {
    const items = matchConversationCatalogItems([
      {
        category: 'Meals',
        id: 1,
        name: 'q002 p001',
        price: '27.00',
      },
      {
        category: 'Meals',
        id: 2,
        name: 'x001 p001 q002',
        price: '15.00',
      },
      {
        category: 'Meals',
        id: 3,
        name: 'y001 q002 z003',
        price: '45.00',
      },
    ], 'x001 p001 q002');

    expect(items).toEqual([
      {
        name: 'x001 p001 q002',
        productId: 2,
        quantity: 1,
        unitPrice: 15,
      },
    ]);
  });

  it('does not match a product from a partial word inside another customer word', () => {
    const items = matchConversationCatalogItems([
      {
        category: 'Salads',
        id: 1,
        name: 'p001 q002 r003',
        price: '7.00',
        tags: ['q002'],
      },
    ], 'x000 q002x');

    expect(items).toEqual([]);
  });

  it('creates order decisions only after customer confirmation', () => {
    const decision = buildConversationDecision({
      customerConfirmedOrder: true,
      items: [
        {
          name: 'Latte',
          productId: 1,
          quantity: 1,
          unitPrice: 14,
        },
      ],
      message: 'I want Latte',
      storeName: 'Demo Store',
    });

    expect(decision.intent).toBe('order_request');
    expect(decision.reply).toBe('internal_decision_only');
    expect(decision.shouldCreateDraftOrder).toBe(true);
  });

  it('extracts explicit numeric review ratings only', () => {
    expect(extractConversationRating('5 stars')).toBe(5);
    expect(extractConversationRating('great service')).toBeNull();
  });

  it('finds unavailable products and available alternatives from catalog facts', () => {
    const catalog = [
      {
        availability: 'unavailable' as const,
        category: 'Drinks',
        id: 1,
        image: '/uploads/diet-pepsi.png',
        name: 'Diet Pepsi',
        price: '5.00',
        tags: ['soda'],
      },
      {
        availability: 'available' as const,
        category: 'Drinks',
        id: 2,
        image: '/uploads/pepsi.png',
        name: 'Pepsi',
        price: '5.00',
        tags: ['soda'],
      },
      {
        availability: 'available' as const,
        category: 'Drinks',
        id: 3,
        image: '/uploads/cola.png',
        name: 'Coca-Cola',
        price: '5.00',
        tags: ['soda'],
      },
    ];
    const unavailableProduct = findUnavailableRequestedProduct(catalog, 'Do you have Diet Pepsi?');

    expect(unavailableProduct?.name).toBe('Diet Pepsi');
    expect(findAlternativeProducts(catalog, unavailableProduct!)).toMatchObject([
      { image: '/uploads/pepsi.png', name: 'Pepsi' },
      { image: '/uploads/cola.png', name: 'Coca-Cola' },
    ]);
    expect(findAlternativeProducts(catalog, unavailableProduct!, [2])).toMatchObject([
      { image: '/uploads/cola.png', name: 'Coca-Cola' },
    ]);
  });

  it('does not infer alternative intent from fixed wording lists', () => {
    expect(isAlternativeRequest('show me another alternative')).toBe(false);
  });

  it('returns internal decisions when a requested product is unavailable', () => {
    const decision = buildConversationDecision({
      items: [],
      message: 'Do you have Diet Pepsi?',
      storeName: 'Demo Store',
      suggestedProducts: [
        {
          availability: 'available',
          category: 'Drinks',
          id: 2,
          image: '/uploads/pepsi.png',
          name: 'Pepsi',
          price: '5.00',
        },
      ],
      unavailableProduct: {
        availability: 'unavailable',
        category: 'Drinks',
        id: 1,
        image: '/uploads/diet-pepsi.png',
        name: 'Diet Pepsi',
        price: '5.00',
      },
    });

    expect(decision.reply).toBe('internal_decision_only');
    expect(decision.shouldCreateDraftOrder).toBe(false);
    expect(decision.suggestedProducts).toMatchObject([{ name: 'Pepsi' }]);
    expect(decision.unavailableProduct?.name).toBe('Diet Pepsi');
  });
});
