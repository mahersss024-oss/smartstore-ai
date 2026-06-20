import type {
  ConversationCatalogProduct,
  ConversationOrderItem,
  ConversationSuggestedProduct,
} from './ConversationEngine';
import {
  findAlternativeProducts,
  findUnavailableRequestedProduct,
  matchExplicitConversationCatalogItems,
} from './ConversationEngine';

export type SalesCatalogProduct = ConversationCatalogProduct & {
  aiVisible: boolean;
};

export type SalesConversationSignal
  = | 'budget'
    | 'cold'
    | 'diet'
    | 'gift'
    | 'hot'
    | 'light'
    | 'premium'
    | 'sweet';

export type SalesConversationAnalysis = {
  requestedItems: ConversationOrderItem[];
  signals: SalesConversationSignal[];
  suggestedProducts: ConversationSuggestedProduct[];
  unavailableProduct?: ConversationSuggestedProduct;
};

const MAX_VISIBLE_PRODUCT_SUGGESTIONS = 8;

const normalize = (value: string) => {
  return value
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

const canonicalToken = (token: string) => {
  if (token.startsWith('\u0627\u0644') && token.length > 4) {
    return token.slice(2);
  }

  return token;
};

const tokensFrom = (value: null | string | undefined) => {
  return normalize(value ?? '')
    .split(' ')
    .filter(token => token.length >= 3)
    .map(canonicalToken);
};

const equivalentTokensFrom = (token: string) => {
  const equivalents = new Set([token]);

  if (token === '\u0634\u0637\u0647') {
    equivalents.add('\u062D\u0627\u0631');
    equivalents.add('\u062D\u0627\u0631\u0647');
    equivalents.add('spicy');
    equivalents.add('hot');
  }

  return equivalents;
};

const messageTokenVariantsFrom = (message: string) => {
  const variants = new Set<string>();

  for (const token of tokensFrom(message)) {
    for (const variant of equivalentTokensFrom(token)) {
      variants.add(variant);
    }
  }

  return variants;
};

const getBoundedDamerauLevenshteinDistance = (
  first: string,
  second: string,
  maximumDistance = 1,
) => {
  if (first === second) {
    return 0;
  }

  if (Math.abs(first.length - second.length) > maximumDistance) {
    return maximumDistance + 1;
  }

  const rows = Array.from(
    { length: first.length + 1 },
    () => Array.from<number>({ length: second.length + 1 }).fill(0),
  );

  for (let firstIndex = 0; firstIndex <= first.length; firstIndex += 1) {
    rows[firstIndex]![0] = firstIndex;
  }

  for (let secondIndex = 0; secondIndex <= second.length; secondIndex += 1) {
    rows[0]![secondIndex] = secondIndex;
  }

  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    let rowMinimum = maximumDistance + 1;

    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const substitutionCost = first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;
      const deletion = rows[firstIndex - 1]![secondIndex]! + 1;
      const insertion = rows[firstIndex]![secondIndex - 1]! + 1;
      const substitution = rows[firstIndex - 1]![secondIndex - 1]! + substitutionCost;
      let distance = Math.min(deletion, insertion, substitution);

      if (
        firstIndex > 1
        && secondIndex > 1
        && first[firstIndex - 1] === second[secondIndex - 2]
        && first[firstIndex - 2] === second[secondIndex - 1]
      ) {
        distance = Math.min(distance, rows[firstIndex - 2]![secondIndex - 2]! + 1);
      }

      rows[firstIndex]![secondIndex] = distance;
      rowMinimum = Math.min(rowMinimum, distance);
    }

    if (rowMinimum > maximumDistance) {
      return maximumDistance + 1;
    }
  }

  return rows[first.length]![second.length]!;
};

const tokensMatch = (first: string, second: string) => {
  if (first === second) {
    return true;
  }

  if (
    first.length < 5
    || second.length < 5
    || !/^\p{L}+$/u.test(first)
    || !/^\p{L}+$/u.test(second)
  ) {
    return false;
  }

  return getBoundedDamerauLevenshteinDistance(first, second) <= 1;
};

const tokenCollectionHasMatch = (
  candidates: Iterable<string>,
  expected: string,
) => {
  return Array.from(candidates).some(candidate => tokensMatch(candidate, expected));
};

const identityTokensFrom = (product: ConversationCatalogProduct) => {
  return [
    product.name,
    product.productType,
    product.brand,
    product.unit,
    product.category,
    product.description,
    ...(product.tags ?? []),
  ]
    .flatMap(value => tokensFrom(value));
};

const productFirstNameTokenMatchesMessage = (
  product: ConversationCatalogProduct,
  messageTokens: Set<string>,
) => {
  const [firstToken] = tokensFrom(product.name);

  return Boolean(firstToken && tokenCollectionHasMatch(messageTokens, firstToken));
};

const hasDirectShortQueryMatch = (
  product: ConversationCatalogProduct,
  messageTokens: Set<string>,
) => {
  if (messageTokens.size !== 1) {
    return true;
  }

  const directTokens = [
    product.name,
    product.productType,
    product.brand,
    product.unit,
    product.category,
  ].flatMap(value => tokensFrom(value));

  return directTokens.some(token => tokenCollectionHasMatch(messageTokens, token));
};

export const detectSalesConversationSignals = (
  _message: string,
): SalesConversationSignal[] => {
  return [];
};

