import type { AIEmployeeSemanticHints } from '@/libs/AIEmployeeSemanticHints';
import type { AIOrchestrationVisibleSystemAction } from '@/libs/AIOrchestrationDiagnostics';
import type {
  ConversationOrderItem,
  ConversationSuggestedProduct,
} from '@/libs/ConversationEngine';

export type ChatCart = {
  deliveryFee?: number;
  items: ConversationOrderItem[];
  orderId?: null | number;
  status: 'collecting' | 'submitted';
  subtotal: number;
  total?: number;
  updatedAt: string;
};

export type ChatCustomerDetails = {
  deliveryPreference?: 'delivery' | 'pickup';
  fulfillmentType?: 'delivery' | 'dine_in' | 'pickup';
  paymentPreference?: 'card_on_delivery' | 'card_on_pickup' | 'cash_on_delivery' | 'cash_on_pickup';
  tableNumber?: string;
};

export type ChatCancelledCartSnapshot = {
  cancelledAt: string;
  cart: ChatCart;
  expiresAt: string;
};

export type ChatMessage = {
  cart?: ChatCart;
  cancelledCartSnapshot?: ChatCancelledCartSnapshot;
  clientSubmissionId?: string;
  createdAt?: string;
  customerDetails?: ChatCustomerDetails;
  freeTextAllowed?: boolean;
  id: string;
  missingDetails?: string[];
  orderId?: null | number;
  products?: ConversationSuggestedProduct[];
  remoteId?: number;
  sender: 'ai' | 'customer';
  text: string;
  visibleSystemActions?: AIOrchestrationVisibleSystemAction[];
};

export type FulfillmentChoice = 'delivery' | 'dine_in' | 'pickup';
export type PaymentChoiceKind = 'card' | 'cash';

export type WebChatResponseData = {
  cancelledCartSnapshot?: unknown;
  cartMutation?: {
    type?: unknown;
  };
  currentCart?: unknown;
  customerDetails?: unknown;
  missingDetails?: unknown;
  orderId?: null | number;
  replyToCustomer: string;
  responseMessageId?: number;
  suggestedProducts?: unknown;
  visibleSystemActions?: unknown;
};

export type RemoteMessage = {
  body: string;
  createdAt?: string;
  direction: string;
  id: number;
  metadata: unknown;
  senderType: string;
};

type RemoteMessageMetadata = {
  cancelledCartSnapshot?: unknown;
  clientSubmissionId?: unknown;
  customerDetails?: unknown;
  currentCart?: unknown;
  missingDetails?: unknown;
  orderId?: null | number;
  productCards?: unknown;
  shouldDisplayInChat?: unknown;
  visibleSystemActions?: unknown;
};

const visibleSystemActions: AIOrchestrationVisibleSystemAction[] = [
  'cart_controls',
  'final_confirmation',
  'fulfillment_choices',
  'location_share',
  'payment_choices',
  'product_choices',
  'restore_cancelled_cart',
];

