import type { AgentCatalogProduct, getCatalogSummary } from './AIEmployeeAgentCatalog';
import type { AIEmployeeCartMutationContext, AIEmployeeConversationCart } from '@/libs/AIEmployeeCart';
import type { AIEmployeeCustomerDetails } from '@/libs/AIEmployeeCheckout';
import type { AIEmployeeCancelledCartSnapshot, AIEmployeeDialogueState, AIEmployeeOrchestrationTrace } from '@/libs/AIEmployeeOrchestration';
import type { AIEmployeeAddOnOrderSnapshot, AIEmployeeCustomerOrderSnapshot, AIEmployeeOrderCancellationResult, AIEmployeeOrderModificationResult, AIEmployeeSupportEscalationResult } from '@/libs/AIEmployeeOrderLifecycle';
import type { AIEmployeeSystemEventContext } from '@/libs/AIEmployeeSystemEventBridge';
import type { AIOrchestrationVisibleSystemAction } from '@/libs/AIOrchestrationDiagnostics';
import type { ConversationDecision, ConversationOrderItem, ConversationSuggestedProduct } from '@/libs/ConversationEngine';
import type { loadStoreAIContext } from '@/libs/StoreAIContext';
import { getAllowedAIEmployeeDeliveryPreferences, getAllowedAIEmployeePaymentPreferences } from '@/libs/AIEmployeeCheckout';
import { generatePlatformAIText } from '@/libs/PlatformAIClient';
import { getPlatformAIProviderConfig } from '@/libs/PlatformAIProviderConfig';
import { buildModelInstructions } from './AIEmployeeAgentPrompt';

type StoreAIContext = Awaited<ReturnType<typeof loadStoreAIContext>>;

type ConversationHistoryMessage = {
  body: string;
  direction: 'inbound' | 'outbound';
  senderType: string;
};

type AddOnOrderBlockedContext = {
  originalDeliveryStatus?: null | string;
  originalOrderId: number;
  originalOrderStatus: string;
  reason: 'original_order_out_for_delivery';
  separateOrderMayRequireExtraDeliveryCost: true;
};

export type AddOnOrderContext = {
  confirmationRequestedAt: string;
  mode: 'separate_order_after_store_approval';
  originalOrderId: number;
  originalOrderStatus: string;
  snapshot: AIEmployeeAddOnOrderSnapshot;
};

type LastOrder = {
  completedAt?: string;
  id: number;
  status?: string;
};

type PendingOrderModification = {
  confirmationRequestedAt: string;
  items: ConversationOrderItem[];
  orderId: number;
  type: 'add_items';
};

type ModelContextParams = {
  aiOrchestration: AIEmployeeOrchestrationTrace;
  addOnOrderBlockedContext?: AddOnOrderBlockedContext;
  addOnOrderContext?: AddOnOrderContext;
  cancelledCartSnapshot?: AIEmployeeCancelledCartSnapshot | null;
  cart?: AIEmployeeConversationCart;
  cartClearedThisTurn?: boolean;
  cartMutation: AIEmployeeCartMutationContext;
  catalogProducts: AgentCatalogProduct[];
  catalogSummary: ReturnType<typeof getCatalogSummary>;
  conversationHistory: ConversationHistoryMessage[];
  customerDetails?: AIEmployeeCustomerDetails;
  customerOrders: AIEmployeeCustomerOrderSnapshot;
  decision: ConversationDecision;
  dialogueState: AIEmployeeDialogueState;
  lastOrder?: LastOrder;
  locale?: string;
  message: string;
  orderId?: null | number;
  orderCancellation: AIEmployeeOrderCancellationResult;
  orderModification: AIEmployeeOrderModificationResult;
  pendingOrderModification?: PendingOrderModification;
  referencedOrderId?: null | number;
  storeContext?: StoreAIContext;
  suggestedProducts: ConversationSuggestedProduct[];
  supportEscalation: AIEmployeeSupportEscalationResult;
  systemEvent?: AIEmployeeSystemEventContext;
  visibleSystemActions: AIOrchestrationVisibleSystemAction[];
};

