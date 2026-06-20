export type NormalizedOrderItem = {
  name: string;
  productId?: number;
  quantity?: number;
  unitPrice?: number;
};

const getStringValue = (
  data: Record<string, unknown>,
  keys: string[],
) => {
  for (const key of keys) {
    const value = data[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
};

const getNumberValue = (
  data: Record<string, unknown>,
  keys: string[],
) => {
  for (const key of keys) {
    const value = data[key];

    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
      return Number(value);
    }
  }

  return undefined;
};

export const normalizeOrderItems = (items: unknown): NormalizedOrderItem[] => {
  if (!Array.isArray(items)) {
    return [];
  }

  return items.flatMap((item) => {
    if (!item || typeof item !== 'object') {
      return [];
    }

    const data = item as Record<string, unknown>;
    const name = getStringValue(data, ['name', 'productName', 'title', 'label']);

    if (!name) {
      return [];
    }

    return {
      name,
      productId: getNumberValue(data, ['productId', 'product_id', 'id']),
      quantity: getNumberValue(data, ['quantity', 'qty', 'count']),
      unitPrice: getNumberValue(data, ['unitPrice', 'unit_price', 'price']),
    };
  });
};
