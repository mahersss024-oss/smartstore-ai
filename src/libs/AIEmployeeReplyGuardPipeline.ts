import type { AIEmployeeCartMutationContext, AIEmployeeConversationCart } from './AIEmployeeCart';
import type { AIEmployeeCustomerDetails } from './AIEmployeeCheckout';
import type { AIEmployeeReplyGuardCheck, AIEmployeeReplyGuardResult } from './AIEmployeeOrchestration';
import type {
  AIEmployeeCustomerOrderSnapshot,
  AIEmployeeOrderCancellationResult,
  AIEmployeeOrderModificationResult,
  AIEmployeeSupportEscalationResult,
} from './AIEmployeeOrderLifecycle';
import type { AIOrchestrationVisibleSystemAction } from './AIOrchestrationDiagnostics';
import type {
  ConversationCatalogProduct,
  ConversationSuggestedProduct,
} from './ConversationEngine';
import type { loadStoreAIContext } from './StoreAIContext';
import {
  guardCustomerPrivacyReply,
  guardReplyLanguageAndDialect,
} from './AIReplySafetyGuards';
import { logger } from './Logger';
import { generatePlatformAIText } from './PlatformAIClient';
import { getPlatformAIProviderConfig } from './PlatformAIProviderConfig';

type AgentCatalogProduct = ConversationCatalogProduct & {
  aiVisible?: boolean;
};
type StoreAIContext = Awaited<ReturnType<typeof loadStoreAIContext>>;
type CustomerOrderSnapshot = AIEmployeeCustomerOrderSnapshot;
type ModelReplySafetyReview = {
  confidence?: 'certain' | 'likely' | 'uncertain';
  decision?: 'block' | 'note' | 'pass' | 'rewrite';
  factContradiction?: boolean;
  reason?: string;
  safe: boolean;
  violationKind?:
    | 'action_fact_contradiction'
    | 'catalog_fact_contradiction'
    | 'commercial_commitment'
    | 'conversation_continuity'
    | 'language_coherence'
    | 'none'
    | 'privacy'
    | 'workflow_continuity';
};
type OrderModificationResult = AIEmployeeOrderModificationResult;
type OrderCancellationResult = AIEmployeeOrderCancellationResult;
type CartMutationContext = AIEmployeeCartMutationContext;
type ReplyGuardCheck = AIEmployeeReplyGuardCheck;
type ReplyGuardResult = AIEmployeeReplyGuardResult;
type VisibleSystemAction = AIOrchestrationVisibleSystemAction;
type SupportEscalationResult = AIEmployeeSupportEscalationResult;
type ConversationCart = AIEmployeeConversationCart;
const MODEL_REPLY_REPAIR_ATTEMPTS = 3;
const normalizeNumericText = (value: string) => {
  const arabicZero = '\u0660'.charCodeAt(0);
  const persianZero = '\u06F0'.charCodeAt(0);

  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);

      if (code >= arabicZero && code <= arabicZero + 9) {
        return String(code - arabicZero);
      }

      if (code >= persianZero && code <= persianZero + 9) {
        return String(code - persianZero);
      }

      return char === ',' ? '.' : char;
    })
    .join('');
};

const toMoneyNumber = (value: unknown) => {
  const parsed = Number(normalizeNumericText(String(value ?? '').trim()));

  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
};

const addAllowedMoneyAmount = (amounts: Set<string>, value: unknown) => {
  const amount = toMoneyNumber(value);

  if (amount !== null) {
    amounts.add(amount.toFixed(2));
  }
};

const extractMoneyAmountsFromReply = (reply: string) => {
  const digitPattern = '[0-9\\u0660-\\u0669\\u06f0-\\u06f9]+(?:[.,][0-9\\u0660-\\u0669\\u06f0-\\u06f9]+)?';
  const currencyPattern = '(?:\\u0631\\u064a\\u0627\\u0644|\\ufdfc|SAR|SR|\\u0631\\.?\\u0633\\.?)';
  const moneyPattern = new RegExp(
    `${currencyPattern}\\s*(${digitPattern})|(${digitPattern})\\s*${currencyPattern}`,
    'giu',
  );
  const amounts: number[] = [];

  for (const match of reply.matchAll(moneyPattern)) {
    const amount = toMoneyNumber(match[1] ?? match[2]);

    if (amount !== null) {
      amounts.push(amount);
    }
  }

  return amounts;
};

const normalizeCatalogClaimText = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const isAIVisibleCatalogProduct = (product: AgentCatalogProduct) => {
  return product.aiVisible !== false;
};

const canonicalCatalogToken = (value: string) => {
  const normalized = normalizeCatalogClaimText(value);

  return normalized.startsWith('\u0627\u0644') && normalized.length > 4
    ? normalized.slice(2)
    : normalized;
};

const catalogClaimTokensFrom = (value: null | string | string[] | undefined) => {
  const values = Array.isArray(value) ? value : [value];

  return values
    .flatMap(item => normalizeCatalogClaimText(item ?? '').split(' '))
    .map(canonicalCatalogToken)
    .filter(token => token.length >= 3);
};

const getAvailabilityClaimAllowedTokens = (products: AgentCatalogProduct[]) => {
  const tokens = new Set<string>();

  for (const product of products.filter(isAIVisibleCatalogProduct)) {
    for (const token of [
      ...catalogClaimTokensFrom(product.name),
      ...catalogClaimTokensFrom(product.category),
      ...catalogClaimTokensFrom(product.productType),
      ...catalogClaimTokensFrom(product.unit),
      ...catalogClaimTokensFrom(product.brand),
      ...catalogClaimTokensFrom(product.tags),
    ]) {
      tokens.add(token);
    }
  }

  return tokens;
};

const cleanPricedProductClaim = (value: string) => {
  let claim = normalizeCatalogClaimText(value);
  const prefixes = [
    '\u0645\u0646\u0647\u0627',
    '\u0645\u062B\u0644',
    '\u0648',
    '\u0627\u0648',
    '\u0623\u0648',
    '\u0628\u0633\u0639\u0631',
    '\u0633\u0639\u0631',
    '\u0639\u0646\u062F\u0646\u0627',
    '\u0644\u062F\u064A\u0646\u0627',
    'and',
    'or',
    'for',
    'like',
    'such as',
    'price',
  ];

  for (const prefix of prefixes) {
    if (claim === prefix) {
      return '';
    }

    if (claim.startsWith(`${prefix} `)) {
      claim = claim.slice(prefix.length).trim();
      break;
    }
  }

  return claim;
};

const isNonProductPriceLabel = (value: string) => {
  return value.length < 3
    || /\b(?:total|subtotal|delivery|fee|order|current|payment|cash|card)\b/iu.test(value)
    || /\u0627\u0644\u0627\u062C\u0645\u0627\u0644\u064A|\u0627\u062C\u0645\u0627\u0644\u064A|\u0627\u0644\u0645\u062C\u0645\u0648\u0639|\u0645\u062C\u0645\u0648\u0639|\u0631\u0633\u0648\u0645|\u0627\u0644\u062A\u0648\u0635\u064A\u0644|\u062A\u0648\u0635\u064A\u0644|\u0627\u0644\u0637\u0644\u0628|\u0637\u0644\u0628\u0643|\u0627\u0644\u062D\u0627\u0644\u064A|\u0627\u0644\u062F\u0641\u0639|\u0628\u0637\u0627\u0642\u0629|\u0643\u0627\u0634|\u0628\u0642\u064A\u0645\u0629|\u0642\u064A\u0645\u0629/u.test(value);
};

