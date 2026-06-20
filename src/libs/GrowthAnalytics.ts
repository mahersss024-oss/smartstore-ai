type OrderLike = {
  source?: null | string;
  status: string;
};

type ConversationLike = {
  channel: string;
};

export const normalizeAnalyticsSource = (source?: null | string) => {
  const value = source?.trim().toLowerCase() || 'direct';

  if (value.includes('whatsapp')) {
    return 'whatsapp';
  }

  if (value.includes('instagram')) {
    return 'instagram';
  }

  if (value.includes('tiktok')) {
    return 'tiktok';
  }

  if (value.includes('google')) {
    return 'google_maps';
  }

  if (value.includes('qr')) {
    return 'qr';
  }

  if (value.includes('web')) {
    return 'website';
  }

  if (value.includes('smart_link')) {
    return 'smart_link';
  }

  return 'direct';
};

export const calculateConversionRate = (ordersCount: number, conversationsCount: number) => {
  if (conversationsCount <= 0) {
    return ordersCount > 0 ? 100 : 0;
  }

  return Math.min(100, Math.round((ordersCount / conversationsCount) * 100));
};

export const buildGrowthAnalytics = (params: {
  conversations: ConversationLike[];
  orders: OrderLike[];
}) => {
  const completedOrders = params.orders.filter(order => order.status === 'completed').length;
  const cancelledOrders = params.orders.filter(order => order.status === 'cancelled').length;
  const sourceCounts = new Map<string, number>();

  for (const order of params.orders) {
    const source = normalizeAnalyticsSource(order.source);
    sourceCounts.set(source, (sourceCounts.get(source) ?? 0) + 1);
  }

  for (const conversation of params.conversations) {
    const source = normalizeAnalyticsSource(conversation.channel);
    sourceCounts.set(source, sourceCounts.get(source) ?? 0);
  }

  return {
    cancelledOrders,
    completedOrders,
    conversations: params.conversations.length,
    conversionRate: calculateConversionRate(params.orders.length, params.conversations.length),
    orders: params.orders.length,
    trafficSources: [...sourceCounts.entries()]
      .map(([source, count]) => ({ count, source }))
      .sort((a, b) => b.count - a.count),
  };
};
