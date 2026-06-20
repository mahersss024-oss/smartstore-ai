import { describe, expect, it } from 'vitest';
import { parseAIProductDrafts, productDraftToInsertMetadata } from './AISetupAssistant';

describe('AISetupAssistant', () => {
  it('parses product drafts from owner text', () => {
    const drafts = parseAIProductDrafts(`
      Latte | 14 | Drinks | Hot coffee with milk | coffee, morning
      Croissant | 9 | Bakery | Butter croissant | breakfast
    `);

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      category: 'Drinks',
      name: 'Latte',
      price: 14,
      tags: ['coffee', 'morning'],
    });
  });

  it('keeps comma-separated tags together when owner uses comma rows', () => {
    const drafts = parseAIProductDrafts(`
      name,price,category,description,tags
      Latte,14,Drinks,Hot coffee with milk,coffee,morning
      Tea,5,Drinks,Hot tea,hot,breakfast,https://example.com/tea.png
    `);

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      image: '',
      name: 'Latte',
      tags: ['coffee', 'morning'],
    });
    expect(drafts[1]).toMatchObject({
      image: 'https://example.com/tea.png',
      name: 'Tea',
      tags: ['hot', 'breakfast'],
    });
  });

  it('rejects invalid product rows', () => {
    expect(() => parseAIProductDrafts('Incomplete product row')).toThrow();
  });

  it('creates AI-visible available metadata for approved drafts', () => {
    expect(productDraftToInsertMetadata({
      category: 'Drinks',
      description: '',
      image: '',
      name: 'Tea',
      price: 5,
      tags: ['hot'],
    })).toEqual({
      aiVisible: true,
      availability: 'available',
      brand: undefined,
      productType: undefined,
      tags: ['hot'],
      unit: undefined,
    });
  });
});
