import type { AIEmployeeSemanticHints } from './AIEmployeeSemanticHints';
import type {
  ConversationCatalogProduct,
  ConversationOrderItem,
} from './ConversationEngine';

const MAX_CART_ITEM_QUANTITY = 99;

export type AIEmployeeConversationCart = {
  confirmationRequestedAt?: string;
  deliveryFee?: number;
  items: ConversationOrderItem[];
  orderId?: number | null;
  status: 'collecting' | 'submitted';
  subtotal: number;
  total?: number;
  updatedAt: string;
};

export type AIEmployeeCartMutationContext = {
  cartActive: boolean;
  currentQuantity?: number;
  items?: ConversationOrderItem[];
  previousQuantity?: number;
  productId?: number;
  requestedQuantity?: number;
  type: 'added_items' | 'cleared' | 'none' | 'quantity_changed' | 'removed_item' | 'restored';
};

type CartSemanticUnderstanding = {
  cartItemRemovalRequested?: boolean;
  removeCartItemProductId?: number;
  replaceExistingQuantity?: boolean;
  requestedQuantity?: number;
};

export const resolveAIEmployeeCartQuantityChange = (params: {
  previousCart?: AIEmployeeConversationCart;
  semanticHints?: AIEmployeeSemanticHints;
  semanticUnderstanding?: CartSemanticUnderstanding;
}) => {
  const hintedProductId = params.semanticHints?.selectedProductId;
  const hintedQuantity = params.semanticHints?.requestedQuantity;

  if (
    hintedProductId
    && hintedQuantity
    && params.semanticHints?.replaceExistingQuantity === true
  ) {
    return {
      replaceExistingQuantity: true,
      requestedQuantity: hintedQuantity,
      selectedProductId: hintedProductId,
    };
  }

  const soleCartItem = params.previousCart?.status === 'collecting'
    && params.previousCart.items.length === 1
    ? params.previousCart.items[0]
    : undefined;
  const requestedQuantity = params.semanticUnderstanding?.requestedQuantity;

  if (
    soleCartItem
    && requestedQuantity
    && params.semanticUnderstanding?.replaceExistingQuantity === true
  ) {
    return {
      replaceExistingQuantity: true,
      requestedQuantity,
      selectedProductId: soleCartItem.productId,
    };
  }

  return undefined;
};

const normalize = (value: string) => value.trim().toLowerCase();

export const toAIEmployeeOrderItem = (
  product: Pick<ConversationCatalogProduct, 'id' | 'name' | 'price'>,
  quantity = 1,
): ConversationOrderItem => ({
  name: product.name,
  productId: product.id,
  quantity,
  unitPrice: Number(product.price ?? 0),
});

export const calculateAIEmployeeCartSubtotal = (items: ConversationOrderItem[]) => {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
};

export const toMoneyNumberOrZero = (value?: null | number | string) => {
  const amount = Number(value ?? 0);

  return Number.isFinite(amount) ? amount : 0;
};

const itemMatchesRemovalRequest = (
  item: ConversationOrderItem,
  message: string,
) => {
  const normalizedMessage = normalize(message);
  const itemTokens = normalize(item.name)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3);

  return itemTokens.some(token => normalizedMessage.includes(token));
};

export const mergeAIEmployeeCartItems = (
  existingItems: ConversationOrderItem[],
  incomingItems: ConversationOrderItem[],
  options?: {
    replaceExisting?: boolean;
  },
) => {
  const itemsByProductId = new Map<number, ConversationOrderItem>();

  for (const item of existingItems) {
    itemsByProductId.set(item.productId, { ...item });
  }

  for (const item of incomingItems) {
    const existing = itemsByProductId.get(item.productId);

    if (existing) {
      const newQuantity = options?.replaceExisting
        ? item.quantity
        : existing.quantity + item.quantity;
      itemsByProductId.set(item.productId, {
        ...existing,
        quantity: Math.min(newQuantity, MAX_CART_ITEM_QUANTITY),
      });
      continue;
    }

    itemsByProductId.set(item.productId, {
      ...item,
      quantity: Math.min(item.quantity, MAX_CART_ITEM_QUANTITY),
    });
  }

  return Array.from(itemsByProductId.values());
};