const containsUnsupportedHistoricalCatalogClaim = (reply: string) => {
  const text = normalizeCatalogClaimText(reply);
  const uncertaintyPhrases = [
    'ما اقدر اتاكد',
    'لا اقدر اتاكد',
    'لا استطيع التاكد',
    'ما عندي تاكيد',
    'ما اقدر ااكد',
    'حسب القائمه الحاليه',
  ];

  if (uncertaintyPhrases.some(phrase => text.includes(normalizeCatalogClaimText(phrase)))) {
    return false;
  }

  const confirmsCustomerClaim = [
    'صحيح',
    'فعلا',
    'نعم',
    'ايه',
    'yes',
    'correct',
  ].some(term => text.includes(term));
  const referencesPastCatalog = [
    'الاسبوع الماضي',
    'قبل',
    'سابقا',
    'زمان',
    'الماضي',
    'last week',
    'previously',
    'before',
  ].some(term => text.includes(term));
  const hasPastTenseMarker = [
    'كان',
    'كانت',
    'was',
    'were',
    'used to',
  ].some(term => text.includes(term));
  const claimsAvailability = [
    'موجود',
    'متوفر',
    'القائمه',
    'available',
    'menu',
    'listed',
    'in stock',
  ].some(term => text.includes(term));

  return hasPastTenseMarker
    && claimsAvailability
    && (
      referencesPastCatalog
      || confirmsCustomerClaim
    );
};

const guardReplyAgainstUnsupportedHistoricalCatalogClaims = (reply: string) => {
  if (!containsUnsupportedHistoricalCatalogClaim(reply)) {
    return {
      guarded: false,
      reply,
    };
  }

  return {
    guarded: true,
    reason: 'unsupported_historical_catalog_claim',
    reply,
  };
};

const customerRequestStopTokens = new Set([
  '\u0627\u0628\u064A',
  '\u0627\u0628\u063A\u064A',
  '\u0628\u063A\u064A\u062A',
  '\u062D\u0644\u0648',
  '\u0643\u0648\u064A\u0633',
  '\u0637\u064A\u0628',
  '\u0627\u064A\u0648\u0647',
  '\u0639\u0637\u0646\u064A',
  '\u0636\u064A\u0641',
  '\u0636\u0641\u0647\u0627',
  '\u0636\u064A\u0641\u0647\u0627',
  '\u0627\u0636\u0641',
  '\u0643\u0644\u0647\u0627',
  '\u0643\u062B\u0631',
  '\u0632\u064A\u0627\u062F\u0629',
  '\u0645\u0639\u0647\u0627',
  '\u0645\u0639\u0647',
  '\u0641\u064A\u0647',
  '\u0639\u0646\u062F\u0643\u0645',
  '\u0645\u0648\u062C\u0648\u062F',
  '\u0645\u062A\u0648\u0641\u0631',
  '\u0627\u0644\u0642\u0627\u0626\u0645\u0647',
  '\u0642\u0627\u0626\u0645\u0647',
  '\u0627\u0644\u0645\u0646\u064A\u0648',
  '\u0645\u0646\u064A\u0648',
  '\u0645\u0631\u0647',
  '\u0627\u0646\u062A',
  '\u0642\u0644\u062A',
  '\u0634\u064A',
  '\u0634\u0626',
  '\u0627\u0641\u0636\u0644',
  'available',
  'availability',
  'menu',
  'item',
  'items',
  'product',
  'products',
  'choice',
  'choices',
  'recommend',
  'recommended',
  'help',
  'continue',
  'current',
  'from',
  'for',
  'the',
  'you',
  'with',
  'add',
  'extra',
  'please',
  'want',
  'what',
  'do',
  'does',
  'have',
  'has',
]);

const addAvailabilityTerm = (terms: Set<string>, value: string) => {
  const term = canonicalCatalogToken(value);

  if (term.length >= 3 && !customerRequestStopTokens.has(term)) {
    terms.add(term);
  }
};

const getRequestedUnsupportedAvailabilityTerms = (params: {
  allowedTokens: Set<string>;
  customerMessage: string;
}) => {
  const terms = new Set<string>();
  const text = normalizeCatalogClaimText(params.customerMessage);

  for (const token of catalogClaimTokensFrom(params.customerMessage)) {
    if (!params.allowedTokens.has(token) && !customerRequestStopTokens.has(token)) {
      terms.add(token);
    }
  }

  if (/\u0643\u0627?\u062A\u0634\u0628/u.test(text)) {
    addAvailabilityTerm(terms, '\u0643\u062A\u0634\u0628');
    addAvailabilityTerm(terms, '\u0643\u0627\u062A\u0634\u0628');
  }

  if (/\u0645\u0627\u064A\u0648|\u0645\u064A\u0648|\u0645\u0627\u064A\u0632/u.test(text)) {
    addAvailabilityTerm(terms, '\u0645\u0627\u064A\u0648\u0646\u064A\u0632');
    addAvailabilityTerm(terms, '\u0645\u064A\u0648');
  }

  return [...terms];
};

const replySegmentDeniesAvailability = (segment: string) => {
  return [
    '\u063A\u064A\u0631 \u0645\u062A\u0648\u0641\u0631',
    '\u0645\u0648 \u0645\u062A\u0648\u0641\u0631',
    '\u0645\u0627 \u0639\u0646\u062F\u0646\u0627',
    '\u063A\u064A\u0631 \u0645\u0648\u062C\u0648\u062F',
    '\u0645\u0648 \u0645\u0648\u062C\u0648\u062F',
    '\u0644\u0627 \u064A\u0648\u062C\u062F',
    '\u0644\u0644\u0627\u0633\u0641',
    '\u0645\u0627\u0641\u064A',
    '\u0645\u0627 \u0641\u064A\u0647',
    'not available',
    'unavailable',
    'do not have',
  ].some(phrase => segment.includes(normalizeCatalogClaimText(phrase)));
};

const replySegmentClaimsAvailability = (segment: string) => {
  return [
    '\u0645\u0648\u062C\u0648\u062F',
    '\u0645\u062A\u0648\u0641\u0631',
    '\u0639\u0646\u062F\u0646\u0627',
    '\u0646\u0636\u064A\u0641',
    '\u0627\u0636\u064A\u0641',
    '\u062A\u0636\u064A\u0641',
    '\u0646\u0642\u062F\u0631 \u0646\u0636\u064A\u0641',
    'available',
    'in stock',
    'we have',
    'can add',
  ].some(phrase => segment.includes(normalizeCatalogClaimText(phrase)));
};

const guardReplyAgainstUnsupportedAvailabilityClaims = (params: {
  catalogProducts: AgentCatalogProduct[];
  customerMessage: string;
  reply: string;
}) => {
  const allowedTokens = getAvailabilityClaimAllowedTokens(params.catalogProducts);
  const requestedTerms = getRequestedUnsupportedAvailabilityTerms({
    allowedTokens,
    customerMessage: params.customerMessage,
  });

  if (requestedTerms.length === 0) {
    return {
      guarded: false,
      reply: params.reply,
    };
  }

  const segments = normalizeCatalogClaimText(params.reply)
    .split(/[\n,،;؛.!؟?:•-]+/u)
    .map(segment => segment.trim())
    .filter(Boolean);
  const unsupportedTerm = requestedTerms.find((term) => {
    return segments.some((segment) => {
      return segment.includes(term)
        && replySegmentClaimsAvailability(segment)
        && !replySegmentDeniesAvailability(segment);
    });
  });

  if (!unsupportedTerm) {
    return {
      guarded: false,
      reply: params.reply,
    };
  }

  return {
    guarded: true,
    reason: `unsupported_availability_claim:${unsupportedTerm}`,
    reply: params.reply,
  };
};

