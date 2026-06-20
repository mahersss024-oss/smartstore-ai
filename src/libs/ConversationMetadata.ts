const toPositiveInteger = (value: unknown) => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number(value.trim());

    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  return undefined;
};

export const readOrderIdFromConversationMetadata = (metadata: unknown) => {
  if (!metadata || typeof metadata !== 'object') {
    return undefined;
  }

  const data = metadata as {
    currentCart?: { orderId?: unknown };
    lastOrder?: { id?: unknown };
    orderId?: unknown;
  };

  return toPositiveInteger(data.lastOrder?.id)
    ?? toPositiveInteger(data.currentCart?.orderId)
    ?? toPositiveInteger(data.orderId);
};
