import type { AddOnOrderContext } from './AIEmployeeAgentContext';
import type { AIEmployeeConversationCart } from '@/libs/AIEmployeeCart';
import type { AIEmployeeCustomerDetails } from '@/libs/AIEmployeeCheckout';
import type { AIEmployeeCancelledCartSnapshot, AIEmployeeDialogueState, AIEmployeeOrchestrationTrace, AIEmployeeReplyGuardResult, AIEmployeeSemanticUnderstanding } from '@/libs/AIEmployeeOrchestration';
import type { AIEmployeeOrderModificationResult, AIEmployeeSupportEscalationResult } from '@/libs/AIEmployeeOrderLifecycle';
import type {
  AIOrchestrationCustomerNeed,
  AIOrchestrationVisibleSystemAction,
} from '@/libs/AIOrchestrationDiagnostics';
import type {
  ConversationDecision,
  ConversationOrderItem,
  ConversationSuggestedProduct,
} from '@/libs/ConversationEngine';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  AI_AUDIT_ACTION,
  assertCanPerformAIAction,
  getRequiredAIPermission,
} from '@/libs/AIActionPermissions';
import {

  buildAIEmployeeCartMutationContext,
  buildAIEmployeeCartState,
  calculateAIEmployeeCartSubtotal,
  mergeAIEmployeeCartItems,
  resolveAIEmployeeCartQuantityChange,
  toAIEmployeeOrderItem,
  toMoneyNumberOrZero,
} from '@/libs/AIEmployeeCart';
import {

  applyAIEmployeeCartPricing,
  constrainAIEmployeeSemanticUnderstandingToStoreMethods,
  extractAIEmployeeCustomerDetails,
  getAIEmployeeDeliveryCustomerAddress,
  getAllowedAIEmployeePaymentPreferences,
  getAvailableAIEmployeeServiceChoices,
  getMissingAIEmployeeOrderDetails,
} from '@/libs/AIEmployeeCheckout';
import {

  AIEmployeeSemanticHintsContinueCheckout,

  buildAIEmployeeCancelledCartSnapshot,
  buildAIEmployeeOrchestrationTrace,
  getAIEmployeeReplyGuardDecisionSummary,
  getAIEmployeeReplyGuardOrchestrationIssues,
  getNextAIEmployeeCustomerNeed,
  getPendingAIEmployeeProductSelectionNeed,
  getRestorableAIEmployeeCancelledCartSnapshot,
  getVisibleAIEmployeeSystemActions,
  hasMeaningfulAIEmployeeSemanticHints,
  orchestrateAIEmployeeDialogueState,
  sanitizeAIEmployeeSystemSemanticHints,
  validateAIEmployeeRequestedCustomerNeed,
} from '@/libs/AIEmployeeOrchestration';
import {
  addAIEmployeeItemsToExistingOrder,

  buildAIEmployeeAddOnOrderSnapshot,
  canAIEmployeeAddItemsToExistingOrder,
  createAIEmployeeCustomerFeedbackEvent,
  createAIEmployeeDraftOrder,
  createAIEmployeeSupportEscalationEvent,
  getMostRelevantAIEmployeeDeliveryStageOpenOrder,
  handleAIEmployeeOrderCancellationRequest,
  isAIEmployeeOrderInDeliveryStage,
  loadAIEmployeeCustomerOrderSnapshot,
  loadAIEmployeeOrderLifecycleState,
} from '@/libs/AIEmployeeOrderLifecycle';
import {
  guardModelReplyAgainstFalseActions,
  repairGuardedReplyIfPossible,
} from '@/libs/AIEmployeeReplyGuardPipeline';
import {
  analyzeAIEmployeeMessageSemantics,
  analyzeAIEmployeeModelReplySystemNeed,
} from '@/libs/AIEmployeeSemanticAnalysis';
import { aiEmployeeSemanticHintsSchema } from '@/libs/AIEmployeeSemanticHints';
import { buildAIEmployeeSystemEventContext } from '@/libs/AIEmployeeSystemEventBridge';
import {
  generateAIEmployeeSystemEventReply,
} from '@/libs/AIEmployeeSystemEventReply';
import {
  canAdvanceCustomerNeedBeforeReply,
  evaluateAIOrchestrationQuality,
} from '@/libs/AIOrchestrationDiagnostics';
import {
  extractConversationRating,
} from '@/libs/ConversationEngine';
import { db } from '@/libs/DB';
import { logger } from '@/libs/Logger';
import { ORDER_STATUS } from '@/libs/OrderWorkflow';
import { getPlatformAIProviderConfig } from '@/libs/PlatformAIProviderConfig';
import { normalizeProductCatalogMetadata } from '@/libs/ProductCatalogMetadata';
import { analyzeSalesConversation } from '@/libs/SalesConversationIntelligence';
import { loadProductImageMap, loadStoreAIContext } from '@/libs/StoreAIContext';
import { assertStoreFeatureEnabled } from '@/libs/StoreServiceControls';
import {
  conversationMessagesTable,
  conversationsTable,
  customerReviewsTable,
  customersTable,
  productsTable,
} from '@/models/Schema';
import { resolveCustomerEntryOperationalContext } from '@/utils/CustomerChannels';
import {

  getCatalogSummary,
  pushUniqueIssue,
  selectCatalogProductsForModel,
  shouldApplyRequestedItemsToCart,
  toSuggestedProduct,
} from './AIEmployeeAgentCatalog';
import { generateCustomerReplyWithPlatformModel } from './AIEmployeeAgentContext';
import { buildDecision, MAX_PRODUCT_CARDS_IN_CHAT } from './AIEmployeeAgentDecision';
import { buildAIEmployeeStateFallbackReply } from './AIEmployeeAgentFallback';
import { findReviewOrderId, getStoreAIProfile, loadConversationHistory, logAIAction } from './AIEmployeeAgentStorage';

const incomingCustomerMessageSchema = z.object({
  body: z.string().min(1).max(4000),
  channel: z.string().min(1).max(50),
  clientSubmissionId: z.string().min(1).max(255).optional(),
  customer: z.object({
    email: z.string().email().optional(),
    externalId: z.string().min(1).max(255),
    name: z.string().max(255).optional(),
    phone: z.string().max(50).optional(),
  }),
  customerAddress: z.string().max(500).optional(),
  externalThreadId: z.string().min(1).max(255),
  locale: z.string().min(2).max(10).optional(),
  organizationId: z.string().min(1),
  semanticHints: aiEmployeeSemanticHintsSchema.optional(),
  suppressCustomerEcho: z.boolean().optional(),
});

export type IncomingCustomerMessage = z.infer<typeof incomingCustomerMessageSchema>;

type AgentOrderItem = ConversationOrderItem;
type CustomerNeed = AIOrchestrationCustomerNeed;
type SemanticMessageUnderstanding = AIEmployeeSemanticUnderstanding;
type SupportEscalationResult = AIEmployeeSupportEscalationResult;
type CustomerSystemEventReplyParams = {
  eventType:
    | 'order_approved'
    | 'order_cancelled'
    | 'order_out_for_delivery'
    | 'order_preparing'
    | 'order_ready_for_pickup'
    | 'review_requested';
  locale?: string;
  order: {
    customerAddress?: null | string;
    customerPhone?: null | string;
    deliveryPreference?: null | string;
    fulfillmentType?: null | string;
    id: number;
    items: unknown;
    paymentPreference?: null | string;
    paymentStatus?: null | string;
    status: string;
    totalPrice: string;
  };
  organizationId: string;
};
type OrderModificationResult = AIEmployeeOrderModificationResult;
type CustomerDetails = AIEmployeeCustomerDetails;
type ConversationCart = AIEmployeeConversationCart;
type CancelledCartSnapshot = AIEmployeeCancelledCartSnapshot;
type VisibleSystemAction = AIOrchestrationVisibleSystemAction;
type AIOrchestrationTrace = AIEmployeeOrchestrationTrace;
type ReplyGuardResult = AIEmployeeReplyGuardResult;
type DialogueState = AIEmployeeDialogueState;

type ConversationMessageMetadata = {
  aiOrchestration?: AIOrchestrationTrace;
  cancelledCartSnapshot?: unknown;
  cartMutation?: unknown;
  currentCart?: unknown;
  customerDetails?: unknown;
  clientSubmissionId?: unknown;
  missingDetails?: unknown;
  orderCancellation?: unknown;
  orderId?: unknown;
  orderModification?: unknown;
  productCards?: unknown;
  shouldDisplayInChat?: unknown;
  unavailableProduct?: unknown;
  visibleSystemActions?: unknown;
};

type ConversationMetadata = {
  aiOrchestration?: AIOrchestrationTrace;
  cancelledCartSnapshot?: CancelledCartSnapshot | null;
  currentCart?: ConversationCart;
  customerDetails?: CustomerDetails;
  lastSuggestedProducts?: NonNullable<ConversationDecision['suggestedProducts']>;
  lastOrder?: {
    completedAt?: string;
    id: number;
    status?: string;
  };
  lastDialogueState?: DialogueState;
  lastAskedFor?: CustomerNeed | null;
  missingDetails?: CustomerNeed[];
  pendingOrderModification?: {
    confirmationRequestedAt: string;
    items: AgentOrderItem[];
    orderId: number;
    type: 'add_items';
  };
  pendingSeparateAddOnOrder?: AddOnOrderContext;
  pendingSupportIssue?: {
    capturedAt: string;
    message: string;
    referencedOrderId?: null | number;
  } | null;
  unavailableProduct?: ConversationDecision['unavailableProduct'] | null;
};

const analyzeRequestedProducts = async (params: {
  channel: string;
  externalThreadId: string;
  message: string;
  organizationId: string;
}) => {
  // `image` is intentionally excluded: catalog images are base64 data URLs
  // (megabytes each) and this runs on every inbound AI message. Images are
  // hydrated only for the few suggested/unavailable products after the decision.
  const products = await db
    .select({
      category: productsTable.category,
      description: productsTable.description,
      id: productsTable.id,
      metadata: productsTable.metadata,
      name: productsTable.name,
      price: productsTable.price,
    })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.organizationId, params.organizationId),
        eq(productsTable.isActive, true),
      ),
    );
  const [existingConversation] = await db
    .select({ metadata: conversationsTable.metadata })
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.organizationId, params.organizationId),
        eq(conversationsTable.channel, params.channel),
        eq(conversationsTable.externalThreadId, params.externalThreadId),
      ),
    )
    .limit(1);
  const previousMetadata = (existingConversation?.metadata ?? {}) as ConversationMetadata;

  const catalog = products
    .map((product) => {
      const metadata = normalizeProductCatalogMetadata(product.metadata);

      return {
        aiVisible: metadata.aiVisible,
        availability: metadata.availability,
        brand: metadata.brand,
        category: product.category,
        description: product.description,
        id: product.id,
        image: null,
        name: product.name,
        price: product.price,
        productType: metadata.productType,
        tags: metadata.tags,
        unit: metadata.unit,
      };
    });
  const previousUnavailableProduct = previousMetadata.unavailableProduct
    ? catalog.find(product => product.id === previousMetadata.unavailableProduct?.id)
    : undefined;
  const salesAnalysis = analyzeSalesConversation({
    catalog,
    message: params.message,
    previousSuggestedProductIds: previousMetadata.lastSuggestedProducts?.map(product => product.id),
    previousUnavailableProduct,
  });

  return {
    catalog,
    previousMetadata,
    requestedItems: salesAnalysis.requestedItems,
    signals: salesAnalysis.signals,
    suggestedProducts: salesAnalysis.suggestedProducts,
    unavailableProduct: salesAnalysis.unavailableProduct,
  };
};