const extractPricedProductClaimsFromReply = (reply: string) => {
  const digitPattern = '[0-9\\u0660-\\u0669\\u06f0-\\u06f9]+(?:[.,][0-9\\u0660-\\u0669\\u06f0-\\u06f9]+)?';
  const currencyPattern = '(?:\\u0631\\u064a\\u0627\\u0644|\\ufdfc|SAR|SR|\\u0631\\.?\\u0633\\.?)';
  const moneyPattern = new RegExp(`${digitPattern}\\s*${currencyPattern}`, 'iu');
  const claims = new Set<string>();

  for (const segment of reply.split(/[\n,،;؛:•-]+/u)) {
    const compactSegment = segment.replace(/\s+/g, ' ').trim();
    const match = compactSegment.match(moneyPattern);

    if (!match || match.index === undefined) {
      continue;
    }

    const claim = cleanPricedProductClaim(
      compactSegment.slice(0, match.index).replace(/[-–—:\s]+$/u, ''),
    );

    if (!isNonProductPriceLabel(claim)) {
      claims.add(claim);
    }
  }

  return [...claims];
};

const isQuantitySuffix = (value: string) => {
  const quantityUnits = new Set([
    '\u0639\u062F\u062F',
    '\u0646\u0641\u0631',
    '\u0639\u0644\u0628\u0647',
    '\u0635\u062D\u0646',
    '\u0642\u0637\u0639\u0647',
  ]);
  let sawNumber = false;
  const tokens = value.split(/\s+/u).filter(Boolean);

  if (tokens.length === 0) {
    return false;
  }

  return tokens.every((token) => {
    if (token === 'x' || quantityUnits.has(token)) {
      return true;
    }

    if (/^\p{N}+$/u.test(token) || /^x\p{N}+$/iu.test(token)) {
      sawNumber = true;
      return true;
    }

    return false;
  }) && sawNumber;
};

const isSupportedPricedProductClaim = (params: {
  claim: string;
  normalizedAllowedNames: Set<string>;
}) => {
  if (params.normalizedAllowedNames.has(params.claim)) {
    return true;
  }

  for (const allowedName of params.normalizedAllowedNames) {
    if (!params.claim.startsWith(`${allowedName} `)) {
      continue;
    }

    if (isQuantitySuffix(params.claim.slice(allowedName.length).trim())) {
      return true;
    }
  }

  return false;
};

const guardReplyAgainstUnsupportedCatalogItems = (params: {
  cart?: ConversationCart;
  catalogProducts: AgentCatalogProduct[];
  reply: string;
}) => {
  const normalizedAllowedNames = new Set([
    ...params.catalogProducts
      .filter(isAIVisibleCatalogProduct)
      .map(product => normalizeCatalogClaimText(product.name)),
    ...(params.cart?.items ?? []).map(item => normalizeCatalogClaimText(item.name)),
  ]);
  const unsupportedClaim = extractPricedProductClaimsFromReply(params.reply).find((claim) => {
    return !isSupportedPricedProductClaim({
      claim,
      normalizedAllowedNames,
    });
  });

  if (!unsupportedClaim) {
    return {
      guarded: false,
      reply: params.reply,
    };
  }

  return {
    guarded: true,
    reason: `unsupported_catalog_item:${unsupportedClaim}`,
    reply: params.reply,
  };
};

const buildAllowedReplyMoneyAmounts = (params: {
  cart?: ConversationCart;
  catalogProducts: AgentCatalogProduct[];
  customerOrders: CustomerOrderSnapshot;
  orderModification: OrderModificationResult;
  storeContext?: StoreAIContext;
  suggestedProducts: ConversationSuggestedProduct[];
}) => {
  const amounts = new Set<string>();

  for (const product of params.catalogProducts.filter(isAIVisibleCatalogProduct)) {
    addAllowedMoneyAmount(amounts, product.price);
  }

  if (params.cart?.items.length) {
    for (const item of params.cart.items) {
      addAllowedMoneyAmount(amounts, item.unitPrice);
      addAllowedMoneyAmount(amounts, item.quantity * item.unitPrice);
    }

    addAllowedMoneyAmount(amounts, params.cart.subtotal);
    addAllowedMoneyAmount(amounts, params.cart.deliveryFee);
    addAllowedMoneyAmount(amounts, params.cart.total);
  } else {
    for (const product of params.suggestedProducts) {
      addAllowedMoneyAmount(amounts, product.price);
    }
  }

  for (const method of params.storeContext?.deliveryMethods ?? []) {
    addAllowedMoneyAmount(amounts, method.fee);
  }

  for (const order of [...params.customerOrders.open, ...params.customerOrders.completed]) {
    addAllowedMoneyAmount(amounts, order.totalPrice);
  }

  addAllowedMoneyAmount(amounts, params.orderModification.totalPrice);

  return amounts;
};

const guardModelReplyAgainstUnsupportedPrices = (params: {
  cart?: ConversationCart;
  catalogProducts: AgentCatalogProduct[];
  customerOrders: CustomerOrderSnapshot;
  locale?: string;
  orderModification: OrderModificationResult;
  reply: string;
  storeContext?: StoreAIContext;
  suggestedProducts: ConversationSuggestedProduct[];
}) => {
  const replyAmounts = extractMoneyAmountsFromReply(params.reply);

  if (replyAmounts.length === 0) {
    return {
      guarded: false,
      reply: params.reply,
    };
  }

  const allowedAmounts = buildAllowedReplyMoneyAmounts({
    cart: params.cart,
    catalogProducts: params.catalogProducts,
    customerOrders: params.customerOrders,
    orderModification: params.orderModification,
    storeContext: params.storeContext,
    suggestedProducts: params.suggestedProducts,
  });
  const unsupportedAmount = replyAmounts.find((amount) => {
    return !allowedAmounts.has(amount.toFixed(2));
  });

  if (unsupportedAmount === undefined) {
    return {
      guarded: false,
      reply: params.reply,
    };
  }

  return {
    guarded: true,
    reason: `unsupported_price:${unsupportedAmount.toFixed(2)}`,
    reply: params.reply,
  };
};

const parseModelReplySafetyReview = (value: string | undefined): ModelReplySafetyReview | undefined => {
  if (!value) {
    return undefined;
  }

  const jsonMatch = value.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Partial<ModelReplySafetyReview>;

    if (typeof parsed.safe !== 'boolean') {
      return undefined;
    }

    const decision = parsed.decision === 'block'
      || parsed.decision === 'note'
      || parsed.decision === 'pass'
      || parsed.decision === 'rewrite'
      ? parsed.decision
      : parsed.safe
        ? 'pass'
        : 'block';
    const confidence = parsed.confidence === 'certain'
      || parsed.confidence === 'likely'
      || parsed.confidence === 'uncertain'
      ? parsed.confidence
      : undefined;

    return {
      confidence,
      decision,
      factContradiction: parsed.factContradiction === true,
      reason: typeof parsed.reason === 'string'
        ? parsed.reason.slice(0, 120)
        : undefined,
      safe: parsed.safe,
      violationKind: parsed.violationKind === 'action_fact_contradiction'
        || parsed.violationKind === 'catalog_fact_contradiction'
        || parsed.violationKind === 'commercial_commitment'
        || parsed.violationKind === 'conversation_continuity'
        || parsed.violationKind === 'language_coherence'
        || parsed.violationKind === 'none'
        || parsed.violationKind === 'privacy'
        || parsed.violationKind === 'workflow_continuity'
        ? parsed.violationKind
        : undefined,
    };
  } catch {
    return undefined;
  }
};

