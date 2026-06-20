import { PLATFORM_AI_POLICY_VERSION } from './PlatformAIPolicy';

type ConversationIntent = 'general_question' | 'order_followup' | 'order_request' | 'review_response';

type ProductConversationAvailability = 'available' | 'limited' | 'unavailable';

export type ConversationOrderItem = {
  name: string;
  productId: number;
  quantity: number;
  unitPrice: number;
};

export type ConversationSuggestedProduct = {
  availability: ProductConversationAvailability;
  category?: null | string;
  id: number;
  image?: null | string;
  matchScore?: number;
  salesReason?: string;
  name: string;
  price: string;
};

export type ConversationDecision = {
  confidence: number;
  intent: ConversationIntent;
  missingDetails: string[];
  policyVersion: string;
  reply: string;
  requiresCustomerConfirmation?: boolean;
  suggestedProducts?: ConversationSuggestedProduct[];
  shouldCreateDraftOrder: boolean;
  unavailableProduct?: ConversationSuggestedProduct;
};

export type ConversationCatalogProduct = {
  availability?: ProductConversationAvailability;
  brand?: null | string;
  category?: null | string;
  description?: null | string;
  id: number;
  image?: null | string;
  name: string;
  price: string;
  productType?: null | string;
  tags?: string[];
  unit?: null | string;
};

const INTERNAL_DECISION_REPLY = 'internal_decision_only';

const normalize = (value: string) => {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647');
};

const tokensFrom = (value: string) => {
  return normalize(value)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3);
};

const productNameTokensFrom = (value: string) => {
  return normalize(value)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 2);
};

const normalizedTextTokens = (value: string) => {
  return normalize(value)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(token => token.length > 0);
};

const metadataTokensFrom = (product: ConversationCatalogProduct) => {
  return [
    product.productType,
    product.brand,
    product.unit,
    ...(product.tags ?? []),
  ]
    .flatMap(value => productNameTokensFrom(value ?? ''));
};

const productIdentityTokensFrom = (product: ConversationCatalogProduct) => {
  return [
    ...productNameTokensFrom(product.name),
    ...metadataTokensFrom(product),
  ];
};

const tokenCoverageScore = (product: ConversationCatalogProduct, messageTokens: string[]) => {
  const identityTokens = new Set(productIdentityTokensFrom(product));

  if (identityTokens.size === 0 || messageTokens.length === 0) {
    return 0;
  }

  const matchedCount = messageTokens.filter(token => identityTokens.has(token)).length;

  return matchedCount / messageTokens.length;
};

const productMatchesMessage = (
  product: ConversationCatalogProduct,
  normalizedMessage: string,
) => {
  const messageTokens = new Set(tokensFrom(normalizedMessage));
  const searchableValues = [
    product.name,
    product.productType,
    product.brand,
    product.unit,
    product.description,
    product.category,
    ...(product.tags ?? []),
  ].filter((value): value is string => Boolean(value?.trim()));

  return searchableValues.some((value) => {
    const normalizedValue = normalize(value);
    const valueTokens = tokensFrom(value);

    if (normalizedValue.length < 3) {
      return false;
    }

    const structurallyMatches = (
      valueTokens.length === 1
        ? messageTokens.has(valueTokens[0]!)
        : normalizedMessage.includes(normalizedValue)
          || valueTokens.every(token => messageTokens.has(token))
    );

    return structurallyMatches || valueTokens.some((token) => {
      return token.length >= 4 && messageTokens.has(token);
    });
  });
};

const productNameMatchesMessage = (
  product: ConversationCatalogProduct,
  normalizedMessage: string,
) => {
  const normalizedName = normalize(product.name);
  const nameTokens = tokensFrom(product.name);
  const messageTokens = normalizedTextTokens(normalizedMessage);
  const coverageScore = tokenCoverageScore(product, messageTokens);

  return normalizedName.length >= 3
    && (
      (
        normalizedMessage.includes(normalizedName)
        && coverageScore > 0.5
      )
      || (
        nameTokens.length > 1
        && nameTokens.every(token => normalizedMessage.includes(token))
        && coverageScore > 0.5
      )
    );
};