export const generateCustomerReplyForSystemEvent = async (
  params: CustomerSystemEventReplyParams,
) => {
  const config = await getPlatformAIProviderConfig();

  if (!config.enabled || !config.apiKey) {
    return undefined;
  }

  const { aiSettings, storeName } = await getStoreAIProfile(params.organizationId);
  try {
    assertCanPerformAIAction(aiSettings, AI_AUDIT_ACTION.REPLY);

    if (params.eventType === 'review_requested') {
      assertCanPerformAIAction(aiSettings, AI_AUDIT_ACTION.CAPTURE_REVIEW);
    }
  } catch {
    return undefined;
  }

  try {
    return await generateAIEmployeeSystemEventReply({
      assistantDisplayName: aiSettings.displayName,
      config,
      eventType: params.eventType,
      locale: params.locale,
      order: params.order,
      storeName,
    });
  } catch {
    return undefined;
  }
};

export const handleCustomerMessageWithAIEmployee = async (input: IncomingCustomerMessage) => {
  const message = incomingCustomerMessageSchema.parse(input);
  await assertStoreFeatureEnabled(message.organizationId, 'ai');
  const { aiSettings, storeName } = await getStoreAIProfile(message.organizationId);
  const storeContext = await loadStoreAIContext({
    organizationId: message.organizationId,
  });

  try {
    assertCanPerformAIAction(aiSettings, AI_AUDIT_ACTION.REPLY);
  } catch (error) {
    await logAIAction({
      actionType: AI_AUDIT_ACTION.REPLY,
      allowed: false,
      metadata: {
        error: error instanceof Error ? error.message : 'AI reply blocked',
      },
      organizationId: message.organizationId,
      requiredPermission: getRequiredAIPermission(AI_AUDIT_ACTION.REPLY),
      summary: 'AI reply blocked by store settings.',
    });

    throw error;
  }

  const {
    catalog,
    previousMetadata,
    requestedItems,
    signals,
    suggestedProducts,
    unavailableProduct,
  } = await analyzeRequestedProducts({
    channel: message.channel,
    externalThreadId: message.externalThreadId,
    message: message.body,
    organizationId: message.organizationId,
  });
  const semanticHints = sanitizeAIEmployeeSystemSemanticHints({
    hints: message.semanticHints,
    previousMetadata,
  });
  const isSystemSemanticAction = message.suppressCustomerEcho === true
    && message.body === 'system_action'
    && Boolean(message.semanticHints);
  if (isSystemSemanticAction && !hasMeaningfulAIEmployeeSemanticHints(semanticHints)) {
    const [existingConversation] = await db
      .select({ id: conversationsTable.id })
      .from(conversationsTable)
      .where(
        and(
          eq(conversationsTable.organizationId, message.organizationId),
          eq(conversationsTable.channel, message.channel),
          eq(conversationsTable.externalThreadId, message.externalThreadId),
        ),
      )
      .limit(1);
    const previousVisibleSystemActions = getVisibleAIEmployeeSystemActions({
      cancelledCartSnapshot: previousMetadata.cancelledCartSnapshot,
      cart: previousMetadata.currentCart,
      missingDetails: previousMetadata.missingDetails ?? [],
      suggestedProducts: previousMetadata.lastSuggestedProducts ?? [],
    });
    const previousOrchestration = previousMetadata.aiOrchestration ?? {
      executionResult: {
        ignoredEmptySystemAction: true,
      },
      issues: ['empty_system_action_ignored'],
      modelIntent: {
        systemSemanticAction: true,
      },
      protocolVersion: '2026-05-28.v1',
      quality: evaluateAIOrchestrationQuality({
        cartActive: Boolean(previousMetadata.currentCart?.items.length),
        issues: ['empty_system_action_ignored'],
        replyGuarded: false,
        systemNextCustomerNeed: previousMetadata.lastAskedFor ?? null,
        visibleSystemActions: previousVisibleSystemActions,
      }),
      systemDecision: {
        cartActive: Boolean(previousMetadata.currentCart?.items.length),
        missingDetails: previousMetadata.missingDetails ?? [],
        nextCustomerNeed: previousMetadata.lastAskedFor ?? null,
        visibleSystemActions: previousVisibleSystemActions,
      },
      systemDecisionReasons: ['empty_system_action_ignored'],
    } satisfies AIOrchestrationTrace;
    const previousReplyToCustomer = buildAIEmployeeStateFallbackReply({
      cart: previousMetadata.currentCart,
      customerDetails: previousMetadata.customerDetails ?? {},
      locale: message.locale ?? aiSettings.fallbackLanguage,
      orderId: previousMetadata.currentCart?.status === 'submitted'
        ? previousMetadata.currentCart.orderId
        : undefined,
      visibleSystemActions: previousVisibleSystemActions,
    }) ?? '';

    await logAIAction({
      actionType: 'ai_orchestration_issue',
      aiConfidence: 0,
      allowed: true,
      conversationId: existingConversation?.id,
      metadata: {
        issues: ['empty_system_action_ignored'],
        visibleSystemActions: previousVisibleSystemActions,
      },
      organizationId: message.organizationId,
      summary: 'Empty system action ignored without changing conversation state.',
    });

    return {
      aiOrchestration: previousOrchestration,
      cancelledCartSnapshot: previousMetadata.cancelledCartSnapshot,
      cartMutation: {
        cartActive: Boolean(previousMetadata.currentCart?.items.length),
        type: 'none',
      },
      conversationId: existingConversation?.id ?? 0,
      currentCart: previousMetadata.currentCart,
      customerDetails: previousMetadata.customerDetails,
      intent: 'general_question',
      missingDetails: previousMetadata.missingDetails ?? [],
      orderId: previousMetadata.currentCart?.orderId ?? previousMetadata.lastOrder?.id,
      orderCancellation: {
        applied: false,
        requested: false,
        requiresStoreReview: false,
      },
      orderModification: {
        created: false,
      },
      replyToCustomer: previousReplyToCustomer,
      reviewCaptured: false,
      suggestedProducts: previousMetadata.lastSuggestedProducts ?? [],
      unavailableProduct: previousMetadata.unavailableProduct ?? null,
      visibleSystemActions: previousVisibleSystemActions,
    };
  }
  const restorableCancelledCartSnapshot = getRestorableAIEmployeeCancelledCartSnapshot(
    previousMetadata.cancelledCartSnapshot,
  );
  const restoredCartFromSnapshot = semanticHints?.restoreCancelledCart === true
    && restorableCancelledCartSnapshot
    ? {
        ...restorableCancelledCartSnapshot.cart,
        confirmationRequestedAt: undefined,
        updatedAt: new Date().toISOString(),
      }
    : undefined;
  const cartRestoredThisTurn = Boolean(restoredCartFromSnapshot);
  const availableCatalog = catalog.filter((product) => {
    return product.aiVisible !== false
      && (product.availability ?? 'available') !== 'unavailable';
  });
  const selectedCatalogProduct = semanticHints?.selectedProductId
    ? availableCatalog.find(product => product.id === semanticHints.selectedProductId)
    : undefined;
  const systemEvent = buildAIEmployeeSystemEventContext(semanticHints, {
    findCartItemName: (productId) => {
      return previousMetadata.currentCart?.items.find((item) => {
        return item.productId === productId;
      })?.name;
    },
    findProductName: (productId) => {
      return selectedCatalogProduct?.id === productId
        ? selectedCatalogProduct.name
        : availableCatalog.find(product => product.id === productId)?.name;
    },
  });
  const rawSemanticUnderstanding: SemanticMessageUnderstanding = isSystemSemanticAction
    ? {}
    : await analyzeAIEmployeeMessageSemantics({
        cart: previousMetadata.currentCart,
        customerDetails: previousMetadata.customerDetails,
        lastAskedFor: previousMetadata.lastAskedFor,
        message: message.body,
        previousMissingDetails: previousMetadata.missingDetails,
        previousDialogueState: previousMetadata.lastDialogueState,
        storeContext,
        storeName,
      });
  const semanticUnderstanding = constrainAIEmployeeSemanticUnderstandingToStoreMethods(
    {
      ...rawSemanticUnderstanding,
      checkoutRequested: AIEmployeeSemanticHintsContinueCheckout(semanticHints)
        || rawSemanticUnderstanding.checkoutRequested,
      customerAddress: semanticHints?.customerAddress
        ?? rawSemanticUnderstanding.customerAddress,
      customerConfirmedOrder: semanticHints?.customerConfirmedOrder,
      deliveryPreference: semanticHints?.deliveryPreference,
      dialogueState: semanticHints?.startNewOrder === true
        ? 'order_request'
        : semanticHints?.dialogueState
          ?? rawSemanticUnderstanding.dialogueState,
      fulfillmentType: semanticHints?.fulfillmentType,
      paymentPreference: semanticHints?.paymentPreference,
      referencedOrderId: semanticHints?.referencedOrderId,
      replaceExistingQuantity: semanticHints?.replaceExistingQuantity
        ?? rawSemanticUnderstanding.replaceExistingQuantity,
      requestedQuantity: semanticHints?.requestedQuantity
        ?? rawSemanticUnderstanding.requestedQuantity,
      cartItemRemovalRequested: semanticHints?.removeCartItemProductId
        ? true
        : rawSemanticUnderstanding.cartItemRemovalRequested,
      removeCartItemProductId: semanticHints?.removeCartItemProductId,
      supportEscalationConfirmed: semanticHints?.supportEscalationConfirmed
        ?? rawSemanticUnderstanding.supportEscalationConfirmed,
    },
    storeContext,
    {
      lastAskedFor: previousMetadata.lastAskedFor,
      message: message.body,
      previousCustomerDetails: previousMetadata.customerDetails,
      previousMissingDetails: previousMetadata.missingDetails,
    },
  );
  const customerConfirmedOrder = semanticHints?.customerConfirmedOrder === true;
  const customerCancelledOrder = semanticHints?.customerCancelledOrder === true;
  const entryOperationalContext = resolveCustomerEntryOperationalContext(message.channel);
  const isSystemControlledConfirmationTurn = previousMetadata.lastAskedFor === 'order_confirmation'
    || Boolean(previousMetadata.currentCart?.confirmationRequestedAt);
  const shouldCancelPendingSystemAction = customerCancelledOrder && isSystemControlledConfirmationTurn;
  const shouldProtectSystemConfirmationFromFreeText = isSystemControlledConfirmationTurn
    && !isSystemSemanticAction
    && !customerConfirmedOrder
    && !customerCancelledOrder
    && rawSemanticUnderstanding.dialogueState === 'order_confirmation'
    && requestedItems.length === 0
    && suggestedProducts.length === 0
    && !unavailableProduct;
  const guardedSemanticUnderstanding = isSystemControlledConfirmationTurn
    && !customerConfirmedOrder
    && !customerCancelledOrder
    && shouldProtectSystemConfirmationFromFreeText
    ? {
        ...semanticUnderstanding,
        cartItemRemovalRequested: semanticHints?.removeCartItemProductId
          ? semanticUnderstanding.cartItemRemovalRequested
          : undefined,
        dialogueState: undefined,
      }
    : semanticUnderstanding;
  const effectiveSemanticUnderstanding = {
    ...guardedSemanticUnderstanding,
    deliveryPreference: entryOperationalContext.deliveryPreference
      ?? guardedSemanticUnderstanding.deliveryPreference,
    fulfillmentType: entryOperationalContext.fulfillmentType
      ?? guardedSemanticUnderstanding.fulfillmentType,
  };
  const cartQuantityChange = resolveAIEmployeeCartQuantityChange({
    previousCart: previousMetadata.currentCart,
    semanticHints,
    semanticUnderstanding: effectiveSemanticUnderstanding,
  });
  const cartMutationSemanticUnderstanding: SemanticMessageUnderstanding = {
    ...effectiveSemanticUnderstanding,
    cartItemRemovalRequested: semanticHints?.removeCartItemProductId
      ? true
      : undefined,
    removeCartItemProductId: semanticHints?.removeCartItemProductId,
    replaceExistingQuantity: cartQuantityChange?.replaceExistingQuantity,
    requestedQuantity: cartQuantityChange?.requestedQuantity,
  };
  const systemSelectedRequestedItems = semanticHints?.addAllSuggestedProducts
    && previousMetadata.lastSuggestedProducts?.length
    ? previousMetadata.lastSuggestedProducts.map(product => toAIEmployeeOrderItem(product))
    : selectedCatalogProduct
      ? [toAIEmployeeOrderItem(selectedCatalogProduct, semanticHints?.requestedQuantity ?? 1)]
      : [];
  const cartItemRemovalRequest = Boolean(semanticHints?.removeCartItemProductId);
  const shouldApplyRequestedItems = shouldApplyRequestedItemsToCart(effectiveSemanticUnderstanding);
  const catalogInquiryHasComparableChoices = effectiveSemanticUnderstanding.dialogueState === 'catalog_inquiry'
    && suggestedProducts.length > 1;
  const customerRequestedProductChoices = Boolean(
    selectedCatalogProduct
    || requestedItems.length > 0
    || unavailableProduct
    || catalogInquiryHasComparableChoices
    || effectiveSemanticUnderstanding.dialogueState === 'order_request'
    || effectiveSemanticUnderstanding.requestedCustomerNeed === 'requested_product',
  );
  const textMatchedSuggestedProducts = requestedItems
    .map((item) => {
      const product = availableCatalog.find(candidate => candidate.id === item.productId);

      return product ? toSuggestedProduct(product) : undefined;
    })
    .filter((product): product is ConversationSuggestedProduct => Boolean(product));
  const singleCatalogSuggestedProducts = requestedItems.length === 0
    && availableCatalog.length === 1
    && effectiveSemanticUnderstanding.dialogueState === 'order_request'
    ? [toSuggestedProduct(availableCatalog[0]!)]
    : [];
  let analyzedRequestedItems: AgentOrderItem[] = [];
  if (systemSelectedRequestedItems.length > 0) {
    analyzedRequestedItems = systemSelectedRequestedItems;
  } else if (cartItemRemovalRequest || !shouldApplyRequestedItems) {
    analyzedRequestedItems = [];
  } else {
    analyzedRequestedItems = [];
  }
  let analyzedSuggestedProducts = customerRequestedProductChoices
    ? suggestedProducts
    : [];
  if (semanticHints?.startNewOrder === true) {
    analyzedSuggestedProducts = availableCatalog
      .slice(0, MAX_PRODUCT_CARDS_IN_CHAT)
      .map(toSuggestedProduct);
  } else if (systemSelectedRequestedItems.length > 0 || cartItemRemovalRequest) {
    analyzedSuggestedProducts = [];
  } else if (textMatchedSuggestedProducts.length > 0) {
    analyzedSuggestedProducts = textMatchedSuggestedProducts;
  } else if (singleCatalogSuggestedProducts.length > 0) {
    analyzedSuggestedProducts = singleCatalogSuggestedProducts;
  }
  const contextualSuggestedProducts = analyzedSuggestedProducts;
  const candidateCart = restoredCartFromSnapshot
    ?? buildAIEmployeeCartState(
      previousMetadata.currentCart,
      analyzedRequestedItems,
      message.body,
      cartMutationSemanticUnderstanding,
    );
  const extractedCustomerDetails = extractAIEmployeeCustomerDetails(
    previousMetadata.customerDetails,
    message.body,
    message.customer,
    message.customerAddress,
    effectiveSemanticUnderstanding,
  );
  const baseCustomerDetails = extractedCustomerDetails ?? {};
  const deliveryPreference = effectiveSemanticUnderstanding.deliveryPreference
    ?? baseCustomerDetails.deliveryPreference;
  const paymentPreference = effectiveSemanticUnderstanding.paymentPreference
    ?? baseCustomerDetails.paymentPreference;
  const allowedPaymentPreferences = getAllowedAIEmployeePaymentPreferences(
    storeContext,
    deliveryPreference,
  );
  const customerDetails = {
    ...baseCustomerDetails,
    deliveryPreference,
    paymentPreference: paymentPreference
      && allowedPaymentPreferences.includes(paymentPreference)
      ? paymentPreference
      : undefined,
  };
  const deliveryCustomerAddress = getAIEmployeeDeliveryCustomerAddress(
    customerDetails,
    message.customerAddress,
  );
  const dialogue = orchestrateAIEmployeeDialogueState({
    cart: candidateCart,
    customerCancelledOrder,
    customerConfirmedOrder,
    lastOrder: previousMetadata.lastOrder,
    message: message.body,
    requestedItems: analyzedRequestedItems,
    semanticUnderstanding: effectiveSemanticUnderstanding,
    suggestedProducts: contextualSuggestedProducts,
  });
  const effectiveRequestedItems = dialogue.shouldSuppressCommerce ? [] : analyzedRequestedItems;
  const effectiveSuggestedProducts = dialogue.shouldSuppressCommerce ? [] : contextualSuggestedProducts;
  const cartClearedThisTurn = !cartRestoredThisTurn
    && dialogue.shouldClearCart
    && Boolean(previousMetadata.currentCart?.items.length);
  const currentCart = restoredCartFromSnapshot
    ?? (dialogue.shouldClearCart
      ? undefined
      : buildAIEmployeeCartState(
          previousMetadata.currentCart,
          effectiveRequestedItems,
          message.body,
          cartMutationSemanticUnderstanding,
        ));
  const nextCancelledCartSnapshot = semanticHints?.startNewOrder === true
    ? null
    : cartClearedThisTurn
      ? buildAIEmployeeCancelledCartSnapshot(previousMetadata.currentCart) ?? null
      : currentCart?.items.length || cartRestoredThisTurn
        ? null
        : restorableCancelledCartSnapshot ?? null;
  const previousSubmittedCart = previousMetadata.currentCart?.status === 'submitted'
    ? previousMetadata.currentCart
    : undefined;
  const preDecisionCustomerOrders = await loadAIEmployeeCustomerOrderSnapshot({
    currentCart: currentCart ?? previousSubmittedCart,
    customerAddress: deliveryCustomerAddress,
    customerEmail: customerDetails?.email ?? message.customer.email,
    customerPhone: customerDetails?.phone ?? message.customer.phone,
    externalThreadId: message.externalThreadId,
    lastOrder: previousMetadata.lastOrder,
    organizationId: message.organizationId,
    referencedOrderId: dialogue.referencedOrderId,
  });
  const preferredOpenOrderId = previousMetadata.pendingOrderModification?.orderId
    ?? dialogue.referencedOrderId
    ?? previousSubmittedCart?.orderId
    ?? previousMetadata.lastOrder?.id
    ?? null;
  const preferredOpenOrder = preferredOpenOrderId
    ? preDecisionCustomerOrders.open.find((order) => {
        return order.id === preferredOpenOrderId;
      })
    : undefined;
  const fallbackModifiableOpenOrder = preDecisionCustomerOrders.open.find((order) => {
    return canAIEmployeeAddItemsToExistingOrder(order);
  });
  const targetOpenOrder = preferredOpenOrder && canAIEmployeeAddItemsToExistingOrder(preferredOpenOrder)
    ? preferredOpenOrder
    : fallbackModifiableOpenOrder;
  const targetOpenOrderId = targetOpenOrder?.id;
  const orderModificationItems = effectiveRequestedItems;
  const shouldStartExistingOrderModification = Boolean(
    targetOpenOrderId
    && orderModificationItems.length > 0
    && (
      previousSubmittedCart
      || previousMetadata.lastOrder?.id === targetOpenOrderId
      || semanticUnderstanding.existingOrderModificationRequested === true
      || semanticUnderstanding.existingOrderModificationConfirmed === true
    ),
  );
  const blockedPreferredOpenOrder = (
    preferredOpenOrder
    && !canAIEmployeeAddItemsToExistingOrder(preferredOpenOrder)
    && isAIEmployeeOrderInDeliveryStage(preferredOpenOrder)
  )
    ? preferredOpenOrder
    : undefined;
  const fallbackDeliveryStageOpenOrder = targetOpenOrder
    ? undefined
    : getMostRelevantAIEmployeeDeliveryStageOpenOrder(preDecisionCustomerOrders);
  const deliveryStageAddOnSourceOrder = shouldStartExistingOrderModification
    ? undefined
    : orderModificationItems.length > 0
      ? blockedPreferredOpenOrder
      ?? fallbackDeliveryStageOpenOrder
      : undefined;
  const rawAddOnOrderContext = previousMetadata.pendingSeparateAddOnOrder;
  const originalAddOnOrder = rawAddOnOrderContext
    ? await loadAIEmployeeOrderLifecycleState({
        orderId: rawAddOnOrderContext.originalOrderId,
        organizationId: message.organizationId,
      })
    : null;
  const nextAddOnOrderSnapshot = rawAddOnOrderContext
    ? orderModificationItems.length > 0
      ? buildAIEmployeeAddOnOrderSnapshot(orderModificationItems, customerDetails)
      : rawAddOnOrderContext.snapshot?.items?.length > 0
        ? rawAddOnOrderContext.snapshot
        : buildAIEmployeeAddOnOrderSnapshot(orderModificationItems, customerDetails)
    : undefined;
  const addOnOrderContext = rawAddOnOrderContext
    && originalAddOnOrder
    && isAIEmployeeOrderInDeliveryStage(originalAddOnOrder)
    && originalAddOnOrder.status !== ORDER_STATUS.COMPLETED
    && originalAddOnOrder.status !== ORDER_STATUS.CANCELLED
    && nextAddOnOrderSnapshot
    ? {
        ...rawAddOnOrderContext,
        originalOrderStatus: originalAddOnOrder.status,
        snapshot: nextAddOnOrderSnapshot,
      }
    : undefined;
  const activeAddOnOrderContext = shouldCancelPendingSystemAction
    ? undefined
    : addOnOrderContext;
  const blockedOriginalOrder = deliveryStageAddOnSourceOrder
    ?? (
      rawAddOnOrderContext
      && originalAddOnOrder
      && isAIEmployeeOrderInDeliveryStage(originalAddOnOrder)
        ? originalAddOnOrder
        : undefined
    );
  const addOnOrderBlockedContext = blockedOriginalOrder
    ? {
        originalDeliveryStatus: blockedOriginalOrder.deliveryStatus,
        originalOrderId: blockedOriginalOrder.id,
        originalOrderStatus: blockedOriginalOrder.status,
        reason: 'original_order_out_for_delivery' as const,
        separateOrderMayRequireExtraDeliveryCost: true as const,
      }
    : undefined;
  const pendingSeparateAddOnOrder = shouldCancelPendingSystemAction
    ? undefined
    : (
        activeAddOnOrderContext
        ?? (
          addOnOrderBlockedContext
          && orderModificationItems.length > 0
            ? {
                confirmationRequestedAt: new Date().toISOString(),
                mode: 'separate_order_after_store_approval' as const,
                originalOrderId: addOnOrderBlockedContext.originalOrderId,
                originalOrderStatus: addOnOrderBlockedContext.originalOrderStatus,
                snapshot: buildAIEmployeeAddOnOrderSnapshot(
                  orderModificationItems,
                  customerDetails,
                ),
              }
            : undefined
        )
      );
  const pendingOrderModification = shouldCancelPendingSystemAction
    ? undefined
    : previousMetadata.pendingOrderModification
      ? {
          ...previousMetadata.pendingOrderModification,
          items: orderModificationItems.length > 0
            ? mergeAIEmployeeCartItems(
                previousMetadata.pendingOrderModification.items,
                orderModificationItems,
                {
                  replaceExisting: cartMutationSemanticUnderstanding.replaceExistingQuantity === true,
                },
              )
            : previousMetadata.pendingOrderModification.items,
        }
      : shouldStartExistingOrderModification && targetOpenOrderId
        ? {
            confirmationRequestedAt: new Date().toISOString(),
            items: orderModificationItems,
            orderId: targetOpenOrderId,
            type: 'add_items' as const,
          }
        : undefined;
  if (effectiveRequestedItems.length > 0 || effectiveSuggestedProducts.length > 0) {
    try {
      assertCanPerformAIAction(aiSettings, AI_AUDIT_ACTION.RECOMMEND_PRODUCTS);
    } catch (error) {
      await logAIAction({
        actionType: AI_AUDIT_ACTION.RECOMMEND_PRODUCTS,
        allowed: false,
        metadata: {
          matchedProductIds: effectiveRequestedItems.map(item => item.productId),
          salesSignals: signals,
          suggestedProductIds: effectiveSuggestedProducts.map(product => product.id),
        },
        organizationId: message.organizationId,
        requiredPermission: getRequiredAIPermission(AI_AUDIT_ACTION.RECOMMEND_PRODUCTS),
        summary: 'Product recommendation blocked by store settings.',
      });

      throw error;
    }
  }

  const decision = await buildDecision({
    cart: currentCart,
    checkoutRequested: semanticUnderstanding.checkoutRequested,
    customerConfirmedOrder,
    customerDetails,
    dialogueState: dialogue.state,
    existingOrderModificationInProgress: Boolean(
      pendingOrderModification
      || semanticUnderstanding.existingOrderModificationConfirmed,
    ),
    items: effectiveRequestedItems,
    suggestedProducts: effectiveSuggestedProducts,
    unavailableProduct: dialogue.shouldSuppressCommerce ? undefined : unavailableProduct,
  });
  // Hydrate base64 images only for the handful of products the customer will
  // actually see (suggestion cards + an unavailable-product reference). The bulk
  // catalog load above excludes images to avoid loading every product's data URL
  // on every message. All downstream persists/returns read decision.* so doing it
  // here once covers the conversation metadata and the customer response.
  if ((decision.suggestedProducts?.length ?? 0) > 0 || decision.unavailableProduct) {
    const decisionImages = await loadProductImageMap(message.organizationId, [
      ...(decision.suggestedProducts ?? []).map(product => product.id),
      ...(decision.unavailableProduct ? [decision.unavailableProduct.id] : []),
    ]);

    if (decision.suggestedProducts) {
      decision.suggestedProducts = decision.suggestedProducts.map(product => ({
        ...product,
        image: decisionImages.get(product.id) ?? product.image ?? null,
      }));
    }

    if (decision.unavailableProduct) {
      decision.unavailableProduct = {
        ...decision.unavailableProduct,
        image: decisionImages.get(decision.unavailableProduct.id)
          ?? decision.unavailableProduct.image
          ?? null,
      };
    }
  }
  const shouldRequestCustomerOrderConfirmation = decision.requiresCustomerConfirmation === true
    && currentCart?.status === 'collecting'
    && currentCart.items.length > 0;
  const rawCurrentCartForConversation = shouldRequestCustomerOrderConfirmation
    ? {
        ...currentCart,
        confirmationRequestedAt: currentCart.confirmationRequestedAt ?? new Date().toISOString(),
      }
    : currentCart;
  const currentCartForConversation = applyAIEmployeeCartPricing(rawCurrentCartForConversation, {
    customerDetails,
    storeContext,
  });
  const cartMutation = buildAIEmployeeCartMutationContext({
    cartClearedThisTurn,
    cartRestoredThisTurn,
    currentCart: currentCartForConversation,
    incomingItems: effectiveRequestedItems,
    previousCart: previousMetadata.currentCart,
    quantityChange: cartQuantityChange,
    semanticHints,
  });
  const pendingProductSelectionNeed = getPendingAIEmployeeProductSelectionNeed({
    cartMutation,
    requestedItems: effectiveRequestedItems,
    suggestedProducts: decision.suggestedProducts ?? [],
  });
  const nextCustomerNeed = getNextAIEmployeeCustomerNeed(decision);
  const pendingOrderModificationNeedsConfirmation = Boolean(
    pendingOrderModification
    && !customerConfirmedOrder
    && semanticUnderstanding.existingOrderModificationConfirmed !== true,
  );
  const requestedNeedCanAdvanceCheckout = canAdvanceCustomerNeedBeforeReply({
    checkoutRequested: effectiveSemanticUnderstanding.checkoutRequested,
    requestedCustomerNeed: effectiveSemanticUnderstanding.requestedCustomerNeed,
    systemSemanticAction: isSystemSemanticAction,
  });
  let requestedCustomerNeedFromModel = pendingProductSelectionNeed
    ?? validateAIEmployeeRequestedCustomerNeed({
      cart: currentCartForConversation,
      customerDetails,
      decision,
      pendingOrderModificationNeedsConfirmation,
      requestedNeed: requestedNeedCanAdvanceCheckout
        ? semanticUnderstanding.requestedCustomerNeed
        : undefined,
    });
  let systemNextCustomerNeed = pendingOrderModificationNeedsConfirmation
    ? 'order_confirmation'
    : pendingProductSelectionNeed ?? requestedCustomerNeedFromModel ?? nextCustomerNeed;
  let customerFacingMissingDetails = systemNextCustomerNeed
    ? [systemNextCustomerNeed]
    : decision.missingDetails;
  let visibleSystemActions = getVisibleAIEmployeeSystemActions({
    cancelledCartSnapshot: nextCancelledCartSnapshot,
    cart: currentCartForConversation,
    missingDetails: customerFacingMissingDetails,
    suggestedProducts: decision.suggestedProducts ?? [],
  });
  let orchestrationSemanticUnderstanding = effectiveSemanticUnderstanding;
  const aiOrchestrationBeforeExecution = buildAIEmployeeOrchestrationTrace({
    cancelledCartSnapshot: nextCancelledCartSnapshot,
    cart: currentCartForConversation,
    cartMutation,
    customerFacingMissingDetails,
    decision,
    dialogue,
    effectiveRequestedItems,
    effectiveSuggestedProducts,
    executionResult: {
      orderCreated: false,
      orderModificationCreated: false,
    },
    isSystemSemanticAction,
    requestedCustomerNeedFromModel,
    semanticHints,
    semanticUnderstanding: orchestrationSemanticUnderstanding,
    systemNextCustomerNeed,
    visibleSystemActions,
  });
  const supportEscalationRequested = false;
  const nextPendingSupportIssue = null;
  const addOnSnapshotCart = activeAddOnOrderContext
    ? {
        items: activeAddOnOrderContext.snapshot.items,
        orderId: null,
        status: 'collecting' as const,
        subtotal: activeAddOnOrderContext.snapshot.subtotal,
        updatedAt: activeAddOnOrderContext.snapshot.updatedAt,
      }
    : undefined;
  const addOnMissingDetails = activeAddOnOrderContext
    ? getMissingAIEmployeeOrderDetails({
        cart: addOnSnapshotCart,
        customerDetails: activeAddOnOrderContext.snapshot.customerDetails ?? customerDetails,
      })
    : [];
  const separateAddOnConfirmed = Boolean(
    activeAddOnOrderContext
    && customerConfirmedOrder
    && activeAddOnOrderContext.snapshot.items.length > 0
    && addOnMissingDetails.length === 0
    && previousMetadata.pendingSeparateAddOnOrder?.originalOrderId === activeAddOnOrderContext.originalOrderId,
  );

  if (decision.intent === 'order_request' && effectiveRequestedItems.length > 0) {
    try {
      assertCanPerformAIAction(aiSettings, AI_AUDIT_ACTION.BUILD_CART);
    } catch (error) {
      await logAIAction({
        actionType: AI_AUDIT_ACTION.BUILD_CART,
        aiConfidence: decision.confidence,
        allowed: false,
        metadata: {
          matchedProductIds: (currentCartForConversation?.items ?? effectiveRequestedItems).map(item => item.productId),
        },
        organizationId: message.organizationId,
        requiredPermission: getRequiredAIPermission(AI_AUDIT_ACTION.BUILD_CART),
        summary: 'Cart preparation blocked by store settings.',
      });

      throw error;
    }
  }

  if (decision.shouldCreateDraftOrder || separateAddOnConfirmed) {
    try {
      assertCanPerformAIAction(aiSettings, AI_AUDIT_ACTION.CREATE_ORDER);
    } catch (error) {
      await logAIAction({
        actionType: AI_AUDIT_ACTION.CREATE_ORDER,
        aiConfidence: decision.confidence,
        allowed: false,
        metadata: {
          matchedProductIds: effectiveRequestedItems.map(item => item.productId),
        },
        organizationId: message.organizationId,
        requiredPermission: getRequiredAIPermission(AI_AUDIT_ACTION.CREATE_ORDER),
        summary: 'Order creation blocked by store settings.',
      });

      throw error;
    }
  }

  const [customer] = await db
    .insert(customersTable)
    .values({
      displayName: customerDetails?.name ?? message.customer.name,
      email: customerDetails?.email ?? message.customer.email,
      externalId: message.customer.externalId,
      lastContactAt: new Date(),
      organizationId: message.organizationId,
      phone: customerDetails?.phone ?? message.customer.phone,
      sourceChannel: message.channel,
    })
    .onConflictDoUpdate({
      set: {
        displayName: customerDetails?.name ?? message.customer.name,
        email: customerDetails?.email ?? message.customer.email,
        lastContactAt: new Date(),
        phone: customerDetails?.phone ?? message.customer.phone,
      },
      target: [
        customersTable.organizationId,
        customersTable.sourceChannel,
        customersTable.externalId,
      ],
    })
    .returning({ id: customersTable.id });

  const [conversation] = await db
    .insert(conversationsTable)
    .values({
      aiStatus: 'processing',
      channel: message.channel,
      customerId: customer?.id,
      externalThreadId: message.externalThreadId,
      lastMessageAt: new Date(),
      lastMessagePreview: message.body.slice(0, 180),
      metadata: {
        aiOrchestration: aiOrchestrationBeforeExecution,
        cancelledCartSnapshot: nextCancelledCartSnapshot,
        currentCart: currentCartForConversation,
        customerDetails,
        currentIntent: decision.intent,
        lastAskedFor: systemNextCustomerNeed,
        lastDialogueState: dialogue.state,
        lastOrder: previousMetadata.lastOrder,
        lastSuggestedProducts: decision.suggestedProducts ?? [],
        salesSignals: signals,
        missingDetails: customerFacingMissingDetails,
        pendingSeparateAddOnOrder,
        pendingSupportIssue: nextPendingSupportIssue,
        policyVersion: decision.policyVersion,
        unavailableProduct: decision.unavailableProduct ?? null,
      },
      organizationId: message.organizationId,
      status: 'open',
    })
    .onConflictDoUpdate({
      set: {
        aiStatus: 'processing',
        customerId: customer?.id,
        lastMessageAt: new Date(),
        lastMessagePreview: message.body.slice(0, 180),
        metadata: {
          aiOrchestration: aiOrchestrationBeforeExecution,
          cancelledCartSnapshot: nextCancelledCartSnapshot,
          currentCart: currentCartForConversation,
          customerDetails,
          currentIntent: decision.intent,
          lastAskedFor: systemNextCustomerNeed,
          lastDialogueState: dialogue.state,
          lastOrder: previousMetadata.lastOrder,
          lastSuggestedProducts: decision.suggestedProducts ?? [],
          salesSignals: signals,
          missingDetails: customerFacingMissingDetails,
          pendingSeparateAddOnOrder,
          pendingSupportIssue: nextPendingSupportIssue,
          policyVersion: decision.policyVersion,
          unavailableProduct: decision.unavailableProduct ?? null,
        },
        status: 'open',
      },
      target: [
        conversationsTable.organizationId,
        conversationsTable.channel,
        conversationsTable.externalThreadId,
      ],
    })
    .returning({ id: conversationsTable.id });

  if (!conversation?.id) {
    throw new Error('Failed to create or update AI conversation.');
  }

  if (message.clientSubmissionId) {
    const [duplicateCustomerMessage] = await db
      .select({ id: conversationMessagesTable.id })
      .from(conversationMessagesTable)
      .where(
        and(
          eq(conversationMessagesTable.organizationId, message.organizationId),
          eq(conversationMessagesTable.conversationId, conversation.id),
          eq(conversationMessagesTable.senderType, 'customer'),
          sql`${conversationMessagesTable.metadata}->>'clientSubmissionId' = ${message.clientSubmissionId}`,
        ),
      )
      .orderBy(desc(conversationMessagesTable.id))
      .limit(1);

    if (duplicateCustomerMessage?.id) {
      const [existingReply] = await db
        .select({
          body: conversationMessagesTable.body,
          id: conversationMessagesTable.id,
          metadata: conversationMessagesTable.metadata,
        })
        .from(conversationMessagesTable)
        .where(
          and(
            eq(conversationMessagesTable.organizationId, message.organizationId),
            eq(conversationMessagesTable.conversationId, conversation.id),
            eq(conversationMessagesTable.direction, 'outbound'),
            sql`${conversationMessagesTable.id} > ${duplicateCustomerMessage.id}`,
          ),
        )
        .orderBy(conversationMessagesTable.id)
        .limit(1);

      const replyMetadata = existingReply?.metadata && typeof existingReply.metadata === 'object'
        ? existingReply.metadata as ConversationMessageMetadata
        : {};

      return {
        aiOrchestration: replyMetadata.aiOrchestration,
        cancelledCartSnapshot: replyMetadata.cancelledCartSnapshot,
        cartMutation: replyMetadata.cartMutation,
        conversationId: conversation.id,
        currentCart: replyMetadata.currentCart,
        customerDetails: replyMetadata.customerDetails,
        intent: decision.intent,
        missingDetails: Array.isArray(replyMetadata.missingDetails)
          ? replyMetadata.missingDetails.filter((item): item is string => typeof item === 'string')
          : [],
        orderId: typeof replyMetadata.orderId === 'number' ? replyMetadata.orderId : null,
        orderCancellation: replyMetadata.orderCancellation,
        orderModification: replyMetadata.orderModification,
        replyToCustomer: existingReply?.body ?? '',
        responseMessageId: existingReply?.id,
        reviewCaptured: false,
        suggestedProducts: Array.isArray(replyMetadata.productCards)
          ? replyMetadata.productCards
          : [],
        unavailableProduct: replyMetadata.unavailableProduct ?? null,
        visibleSystemActions: Array.isArray(replyMetadata.visibleSystemActions)
          ? replyMetadata.visibleSystemActions.filter((item): item is VisibleSystemAction => {
              return typeof item === 'string';
            })
          : [],
      };
    }
  }

  await logAIAction({
    actionType: AI_AUDIT_ACTION.REPLY,
    aiConfidence: decision.confidence,
    allowed: true,
    conversationId: conversation.id,
    metadata: {
      intent: decision.intent,
    },
    organizationId: message.organizationId,
    requiredPermission: getRequiredAIPermission(AI_AUDIT_ACTION.REPLY),
    summary: 'AI reply prepared for customer.',
  });

  let supportEscalation: SupportEscalationResult = { created: false };
  if (supportEscalationRequested) {
    if (!aiSettings.handoffRules.complaints) {
      await logAIAction({
        actionType: 'capture_complaint',
        aiConfidence: decision.confidence,
        allowed: false,
        conversationId: conversation.id,
        metadata: {
          previousDialogueState: previousMetadata.lastDialogueState,
        },
        organizationId: message.organizationId,
        requiredPermission: 'handoff_rules.complaints',
        summary: 'Complaint escalation blocked by store settings.',
      });

      throw new Error('Complaint escalation is disabled by store settings.');
    }

    supportEscalation = await createAIEmployeeSupportEscalationEvent({
      conversationId: conversation.id,
      currentCart: currentCartForConversation ?? previousSubmittedCart,
      customerEmail: customerDetails?.email ?? message.customer.email,
      customerPhone: customerDetails?.phone ?? message.customer.phone,
      lastOrder: previousMetadata.lastOrder,
      message: message.body,
      organizationId: message.organizationId,
      previousDialogueState: previousMetadata.lastDialogueState,
      referencedOrderId: dialogue.referencedOrderId,
      semanticUnderstanding,
      supportIssue: nextPendingSupportIssue,
    });

    if (supportEscalation.created) {
      await logAIAction({
        actionType: 'capture_complaint',
        aiConfidence: decision.confidence,
        allowed: true,
        conversationId: conversation.id,
        metadata: {
          orderId: supportEscalation.orderId,
          previousDialogueState: previousMetadata.lastDialogueState,
        },
        orderId: supportEscalation.orderId,
        organizationId: message.organizationId,
        requiredPermission: 'handoff_rules.complaints',
        summary: 'Customer complaint escalated to order events.',
      });
    }
  }
  const pendingSupportIssueForConversation = supportEscalation.created
    ? null
    : nextPendingSupportIssue;

  const orderCancellation = await handleAIEmployeeOrderCancellationRequest({
    conversationId: conversation.id,
    customerOrders: preDecisionCustomerOrders,
    organizationId: message.organizationId,
    preferredOrderId: dialogue.referencedOrderId
      ?? previousSubmittedCart?.orderId
      ?? previousMetadata.lastOrder?.id,
    requested: dialogue.state === 'cart_cancellation'
      && !shouldCancelPendingSystemAction
      && (
        preDecisionCustomerOrders.open.length > 0
        || Boolean(previousSubmittedCart?.orderId)
      ),
  });

  if (orderCancellation.requested) {
    await logAIAction({
      actionType: 'cancel_order',
      aiConfidence: decision.confidence,
      allowed: orderCancellation.applied || orderCancellation.requiresStoreReview,
      conversationId: conversation.id,
      metadata: {
        applied: orderCancellation.applied,
        reason: orderCancellation.reason,
        requiresStoreReview: orderCancellation.requiresStoreReview,
      },
      orderId: orderCancellation.orderId,
      organizationId: message.organizationId,
      summary: orderCancellation.applied
        ? 'Customer order cancelled before store approval.'
        : 'Customer cancellation request handled according to order policy.',
    });
  }

  if (effectiveRequestedItems.length > 0 || effectiveSuggestedProducts.length > 0) {
    await logAIAction({
      actionType: AI_AUDIT_ACTION.RECOMMEND_PRODUCTS,
      aiConfidence: decision.confidence,
      allowed: true,
      conversationId: conversation.id,
      metadata: {
        matchedProductIds: effectiveRequestedItems.map(item => item.productId),
        salesSignals: signals,
        suggestedProductIds: effectiveSuggestedProducts.map(product => product.id),
      },
      organizationId: message.organizationId,
      requiredPermission: getRequiredAIPermission(AI_AUDIT_ACTION.RECOMMEND_PRODUCTS),
      summary: 'AI matched products from the store catalog.',
    });
  }

  if (decision.intent === 'order_request' && effectiveRequestedItems.length > 0) {
    await logAIAction({
      actionType: AI_AUDIT_ACTION.BUILD_CART,
      aiConfidence: decision.confidence,
      allowed: true,
      conversationId: conversation.id,
      metadata: {
        itemCount: currentCartForConversation?.items.length ?? effectiveRequestedItems.length,
      },
      organizationId: message.organizationId,
      requiredPermission: getRequiredAIPermission(AI_AUDIT_ACTION.BUILD_CART),
      summary: 'AI prepared a cart draft from customer message.',
    });
  }

  const [insertedInboundMessage] = await db.insert(conversationMessagesTable).values({
    aiConfidence: decision.confidence.toFixed(2),
    aiIntent: decision.intent,
    body: message.body,
    conversationId: conversation.id,
    direction: 'inbound',
    metadata: {
      clientSubmissionId: message.clientSubmissionId,
      customer: message.customer,
      semanticHints,
      systemEvent,
      shouldDisplayInChat: message.suppressCustomerEcho !== true,
    },
    organizationId: message.organizationId,
    senderType: 'customer',
  }).onConflictDoNothing().returning({ id: conversationMessagesTable.id });

  // DB unique index on (conversation_id, metadata->>'clientSubmissionId') caught a
  // concurrent duplicate submission. Return the cached reply to prevent a second order.
  if (!insertedInboundMessage?.id && message.clientSubmissionId) {
    const [concurrentDupMsg] = await db
      .select({ id: conversationMessagesTable.id })
      .from(conversationMessagesTable)
      .where(
        and(
          eq(conversationMessagesTable.organizationId, message.organizationId),
          eq(conversationMessagesTable.conversationId, conversation.id),
          eq(conversationMessagesTable.senderType, 'customer'),
          sql`${conversationMessagesTable.metadata}->>'clientSubmissionId' = ${message.clientSubmissionId}`,
        ),
      )
      .orderBy(desc(conversationMessagesTable.id))
      .limit(1);

    if (concurrentDupMsg?.id) {
      const [existingReply] = await db
        .select({
          body: conversationMessagesTable.body,
          id: conversationMessagesTable.id,
          metadata: conversationMessagesTable.metadata,
        })
        .from(conversationMessagesTable)
        .where(
          and(
            eq(conversationMessagesTable.organizationId, message.organizationId),
            eq(conversationMessagesTable.conversationId, conversation.id),
            eq(conversationMessagesTable.direction, 'outbound'),
            sql`${conversationMessagesTable.id} > ${concurrentDupMsg.id}`,
          ),
        )
        .orderBy(conversationMessagesTable.id)
        .limit(1);

      const replyMetadata = existingReply?.metadata && typeof existingReply.metadata === 'object'
        ? existingReply.metadata as ConversationMessageMetadata
        : {};

      return {
        aiOrchestration: replyMetadata.aiOrchestration,
        cancelledCartSnapshot: replyMetadata.cancelledCartSnapshot,
        cartMutation: replyMetadata.cartMutation,
        conversationId: conversation.id,
        currentCart: replyMetadata.currentCart,
        customerDetails: replyMetadata.customerDetails,
        intent: decision.intent,
        missingDetails: Array.isArray(replyMetadata.missingDetails)
          ? replyMetadata.missingDetails.filter((item): item is string => typeof item === 'string')
          : [],
        orderId: typeof replyMetadata.orderId === 'number' ? replyMetadata.orderId : null,
        orderCancellation: replyMetadata.orderCancellation,
        orderModification: replyMetadata.orderModification,
        replyToCustomer: existingReply?.body ?? '',
        responseMessageId: existingReply?.id,
        reviewCaptured: false,
        suggestedProducts: Array.isArray(replyMetadata.productCards)
          ? replyMetadata.productCards
          : [],
        unavailableProduct: replyMetadata.unavailableProduct ?? null,
        visibleSystemActions: Array.isArray(replyMetadata.visibleSystemActions)
          ? replyMetadata.visibleSystemActions.filter((item): item is VisibleSystemAction => {
              return typeof item === 'string';
            })
          : [],
      };
    }
  }
  const conversationHistory = await loadConversationHistory({
    conversationId: conversation.id,
    organizationId: message.organizationId,
  });
  const hasPriorAssistantReply = conversationHistory.some((historyMessage) => {
    return historyMessage.direction === 'outbound';
  });

  const orderId = decision.shouldCreateDraftOrder
    || separateAddOnConfirmed
    ? await createAIEmployeeDraftOrder({
        addOnOrderContext: activeAddOnOrderContext,
        aiAnalysis: decision,
        conversationId: conversation.id,
        customerAddress: separateAddOnConfirmed
          ? getAIEmployeeDeliveryCustomerAddress(
              activeAddOnOrderContext?.snapshot.customerDetails ?? customerDetails,
              message.customerAddress,
            )
          : deliveryCustomerAddress,
        customerDetails: separateAddOnConfirmed
          ? activeAddOnOrderContext?.snapshot.customerDetails ?? customerDetails
          : customerDetails,
        customerEmail: customerDetails?.email ?? message.customer.email,
        customerName: separateAddOnConfirmed
          ? activeAddOnOrderContext?.snapshot.customerDetails?.name ?? customerDetails?.name ?? message.customer.name
          : customerDetails?.name ?? message.customer.name,
        customerPhone: separateAddOnConfirmed
          ? activeAddOnOrderContext?.snapshot.customerDetails?.phone ?? customerDetails?.phone ?? message.customer.phone
          : customerDetails?.phone ?? message.customer.phone,
        externalThreadId: message.externalThreadId,
        items: separateAddOnConfirmed
          ? activeAddOnOrderContext?.snapshot.items ?? []
          : currentCartForConversation?.items ?? effectiveRequestedItems,
        organizationId: message.organizationId,
        source: message.channel,
      })
    : null;

  if (orderId) {
    const submittedLastOrder = {
      id: orderId,
      status: ORDER_STATUS.PENDING_STORE_REVIEW,
    };
    const submittedCart = currentCartForConversation
      ? {
          ...currentCartForConversation,
          orderId,
          status: 'submitted' as const,
          updatedAt: new Date().toISOString(),
        }
      : undefined;

    if (submittedCart) {
      await db
        .update(conversationsTable)
        .set({
          metadata: {
            aiOrchestration: {
              ...aiOrchestrationBeforeExecution,
              executionResult: {
                cartMutation,
                orderCreated: true,
                orderId,
                orderModificationCreated: false,
              },
            },
            cancelledCartSnapshot: null,
            currentCart: submittedCart,
            customerDetails,
            currentIntent: decision.intent,
            lastAskedFor: null,
            lastDialogueState: dialogue.state,
            lastOrder: submittedLastOrder,
            lastSuggestedProducts: decision.suggestedProducts ?? [],
            missingDetails: decision.missingDetails,
            pendingSeparateAddOnOrder: null,
            pendingSupportIssue: pendingSupportIssueForConversation,
            policyVersion: decision.policyVersion,
            salesSignals: signals,
            unavailableProduct: decision.unavailableProduct ?? null,
          },
        })
        .where(
          and(
            eq(conversationsTable.id, conversation.id),
            eq(conversationsTable.organizationId, message.organizationId),
          ),
        );
    }

    await logAIAction({
      actionType: AI_AUDIT_ACTION.CREATE_ORDER,
      aiConfidence: decision.confidence,
      allowed: true,
      conversationId: conversation.id,
      metadata: {
        customerConfirmedOrder,
      },
      orderId,
      organizationId: message.organizationId,
      requiredPermission: getRequiredAIPermission(AI_AUDIT_ACTION.CREATE_ORDER),
      summary: 'AI created an order after customer confirmation.',
    });
  }

  const rating = decision.intent === 'review_response'
    ? extractConversationRating(message.body)
    : null;
  if (rating && customer?.id) {
    try {
      assertCanPerformAIAction(aiSettings, AI_AUDIT_ACTION.CAPTURE_REVIEW);
    } catch (error) {
      await logAIAction({
        actionType: AI_AUDIT_ACTION.CAPTURE_REVIEW,
        aiConfidence: decision.confidence,
        allowed: false,
        conversationId: conversation.id,
        metadata: {
          rating,
        },
        organizationId: message.organizationId,
        requiredPermission: getRequiredAIPermission(AI_AUDIT_ACTION.CAPTURE_REVIEW),
        summary: 'Review capture blocked by store settings.',
      });

      throw error;
    }

    const reviewOrderId = await findReviewOrderId({
      customerEmail: customerDetails?.email ?? message.customer.email,
      customerPhone: customerDetails?.phone ?? message.customer.phone,
      organizationId: message.organizationId,
      preferredOrderId: semanticHints?.referencedOrderId,
    });

    const reviewValues = {
      comment: message.body,
      customerId: customer.id,
      metadata: {
        capturedBy: 'ai_employee',
        conversationId: conversation.id,
        matchedOrderId: reviewOrderId,
      },
      orderId: reviewOrderId,
      organizationId: message.organizationId,
      rating,
      sourceChannel: message.channel,
    };
    const reviewInsert = db.insert(customerReviewsTable).values(reviewValues);

    if (reviewOrderId) {
      await reviewInsert.onConflictDoUpdate({
        set: {
          comment: reviewValues.comment,
          metadata: reviewValues.metadata,
          rating: reviewValues.rating,
          sourceChannel: reviewValues.sourceChannel,
        },
        target: [
          customerReviewsTable.organizationId,
          customerReviewsTable.orderId,
          customerReviewsTable.customerId,
        ],
      });
    } else {
      await reviewInsert;
    }

    await logAIAction({
      actionType: AI_AUDIT_ACTION.CAPTURE_REVIEW,
      aiConfidence: decision.confidence,
      allowed: true,
      conversationId: conversation.id,
      metadata: {
        rating,
      },
      orderId: reviewOrderId,
      organizationId: message.organizationId,
      requiredPermission: getRequiredAIPermission(AI_AUDIT_ACTION.CAPTURE_REVIEW),
      summary: 'AI captured a customer review.',
    });
  }

  const shouldCaptureWhatsAppFeedbackNote = message.channel === 'whatsapp'
    && !rating
    && !isSystemSemanticAction
    && (
      dialogue.state === 'complaint'
      || dialogue.state === 'review'
    );
  if (shouldCaptureWhatsAppFeedbackNote) {
    const feedbackCapture = await createAIEmployeeCustomerFeedbackEvent({
      conversationId: conversation.id,
      customerOrders: preDecisionCustomerOrders,
      message: message.body,
      organizationId: message.organizationId,
      preferredOrderId: dialogue.referencedOrderId
        ?? semanticHints?.referencedOrderId
        ?? previousMetadata.lastOrder?.id,
      sourceChannel: message.channel,
    });

    if (feedbackCapture.created) {
      supportEscalation = {
        created: true,
        orderId: feedbackCapture.orderId,
      };

      await logAIAction({
        actionType: 'capture_complaint',
        aiConfidence: decision.confidence,
        allowed: true,
        conversationId: conversation.id,
        metadata: {
          dialogueState: dialogue.state,
          orderId: feedbackCapture.orderId,
          source: 'whatsapp_chat_feedback',
        },
        orderId: feedbackCapture.orderId,
        organizationId: message.organizationId,
        requiredPermission: 'handoff_rules.complaints',
        summary: 'Customer WhatsApp feedback captured to order events.',
      });
    }
  }

  let modelCart = orderId && currentCartForConversation
    ? {
        ...currentCartForConversation,
        orderId,
        status: 'submitted' as const,
      }
    : currentCartForConversation ?? (cartClearedThisTurn ? undefined : previousSubmittedCart);
  if (orderId) {
    requestedCustomerNeedFromModel = null;
    systemNextCustomerNeed = null;
    customerFacingMissingDetails = [];
    visibleSystemActions = getVisibleAIEmployeeSystemActions({
      cancelledCartSnapshot: null,
      cart: modelCart,
      missingDetails: [],
      suggestedProducts: [],
    });
  }
  let modelLastOrder = orderId
    ? {
        id: orderId,
        status: ORDER_STATUS.PENDING_STORE_REVIEW,
      }
    : previousMetadata.lastOrder;
  let customerOrders = orderId
    ? await loadAIEmployeeCustomerOrderSnapshot({
        currentCart: modelCart,
        customerAddress: deliveryCustomerAddress,
        customerEmail: customerDetails?.email ?? message.customer.email,
        customerPhone: customerDetails?.phone ?? message.customer.phone,
        externalThreadId: message.externalThreadId,
        lastOrder: modelLastOrder,
        organizationId: message.organizationId,
        referencedOrderId: dialogue.referencedOrderId,
      })
    : preDecisionCustomerOrders;
  if (orderCancellation.applied) {
    customerOrders = await loadAIEmployeeCustomerOrderSnapshot({
      currentCart: modelCart,
      customerAddress: deliveryCustomerAddress,
      customerEmail: customerDetails?.email ?? message.customer.email,
      customerPhone: customerDetails?.phone ?? message.customer.phone,
      externalThreadId: message.externalThreadId,
      lastOrder: modelLastOrder,
      organizationId: message.organizationId,
      referencedOrderId: orderCancellation.orderId ?? dialogue.referencedOrderId,
    });
  }
  const shouldApplyOrderModification = Boolean(
    pendingOrderModification
    && pendingOrderModification.items.length > 0
    && (
      semanticUnderstanding.existingOrderModificationConfirmed === true
      || (
        customerConfirmedOrder
        && previousMetadata.pendingOrderModification?.orderId === pendingOrderModification.orderId
      )
    ),
  );
  if (shouldApplyOrderModification && pendingOrderModification) {
    try {
      assertCanPerformAIAction(aiSettings, AI_AUDIT_ACTION.CREATE_ORDER);
    } catch (error) {
      await logAIAction({
        actionType: AI_AUDIT_ACTION.CREATE_ORDER,
        aiConfidence: decision.confidence,
        allowed: false,
        conversationId: conversation.id,
        metadata: {
          itemCount: pendingOrderModification.items.length,
          orderId: pendingOrderModification.orderId,
          operation: 'modify_existing_order',
        },
        orderId: pendingOrderModification.orderId,
        organizationId: message.organizationId,
        requiredPermission: getRequiredAIPermission(AI_AUDIT_ACTION.CREATE_ORDER),
        summary: 'Existing order modification blocked by store AI permissions.',
      });

      throw error;
    }
  }
  const orderModification: OrderModificationResult = shouldApplyOrderModification && pendingOrderModification
    ? await addAIEmployeeItemsToExistingOrder({
        conversationId: conversation.id,
        items: pendingOrderModification.items,
        orderId: pendingOrderModification.orderId,
        organizationId: message.organizationId,
      })
    : { created: false } satisfies OrderModificationResult;
  const pendingOrderModificationForConversation = orderModification.created
    ? undefined
    : pendingOrderModification;

  if (orderModification.created) {
    const modifiedSubtotal = orderModification.subtotal
      ?? calculateAIEmployeeCartSubtotal(orderModification.items ?? []);
    const modifiedDeliveryFee = orderModification.deliveryFee ?? Math.max(
      0,
      toMoneyNumberOrZero(orderModification.totalPrice) - modifiedSubtotal,
    );

    if (orderModification.orderId && orderModification.items?.length) {
      modelCart = {
        deliveryFee: modifiedDeliveryFee,
        items: orderModification.items,
        orderId: orderModification.orderId,
        status: 'submitted' as const,
        subtotal: modifiedSubtotal,
        total: toMoneyNumberOrZero(orderModification.totalPrice)
          || modifiedSubtotal + modifiedDeliveryFee,
        updatedAt: new Date().toISOString(),
      };
      modelLastOrder = {
        id: orderModification.orderId,
        status: orderModification.status ?? modelLastOrder?.status,
      };
    }
    customerFacingMissingDetails = [];
    visibleSystemActions = getVisibleAIEmployeeSystemActions({
      cancelledCartSnapshot: null,
      cart: modelCart,
      missingDetails: customerFacingMissingDetails,
      suggestedProducts: [],
    });

    await logAIAction({
      actionType: AI_AUDIT_ACTION.CREATE_ORDER,
      aiConfidence: decision.confidence,
      allowed: true,
      conversationId: conversation.id,
      metadata: {
        itemCount: orderModification.items?.length,
        operation: 'modify_existing_order',
        totalPrice: orderModification.totalPrice,
      },
      orderId: orderModification.orderId,
      organizationId: message.organizationId,
      requiredPermission: getRequiredAIPermission(AI_AUDIT_ACTION.CREATE_ORDER),
      summary: 'AI modified an existing order after customer confirmation.',
    });

    customerOrders = await loadAIEmployeeCustomerOrderSnapshot({
      currentCart: modelCart,
      customerAddress: deliveryCustomerAddress,
      customerEmail: customerDetails?.email ?? message.customer.email,
      customerPhone: customerDetails?.phone ?? message.customer.phone,
      externalThreadId: message.externalThreadId,
      lastOrder: modelLastOrder,
      organizationId: message.organizationId,
      referencedOrderId: orderModification.orderId ?? dialogue.referencedOrderId,
    });
  }

  if (
    pendingOrderModificationForConversation
    || previousMetadata.pendingOrderModification
    || activeAddOnOrderContext
    || previousMetadata.pendingSeparateAddOnOrder
    || supportEscalation.created
    || previousMetadata.pendingSupportIssue
  ) {
    await db
      .update(conversationsTable)
      .set({
        metadata: {
          aiOrchestration: aiOrchestrationBeforeExecution,
          cancelledCartSnapshot: orderId || orderModification.created
            ? null
            : nextCancelledCartSnapshot,
          currentCart: modelCart,
          customerDetails,
          currentIntent: decision.intent,
          lastAskedFor: orderModification.created ? null : systemNextCustomerNeed,
          lastDialogueState: dialogue.state,
          lastOrder: modelLastOrder,
          lastSuggestedProducts: decision.suggestedProducts ?? [],
          missingDetails: customerFacingMissingDetails,
          pendingOrderModification: pendingOrderModificationForConversation,
          pendingSeparateAddOnOrder: orderId ? null : pendingSeparateAddOnOrder,
          pendingSupportIssue: pendingSupportIssueForConversation,
          policyVersion: decision.policyVersion,
          salesSignals: signals,
          unavailableProduct: decision.unavailableProduct ?? null,
        },
      })
      .where(
        and(
          eq(conversationsTable.id, conversation.id),
          eq(conversationsTable.organizationId, message.organizationId),
        ),
      );
  }
  let aiOrchestrationForModel = buildAIEmployeeOrchestrationTrace({
    cancelledCartSnapshot: nextCancelledCartSnapshot,
    cart: modelCart,
    cartMutation,
    customerFacingMissingDetails,
    decision,
    dialogue,
    effectiveRequestedItems,
    effectiveSuggestedProducts,
    executionResult: {
      orderCancellation,
      orderCreated: Boolean(orderId),
      orderId,
      orderModification,
      reviewCaptured: Boolean(rating),
      supportEscalation,
    },
    isSystemSemanticAction,
    requestedCustomerNeedFromModel,
    semanticHints,
    semanticUnderstanding: orchestrationSemanticUnderstanding,
    systemNextCustomerNeed,
    visibleSystemActions,
  });
  const modelCatalogProducts = selectCatalogProductsForModel({
    cart: modelCart,
    catalog,
    message: message.body,
    suggestedProducts: decision.suggestedProducts ?? [],
  });

  const modelReply = await generateCustomerReplyWithPlatformModel({
    aiOrchestration: aiOrchestrationForModel,
    cancelledCartSnapshot: nextCancelledCartSnapshot,
    cart: modelCart,
    cartClearedThisTurn,
    cartMutation,
    catalogProducts: modelCatalogProducts,
    catalogSummary: getCatalogSummary(catalog),
    channel: message.channel,
    conversationHistory,
    customerDetails,
    customerOrders,
    decision,
    dialogueState: dialogue.state,
    lastOrder: modelLastOrder,
    locale: message.locale ?? aiSettings.fallbackLanguage,
    message: message.body,
    systemEvent,
    addOnOrderBlockedContext,
    addOnOrderContext: activeAddOnOrderContext,
    orderId,
    orderCancellation,
    orderModification,
    pendingOrderModification: pendingOrderModificationForConversation,
    referencedOrderId: dialogue.referencedOrderId,
    storeContext,
    storeName,
    suggestedProducts: decision.suggestedProducts ?? [],
    supportEscalation,
    visibleSystemActions,
  });
  if (!modelReply) {
    logger.warn('AI model reply unavailable for customer conversation', {
      conversationId: conversation.id,
      organizationId: message.organizationId,
    });

    const unavailableIssues = [...aiOrchestrationForModel.issues];
    pushUniqueIssue(unavailableIssues, 'model_reply_unavailable');
    const unavailableQuality = evaluateAIOrchestrationQuality({
      cartActive: Boolean(modelCart?.items.length),
      issues: unavailableIssues,
      replyGuarded: false,
      systemNextCustomerNeed,
      visibleSystemActions,
    });
    const aiOrchestrationUnavailable = {
      ...aiOrchestrationForModel,
      executionResult: {
        ...aiOrchestrationForModel.executionResult,
        modelReplyUnavailable: true,
        replyGeneratedByModel: false,
      },
      issues: unavailableIssues,
      quality: unavailableQuality,
    } satisfies AIOrchestrationTrace;

    await logAIAction({
      actionType: 'ai_orchestration_issue',
      aiConfidence: decision.confidence,
      allowed: true,
      conversationId: conversation.id,
      metadata: {
        issues: unavailableIssues,
        nextCustomerNeed: systemNextCustomerNeed,
        orchestrationQuality: unavailableQuality,
        replyGeneratedByModel: false,
        systemDecisionReasons: aiOrchestrationUnavailable.systemDecisionReasons,
        visibleSystemActions,
      },
      orderId,
      organizationId: message.organizationId,
      summary: 'AI model reply unavailable after platform state update.',
    });

    await db
      .update(conversationsTable)
      .set({
        metadata: {
          aiOrchestration: aiOrchestrationUnavailable,
          cancelledCartSnapshot: nextCancelledCartSnapshot,
          currentCart: modelCart,
          customerDetails,
          currentIntent: decision.intent,
          lastAskedFor: systemNextCustomerNeed,
          lastDialogueState: dialogue.state,
          lastOrder: modelLastOrder,
          lastSuggestedProducts: decision.suggestedProducts ?? [],
          missingDetails: customerFacingMissingDetails,
          pendingOrderModification: pendingOrderModificationForConversation,
          pendingSeparateAddOnOrder: orderId ? null : pendingSeparateAddOnOrder,
          pendingSupportIssue: pendingSupportIssueForConversation,
          policyVersion: decision.policyVersion,
          salesSignals: signals,
          unavailableProduct: decision.unavailableProduct ?? null,
        },
      })
      .where(
        and(
          eq(conversationsTable.id, conversation.id),
          eq(conversationsTable.organizationId, message.organizationId),
        ),
      );

    const fallbackReplyToCustomer = buildAIEmployeeStateFallbackReply({
      cart: modelCart,
      customerDetails,
      locale: message.locale ?? aiSettings.fallbackLanguage,
      orderId,
      visibleSystemActions,
    });

    if (
      !fallbackReplyToCustomer
      && !modelCart?.items.length
      && !nextCancelledCartSnapshot
      && (decision.suggestedProducts ?? []).length === 0
      && !orderId
      && !orderModification.created
    ) {
      throw new Error('AI model reply unavailable.');
    }

    const [fallbackReplyMessage] = fallbackReplyToCustomer
      ? await db.insert(conversationMessagesTable).values({
          aiConfidence: decision.confidence.toFixed(2),
          aiIntent: decision.intent,
          body: fallbackReplyToCustomer,
          conversationId: conversation.id,
          direction: 'outbound',
          metadata: {
            aiOrchestration: aiOrchestrationUnavailable,
            cancelledCartSnapshot: nextCancelledCartSnapshot,
            currentCart: modelCart,
            cartMutation,
            customerDetails,
            dialogueState: dialogue.state,
            fallbackReason: 'model_reply_unavailable',
            lastOrder: modelLastOrder,
            orderId,
            orderCancellation,
            orderModification,
            pendingOrderModification: pendingOrderModificationForConversation,
            productCards: decision.suggestedProducts ?? [],
            salesSignals: signals,
            shouldSendToCustomer: true,
            systemEvent,
            missingDetails: customerFacingMissingDetails,
            unavailableProduct: decision.unavailableProduct ?? null,
            visibleSystemActions,
          },
          organizationId: message.organizationId,
          senderType: 'ai_employee',
        }).returning({ id: conversationMessagesTable.id })
      : [];

    return {
      aiOrchestration: aiOrchestrationUnavailable,
      cancelledCartSnapshot: nextCancelledCartSnapshot,
      cartMutation,
      conversationId: conversation.id,
      currentCart: modelCart,
      customerDetails,
      intent: decision.intent,
      missingDetails: customerFacingMissingDetails,
      orderId,
      orderCancellation,
      orderModification,
      replyToCustomer: fallbackReplyToCustomer ?? '',
      responseMessageId: fallbackReplyMessage?.id,
      reviewCaptured: Boolean(rating),
      suggestedProducts: decision.suggestedProducts ?? [],
      unavailableProduct: decision.unavailableProduct ?? null,
      visibleSystemActions,
    };
  }
  const latestCustomerTurnForGuards = systemEvent?.customerMeaning ?? message.body;

  const requestedNeedFromModelReply = pendingProductSelectionNeed
    ?? await analyzeAIEmployeeModelReplySystemNeed({
      cart: modelCart,
      currentVisibleSystemActions: visibleSystemActions,
      customerDetails,
      decision,
      pendingOrderModificationNeedsConfirmation,
      reply: modelReply,
      storeContext,
      storeName,
    });

  if (
    requestedNeedFromModelReply
    && requestedNeedFromModelReply !== systemNextCustomerNeed
  ) {
    requestedCustomerNeedFromModel = requestedNeedFromModelReply;
    systemNextCustomerNeed = requestedNeedFromModelReply;
    customerFacingMissingDetails = [requestedNeedFromModelReply];
    visibleSystemActions = getVisibleAIEmployeeSystemActions({
      cancelledCartSnapshot: nextCancelledCartSnapshot,
      cart: modelCart,
      missingDetails: customerFacingMissingDetails,
      suggestedProducts: decision.suggestedProducts ?? [],
    });
    orchestrationSemanticUnderstanding = {
      ...orchestrationSemanticUnderstanding,
      requestedCustomerNeed: requestedNeedFromModelReply,
    };
    aiOrchestrationForModel = buildAIEmployeeOrchestrationTrace({
      cancelledCartSnapshot: nextCancelledCartSnapshot,
      cart: modelCart,
      cartMutation,
      customerFacingMissingDetails,
      decision,
      dialogue,
      effectiveRequestedItems,
      effectiveSuggestedProducts,
      executionResult: {
        orderCancellation,
        orderCreated: Boolean(orderId),
        orderId,
        orderModification,
        reviewCaptured: Boolean(rating),
        supportEscalation,
      },
      isSystemSemanticAction,
      requestedCustomerNeedFromModel,
      semanticHints,
      semanticUnderstanding: orchestrationSemanticUnderstanding,
      systemNextCustomerNeed,
      visibleSystemActions,
    });
  }

  let guardedReply: ReplyGuardResult;
  try {
    guardedReply = await guardModelReplyAgainstFalseActions({
      cart: modelCart,
      cartMutation,
      catalogProducts: catalog,
      customerDetails,
      customerMessage: latestCustomerTurnForGuards,
      customerOrders,
      hasPriorAssistantReply,
      missingDetails: customerFacingMissingDetails,
      locale: message.locale ?? aiSettings.fallbackLanguage,
      orderId,
      orderCancellation,
      orderModification,
      reply: modelReply,
      reviewCaptured: Boolean(rating),
      storeContext,
      storeName,
      suggestedProducts: decision.suggestedProducts ?? [],
      supportEscalation,
      visibleSystemActions,
    });
    if (guardedReply.guarded) {
      guardedReply = await repairGuardedReplyIfPossible({
        cart: modelCart,
        cartMutation,
        catalogProducts: catalog,
        customerDetails,
        customerMessage: latestCustomerTurnForGuards,
        customerOrders,
        hasPriorAssistantReply,
        guardedReply,
        missingDetails: customerFacingMissingDetails,
        locale: message.locale ?? aiSettings.fallbackLanguage,
        orderId,
        orderCancellation,
        orderModification,
        originalReply: modelReply,
        reviewCaptured: Boolean(rating),
        storeContext,
        storeName,
        suggestedProducts: decision.suggestedProducts ?? [],
        supportEscalation,
        visibleSystemActions,
      });
    }
  } catch (error) {
    logger.warn('AI model reply guard failed after platform state update', {
      conversationId: conversation.id,
      error: error instanceof Error ? error.message : 'unknown_guard_error',
      organizationId: message.organizationId,
    });

    const guardFailureIssues = [...aiOrchestrationForModel.issues];
    pushUniqueIssue(guardFailureIssues, 'model_reply_guard_failed');
    const guardFailureQuality = evaluateAIOrchestrationQuality({
      cartActive: Boolean(modelCart?.items.length),
      issues: guardFailureIssues,
      replyGuarded: true,
      systemNextCustomerNeed,
      visibleSystemActions,
    });
    const aiOrchestrationGuardFailed = {
      ...aiOrchestrationForModel,
      executionResult: {
        ...aiOrchestrationForModel.executionResult,
        modelReplyGuardFailed: true,
        replyGeneratedByModel: true,
      },
      issues: guardFailureIssues,
      quality: guardFailureQuality,
    } satisfies AIOrchestrationTrace;

    await logAIAction({
      actionType: 'ai_orchestration_issue',
      aiConfidence: decision.confidence,
      allowed: true,
      conversationId: conversation.id,
      metadata: {
        error: error instanceof Error ? error.message : 'unknown_guard_error',
        issues: guardFailureIssues,
        nextCustomerNeed: systemNextCustomerNeed,
        orchestrationQuality: guardFailureQuality,
        replyGeneratedByModel: true,
        systemDecisionReasons: aiOrchestrationGuardFailed.systemDecisionReasons,
        visibleSystemActions,
      },
      orderId,
      organizationId: message.organizationId,
      summary: 'AI model reply guard failed after platform state update.',
    });

    await db
      .update(conversationsTable)
      .set({
        metadata: {
          aiOrchestration: aiOrchestrationGuardFailed,
          cancelledCartSnapshot: nextCancelledCartSnapshot,
          currentCart: modelCart,
          customerDetails,
          currentIntent: decision.intent,
          lastAskedFor: systemNextCustomerNeed,
          lastDialogueState: dialogue.state,
          lastOrder: modelLastOrder,
          lastSuggestedProducts: decision.suggestedProducts ?? [],
          missingDetails: customerFacingMissingDetails,
          pendingOrderModification: pendingOrderModificationForConversation,
          pendingSeparateAddOnOrder: orderId ? null : pendingSeparateAddOnOrder,
          pendingSupportIssue: pendingSupportIssueForConversation,
          policyVersion: decision.policyVersion,
          salesSignals: signals,
          unavailableProduct: decision.unavailableProduct ?? null,
        },
      })
      .where(
        and(
          eq(conversationsTable.id, conversation.id),
          eq(conversationsTable.organizationId, message.organizationId),
        ),
      );

    const fallbackReplyToCustomer = buildAIEmployeeStateFallbackReply({
      cart: modelCart,
      customerDetails,
      locale: message.locale ?? aiSettings.fallbackLanguage,
      orderId,
      visibleSystemActions,
    });

    if (
      !fallbackReplyToCustomer
      && !modelCart?.items.length
      && !nextCancelledCartSnapshot
      && (decision.suggestedProducts ?? []).length === 0
      && !orderId
      && !orderModification.created
    ) {
      throw error;
    }

    const [fallbackReplyMessage] = fallbackReplyToCustomer
      ? await db.insert(conversationMessagesTable).values({
          aiConfidence: decision.confidence.toFixed(2),
          aiIntent: decision.intent,
          body: fallbackReplyToCustomer,
          conversationId: conversation.id,
          direction: 'outbound',
          metadata: {
            aiOrchestration: aiOrchestrationGuardFailed,
            cancelledCartSnapshot: nextCancelledCartSnapshot,
            currentCart: modelCart,
            cartMutation,
            customerDetails,
            dialogueState: dialogue.state,
            fallbackReason: 'model_reply_guard_failed',
            lastOrder: modelLastOrder,
            orderId,
            orderCancellation,
            orderModification,
            pendingOrderModification: pendingOrderModificationForConversation,
            productCards: decision.suggestedProducts ?? [],
            salesSignals: signals,
            shouldSendToCustomer: true,
            systemEvent,
            missingDetails: customerFacingMissingDetails,
            unavailableProduct: decision.unavailableProduct ?? null,
            visibleSystemActions,
          },
          organizationId: message.organizationId,
          senderType: 'ai_employee',
        }).returning({ id: conversationMessagesTable.id })
      : [];

    return {
      aiOrchestration: aiOrchestrationGuardFailed,
      cancelledCartSnapshot: nextCancelledCartSnapshot,
      cartMutation,
      conversationId: conversation.id,
      currentCart: modelCart,
      customerDetails,
      intent: decision.intent,
      missingDetails: customerFacingMissingDetails,
      orderId,
      orderCancellation,
      orderModification,
      replyToCustomer: fallbackReplyToCustomer ?? '',
      responseMessageId: fallbackReplyMessage?.id,
      reviewCaptured: Boolean(rating),
      suggestedProducts: decision.suggestedProducts ?? [],
      unavailableProduct: decision.unavailableProduct ?? null,
      visibleSystemActions,
    };
  }
  const replyToCustomer = guardedReply.reply;
  const finalOrchestrationIssues = [...aiOrchestrationForModel.issues];

  for (const issue of getAIEmployeeReplyGuardOrchestrationIssues(guardedReply)) {
    pushUniqueIssue(finalOrchestrationIssues, issue);
  }

  const replyGuardDecision = getAIEmployeeReplyGuardDecisionSummary(guardedReply.checks);
  const finalOrchestrationQuality = evaluateAIOrchestrationQuality({
    cartActive: Boolean(modelCart?.items.length),
    issues: finalOrchestrationIssues,
    replyGuarded: guardedReply.guarded,
    systemNextCustomerNeed,
    visibleSystemActions,
  });

  const aiOrchestrationFinal = {
    ...aiOrchestrationForModel,
    executionResult: {
      ...aiOrchestrationForModel.executionResult,
      replyGuardChecks: guardedReply.checks,
      replyGuardDecision,
      replyGuarded: guardedReply.guarded,
      replyGuardReason: guardedReply.reason ?? guardedReply.repairReason ?? null,
      replyRepairedByModel: guardedReply.repaired === true,
      replyGeneratedByModel: Boolean(modelReply),
    },
    issues: finalOrchestrationIssues,
    quality: finalOrchestrationQuality,
  } satisfies AIOrchestrationTrace;

  if (finalOrchestrationIssues.length > 0) {
    await logAIAction({
      actionType: 'ai_orchestration_issue',
      aiConfidence: decision.confidence,
      allowed: true,
      conversationId: conversation.id,
      metadata: {
        issues: finalOrchestrationIssues,
        nextCustomerNeed: systemNextCustomerNeed,
        orchestrationQuality: finalOrchestrationQuality,
        replyGuardChecks: guardedReply.checks,
        replyGuardDecision,
        replyGuardReason: guardedReply.reason ?? guardedReply.repairReason ?? null,
        replyRepairedByModel: guardedReply.repaired === true,
        systemDecisionReasons: aiOrchestrationFinal.systemDecisionReasons,
        visibleSystemActions,
      },
      orderId,
      organizationId: message.organizationId,
      summary: 'AI orchestration issue detected for internal review.',
    });
  }

  await db
    .update(conversationsTable)
    .set({
      aiStatus: 'reply_ready',
      metadata: {
        aiOrchestration: aiOrchestrationFinal,
        cancelledCartSnapshot: orderId || orderModification.created
          ? null
          : nextCancelledCartSnapshot,
        currentCart: modelCart,
        customerDetails,
        currentIntent: decision.intent,
        lastAskedFor: orderModification.created ? null : systemNextCustomerNeed,
        lastDialogueState: dialogue.state,
        lastOrder: modelLastOrder,
        lastSuggestedProducts: decision.suggestedProducts ?? [],
        missingDetails: customerFacingMissingDetails,
        pendingOrderModification: pendingOrderModificationForConversation,
        pendingSeparateAddOnOrder: orderId ? null : pendingSeparateAddOnOrder,
        pendingSupportIssue: pendingSupportIssueForConversation,
        policyVersion: decision.policyVersion,
        salesSignals: signals,
        unavailableProduct: decision.unavailableProduct ?? null,
      },
    })
    .where(
      and(
        eq(conversationsTable.id, conversation.id),
        eq(conversationsTable.organizationId, message.organizationId),
      ),
    );

  const [replyMessage] = await db.insert(conversationMessagesTable).values({
    aiConfidence: decision.confidence.toFixed(2),
    aiIntent: decision.intent,
    body: replyToCustomer,
    conversationId: conversation.id,
    direction: 'outbound',
    metadata: {
      aiOrchestration: aiOrchestrationFinal,
      cancelledCartSnapshot: nextCancelledCartSnapshot,
      currentCart: modelCart,
      cartMutation,
      customerDetails,
      dialogueState: dialogue.state,
      lastOrder: modelLastOrder,
      orderId,
      orderCancellation,
      orderModification,
      pendingOrderModification: pendingOrderModificationForConversation,
      productCards: decision.suggestedProducts ?? [],
      salesSignals: signals,
      safetyGuard: guardedReply.guarded || guardedReply.repaired
        ? {
            checks: guardedReply.checks,
            decision: replyGuardDecision,
            originalReply: modelReply ?? null,
            reason: guardedReply.reason ?? guardedReply.repairReason,
            repaired: guardedReply.repaired === true,
          }
        : null,
      shouldSendToCustomer: true,
      systemEvent,
      missingDetails: customerFacingMissingDetails,
      unavailableProduct: decision.unavailableProduct ?? null,
      visibleSystemActions,
    },
    organizationId: message.organizationId,
    senderType: 'ai_employee',
  }).returning({ id: conversationMessagesTable.id });

  return {
    aiOrchestration: aiOrchestrationFinal,
    ...getAvailableAIEmployeeServiceChoices(storeContext),
    cancelledCartSnapshot: nextCancelledCartSnapshot,
    cartMutation,
    conversationId: conversation.id,
    currentCart: modelCart,
    customerDetails,
    intent: decision.intent,
    missingDetails: customerFacingMissingDetails,
    orderId,
    orderCancellation,
    orderModification,
    replyToCustomer,
    responseMessageId: replyMessage?.id,
    reviewCaptured: Boolean(rating),
    suggestedProducts: decision.suggestedProducts ?? [],
    unavailableProduct: decision.unavailableProduct ?? null,
    visibleSystemActions,
  };
};