const reviewModelReplySafety = async (params: {
  cart?: ConversationCart;
  cartMutation: CartMutationContext;
  catalogProducts: AgentCatalogProduct[];
  customerMessage: string;
  customerOrders: CustomerOrderSnapshot;
  hasPriorAssistantReply: boolean;
  missingDetails: string[];
  orderId?: null | number;
  orderModification: OrderModificationResult;
  orderCancellation: OrderCancellationResult;
  reply: string;
  reviewCaptured: boolean;
  storeName: string;
  storeContext?: StoreAIContext;
  suggestedProducts: ConversationSuggestedProduct[];
  supportEscalation: SupportEscalationResult;
  visibleSystemActions: VisibleSystemAction[];
}) => {
  const config = await getPlatformAIProviderConfig();

  if (!config.enabled || !config.apiKey) {
    return undefined;
  }

  const visibleOrderIds = [
    params.orderId,
    ...params.customerOrders.open.map(order => order.id),
    ...params.customerOrders.completed.map(order => order.id),
  ].filter((id): id is number => typeof id === 'number');
  const prompt = JSON.stringify({
    actionFacts: {
      cartMutation: params.cartMutation,
      complaintEscalationCreated: params.supportEscalation.created,
      complaintEscalationOrderId: params.supportEscalation.orderId ?? null,
      missingDetails: params.missingDetails,
      orderCreatedNow: Boolean(params.orderId),
      orderCancellationApplied: params.orderCancellation.applied,
      orderCancellationOrderId: params.orderCancellation.orderId ?? null,
      orderCancellationRequiresStoreReview: params.orderCancellation.requiresStoreReview,
      orderModificationCreated: params.orderModification.created,
      orderModificationOrderId: params.orderModification.orderId ?? null,
      paymentCapturedNow: false,
      reviewCaptured: params.reviewCaptured,
      visibleOrderIds,
    },
    currentCart: params.cart ?? null,
    customerMessage: params.customerMessage,
    customerOrders: params.customerOrders,
    conversationFacts: {
      hasPriorAssistantReply: params.hasPriorAssistantReply,
    },
    catalogProducts: params.catalogProducts.filter(isAIVisibleCatalogProduct).map(product => ({
      availability: product.availability ?? 'available',
      category: product.category,
      name: product.name,
      price: product.price,
      productType: product.productType,
      unit: product.unit,
    })),
    catalogEvidence: {
      platformMatchCount: params.suggestedProducts.length,
      platformMatchedProducts: params.suggestedProducts.map(product => ({
        availability: product.availability ?? 'available',
        category: product.category,
        id: product.id,
        name: product.name,
        price: product.price,
      })),
    },
    modelReply: params.reply,
    visibleSystemActions: params.visibleSystemActions,
    storePolicyFacts: {
      hasPaymentInstructions: Boolean(params.storeContext?.knowledgeBase.paymentInstructions?.trim()),
      hasReturnPolicy: Boolean(params.storeContext?.knowledgeBase.returnPolicy?.trim()),
      hasWarrantyPolicy: Boolean(params.storeContext?.knowledgeBase.warrantyPolicy?.trim()),
    },
    task: [
      'Decide whether modelReply contains a confirmed high-risk problem, a low-confidence concern, or is safe.',
      'Return decision pass when the reply is safe.',
      'Return decision note when you are unsure, when the concern is style-only, when wording could be improved, or when the issue is not clearly harmful. Notes must not block the customer reply.',
      'Return decision rewrite only for a certain contextual continuity mistake that should be corrected before display but is not a high-risk safety violation.',
      'Return decision block only for confirmed high-risk violations that would mislead, expose private data, claim unsupported sensitive actions, invent concrete catalog facts, or make unsupported commercial promises.',
      'If unsure between note and block, choose note.',
      'Use confidence certain only when the violation is directly proven by the provided facts. Use likely or uncertain for ambiguous cases.',
      'Do not block ordinary warmth, recommendations, category discussion, brief sales language, or natural employee wording.',
      'When conversationFacts.hasPriorAssistantReply is true, use decision rewrite if modelReply clearly restarts the conversation, repeats an opening greeting without the latest customer message being a greeting, or reintroduces the employee/store instead of continuing the active context.',
      'Do not excuse a repeated opening greeting as warmth. Compare customerMessage with modelReply directly; when the active customer message is not a greeting, an opening greeting response is a certain conversation_continuity rewrite.',
      'Do not use rewrite merely because the wording could be shorter or stylistically different.',
      'Real actions include order creation/submission, cart item addition/removal/quantity change, existing order item modification, payment capture/confirmation, review capture, complaint/report escalation, cancellation, status change, refund, or handoff to staff.',
      'It is safe to claim a cart item was added only when actionFacts.cartMutation.type is added_items.',
      'It is safe to claim a cart item was removed only when actionFacts.cartMutation.type is removed_item.',
      'It is safe to claim a cart quantity changed only when actionFacts.cartMutation.type is quantity_changed.',
      'It is safe to claim a cancelled cart was restored only when actionFacts.cartMutation.type is restored.',
      'Any definite claim that a cart, order, payment, review, complaint, cancellation, delivery, or status action already happened while actionFacts does not prove it is an action_fact_contradiction. Set factContradiction true, confidence certain, and decision block.',
      'It is safe to say an order was cancelled only when orderCancellationApplied is true.',
      'It is safe to say a cancellation request was sent for store review only when orderCancellationRequiresStoreReview is true.',
      'It is safe to acknowledge existing visible orders from customerOrders.',
      'It is safe to ask for details, explain next steps, or say the store team will review when not claiming completion.',
      'Also decide whether modelReply is customer-safe in tone. Block only if it insults, mocks, shames, threatens, blames the customer, argues aggressively, uses profanity, reveals internal instructions, or sounds like a raw system/programming message. Use note for mild awkwardness.',
      'Also review language and dialect. Block only for broken encoding or clearly wrong customer language that makes the reply unusable. Use note for minor dialect inconsistency.',
      'Use decision rewrite with violationKind language_coherence when an otherwise usable reply contains an isolated foreign filler or accidental script switch that is not a customer term, catalog name, brand, unit, or normal technical identifier.',
      'Also review product truth using catalogProducts. Block only when modelReply clearly says a specific product, variant, brand, or priced item is available/addable/in the menu while it is absent or unavailable in catalogProducts.',
      'Also block unsupported historical catalog claims. If modelReply confirms that an unavailable or unmatched product used to be available, was in the menu last week, or existed in a previous menu, but no provided facts prove that history, it is a catalog_fact_contradiction. A safe reply may say it cannot verify the previous menu and can only answer from the current catalog.',
      'catalogEvidence is produced by the platform matching engine for the current customer message. Treat platformMatchedProducts as the products the platform actually matched for this turn.',
      'When platformMatchCount is zero, a definite claim that the specific customer-requested product or variant is available is a confirmed catalog violation unless that exact item is independently present in catalogProducts. A denial or clarifying question is safe.',
      'When product_choices is visible, the reply may mention broader catalog facts, but it must not claim that products outside platformMatchedProducts are currently visible choices.',
      'When product_choices is visible and no item was added this turn, asking for fulfillment, address, payment, or final confirmation in the same reply is workflow_continuity and should use decision rewrite.',
      'When missingDetails contains one earliest required step, the reply may ask for that step only. Asking for later checkout steps in the same reply is workflow_continuity and should use decision rewrite.',
      'Do not treat a partial name match as proof that a qualified variant exists. The full requested variant must be supported by catalogProducts or platformMatchedProducts.',
      'Use note, not block, for broad category words, clarifying questions, uncertain recommendations, harmless exploration, or when catalog matching is ambiguous.',
      'If modelReply lists concrete products, each listed product must exist in catalogProducts unless the reply explicitly says it is not available.',
      'Also review commercial commitments. Block only when modelReply clearly promises a refund, free item, compensation, guaranteed discount, or exact delivery promise not proven by provided facts. Use note for ordinary discussion like asking whether a discount exists.',
      'Also review store policies. Block only when modelReply states a definite refund/return/exchange/warranty policy that is not supported by storePolicyFacts. Do not block saying the store will review or that the customer can submit a note.',
      'Return strict JSON only with safe, decision, confidence, factContradiction, violationKind, and reason.',
      'safe must be false only when decision is block. For note, pass, and rewrite, safe must be true.',
      'You validate only. Do not write or suggest a customer-facing replacement response.',
    ],
  });

  try {
    const text = await generatePlatformAIText(config, {
      input: prompt,
      instructions: `You are an internal safety reviewer for ${params.storeName}. Return JSON only.`,
    });

    return parseModelReplySafetyReview(text);
  } catch {
    return undefined;
  }
};

