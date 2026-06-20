import { describe, expect, it } from 'vitest';
import {
  analyzeSalesConversation,
  detectSalesConversationSignals,
} from './SalesConversationIntelligence';

describe('SalesConversationIntelligence', () => {
  const catalog = [
    {
      aiVisible: true,
      availability: 'available' as const,
      category: 'Gifts',
      description: 'Small birthday flower gift',
      id: 1,
      image: '/uploads/flowers.png',
      name: 'Small flower bouquet',
      price: '60.00',
      tags: ['gift', 'birthday'],
    },
    {
      aiVisible: true,
      availability: 'available' as const,
      category: 'Drinks',
      description: 'Cold cola soda',
      id: 2,
      image: '/uploads/cola.png',
      name: 'Coca-Cola',
      price: '5.00',
      tags: ['cold', 'soda'],
    },
    {
      aiVisible: true,
      availability: 'unavailable' as const,
      category: 'Drinks',
      description: 'Diet soda',
      id: 3,
      image: '/uploads/diet-pepsi.png',
      name: 'Diet Pepsi',
      price: '5.00',
      tags: ['diet', 'soda'],
    },
  ];

  it('does not infer sales signals from fixed wording lists', () => {
    expect(detectSalesConversationSignals('I want a birthday gift')).toEqual([]);
  });

  it('ranks products by catalog facts without canned sales reasons', () => {
    const analysis = analyzeSalesConversation({
      catalog,
      message: 'Small birthday flower gift',
    });

    expect(analysis.suggestedProducts[0]).toMatchObject({
      image: '/uploads/flowers.png',
      name: 'Small flower bouquet',
    });
    expect(analysis.suggestedProducts[0]?.salesReason).toBeUndefined();
  });

  it('does not suggest products from partial words inside a clarification question', () => {
    const analysis = analyzeSalesConversation({
      catalog: [
        ...catalog,
        {
          aiVisible: true,
          availability: 'available' as const,
          category: 'Salads',
          description: 'fresh q002 item',
          id: 4,
          image: null,
          name: 'p001 q002 r003',
          price: '7.00',
          tags: ['q002'],
        },
      ],
      message: 'x000 q002x',
    });

    expect(analysis.requestedItems).toEqual([]);
    expect(analysis.suggestedProducts).toEqual([]);
  });

  it('uses catalog facts for unavailable items and alternatives', () => {
    const analysis = analyzeSalesConversation({
      catalog,
      message: 'Diet Pepsi',
      previousSuggestedProductIds: [2],
      previousUnavailableProduct: catalog[2],
    });

    expect(analysis.unavailableProduct?.name).toBe('Diet Pepsi');
    expect(analysis.suggestedProducts).toHaveLength(0);
  });

  it('does not add a single-token product automatically when the customer requested a qualified variant', () => {
    const analysis = analyzeSalesConversation({
      catalog: [
        {
          aiVisible: true,
          availability: 'available' as const,
          category: 'Drinks',
          description: 'Regular soda',
          id: 1,
          image: null,
          name: 'Pepsi',
          price: '5.00',
          tags: ['soda'],
        },
      ],
      message: 'Diet Pepsi',
    });

    expect(analysis.requestedItems).toEqual([]);
    expect(analysis.suggestedProducts).toMatchObject([
      { name: 'Pepsi' },
    ]);
  });

  it('prefers products whose name starts with the requested token over other categories that contain it', () => {
    const analysis = analyzeSalesConversation({
      catalog: [
        {
          aiVisible: true,
          availability: 'available' as const,
          category: 'Drinks',
          description: 'Plain alpha drink',
          id: 1,
          image: null,
          name: 'alpha drink',
          price: '4.00',
          tags: [],
        },
        {
          aiVisible: true,
          availability: 'available' as const,
          category: 'Salads',
          description: 'Garden dish with alpha',
          id: 2,
          image: null,
          name: 'garden alpha salad',
          price: '7.00',
          tags: [],
        },
      ],
      message: 'need alpha available',
    });

    expect(analysis.suggestedProducts).toMatchObject([
      { name: 'alpha drink' },
    ]);
    expect(analysis.suggestedProducts).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'garden alpha salad' }),
      ]),
    );
  });

  it('does not suggest a product from a single-token tag-only match', () => {
    const analysis = analyzeSalesConversation({
      catalog: [
        {
          aiVisible: true,
          availability: 'available' as const,
          category: 'Salads',
          description: 'Fresh side dish',
          id: 1,
          image: null,
          name: 'Cucumber dairy salad',
          price: '7.00',
          tags: ['yogurt'],
        },
      ],
      message: 'yogurt',
    });

    expect(analysis.requestedItems).toEqual([]);
    expect(analysis.suggestedProducts).toEqual([]);
  });

  it('uses product descriptions for multi-token customer requests', () => {
    const analysis = analyzeSalesConversation({
      catalog: [
        {
          aiVisible: true,
          availability: 'available' as const,
          category: 'Drinks',
          description: 'Hot coffee with milk',
          id: 1,
          image: null,
          name: 'Latte',
          price: '14.00',
          tags: ['morning'],
        },
      ],
      message: 'I want hot coffee',
    });

    expect(analysis.suggestedProducts).toMatchObject([
      { name: 'Latte' },
    ]);
  });

  it('matches an Arabic category query without requiring the definite article', () => {
    const analysis = analyzeSalesConversation({
      catalog: [
        {
          aiVisible: true,
          availability: 'available' as const,
          category: '\u0627\u0644\u0633\u0644\u0637\u0627\u062A \u0648\u0627\u0644\u0645\u0642\u0628\u0644\u0627\u062A',
          description: null,
          id: 1,
          image: null,
          name: '\u0633\u0644\u0637\u0629 \u062D\u0627\u0631\u0629',
          price: '5.00',
          tags: [],
        },
        {
          aiVisible: true,
          availability: 'available' as const,
          category: '\u0627\u0644\u0633\u0644\u0637\u0627\u062A \u0648\u0627\u0644\u0645\u0642\u0628\u0644\u0627\u062A',
          description: null,
          id: 2,
          image: null,
          name: '\u0633\u0644\u0637\u0629 \u062E\u0636\u0631\u0627\u0621',
          price: '8.00',
          tags: [],
        },
      ],
      message: '\u0633\u0644\u0637\u0627\u062A',
    });

    expect(analysis.suggestedProducts).toMatchObject([
      { name: '\u0633\u0644\u0637\u0629 \u062D\u0627\u0631\u0629' },
      { name: '\u0633\u0644\u0637\u0629 \u062E\u0636\u0631\u0627\u0621' },
    ]);
  });

  it('maps shatta requests to the real spicy salad product choice', () => {
    const analysis = analyzeSalesConversation({
      catalog: [
        {
          aiVisible: true,
          availability: 'available' as const,
          category: '\u0627\u0644\u0633\u0644\u0637\u0627\u062A \u0648\u0627\u0644\u0645\u0642\u0628\u0644\u0627\u062A',
          description: null,
          id: 1,
          image: null,
          name: '\u0633\u0644\u0637\u0629 \u062D\u0627\u0631\u0629',
          price: '5.00',
          tags: [],
        },
        {
          aiVisible: true,
          availability: 'available' as const,
          category: '\u0627\u0644\u0633\u0644\u0637\u0627\u062A \u0648\u0627\u0644\u0645\u0642\u0628\u0644\u0627\u062A',
          description: null,
          id: 2,
          image: null,
          name: '\u0633\u0644\u0637\u0629 \u062E\u0636\u0631\u0627\u0621',
          price: '8.00',
          tags: [],
        },
      ],
      message: '\u0634\u0637\u0647',
    });

    expect(analysis.requestedItems).toEqual([]);
    expect(analysis.suggestedProducts).toMatchObject([
      { name: '\u0633\u0644\u0637\u0629 \u062D\u0627\u0631\u0629' },
    ]);
  });

  it('matches a catalog category after one adjacent character transposition', () => {
    const analysis = analyzeSalesConversation({
      catalog: [
        {
          aiVisible: true,
          availability: 'available' as const,
          category: '\u0627\u0644\u0645\u0636\u063A\u0648\u0637',
          description: null,
          id: 1,
          image: null,
          name: '\u0645\u0636\u063A\u0648\u0637 \u062F\u062C\u0627\u062C',
          price: '27.00',
          tags: [],
        },
        {
          aiVisible: true,
          availability: 'available' as const,
          category: '\u0627\u0644\u0645\u0636\u063A\u0648\u0637',
          description: null,
          id: 2,
          image: null,
          name: '\u0645\u0636\u063A\u0648\u0637 \u0644\u062D\u0645',
          price: '50.00',
          tags: [],
        },
      ],
      message: '\u0641\u064A\u0647 \u0645\u0636\u0639\u0648\u0637',
    });

    expect(analysis.suggestedProducts).toMatchObject([
      { name: '\u0645\u0636\u063A\u0648\u0637 \u062F\u062C\u0627\u062C' },
      { name: '\u0645\u0636\u063A\u0648\u0637 \u0644\u062D\u0645' },
    ]);
  });

  it('does not fuzzily match short or compact product words', () => {
    const analysis = analyzeSalesConversation({
      catalog: [
        {
          aiVisible: true,
          availability: 'available' as const,
          category: 'Fabric',
          description: null,
          id: 1,
          image: null,
          name: 'Silk',
          price: '4.00',
          tags: [],
        },
      ],
      message: 'Milk',
    });

    expect(analysis.suggestedProducts).toEqual([]);
  });

  it('keeps all relevant choices aligned with the chat product cards', () => {
    const analysis = analyzeSalesConversation({
      catalog: Array.from({ length: 8 }, (_, index) => ({
        aiVisible: true,
        availability: 'available' as const,
        category: 'Pressed meals',
        description: null,
        id: index + 1,
        image: null,
        name: `Pressed meal ${index + 1}`,
        price: `${20 + index}.00`,
        tags: [],
      })),
      message: 'Pressed meals',
    });

    expect(analysis.suggestedProducts).toHaveLength(8);
  });
});