const productNameIsCompleteMessageMatch = (
  product: ConversationCatalogProduct,
  normalizedMessage: string,
) => {
  const nameTokens = productNameTokensFrom(product.name);
  const messageTokens = normalizedTextTokens(normalizedMessage);

  return nameTokens.length > 0
    && messageTokens.length > 0
    && nameTokens.every(token => messageTokens.includes(token))
    && messageTokens.every(token => nameTokens.includes(token));
};

const toSuggestedProduct = (
  product: ConversationCatalogProduct,
): ConversationSuggestedProduct => ({
  availability: product.availability ?? 'available',
  category: product.category,
  id: product.id,
  image: product.image,
  name: product.name,
  price: product.price,
});

export const extractConversationRating = (message: string) => {
  const explicitRating = message.match(/\b([1-5])\b/);
  if (explicitRating?.[1]) {
    return Number(explicitRating[1]);
  }

  return null;
};

export const matchConversationCatalogItems = (
  catalog: ConversationCatalogProduct[],
  message: string,
): ConversationOrderItem[] => {
  const normalizedMessage = normalize(message);
  const unavailableNameMatches = catalog.filter((product) => {
    return product.availability === 'unavailable'
      && productNameMatchesMessage(product, normalizedMessage);
  });

  if (unavailableNameMatches.length > 0) {
    return [];
  }

  const availableCatalog = catalog.filter(product => product.availability !== 'unavailable');
  const exactNameMatches = availableCatalog.filter((product) => {
    return productNameMatchesMessage(product, normalizedMessage);
  });
  const longestExactNameMatches = exactNameMatches.filter((product) => {
    const normalizedName = normalize(product.name);
    const productTokens = new Set(productNameTokensFrom(product.name));
    const productIsCompleteMessageMatch = productNameIsCompleteMessageMatch(
      product,
      normalizedMessage,
    );

    return !exactNameMatches.some((otherProduct) => {
      const otherNormalizedName = normalize(otherProduct.name);
      const otherTokens = new Set(productNameTokensFrom(otherProduct.name));
      const productTokensAreSubset = productTokens.size > 0
        && otherTokens.size > productTokens.size
        && [...productTokens].every(token => otherTokens.has(token));

      return otherProduct.id !== product.id
        && !productIsCompleteMessageMatch
        && (
          (
            otherNormalizedName.length > normalizedName.length
            && otherNormalizedName.includes(normalizedName)
          )
          || productTokensAreSubset
        );
    });
  });
  const matchedProducts = longestExactNameMatches.length > 0
    ? longestExactNameMatches
    : availableCatalog.filter((product) => {
        return productMatchesMessage(product, normalizedMessage);
      });

  return matchedProducts.map(product => ({
    name: product.name,
    productId: product.id,
    quantity: 1,
    unitPrice: Number(product.price ?? 0),
  }));
};

export const matchExplicitConversationCatalogItems = (
  catalog: ConversationCatalogProduct[],
  message: string,
): ConversationOrderItem[] => {
  const normalizedMessage = normalize(message);
  const unavailableNameMatches = catalog.filter((product) => {
    return product.availability === 'unavailable'
      && productNameMatchesMessage(product, normalizedMessage);
  });

  if (unavailableNameMatches.length > 0) {
    return [];
  }

  const availableCatalog = catalog.filter(product => product.availability !== 'unavailable');
  const exactNameMatches = availableCatalog.filter((product) => {
    return productNameMatchesMessage(product, normalizedMessage);
  });
  const longestExactNameMatches = exactNameMatches.filter((product) => {
    const normalizedName = normalize(product.name);
    const productTokens = new Set(productNameTokensFrom(product.name));
    const productIsCompleteMessageMatch = productNameIsCompleteMessageMatch(
      product,
      normalizedMessage,
    );

    return !exactNameMatches.some((otherProduct) => {
      const otherNormalizedName = normalize(otherProduct.name);
      const otherTokens = new Set(productNameTokensFrom(otherProduct.name));
      const productTokensAreSubset = productTokens.size > 0
        && otherTokens.size > productTokens.size
        && [...productTokens].every(token => otherTokens.has(token));

      return otherProduct.id !== product.id
        && !productIsCompleteMessageMatch
        && (
          (
            otherNormalizedName.length > normalizedName.length
            && otherNormalizedName.includes(normalizedName)
          )
          || productTokensAreSubset
        );
    });
  });

  return longestExactNameMatches.map(product => ({
    name: product.name,
    productId: product.id,
    quantity: 1,
    unitPrice: Number(product.price ?? 0),
  }));
};