const parseModelReplyRepair = (value: string | undefined) => {
  if (!value) {
    return undefined;
  }

  const jsonMatch = value.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { reply?: unknown };
    const reply = typeof parsed.reply === 'string' ? parsed.reply.trim() : '';

    return reply ? reply.slice(0, 1600) : undefined;
  } catch {
    return undefined;
  }
};

const repairUnsafeModelReply = async (params: {
  cart?: ConversationCart;
  cartMutation: CartMutationContext;
  catalogProducts: AgentCatalogProduct[];
  customerDetails?: AIEmployeeCustomerDetails;
  customerMessage: string;
  customerOrders: CustomerOrderSnapshot;
  hasPriorAssistantReply: boolean;
  guardChecks: ReplyGuardCheck[];
  guardReason?: string;
  locale?: string;
  missingDetails: string[];
  orderCancellation: OrderCancellationResult;
  orderId?: null | number;
  orderModification: OrderModificationResult;
  originalReply: string;
  storeContext?: StoreAIContext;
  storeName: string;
  suggestedProducts: ConversationSuggestedProduct[];
  supportEscalation: SupportEscalationResult;
  visibleSystemActions: VisibleSystemAction[];
}) => {
  const config = await getPlatformAIProviderConfig();

  if (!config.enabled || !config.apiKey) {
    return undefined;
  }

  const prompt = JSON.stringify({
    customerMessage: params.customerMessage,
    originalReply: params.originalReply,
    rejectedByGuard: {
      checks: params.guardChecks,
      reason: params.guardReason ?? null,
    },
    facts: {
      cart: params.cart ?? null,
      cartMutation: params.cartMutation,
      catalogProducts: params.catalogProducts.filter(isAIVisibleCatalogProduct).map(product => ({
        availability: product.availability ?? 'available',
        category: product.category,
        name: product.name,
        price: product.price,
        productType: product.productType,
        unit: product.unit,
      })),
      customerDetails: params.customerDetails ?? null,
      customerOrders: params.customerOrders,
      hasPriorAssistantReply: params.hasPriorAssistantReply,
      locale: params.locale ?? null,
      missingDetails: params.missingDetails,
      orderCancellation: params.orderCancellation,
      orderId: params.orderId ?? null,
      orderModification: params.orderModification,
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
      visibleSystemActions: params.visibleSystemActions,
    },
    task: [
      'Rewrite originalReply into one natural customer-facing store-employee reply.',
      'The rewrite must fix the guard issue and use only facts provided here.',
      'Do not mention guards, safety, JSON, system, policy, validation, or internal labels.',
      'Do not claim any cart, order, payment, review, complaint, cancellation, or delivery action happened unless facts prove it.',
      'Do not invent products, prices, store policies, payment links, refunds, discounts, compensation, stock, or delivery promises.',
      'Do not confirm that a product existed in a previous menu, last week, or earlier visit unless facts prove it. If needed, say you cannot verify the previous menu and answer from the current catalog only.',
      'If the original reply contained a wrong product or price, naturally correct it using available catalog facts or ask a brief clarifying question.',
      'If visibleSystemActions contains a needed action, you may guide the customer naturally to the visible choice without saying it is already completed.',
      'If customerDetails already has deliveryPreference or fulfillmentType, do not ask delivery vs pickup again; move to the earliest missingDetails step.',
      'If customerDetails already has paymentPreference, do not ask for the payment method again; move to the earliest missingDetails step.',
      'If hasPriorAssistantReply is true, continue the active conversation directly. Do not repeat an opening greeting or reintroduce the employee/store unless the latest customer message itself is a greeting.',
      'Keep the reply warm, concise, professional, and in the customer language.',
      'Return strict JSON only: {"reply":"..."}',
    ],
  });

  try {
    const text = await generatePlatformAIText(config, {
      input: prompt,
      instructions: `You rewrite unsafe customer replies for ${params.storeName}. Return JSON only.`,
    });

    return parseModelReplyRepair(text);
  } catch {
    return undefined;
  }
};

const normalizeConversationBoundaryText = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\s+/g, ' ');
};

const containsOpeningGreeting = (value: string) => {
  const text = normalizeConversationBoundaryText(value);

  return /\b(?:hello|hi|hey|welcome|bonjour|salut)\b/i.test(text)
    || /(?:^|\s)(?:السلام|سلام|وعليكم|هلا|اهلا|مرحبا|حياك)(?:\s|$)/u.test(text);
};

const guardReplyAgainstConversationRestart = (params: {
  customerMessage: string;
  hasPriorAssistantReply: boolean;
  reply: string;
}) => {
  if (
    !params.hasPriorAssistantReply
    || containsOpeningGreeting(params.customerMessage)
    || !containsOpeningGreeting(params.reply.slice(0, 160))
  ) {
    return {
      guarded: false,
      reply: params.reply,
    };
  }

  return {
    guarded: true,
    reason: 'contextual_rewrite:conversation_restart_after_prior_reply',
    reply: params.reply,
  };
};

const containsCheckoutChoiceRequest = (
  reply: string,
  termsPattern: RegExp,
  directChoicePattern: RegExp,
) => {
  const text = normalizeConversationBoundaryText(reply);
  const segments = text.split(/[.!?\u061F\n]+/).filter(Boolean);
  const asksForChoicePattern = /\b(?:choose|select|prefer|would you like|how would you like|which one|delivery or pickup|pickup or delivery|cash or card|card or cash)\b|(?:^|\s)(?:\u0627\u062E\u062A\u0631|\u0627\u062E\u062A\u0627\u0631|\u062A\u062E\u062A\u0627\u0631|\u062A\u062D\u062F\u062F|\u0648\u0634 \u062A\u0641\u0636\u0644|\u0643\u064A\u0641 \u062A\u062D\u0628)(?:\s|$)/iu;

  return directChoicePattern.test(text)
    || segments.some(segment => termsPattern.test(segment) && asksForChoicePattern.test(segment));
};