const scoreProduct = (
  product: ConversationCatalogProduct,
  message: string,
) => {
  const normalizedMessage = normalize(message);
  const originalMessageTokens = new Set(tokensFrom(message));
  const messageTokens = messageTokenVariantsFrom(message);
  const name = normalize(product.name);
  const category = normalize(product.category ?? '');
  const productType = normalize(product.productType ?? '');
  const brand = normalize(product.brand ?? '');
  const unit = normalize(product.unit ?? '');
  const tags = product.tags ?? [];
  const descriptionTokens = tokensFrom(product.description);
  const identityTokens = new Set(identityTokensFrom(product));
  const nameTokens = tokensFrom(product.name);
  const firstNameTokenMatched = productFirstNameTokenMatchesMessage(product, messageTokens);
  let score = 0;
  const spicyIdentityMatched = [
    '\u062D\u0627\u0631',
    '\u062D\u0627\u0631\u0647',
    'hot',
    'spicy',
  ].some(token => tokenCollectionHasMatch(identityTokens, token));

  if (originalMessageTokens.has('\u0634\u0637\u0647') && spicyIdentityMatched) {
    score += 10;
  }

  if (name && normalizedMessage.includes(name)) {
    score += 14;
  }

  for (const token of tokensFrom(product.name)) {
    if (tokenCollectionHasMatch(messageTokens, token)) {
      score += 5;
    }
  }

  if (firstNameTokenMatched) {
    score += 4;
  }

  if (
    nameTokens.length > 1
    && !tokenCollectionHasMatch(messageTokens, nameTokens[0] ?? '')
    && nameTokens.some(token => tokenCollectionHasMatch(messageTokens, token))
  ) {
    score -= 3;
  }

  if (category && normalizedMessage.includes(category)) {
    score += 6;
  }

  if (productType && normalizedMessage.includes(productType)) {
    score += 8;
  }

  if (brand && normalizedMessage.includes(brand)) {
    score += 5;
  }

  if (unit && normalizedMessage.includes(unit)) {
    score += 4;
  }

  for (const tag of tags) {
    if (tokensFrom(tag).some(token => tokenCollectionHasMatch(messageTokens, token))) {
      score += 7;
    }
  }

  for (const token of descriptionTokens) {
    if (tokenCollectionHasMatch(messageTokens, token)) {
      score += 2;
    }
  }

  const matchedIdentityTokens = [...messageTokens].filter((token) => {
    return tokenCollectionHasMatch(identityTokens, token);
  });
  if (matchedIdentityTokens.length > 0) {
    score += matchedIdentityTokens.length * 2;
  }

  if (messageTokens.size > 0 && matchedIdentityTokens.length / messageTokens.size < 0.5) {
    score -= 6;
  }

  return score;
};

const suggestProducts = (
  catalog: ConversationCatalogProduct[],
  message: string,
) => {
  const messageTokens = messageTokenVariantsFrom(message);
  const scoredProducts = catalog
    .map((product) => {
      const matchScore = scoreProduct(product, message);

      return {
        availability: product.availability ?? 'available',
        category: product.category,
        id: product.id,
        image: product.image,
        matchScore,
        name: product.name,
        nameFirstTokenMatched: productFirstNameTokenMatchesMessage(product, messageTokens),
        price: product.price,
      };
    })
    .filter(product => product.matchScore > 0);
  const leadingCategoryMatches = new Set(
    scoredProducts
      .filter(product => product.nameFirstTokenMatched)
      .map(product => normalize(product.category ?? ''))
      .filter(Boolean),
  );

  return scoredProducts
    .filter((product) => {
      return hasDirectShortQueryMatch(product, messageTokens)
        && (
          product.nameFirstTokenMatched
          || leadingCategoryMatches.size === 0
          || leadingCategoryMatches.has(normalize(product.category ?? ''))
        );
    })
    .sort((first, second) => second.matchScore - first.matchScore)
    .slice(0, MAX_VISIBLE_PRODUCT_SUGGESTIONS)
    .map(({ nameFirstTokenMatched: _nameFirstTokenMatched, ...product }) => product);
};

export const analyzeSalesConversation = (params: {
  catalog: SalesCatalogProduct[];
  message: string;
  previousSuggestedProductIds?: number[];
  previousUnavailableProduct?: ConversationCatalogProduct;
}): SalesConversationAnalysis => {
  const visibleCatalog = params.catalog.filter(product => product.aiVisible);
  const recommendableCatalog = visibleCatalog.filter((product) => {
    return product.availability !== 'unavailable';
  });
  const signals = detectSalesConversationSignals(params.message);
  const unavailableProduct = findUnavailableRequestedProduct(visibleCatalog, params.message);
  const suggestedProducts = unavailableProduct
    ? findAlternativeProducts(
        recommendableCatalog,
        unavailableProduct,
        params.previousSuggestedProductIds ?? [],
      )
    : suggestProducts(recommendableCatalog, params.message);

  return {
    requestedItems: matchExplicitConversationCatalogItems(recommendableCatalog, params.message),
    signals,
    suggestedProducts,
    unavailableProduct: unavailableProduct
      ? {
          availability: unavailableProduct.availability ?? 'unavailable',
          category: unavailableProduct.category,
          id: unavailableProduct.id,
          image: unavailableProduct.image,
          name: unavailableProduct.name,
          price: unavailableProduct.price,
        }
      : undefined,
  };
};