const buildModelContext = (params: ModelContextParams) => {
  const shouldClarifyProduct = params.decision.intent === 'order_request'
    && params.decision.missingDetails.includes('requested_product')
    && !params.cart?.items.length;
  const latestCustomerTurn = params.systemEvent?.customerMeaning ?? params.message;

  return JSON.stringify({
    cart: params.cart ?? null,
    cartState: {
      active: Boolean(params.cart?.items.length),
      clearedThisTurn: params.cartClearedThisTurn === true,
      mutation: params.cartMutation,
    },
    assistantIdentity: params.storeContext
      ? {
          displayName: params.storeContext.aiSettings.displayName,
          storeName: params.storeContext.store.name,
        }
      : null,
    cancelledCartSnapshot: params.cancelledCartSnapshot
      ? {
          cancelledAt: params.cancelledCartSnapshot.cancelledAt,
          expiresAt: params.cancelledCartSnapshot.expiresAt,
          items: params.cancelledCartSnapshot.cart.items,
          subtotal: params.cancelledCartSnapshot.cart.subtotal,
        }
      : null,
    catalogSummary: params.catalogSummary,
    catalogProducts: params.catalogProducts.map(product => ({
      availability: product.availability ?? 'available',
      brand: product.brand,
      category: product.category,
      description: product.description,
      id: product.id,
      name: product.name,
      price: product.price,
      productType: product.productType,
      unit: product.unit,
    })),
    conversationHistory: params.conversationHistory,
    conversationState: {
      hasPriorAssistantReply: params.conversationHistory.some((historyMessage) => {
        return historyMessage.direction === 'outbound';
      }),
    },
    customerDetails: params.customerDetails ?? null,
    customerOrders: params.customerOrders,
    dialogueState: params.dialogueState,
    locale: params.locale ?? null,
    latestSystemEvent: params.systemEvent ?? null,
    internalDecision: {
      addOnOrderBlockedContext: params.addOnOrderBlockedContext ?? null,
      addOnOrderContext: params.addOnOrderContext ?? null,
      confidence: params.decision.confidence,
      intent: params.decision.intent,
      missingDetails: params.decision.missingDetails,
      orderCreated: Boolean(params.orderId),
      orderCancellation: params.orderCancellation,
      orderModificationCreated: params.orderModification.created,
      requiresCustomerConfirmation: params.decision.requiresCustomerConfirmation === true
        || Boolean(params.pendingOrderModification),
      shouldCreateDraftOrder: params.decision.shouldCreateDraftOrder,
      unavailableProduct: params.decision.unavailableProduct ?? null,
    },
    intent: params.decision.intent,
    missingDetails: params.decision.missingDetails,
    orderId: params.orderId ?? null,
    addOnOrderBlockedContext: params.addOnOrderBlockedContext ?? null,
    addOnOrderContext: params.addOnOrderContext ?? null,
    aiOrchestration: params.aiOrchestration,
    orderCancellation: params.orderCancellation,
    orderModification: params.orderModification,
    pendingOrderModification: params.pendingOrderModification ?? null,
    productClarification: {
      availableCategories: params.catalogSummary.categories,
      examples: params.catalogProducts.slice(0, 6).map(product => ({
        category: product.category,
        name: product.name,
        price: product.price,
      })),
      customerMessage: params.message,
      latestCustomerTurn,
      shouldAsk: shouldClarifyProduct,
    },
    referencedOrderId: params.referencedOrderId ?? params.orderId ?? params.lastOrder?.id ?? null,
    recentOrder: params.lastOrder ?? null,
    preserveFacts: {
      cartMustRemainAsProvided: true,
      doNotCreateOrderUnlessOrderIdProvided: true,
      doNotInventCatalogItems: true,
      internalSystemControlsActions: true,
      modelOnlyWritesCustomerReply: true,
      deliveryOptionsAllowed: getAllowedAIEmployeeDeliveryPreferences(params.storeContext),
      internalPaymentIdsAreNotCustomerWording: true,
      inPersonCardMeansPayAtHandoffWhenActive: true,
      paymentMethodsAreLimitedBySupportedDeliveryPreferences: true,
      paymentOptionsAllowed: getAllowedAIEmployeePaymentPreferences(
        params.storeContext,
        params.customerDetails?.deliveryPreference,
      ),
    },
    orderConfirmation: {
      canCreateOnlyAfterPreviousConfirmationRequest: true,
      confirmationRequestedAt: params.cart?.confirmationRequestedAt ?? null,
      requiresCustomerConfirmation: params.decision.requiresCustomerConfirmation === true
        || Boolean(params.pendingOrderModification),
    },
    orderPricing: params.cart
      ? {
          deliveryFee: params.cart.deliveryFee ?? 0,
          subtotal: params.cart.subtotal,
          total: params.cart.total ?? params.cart.subtotal,
        }
      : null,
    storeContext: params.storeContext
      ? {
          deliveryMethods: params.storeContext.deliveryMethods,
          knowledgeBase: params.storeContext.knowledgeBase,
          paymentMethods: params.storeContext.paymentMethods,
          store: params.storeContext.store,
        }
      : null,
    suggestedProducts: params.suggestedProducts,
    supportEscalation: params.supportEscalation,
    userMessage: latestCustomerTurn,
    visibleSystemActions: params.visibleSystemActions,
  });
};

export const generateCustomerReplyWithPlatformModel = async (
  params: ModelContextParams & { storeName: string },
) => {
  const config = await getPlatformAIProviderConfig();

  if (!config.enabled || !config.apiKey) {
    return undefined;
  }

  try {
    const instructions = buildModelInstructions({
      assistantDisplayName: params.storeContext?.aiSettings.displayName ?? 'Store employee',
      configSystemPrompt: config.systemPrompt,
      storeName: params.storeName,
    });
    const modelContext = buildModelContext(params);
    const text = await generatePlatformAIText(config, {
      input: modelContext,
      instructions,
    });

    return text || undefined;
  } catch {
    return undefined;
  }
};