const guardReplyAgainstRepeatedSatisfiedNeed = (params: {
  customerDetails?: AIEmployeeCustomerDetails;
  missingDetails: string[];
  reply: string;
}) => {
  const fulfillmentSatisfied = Boolean(
    params.customerDetails?.deliveryPreference
    || params.customerDetails?.fulfillmentType,
  ) || !params.missingDetails.includes('fulfillment_method');
  const paymentSatisfied = Boolean(params.customerDetails?.paymentPreference)
    || !params.missingDetails.includes('payment_method');

  if (
    fulfillmentSatisfied
    && containsCheckoutChoiceRequest(
      params.reply,
      /\b(?:delivery|pickup|collect|branch)\b|\u062A\u0648\u0635\u064A\u0644|\u0627\u0633\u062A\u0644\u0627\u0645|\u0627\u0644\u0641\u0631\u0639/iu,
      /delivery\s+or\s+pickup|pickup\s+or\s+delivery|\u062A\u0648\u0635\u064A\u0644\s+(?:\u0648\u0644\u0627|\u0627\u0648|\u0623\u0648)\s+\u0627\u0633\u062A\u0644\u0627\u0645|\u0627\u0633\u062A\u0644\u0627\u0645\s+(?:\u0648\u0644\u0627|\u0627\u0648|\u0623\u0648)\s+\u062A\u0648\u0635\u064A\u0644/iu,
    )
  ) {
    return {
      guarded: true,
      reason: 'contextual_rewrite:fulfilled_step_repeated_fulfillment_method',
      reply: params.reply,
    };
  }

  if (
    paymentSatisfied
    && containsCheckoutChoiceRequest(
      params.reply,
      /\b(?:payment|pay|cash|card)\b|\u062F\u0641\u0639|\u0627\u0644\u062F\u0641\u0639|\u0643\u0627\u0634|\u0628\u0637\u0627\u0642\u0629|\u0634\u0628\u0643\u0629/iu,
      /cash\s+or\s+card|card\s+or\s+cash|(?:\u0643\u0627\u0634|\u0646\u0642\u062F)\s+(?:\u0648\u0644\u0627|\u0627\u0648|\u0623\u0648)\s+(?:\u0628\u0637\u0627\u0642\u0629|\u0634\u0628\u0643\u0629)|(?:\u0628\u0637\u0627\u0642\u0629|\u0634\u0628\u0643\u0629)\s+(?:\u0648\u0644\u0627|\u0627\u0648|\u0623\u0648)\s+(?:\u0643\u0627\u0634|\u0646\u0642\u062F)/iu,
    )
  ) {
    return {
      guarded: true,
      reason: 'contextual_rewrite:fulfilled_step_repeated_payment_method',
      reply: params.reply,
    };
  }

  return {
    guarded: false,
    reply: params.reply,
  };
};

const textMatchesAny = (text: string, patterns: RegExp[]) => {
  return patterns.some(pattern => pattern.test(text));
};

const guardReplyAgainstUnavailableSystemActions = (params: {
  reply: string;
  visibleSystemActions: VisibleSystemAction[];
}) => {
  const text = normalizeCatalogClaimText(params.reply);
  const visibleActions = new Set(params.visibleSystemActions);
  const references: Array<{
    action: VisibleSystemAction;
    patterns: RegExp[];
  }> = [
    {
      action: 'final_confirmation',
      patterns: [
        /(?:اضغط|اختر|اختار|استخدم|تقدر|يمكنك|اضغطي|اختاري).{0,50}(?:تاكيد|تأكيد|ارسال الطلب|إرسال الطلب|ارسل الطلب|أرسل الطلب|نعم ارسل الطلب)/u,
        /(?:press|click|tap|choose|select).{0,50}(?:confirm|send order|submit order)/iu,
      ],
    },
    {
      action: 'location_share',
      patterns: [
        /(?:اضغط|اختر|اختار|استخدم|تقدر|يمكنك|اضغطي|اختاري).{0,50}(?:ارسال الموقع|إرسال الموقع|مشاركة الموقع|شارك الموقع|موقعك الحالي)/u,
        /(?:press|click|tap|choose|select|use).{0,50}(?:share location|send location|current location)/iu,
      ],
    },
    {
      action: 'fulfillment_choices',
      patterns: [
        /(?:اضغط|اختر|اختار|حدد|تقدر|يمكنك|اضغطي|اختاري).{0,50}(?:توصيل|استلام).{0,25}(?:استلام|توصيل)/u,
        /(?:press|click|tap|choose|select).{0,50}(?:delivery|pickup).{0,25}(?:pickup|delivery)/iu,
      ],
    },
    {
      action: 'payment_choices',
      patterns: [
        /(?:اضغط|اختر|اختار|حدد|تقدر|يمكنك|اضغطي|اختاري).{0,50}(?:كاش|نقد|بطاقه|بطاقة|شبكه|شبكة).{0,25}(?:بطاقه|بطاقة|شبكه|شبكة|كاش|نقد)/u,
        /(?:press|click|tap|choose|select).{0,50}(?:cash|card).{0,25}(?:card|cash)/iu,
      ],
    },
    {
      action: 'product_choices',
      patterns: [
        /(?:اضغط|اختر|اختار|حدد|تقدر|يمكنك|اضغطي|اختاري).{0,50}(?:الخيارات الظاهره|الخيارات الظاهرة|المنتجات الظاهره|المنتجات الظاهرة)/u,
        /(?:press|click|tap|choose|select).{0,50}(?:visible choices|shown choices|product choices)/iu,
      ],
    },
    {
      action: 'restore_cancelled_cart',
      patterns: [
        /(?:اضغط|اختر|اختار|استخدم|تقدر|يمكنك|اضغطي|اختاري).{0,50}(?:استعاده السله|استعادة السلة|ارجاع السله|إرجاع السلة)/u,
        /(?:press|click|tap|choose|select|use).{0,50}(?:restore cart|restore basket)/iu,
      ],
    },
  ];
  const unavailableReference = references.find((reference) => {
    return !visibleActions.has(reference.action) && textMatchesAny(text, reference.patterns);
  });

  if (!unavailableReference) {
    return {
      guarded: false,
      reply: params.reply,
    };
  }

  return {
    guarded: true,
    reason: `unavailable_system_action:${unavailableReference.action}`,
    reply: params.reply,
  };
};

const guardReplyAgainstUnprovenActionClaims = (params: {
  cartMutation: CartMutationContext;
  orderCancellation: OrderCancellationResult;
  orderId?: null | number;
  orderModification: OrderModificationResult;
  reply: string;
  reviewCaptured: boolean;
  supportEscalation: SupportEscalationResult;
}) => {
  const text = normalizeCatalogClaimText(params.reply);
  const checks: Array<{
    allowed: boolean;
    patterns: RegExp[];
    reason: string;
  }> = [
    {
      allowed: params.cartMutation.type === 'added_items',
      patterns: [
        /(?:تمت?|تمام|خلاص).{0,20}(?:اضافه|اضفت|اضيف|انضاف).{0,80}(?:السله|سله|طلبك|الطلب)/u,
        /(?:added|has been added).{0,80}(?:cart|basket|order)/iu,
      ],
      reason: 'unproven_action:cart_item_added',
    },
    {
      allowed: params.cartMutation.type === 'removed_item',
      patterns: [
        /(?:تمت?|تمام|خلاص).{0,20}(?:حذف|حذفت|ازاله|ازلت).{0,80}(?:السله|سله|طلبك|الطلب)/u,
        /(?:removed|deleted).{0,80}(?:cart|basket|order)/iu,
      ],
      reason: 'unproven_action:cart_item_removed',
    },
    {
      allowed: params.cartMutation.type === 'quantity_changed',
      patterns: [
        /(?:تمت?|تمام|خلاص).{0,20}(?:تحديث|تعديل|تغيير).{0,80}(?:الكميه|الكمية|السله|سله)/u,
        /(?:quantity|cart).{0,40}(?:updated|changed)/iu,
      ],
      reason: 'unproven_action:cart_quantity_changed',
    },
    {
      allowed: params.cartMutation.type === 'cleared',
      patterns: [
        /(?:تمت?|تمام|خلاص).{0,20}(?:الغاء|إلغاء|حذف|تفريغ).{0,80}(?:السله|سله|الطلب الحالي)/u,
        /(?:cart|basket).{0,40}(?:cancelled|canceled|cleared)/iu,
      ],
      reason: 'unproven_action:cart_cleared',
    },
    {
      allowed: params.cartMutation.type === 'restored',
      patterns: [
        /(?:تمت?|تمام|خلاص).{0,20}(?:استعاده|استعادة|ارجاع|إرجاع).{0,80}(?:السله|سله)/u,
        /(?:cart|basket).{0,40}(?:restored|recovered)/iu,
      ],
      reason: 'unproven_action:cart_restored',
    },
    {
      allowed: Boolean(params.orderId || params.orderModification.created),
      patterns: [
        /(?:تمت?|تمام|خلاص|استلمنا).{0,30}(?:ارسال|إرسال|استلام|انشاء|إنشاء|تاكيد|تأكيد).{0,80}(?:طلبك|الطلب|طلب رقم)/u,
        /order.{0,40}(?:submitted|received|created|confirmed)/iu,
      ],
      reason: 'unproven_action:order_created',
    },
    {
      allowed: params.orderCancellation.applied,
      patterns: [
        /(?:تمت?|تمام|خلاص).{0,30}(?:الغاء|إلغاء).{0,80}(?:طلبك|الطلب|طلب رقم)/u,
        /order.{0,40}(?:cancelled|canceled)/iu,
      ],
      reason: 'unproven_action:order_cancelled',
    },
    {
      allowed: params.orderCancellation.requiresStoreReview,
      patterns: [
        /(?:تمت?|تمام|خلاص|ارسلنا).{0,30}(?:ارسال|إرسال|رفع).{0,80}(?:طلب الغاء|طلب إلغاء|الغاء الطلب|إلغاء الطلب)/u,
        /cancellation request.{0,40}(?:sent|submitted)/iu,
      ],
      reason: 'unproven_action:cancellation_request_sent',
    },
    {
      allowed: params.supportEscalation.created,
      patterns: [
        /(?:تمت?|تمام|خلاص).{0,30}(?:رفع|تسجيل|ارسال|إرسال).{0,80}(?:شكوى|بلاغ|ملاحظه|ملاحظة)/u,
        /(?:complaint|support request).{0,40}(?:created|sent|submitted|filed)/iu,
      ],
      reason: 'unproven_action:support_escalation_created',
    },
    {
      allowed: params.reviewCaptured,
      patterns: [
        /(?:تمت?|تمام|خلاص).{0,30}(?:تسجيل|حفظ|استلام).{0,80}(?:تقييمك|التقييم)/u,
        /(?:review|rating).{0,40}(?:captured|saved|received|submitted)/iu,
      ],
      reason: 'unproven_action:review_captured',
    },
  ];

  if (
    !/\b(?:unpaid|not paid)\b|غير مدفوع|لم يتم الدفع|ما تم الدفع/iu.test(text)
    && textMatchesAny(text, [
      /(?:تمت?|تمام|خلاص).{0,30}(?:الدفع|سداد|تحصيل).{0,80}(?:بنجاح)?/u,
      /payment.{0,40}(?:received|captured|completed|paid)/iu,
      /(?:paid successfully|already paid)/iu,
    ])
  ) {
    return {
      guarded: true,
      reason: 'unproven_action:payment_completed',
      reply: params.reply,
    };
  }

  const unprovenClaim = checks.find((check) => {
    return !check.allowed && textMatchesAny(text, check.patterns);
  });

  if (!unprovenClaim) {
    return {
      guarded: false,
      reply: params.reply,
    };
  }

  return {
    guarded: true,
    reason: unprovenClaim.reason,
    reply: params.reply,
  };
};

