import { describe, expect, it } from 'vitest';
import {
  hasDuplicateProductInBatch,
  productsLookDuplicate,
} from './ProductDuplicateDetection';

describe('ProductDuplicateDetection', () => {
  it('matches the same product when word order changes', () => {
    expect(productsLookDuplicate(
      { category: 'c001', name: 'p001 q002', price: 27 },
      { category: 'c001', name: 'q002 p001', price: '27.00' },
    )).toBe(true);
  });

  it('matches the same product despite a close spelling error', () => {
    expect(productsLookDuplicate(
      { category: 'c002', name: 'p001 q002', price: 15 },
      { category: 'c003', name: 'q002 p002', price: '27.00' },
    )).toBe(true);
  });

  it('does not merge genuinely different portion products when the price differs', () => {
    expect(productsLookDuplicate(
      { category: 'c001', name: 'x001 p001 q002', price: 15 },
      { category: 'c001', name: 'q002 p001', price: '27.00' },
    )).toBe(false);
  });

  it('does not merge highly similar names when product identity conflicts', () => {
    expect(productsLookDuplicate(
      { category: 'c001', name: 'p001 q002', price: 7, productType: 't001' },
      { category: 'c001', name: 'q002 p001', price: '7.00', productType: 't002' },
    )).toBe(false);
  });

  it('detects duplicates within the same product batch', () => {
    expect(hasDuplicateProductInBatch([
      { category: 'c001', name: 'q002 p001', price: 27 },
      { category: 'c001', name: 'p001 q002', price: 27 },
    ])).toBe(true);
  });
});
