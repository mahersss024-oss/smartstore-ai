import { describe, expect, it } from 'vitest';
import { normalizeOrderItems } from './OrderDataNormalization';

describe('OrderDataNormalization', () => {
  it('normalizes current and legacy order item fields consistently', () => {
    expect(normalizeOrderItems([
      {
        name: 'Current item',
        productId: 7,
        quantity: 2,
        unitPrice: 15,
      },
      {
        product_id: '8',
        productName: 'Legacy item',
        qty: '3',
        price: '4.50',
      },
    ])).toEqual([
      {
        name: 'Current item',
        productId: 7,
        quantity: 2,
        unitPrice: 15,
      },
      {
        name: 'Legacy item',
        productId: 8,
        quantity: 3,
        unitPrice: 4.5,
      },
    ]);
  });

  it('drops invalid entries instead of exposing malformed order data', () => {
    expect(normalizeOrderItems([
      null,
      'invalid',
      { quantity: 1 },
      { name: 'Valid item', quantity: 'not-a-number' },
    ])).toEqual([
      {
        name: 'Valid item',
        productId: undefined,
        quantity: undefined,
        unitPrice: undefined,
      },
    ]);
  });
});