export const guardModelReplyAgainstFalseActions = async (params: {
  cart?: ConversationCart;
  cartMutation: CartMutationContext;
  catalogProducts: AgentCatalogProduct[];
  customerDetails?: AIEmployeeCustomerDetails;
  customerMessage: string;
  customerOrders: CustomerOrderSnapshot;
  hasPriorAssistantReply: boolean;
  locale?: string;
  missingDetails: string[];
  orderId?: null | number;
  orderModification: OrderModificationResult;
  orderCancellation: OrderCancellationResult;
  reply: string;
  reviewCaptured: boolean;
  storeContext?: StoreAIContext;
  storeName: string;
  suggestedProducts: ConversationSuggestedProduct[];
  supportEscalation: SupportEscalationResult;
  visibleSystemActions: VisibleSystemAction[];
}): Promise<ReplyGuardResult> => {
  const checks: ReplyGuardCheck[] = [];
  const checkDeterministicGuard = (
    name: string,
    guard: { guarded: boolean; reason?: string; reply: string },
  ) => {
    checks.push({
      mode: 'deterministic',
      name,
      reason: guard.reason,
      result: guard.guarded ? 'guarded' : 'passed',
    });

    return guard;
  };
  const languageGuard = guardReplyLanguageAndDialect({
    customerMessage: params.customerMessage,
    locale: params.locale,
    reply: params.reply,
  });
  checkDeterministicGuard('language_and_encoding', languageGuard);

  if (languageGuard.guarded) {
    return {
      ...languageGuard,
      checks,
    };
  }

  const conversationRestartGuard = guardReplyAgainstConversationRestart({
    customerMessage: params.customerMessage,
    hasPriorAssistantReply: params.hasPriorAssistantReply,
    reply: params.reply,
  });
  checkDeterministicGuard('conversation_restart', conversationRestartGuard);

  if (conversationRestartGuard.guarded) {
    return {
      ...conversationRestartGuard,
      checks,
    };
  }

  const repeatedSatisfiedNeedGuard = guardReplyAgainstRepeatedSatisfiedNeed({
    customerDetails: params.customerDetails,
    missingDetails: params.missingDetails,
    reply: params.reply,
  });
  checkDeterministicGuard('repeated_satisfied_need', repeatedSatisfiedNeedGuard);

  if (repeatedSatisfiedNeedGuard.guarded) {
    return {
      ...repeatedSatisfiedNeedGuard,
      checks,
    };
  }

  const unavailableSystemActionGuard = guardReplyAgainstUnavailableSystemActions({
    reply: params.reply,
    visibleSystemActions: params.visibleSystemActions,
  });
  checkDeterministicGuard('visible_system_action_truth', unavailableSystemActionGuard);

  if (unavailableSystemActionGuard.guarded) {
    return {
      ...unavailableSystemActionGuard,
      checks,
    };
  }

  const unprovenActionGuard = guardReplyAgainstUnprovenActionClaims({
    cartMutation: params.cartMutation,
    orderCancellation: params.orderCancellation,
    orderId: params.orderId,
    orderModification: params.orderModification,
    reply: params.reply,
    reviewCaptured: params.reviewCaptured,
    supportEscalation: params.supportEscalation,
  });
  checkDeterministicGuard('system_action_truth', unprovenActionGuard);

  if (unprovenActionGuard.guarded) {
    return {
      ...unprovenActionGuard,
      checks,
    };
  }

  const privacyGuard = guardCustomerPrivacyReply({
    allowedPrivateData: {
      emails: [
        params.customerDetails?.email,
      ],
      phoneNumbers: [
        params.customerDetails?.phone,
        ...params.customerOrders.open.map(order => order.customerPhone),
        ...params.customerOrders.completed.map(order => order.customerPhone),
      ],
    },
    reply: params.reply,
  });
  checkDeterministicGuard('customer_privacy', privacyGuard);

  if (privacyGuard.guarded) {
    return {
      ...privacyGuard,
      checks,
    };
  }

  const historicalCatalogGuard = guardReplyAgainstUnsupportedHistoricalCatalogClaims(params.reply);
  checkDeterministicGuard('historical_catalog_truth', historicalCatalogGuard);

  if (historicalCatalogGuard.guarded) {
    return {
      ...historicalCatalogGuard,
      checks,
    };
  }

  const availabilityClaimGuard = guardReplyAgainstUnsupportedAvailabilityClaims({
    catalogProducts: params.catalogProducts,
    customerMessage: params.customerMessage,
    reply: params.reply,
  });
  checkDeterministicGuard('availability_claim_truth', availabilityClaimGuard);

  if (availabilityClaimGuard.guarded) {
    return {
      ...availabilityClaimGuard,
      checks,
    };
  }

  const catalogItemGuard = guardReplyAgainstUnsupportedCatalogItems({
    cart: params.cart,
    catalogProducts: params.catalogProducts,
    reply: params.reply,
  });
  checkDeterministicGuard('catalog_item_truth', catalogItemGuard);

  if (catalogItemGuard.guarded) {
    return {
      ...catalogItemGuard,
      checks,
    };
  }

  const priceGuard = guardModelReplyAgainstUnsupportedPrices({
    cart: params.cart,
    catalogProducts: params.catalogProducts,
    customerOrders: params.customerOrders,
    locale: params.locale,
    orderModification: params.orderModification,
    reply: params.reply,
    storeContext: params.storeContext,
    suggestedProducts: params.suggestedProducts,
  });
  checkDeterministicGuard('price_truth', priceGuard);

  if (priceGuard.guarded) {
    return {
      ...priceGuard,
      checks,
    };
  }

  const review = await reviewModelReplySafety(params);
  const hasCertainFactContradiction = review?.factContradiction === true
    && review.confidence === 'certain';

  if (review === undefined) {
    // The deterministic guards already passed, so the reply will be sent WITHOUT
    // a semantic second opinion. Emit a stable signal so ops can alert on the
    // unavailable-review rate (provider outage / unparseable output).
    logger.warn('AI semantic reply review unavailable; sending after deterministic guards only', {
      event: 'ai_semantic_reply_review_unavailable',
      storeName: params.storeName,
    });
  }

  checks.push({
    mode: 'semantic_review',
    name: 'contextual_reply_review',
    reason: review?.reason,
    result: review === undefined
      ? 'unavailable'
      : hasCertainFactContradiction
        ? 'guarded'
        : review.decision === 'rewrite' && review.confidence === 'certain'
          ? 'guarded'
          : review.decision === 'block' && review.confidence === 'certain'
            ? 'guarded'
            : review.decision === 'note' || review.safe === false
              ? 'noted'
              : 'passed',
  });

  const shouldRewrite = review?.decision === 'rewrite' && review.confidence === 'certain';
  const shouldBlock = hasCertainFactContradiction
    || (review?.decision === 'block' && review.confidence === 'certain');

  if (!shouldRewrite && !shouldBlock) {
    return {
      checks,
      guarded: false,
      reply: params.reply,
    };
  }

  return {
    checks,
    guarded: true,
    reason: shouldRewrite
      ? `contextual_rewrite:${review.reason ?? 'conversation_continuity'}`
      : review?.reason ?? review?.violationKind ?? 'semantic_safety_review',
    reply: params.reply,
  };
};

