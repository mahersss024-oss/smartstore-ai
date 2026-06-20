import { describe, expect, it } from 'vitest';
import {
  buildAIEmployeeCartMutationContext,
  buildAIEmployeeCartState,
  calculateAIEmployeeCartSubtotal,
  mergeAIEmployeeCartItems,
  resolveAIEmployeeCartQuantityChange,
  toAIEmployeeOrderItem,
} from './AIEmployeeCart';

const item = {
  name: 'Product',
  productId: 1,
  quantity: 1,
  unitPrice: 10,
};

describe('AIEmployeeCart', () => {
  it('creates order items and calculates their subtotal', () => {
    const orderItem = toAIEmployeeOrderItem({
      id: 2,
      name: 'Another product',
      price: '12.50',
    }, 2);

    expect(orderItem).toEqual({
      name: 'Another product',
      productId: 2,
      quantity: 2,
      unitPrice: 12.5,
    });
    expect(calculateAIEmployeeCartSubtotal([item, orderItem])).toBe(35);
  });

  it('adds or replaces quantities without duplicating product rows', () => {
    expect(mergeAIEmployeeCartItems([item], [{ ...item, quantity: 2 }])).toEqual([
      { ...item, quantity: 3 },
    ]);
    expect(mergeAIEmployeeCartItems(
      [item],
      [{ ...item, quantity: 4 }],
      { replaceExisting: true },
    )).toEqual([{ ...item, quantity: 4 }]);
  });

  it('removes a product by its system identifier', () => {
    const cart = buildAIEmployeeCartState(
      {
        items: [item, { ...item, name: 'Second', productId: 2 }],
        status: 'collecting',
        subtotal: 20,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      [],
      '',
      {
        cartItemRemovalRequested: true,
        removeCartItemProductId: 1,
      },
    );

    expect(cart?.items).toEqual([{ ...item, name: 'Second', productId: 2 }]);
    expect(cart?.subtotal).toBe(10);
  });

  it('describes quantity changes for the model without mutating the cart', () => {
    const mutation = buildAIEmployeeCartMutationContext({
      cartClearedThisTurn: false,
      currentCart: {
        items: [{ ...item, quantity: 5 }],
        status: 'collecting',
        subtotal: 50,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      incomingItems: [],
      previousCart: {
        items: [{ ...item, quantity: 1 }],
        status: 'collecting',
        subtotal: 10,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      semanticHints: {
        replaceExistingQuantity: true,
        requestedQuantity: 5,
        selectedProductId: 1,
      },
    });

    expect(mutation).toMatchObject({
      currentQuantity: 5,
      previousQuantity: 1,
      productId: 1,
      requestedQuantity: 5,
      type: 'quantity_changed',
    });
  });

  it('targets the sole cart item when free text replaces its quantity', () => {
    const previousCart = {
      items: [{ ...item, quantity: 2 }],
      status: 'collecting' as const,
      subtotal: 20,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const quantityChange = resolveAIEmployeeCartQuantityChange({
      previousCart,
      semanticUnderstanding: {
        replaceExistingQuantity: true,
        requestedQuantity: 1,
      },
    });
    const nextCart = buildAIEmployeeCartState(
      previousCart,
      [],
      'أبي واحد بس',
      quantityChange,
    );
    const mutation = buildAIEmployeeCartMutationContext({
      cartClearedThisTurn: false,
      currentCart: nextCart,
      incomingItems: [],
      previousCart,
      quantityChange,
    });

    expect(quantityChange).toEqual({
      replaceExistingQuantity: true,
      requestedQuantity: 1,
      selectedProductId: 1,
    });
    expect(nextCart?.items).toEqual([{ ...item, quantity: 1 }]);
    expect(nextCart?.subtotal).toBe(10);
    expect(mutation).toMatchObject({
      currentQuantity: 1,
      previousQuantity: 2,
      productId: 1,
      requestedQuantity: 1,
      type: 'quantity_changed',
    });
  });

  it('does not guess a quantity target when the cart contains multiple products', () => {
    expect(resolveAIEmployeeCartQuantityChange({
      previousCart: {
        items: [item, { ...item, productId: 2 }],
        status: 'collecting',
        subtotal: 20,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      semanticUnderstanding: {
        replaceExistingQuantity: true,
        requestedQuantity: 1,
      },
    })).toBeUndefined();
  });

  it('describes removed_item mutation when removeCartItemProductId is set', () => {
    const cart = {
      items: [item],
      status: 'collecting' as const,
      subtotal: 10,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const mutation = buildAIEmployeeCartMutationContext({
      cartClearedThisTurn: false,
      currentCart: undefined,
      incomingItems: [],
      previousCart: cart,
      semanticHints: { removeCartItemProductId: 1 },
    });

    expect(mutation).toMatchObject({
      items: [item],
      productId: 1,
      type: 'removed_item',
    });
  });

  it('describes removed_item mutation when the item is not found in the previous cart', () => {
    const mutation = buildAIEmployeeCartMutationContext({
      cartClearedThisTurn: false,
      incomingItems: [],
      semanticHints: { removeCartItemProductId: 99 },
    });

    expect(mutation).toMatchObject({
      items: undefined,
      productId: 99,
      type: 'removed_item',
    });
  });

  it('describes added_items mutation when incomingItems is non-empty', () => {
    const mutation = buildAIEmployeeCartMutationContext({
      cartClearedThisTurn: false,
      incomingItems: [item],
    });

    expect(mutation).toMatchObject({
      items: [item],
      type: 'added_items',
    });
  });

  it('describes none mutation when there are no changes', () => {
    const mutation = buildAIEmployeeCartMutationContext({
      cartClearedThisTurn: false,
      incomingItems: [],
    });

    expect(mutation.type).toBe('none');
  });

  it('describes restored mutation when cartRestoredThisTurn is true', () => {
    const cart = {
      items: [item],
      status: 'collecting' as const,
      subtotal: 10,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const mutation = buildAIEmployeeCartMutationContext({
      cartClearedThisTurn: false,
      cartRestoredThisTurn: true,
      currentCart: cart,
      incomingItems: [],
    });

    expect(mutation.type).toBe('restored');
    expect(mutation.items).toEqual([item]);
  });

  it('clears a single-item cart when the removal product id does not match', () => {
    const previousCart = {
      items: [item],
      orderId: 10,
      status: 'collecting' as const,
      subtotal: 10,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const result = buildAIEmployeeCartState(
      previousCart,
      [],
      'احذف المنتج',
      {
        cartItemRemovalRequested: true,
        removeCartItemProductId: 99,
      },
    );

    expect(result?.items).toEqual([]);
    expect(result?.orderId).toBe(10);
    expect(result?.subtotal).toBe(0);
  });

  it('removes a cart item by message text when product id does not match', () => {
    const previousCart = {
      items: [
        item,
        { name: 'بيتزا', productId: 2, quantity: 1, unitPrice: 20 },
      ],
      status: 'collecting' as const,
      subtotal: 30,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const result = buildAIEmployeeCartState(
      previousCart,
      [],
      'احذف البيتزا',
      {
        cartItemRemovalRequested: true,
        removeCartItemProductId: 99,
      },
    );

    expect(result?.items).toHaveLength(1);
    expect(result?.items[0]?.productId).toBe(1);
  });

  it('adds incoming items to an empty cart via the merge path', () => {
    const result = buildAIEmployeeCartState(
      undefined,
      [item],
      'أريد منتج',
    );

    expect(result?.items).toEqual([item]);
    expect(result?.subtotal).toBe(10);
  });

  it('returns the existing collecting cart when both incoming and previous items are empty', () => {
    const emptyCollecting = {
      items: [],
      orderId: 5,
      status: 'collecting' as const,
      subtotal: 0,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const result = buildAIEmployeeCartState(emptyCollecting, [], 'مرحبا');

    expect(result).toBe(emptyCollecting);
  });

  it('describes cleared mutation when cartClearedThisTurn is true', () => {
    const cart = {
      items: [item],
      status: 'collecting' as const,
      subtotal: 10,
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const mutation = buildAIEmployeeCartMutationContext({
      cartClearedThisTurn: true,
      incomingItems: [],
      previousCart: cart,
    });

    expect(mutation.type).toBe('cleared');
    expect(mutation.items).toEqual([item]);
  });
});
