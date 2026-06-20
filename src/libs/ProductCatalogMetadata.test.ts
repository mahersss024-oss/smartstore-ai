import { describe, expect, it } from 'vitest';
import {
  canAIRecommendProduct,
  normalizeProductCatalogMetadata,
  parseProductTags,
} from './ProductCatalogMetadata';

describe('ProductCatalogMetadata', () => {
  it('normalizes missing metadata to AI-visible available product', () => {
    expect(normalizeProductCatalogMetadata(null)).toEqual({
      aiVisible: true,
      availability: 'available',
      brand: undefined,
      productType: undefined,
      tags: [],
      unit: undefined,
    });
  });

  it('normalizes optional product identity fields', () => {
    expect(normalizeProductCatalogMetadata({
      brand: '  Brand A  ',
      productType: ' Drink ',
      unit: ' 250 ml ',
    })).toMatchObject({
      brand: 'Brand A',
      productType: 'Drink',
      unit: '250 ml',
    });
  });

  it('parses product tags from comma-separated input', () => {
    expect(parseProductTags('coffee, hot drinks,  , morning')).toEqual([
      'coffee',
      'hot drinks',
      'morning',
    ]);
  });

  it('blocks AI recommendation for hidden or unavailable products', () => {
    expect(canAIRecommendProduct({ aiVisible: false, availability: 'available' })).toBe(false);
    expect(canAIRecommendProduct({ aiVisible: true, availability: 'unavailable' })).toBe(false);
    expect(canAIRecommendProduct({ aiVisible: true, availability: 'limited' })).toBe(true);
  });
});