export const buildAIEmployeeCartState = (
  previousCart: AIEmployeeConversationCart | undefined,
  incomingItems: ConversationOrderItem[],
  message: string,
  semanticUnderstanding?: CartSemanticUnderstanding,
): AIEmployeeConversationCart | undefined => {
  const requestedQuantity = semanticUnderstanding?.requestedQuantity;
  const replaceExisting = semanticUnderstanding?.replaceExistingQuantity ?? false;
  const normalizedIncomingItems = requestedQuantity
    ? incomingItems.map(item => ({ ...item, quantity: requestedQuantity }))
    : incomingItems;
  const previousItems = previousCart?.status === 'collecting'
    ? previousCart.items
    : [];

  if (
    normalizedIncomingItems.length === 0
    && previousItems.length > 0
    && semanticUnderstanding?.cartItemRemovalRequested === true
  ) {
    if (semanticUnderstanding.removeCartItemProductId) {
      const items = previousItems.filter((item) => {
        return item.productId !== semanticUnderstanding.removeCartItemProductId;
      });

      if (items.length !== previousItems.length) {
        return {
          items,
          orderId: previousCart?.orderId ?? null,
          status: 'collecting',
          subtotal: calculateAIEmployeeCartSubtotal(items),
          updatedAt: new Date().toISOString(),
        };
      }
    }

    if (previousItems.length === 1) {
      return {
        items: [],
        orderId: previousCart?.orderId ?? null,
        status: 'collecting',
        subtotal: 0,
        updatedAt: new Date().toISOString(),
      };
    }

    const items = previousItems.filter((item) => {
      return !itemMatchesRemovalRequest(item, message);
    });

    if (items.length !== previousItems.length) {
      return {
        items,
        orderId: previousCart?.orderId ?? null,
        status: 'collecting',
        subtotal: calculateAIEmployeeCartSubtotal(items),
        updatedAt: new Date().toISOString(),
      };
    }
  }

  if (
    normalizedIncomingItems.length === 0
    && replaceExisting
    && requestedQuantity
    && previousItems.length === 1
  ) {
    const items = previousItems.map(item => ({
      ...item,
      quantity: requestedQuantity,
    }));

    return {
      items,
      orderId: previousCart?.orderId ?? null,
      status: 'collecting',
      subtotal: calculateAIEmployeeCartSubtotal(items),
      updatedAt: new Date().toISOString(),
    };
  }

  const items = mergeAIEmployeeCartItems(
    previousItems,
    normalizedIncomingItems,
    { replaceExisting },
  );

  if (items.length === 0) {
    return previousCart?.status === 'collecting' ? previousCart : undefined;
  }

  return {
    confirmationRequestedAt: normalizedIncomingItems.length === 0
      ? previousCart?.confirmationRequestedAt
      : undefined,
    items,
    orderId: previousCart?.orderId ?? null,
    status: 'collecting',
    subtotal: calculateAIEmployeeCartSubtotal(items),
    updatedAt: new Date().toISOString(),
  };
};

export const buildAIEmployeeCartMutationContext = (params: {
  cartClearedThisTurn: boolean;
  cartRestoredThisTurn?: boolean;
  currentCart?: AIEmployeeConversationCart;
  incomingItems: ConversationOrderItem[];
  previousCart?: AIEmployeeConversationCart;
  quantityChange?: ReturnType<typeof resolveAIEmployeeCartQuantityChange>;
  semanticHints?: AIEmployeeSemanticHints;
}): AIEmployeeCartMutationContext => {
  const cartActive = Boolean(params.currentCart?.items.length);

  if (params.cartRestoredThisTurn) {
    return {
      cartActive,
      items: params.currentCart?.items ?? [],
      type: 'restored',
    };
  }

  if (params.cartClearedThisTurn) {
    return {
      cartActive,
      items: params.previousCart?.items ?? [],
      type: 'cleared',
    };
  }

  const removedProductId = params.semanticHints?.removeCartItemProductId;
  if (removedProductId) {
    const removedItem = params.previousCart?.items.find((item) => {
      return item.productId === removedProductId;
    });

    return {
      cartActive,
      items: removedItem ? [removedItem] : undefined,
      productId: removedProductId,
      type: 'removed_item',
    };
  }

  const selectedProductId = params.quantityChange?.selectedProductId
    ?? params.semanticHints?.selectedProductId;
  const requestedQuantity = params.quantityChange?.requestedQuantity
    ?? params.semanticHints?.requestedQuantity;
  if (
    selectedProductId
    && requestedQuantity
    && (
      params.quantityChange?.replaceExistingQuantity === true
      || params.semanticHints?.replaceExistingQuantity === true
    )
  ) {
    const previousItem = params.previousCart?.items.find((item) => {
      return item.productId === selectedProductId;
    });
    const currentItem = params.currentCart?.items.find((item) => {
      return item.productId === selectedProductId;
    });

    return {
      cartActive,
      currentQuantity: currentItem?.quantity,
      previousQuantity: previousItem?.quantity,
      productId: selectedProductId,
      requestedQuantity,
      type: 'quantity_changed',
    };
  }

  if (params.incomingItems.length > 0) {
    return {
      cartActive,
      items: params.incomingItems,
      type: 'added_items',
    };
  }

  return {
    cartActive,
    type: 'none',
  };
};