export const createWebOrderChatId = () => {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const normalizeWebOrderChatCart = (cart: unknown): ChatCart | undefined => {
  if (!cart || typeof cart !== 'object') {
    return undefined;
  }

  const candidate = cart as Partial<ChatCart>;
  if (!Array.isArray(candidate.items)) {
    return undefined;
  }

  return {
    deliveryFee: candidate.deliveryFee === undefined
      ? undefined
      : Number(candidate.deliveryFee ?? 0),
    items: candidate.items,
    orderId: candidate.orderId ?? null,
    status: candidate.status === 'submitted' ? 'submitted' : 'collecting',
    subtotal: Number(candidate.subtotal ?? 0),
    total: candidate.total === undefined
      ? undefined
      : Number(candidate.total ?? candidate.subtotal ?? 0),
    updatedAt: candidate.updatedAt ?? new Date().toISOString(),
  };
};

export const normalizeWebOrderCancelledCartSnapshot = (
  snapshot: unknown,
): ChatCancelledCartSnapshot | undefined => {
  if (!snapshot || typeof snapshot !== 'object') {
    return undefined;
  }

  const candidate = snapshot as Partial<ChatCancelledCartSnapshot> & {
    cart?: unknown;
  };
  const cart = normalizeWebOrderChatCart(candidate.cart);

  if (!cart?.items.length) {
    return undefined;
  }

  const expiresAt = typeof candidate.expiresAt === 'string'
    ? candidate.expiresAt
    : undefined;

  if (!expiresAt || Date.parse(expiresAt) <= Date.now()) {
    return undefined;
  }

  return {
    cancelledAt: typeof candidate.cancelledAt === 'string'
      ? candidate.cancelledAt
      : new Date().toISOString(),
    cart,
    expiresAt,
  };
};

export const normalizeWebOrderProducts = (
  products: unknown,
): ConversationSuggestedProduct[] => {
  return Array.isArray(products)
    ? products.filter((product): product is ConversationSuggestedProduct => {
        return Boolean(product && typeof product === 'object' && 'name' in product);
      })
    : [];
};

export const normalizeWebOrderMissingDetails = (missingDetails: unknown): string[] => {
  return Array.isArray(missingDetails)
    ? missingDetails.filter((item): item is string => typeof item === 'string')
    : [];
};

export const normalizeWebOrderVisibleSystemActions = (
  actions: unknown,
): AIOrchestrationVisibleSystemAction[] => {
  return Array.isArray(actions)
    ? actions.filter((item): item is AIOrchestrationVisibleSystemAction => {
        return visibleSystemActions.includes(item as AIOrchestrationVisibleSystemAction);
      })
    : [];
};

export const normalizeWebOrderCustomerDetails = (
  value: unknown,
): ChatCustomerDetails | undefined => {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const candidate = value as ChatCustomerDetails;

  return {
    deliveryPreference: candidate.deliveryPreference === 'delivery'
      || candidate.deliveryPreference === 'pickup'
      ? candidate.deliveryPreference
      : undefined,
    fulfillmentType: candidate.fulfillmentType === 'delivery'
      || candidate.fulfillmentType === 'dine_in'
      || candidate.fulfillmentType === 'pickup'
      ? candidate.fulfillmentType
      : undefined,
    paymentPreference: candidate.paymentPreference === 'card_on_delivery'
      || candidate.paymentPreference === 'card_on_pickup'
      || candidate.paymentPreference === 'cash_on_delivery'
      || candidate.paymentPreference === 'cash_on_pickup'
      ? candidate.paymentPreference
      : undefined,
    tableNumber: typeof candidate.tableNumber === 'string'
      ? candidate.tableNumber.trim().slice(0, 50) || undefined
      : undefined,
  };
};

export const buildWebOrderSafeReplyText = (params: {
  fallbackText: string;
  hasStructuredVisualContinuation: boolean;
  replyText: string;
}) => {
  const replyText = params.replyText.trim();

  return replyText || (params.hasStructuredVisualContinuation
    ? params.fallbackText
    : '');
};

export const webOrderChatRequiresChoiceResponse = (message?: ChatMessage) => {
  if (!message || message.sender !== 'ai' || message.freeTextAllowed) {
    return false;
  }

  const gatedActions: AIOrchestrationVisibleSystemAction[] = [
    'final_confirmation',
    'fulfillment_choices',
    'location_share',
    'payment_choices',
    'product_choices',
    'restore_cancelled_cart',
  ];

  return message.visibleSystemActions?.some(action => gatedActions.includes(action)) ?? false;
};

const getWebOrderChatMessageTime = (message: ChatMessage) => {
  const time = Date.parse(message.createdAt ?? '');

  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
};

const isProductChoiceAlreadyRepresentedInCart = (
  message: ChatMessage,
  cart?: ChatCart,
) => {
  if (
    !cart?.items.length
    || !message.products?.length
    || !message.visibleSystemActions?.includes('product_choices')
  ) {
    return false;
  }

  const cartProductIds = new Set(cart.items.map(item => item.productId));
  const cartProductNames = new Set(cart.items.map(item => item.name.trim().toLowerCase()));

  return message.products.every((product) => {
    return cartProductIds.has(product.id)
      || cartProductNames.has(product.name.trim().toLowerCase());
  });
};

export const getLatestWebOrderAssistantMessage = (
  messages: ChatMessage[],
  options?: {
    currentCart?: ChatCart;
  },
) => {
  return messages.reduce<ChatMessage | undefined>((latestMessage, message) => {
    if (message.sender !== 'ai') {
      return latestMessage;
    }

    if (isProductChoiceAlreadyRepresentedInCart(message, options?.currentCart)) {
      return latestMessage;
    }

    if (!latestMessage) {
      return message;
    }

    return getWebOrderChatMessageTime(message) >= getWebOrderChatMessageTime(latestMessage)
      ? message
      : latestMessage;
  }, undefined);
};

export const getWebOrderPaymentPreferenceForChoice = (
  details: ChatCustomerDetails | undefined,
  kind: PaymentChoiceKind,
): AIEmployeeSemanticHints['paymentPreference'] => {
  const isDelivery = details?.deliveryPreference === 'delivery'
    || details?.fulfillmentType === 'delivery';

  if (kind === 'card') {
    return isDelivery ? 'card_on_delivery' : 'card_on_pickup';
  }

  return isDelivery ? 'cash_on_delivery' : 'cash_on_pickup';
};

export const hasWebOrderFulfillmentChoice = (
  choices: FulfillmentChoice[],
  choice: FulfillmentChoice,
) => {
  return choices.includes(choice);
};

export const getAvailableWebOrderPaymentKinds = (
  availablePaymentKinds: {
    delivery: PaymentChoiceKind[];
    pickup: PaymentChoiceKind[];
  },
  details?: ChatCustomerDetails,
) => {
  const isDelivery = details?.deliveryPreference === 'delivery'
    || details?.fulfillmentType === 'delivery';

  return isDelivery ? availablePaymentKinds.delivery : availablePaymentKinds.pickup;
};

export const normalizeRemoteWebOrderMessage = (
  item: RemoteMessage,
): ChatMessage | undefined => {
  const metadata = item.metadata && typeof item.metadata === 'object'
    ? item.metadata as RemoteMessageMetadata
    : {};
  const sender = item.senderType === 'customer' || item.direction === 'inbound'
    ? 'customer'
    : 'ai';

  if (sender === 'customer' && metadata.shouldDisplayInChat === false) {
    return undefined;
  }

  return {
    cart: normalizeWebOrderChatCart(metadata.currentCart),
    cancelledCartSnapshot: normalizeWebOrderCancelledCartSnapshot(
      metadata.cancelledCartSnapshot,
    ),
    clientSubmissionId: typeof metadata.clientSubmissionId === 'string'
      ? metadata.clientSubmissionId
      : undefined,
    createdAt: item.createdAt,
    customerDetails: normalizeWebOrderCustomerDetails(metadata.customerDetails),
    id: `remote-${item.id}`,
    missingDetails: normalizeWebOrderMissingDetails(metadata.missingDetails),
    orderId: metadata.orderId,
    products: normalizeWebOrderProducts(metadata.productCards),
    remoteId: item.id,
    sender,
    text: item.body,
    visibleSystemActions: normalizeWebOrderVisibleSystemActions(
      metadata.visibleSystemActions,
    ),
  };
};

const OPTIMISTIC_MESSAGE_MATCH_WINDOW_MS = 2 * 60 * 1000;

const normalizeComparableMessageText = (value: string) => {
  return value.trim().replace(/\s+/g, ' ');
};

const areMessageTimestampsClose = (
  localCreatedAt?: string,
  remoteCreatedAt?: string,
) => {
  if (!localCreatedAt || !remoteCreatedAt) {
    return true;
  }

  const localTime = Date.parse(localCreatedAt);
  const remoteTime = Date.parse(remoteCreatedAt);

  if (!Number.isFinite(localTime) || !Number.isFinite(remoteTime)) {
    return true;
  }

  return Math.abs(localTime - remoteTime) <= OPTIMISTIC_MESSAGE_MATCH_WINDOW_MS;
};

const areWebOrderChatMessagesEquivalent = (
  first: ChatMessage,
  second: ChatMessage,
) => {
  if (
    first.clientSubmissionId
    && second.clientSubmissionId
    && first.clientSubmissionId === second.clientSubmissionId
  ) {
    return first.sender === second.sender;
  }

  if (
    first.sender !== second.sender
    || normalizeComparableMessageText(first.text) !== normalizeComparableMessageText(second.text)
  ) {
    return false;
  }

  if (first.sender === 'ai') {
    return true;
  }

  return areMessageTimestampsClose(first.createdAt, second.createdAt);
};

export const appendWebOrderChatMessage = (
  current: ChatMessage[],
  message: ChatMessage,
) => {
  const duplicateIndex = current.findIndex(item => areWebOrderChatMessagesEquivalent(item, message));

  if (duplicateIndex < 0) {
    return [...current, message];
  }

  return current.map((item, index) => {
    if (index !== duplicateIndex) {
      return item;
    }

    return {
      ...item,
      ...message,
      id: item.id,
      remoteId: item.remoteId ?? message.remoteId,
    };
  });
};

export const mergeWebOrderChatMessages = (
  current: ChatMessage[],
  remoteMessages: ChatMessage[],
) => {
  const nextMessages = [...current];
  const knownRemoteIds = new Set(
    current
      .map(message => message.remoteId)
      .filter((remoteId): remoteId is number => typeof remoteId === 'number'),
  );
  const matchedOptimisticIndexes = new Set<number>();
  let changed = false;

  for (const remoteMessage of remoteMessages) {
    if (
      typeof remoteMessage.remoteId === 'number'
      && knownRemoteIds.has(remoteMessage.remoteId)
    ) {
      continue;
    }

    const optimisticIndex = nextMessages.findIndex((message, index) => {
      return !matchedOptimisticIndexes.has(index)
        && message.remoteId === undefined
        && areWebOrderChatMessagesEquivalent(message, remoteMessage);
    });

    if (optimisticIndex >= 0) {
      const optimisticMessage = nextMessages[optimisticIndex];
      nextMessages[optimisticIndex] = {
        ...remoteMessage,
        freeTextAllowed: optimisticMessage?.freeTextAllowed
          ?? remoteMessage.freeTextAllowed,
        id: optimisticMessage?.id ?? remoteMessage.id,
      };
      matchedOptimisticIndexes.add(optimisticIndex);
    } else {
      nextMessages.push(remoteMessage);
    }

    if (typeof remoteMessage.remoteId === 'number') {
      knownRemoteIds.add(remoteMessage.remoteId);
    }
    changed = true;
  }

  return changed ? nextMessages : current;
};