export const findUnavailableRequestedProduct = (
  catalog: ConversationCatalogProduct[],
  message: string,
) => {
  const normalizedMessage = normalize(message);

  return catalog.find((product) => {
    return product.availability === 'unavailable'
      && productMatchesMessage(product, normalizedMessage);
  });
};

export const findAlternativeProducts = (
  catalog: ConversationCatalogProduct[],
  unavailableProduct: ConversationCatalogProduct,
  excludeProductIds: number[] = [],
) => {
  const unavailableTags = new Set(unavailableProduct.tags ?? []);
  const excludedIds = new Set(excludeProductIds);
  const unavailableProductType = unavailableProduct.productType
    ? normalize(unavailableProduct.productType)
    : undefined;
  const unavailableBrand = unavailableProduct.brand
    ? normalize(unavailableProduct.brand)
    : undefined;

  return catalog
    .filter((product) => {
      if (
        product.id === unavailableProduct.id
        || excludedIds.has(product.id)
        || product.availability === 'unavailable'
      ) {
        return false;
      }

      const sameCategory = product.category
        && unavailableProduct.category
        && normalize(product.category) === normalize(unavailableProduct.category);
      const sameProductType = product.productType
        && unavailableProductType
        && normalize(product.productType) === unavailableProductType;
      const sameBrand = product.brand
        && unavailableBrand
        && normalize(product.brand) === unavailableBrand;
      const sharedTags = (product.tags ?? []).some(tag => unavailableTags.has(tag));

      return Boolean(sameProductType || sameBrand || sameCategory || sharedTags);
    })
    .slice(0, 4)
    .map(toSuggestedProduct);
};

export const isAlternativeRequest = (_message: string) => {
  return false;
};

export const buildConversationDecision = (params: {
  customerConfirmedOrder?: boolean;
  items: ConversationOrderItem[];
  message: string;
  storeName: string;
  suggestedProducts?: ConversationSuggestedProduct[];
  unavailableProduct?: ConversationSuggestedProduct;
}): ConversationDecision => {
  const {
    customerConfirmedOrder,
    items,
    message,
    suggestedProducts = [],
    unavailableProduct,
  } = params;
  const missingDetails: string[] = [];
  const hasOrderIntent = items.length > 0;
  const hasReviewIntent = extractConversationRating(message) !== null;

  if (hasReviewIntent) {
    return {
      confidence: 0.86,
      intent: 'review_response',
      missingDetails,
      policyVersion: PLATFORM_AI_POLICY_VERSION,
      reply: INTERNAL_DECISION_REPLY,
      suggestedProducts: [],
      shouldCreateDraftOrder: false,
    };
  }

  if (unavailableProduct) {
    return {
      confidence: suggestedProducts.length > 0 ? 0.84 : 0.72,
      intent: 'order_request',
      missingDetails,
      policyVersion: PLATFORM_AI_POLICY_VERSION,
      reply: INTERNAL_DECISION_REPLY,
      suggestedProducts,
      shouldCreateDraftOrder: false,
      unavailableProduct,
    };
  }

  if (hasOrderIntent) {
    return {
      confidence: 0.82,
      intent: 'order_request',
      missingDetails,
      policyVersion: PLATFORM_AI_POLICY_VERSION,
      reply: INTERNAL_DECISION_REPLY,
      suggestedProducts,
      shouldCreateDraftOrder: customerConfirmedOrder === true,
    };
  }

  return {
    confidence: 0.62,
    intent: 'general_question',
    missingDetails,
    policyVersion: PLATFORM_AI_POLICY_VERSION,
    reply: INTERNAL_DECISION_REPLY,
    suggestedProducts,
    shouldCreateDraftOrder: false,
  };
};