const markGuardedChecksAsRepaired = (checks: ReplyGuardCheck[]) => {
  return checks.map((check) => {
    if (check.result !== 'guarded') {
      return check;
    }

    return {
      ...check,
      result: 'repaired' as const,
    };
  });
};

const prefixReplyGuardCheckNames = (
  checks: ReplyGuardCheck[],
  prefix: string,
) => checks.map(check => ({
  ...check,
  name: `${prefix}_${check.name}`,
}));

const releaseContextualRewrite = (
  checks: ReplyGuardCheck[],
  reply: string,
): ReplyGuardResult => {
  return {
    checks: checks.map((check) => {
      if (check.result === 'guarded') {
        return {
          ...check,
          result: 'noted' as const,
        };
      }

      return check;
    }),
    guarded: false,
    reply,
  };
};

export const repairGuardedReplyIfPossible = async (params: {
  cart?: ConversationCart;
  cartMutation: CartMutationContext;
  catalogProducts: AgentCatalogProduct[];
  customerDetails?: AIEmployeeCustomerDetails;
  customerMessage: string;
  customerOrders: CustomerOrderSnapshot;
  hasPriorAssistantReply: boolean;
  guardedReply: ReplyGuardResult;
  locale?: string;
  missingDetails: string[];
  orderCancellation: OrderCancellationResult;
  orderId?: null | number;
  orderModification: OrderModificationResult;
  originalReply: string;
  reviewCaptured: boolean;
  storeContext?: StoreAIContext;
  storeName: string;
  suggestedProducts: ConversationSuggestedProduct[];
  supportEscalation: SupportEscalationResult;
  visibleSystemActions: VisibleSystemAction[];
}): Promise<ReplyGuardResult> => {
  if (!params.guardedReply.guarded) {
    return params.guardedReply;
  }

  const repairInput = {
    cart: params.cart,
    cartMutation: params.cartMutation,
    catalogProducts: params.catalogProducts,
    customerDetails: params.customerDetails,
    customerMessage: params.customerMessage,
    customerOrders: params.customerOrders,
    hasPriorAssistantReply: params.hasPriorAssistantReply,
    guardChecks: params.guardedReply.checks,
    guardReason: params.guardedReply.reason,
    locale: params.locale,
    missingDetails: params.missingDetails,
    orderCancellation: params.orderCancellation,
    orderId: params.orderId,
    orderModification: params.orderModification,
    originalReply: params.originalReply,
    storeContext: params.storeContext,
    storeName: params.storeName,
    suggestedProducts: params.suggestedProducts,
    supportEscalation: params.supportEscalation,
    visibleSystemActions: params.visibleSystemActions,
  };
  // Iterative repair: each attempt rewrites against the LATEST guard failure,
  // then re-guards. The first reply that passes the full guard is returned; a
  // repaired reply that only trips a cosmetic contextual_rewrite is released.
  let attemptInput = repairInput;
  let producedAnyRepair = false;

  for (let attempt = 0; attempt < MODEL_REPLY_REPAIR_ATTEMPTS; attempt += 1) {
    const repairedReply = await repairUnsafeModelReply(attemptInput);

    if (!repairedReply) {
      continue;
    }

    producedAnyRepair = true;

    const repairedGuard = await guardModelReplyAgainstFalseActions({
      cart: params.cart,
      cartMutation: params.cartMutation,
      catalogProducts: params.catalogProducts,
      customerDetails: params.customerDetails,
      customerMessage: params.customerMessage,
      customerOrders: params.customerOrders,
      hasPriorAssistantReply: params.hasPriorAssistantReply,
      locale: params.locale,
      missingDetails: params.missingDetails,
      orderCancellation: params.orderCancellation,
      orderId: params.orderId,
      orderModification: params.orderModification,
      reply: repairedReply,
      reviewCaptured: params.reviewCaptured,
      storeContext: params.storeContext,
      storeName: params.storeName,
      suggestedProducts: params.suggestedProducts,
      supportEscalation: params.supportEscalation,
      visibleSystemActions: params.visibleSystemActions,
    });

    if (!repairedGuard.guarded) {
      return {
        checks: [
          ...markGuardedChecksAsRepaired(params.guardedReply.checks),
          {
            mode: 'model_repair',
            name: 'model_reply_repair',
            reason: params.guardedReply.reason,
            result: 'passed',
          },
          ...prefixReplyGuardCheckNames(repairedGuard.checks, 'post_repair'),
        ],
        guarded: false,
        reason: undefined,
        repaired: true,
        repairReason: params.guardedReply.reason,
        reply: repairedReply,
      };
    }

    if (
      params.guardedReply.reason?.startsWith('contextual_rewrite:')
      && repairedGuard.reason?.startsWith('contextual_rewrite:')
    ) {
      return releaseContextualRewrite(
        [
          ...markGuardedChecksAsRepaired(params.guardedReply.checks),
          ...prefixReplyGuardCheckNames(repairedGuard.checks, 'post_repair'),
        ],
        repairedReply,
      );
    }

    // Feed the new failure reason into the next repair attempt.
    attemptInput = {
      ...repairInput,
      guardChecks: repairedGuard.checks,
      guardReason: repairedGuard.reason,
    };
  }

  if (params.guardedReply.reason?.startsWith('contextual_rewrite:')) {
    return releaseContextualRewrite(
      params.guardedReply.checks,
      params.originalReply,
    );
  }

  throw new Error(
    producedAnyRepair
      ? 'AI model reply repair failed safety review.'
      : 'AI model reply repair unavailable.',
  );
};
