export type ProductDuplicateCandidate = {
  brand?: null | string;
  category?: null | string;
  name: string;
  price: number | string;
  productType?: null | string;
  unit?: null | string;
};

const normalizeProductTextForComparison = (value: null | string | undefined) => {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/\u0649/g, '\u064A')
    .replace(/\u0629/g, '\u0647')
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const getProductComparisonTokens = (value: null | string | undefined) => {
  return normalizeProductTextForComparison(value)
    .split(' ')
    .filter(token => token.length >= 2);
};

const getProductNameFingerprint = (value: string) => {
  return [...new Set(getProductComparisonTokens(value))]
    .sort()
    .join(' ');
};

const getTokenContainmentRatio = (firstTokens: string[], secondTokens: string[]) => {
  if (firstTokens.length === 0 || secondTokens.length === 0) {
    return 0;
  }

  const secondSet = new Set(secondTokens);
  const overlap = firstTokens.filter(token => secondSet.has(token)).length;

  return overlap / Math.min(firstTokens.length, secondTokens.length);
};

const levenshteinDistance = (first: string, second: string) => {
  const previous = Array.from({ length: second.length + 1 }, (_, index) => index);

  for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
    let lastDiagonal = previous[0]!;
    previous[0] = firstIndex;

    for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
      const oldDiagonal = previous[secondIndex]!;
      const cost = first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;

      previous[secondIndex] = Math.min(
        previous[secondIndex]! + 1,
        previous[secondIndex - 1]! + 1,
        lastDiagonal + cost,
      );
      lastDiagonal = oldDiagonal;
    }
  }

  return previous[second.length]!;
};

const tokensAreClose = (first: string, second: string) => {
  if (first === second) {
    return true;
  }

  const longerLength = Math.max(first.length, second.length);

  if (longerLength < 4) {
    return false;
  }

  const distance = levenshteinDistance(first, second);
  const similarity = 1 - distance / longerLength;

  return similarity >= 0.72;
};

const getSoftTokenContainmentRatio = (firstTokens: string[], secondTokens: string[]) => {
  if (firstTokens.length === 0 || secondTokens.length === 0) {
    return 0;
  }

  const matchedSecondTokenIndexes = new Set<number>();
  let overlap = 0;

  for (const firstToken of firstTokens) {
    const matchedIndex = secondTokens.findIndex((secondToken, index) => {
      return !matchedSecondTokenIndexes.has(index)
        && tokensAreClose(firstToken, secondToken);
    });

    if (matchedIndex >= 0) {
      matchedSecondTokenIndexes.add(matchedIndex);
      overlap += 1;
    }
  }

  return overlap / Math.min(firstTokens.length, secondTokens.length);
};

const areProductNamesTooSimilar = (first: string, second: string) => {
  const firstFingerprint = getProductNameFingerprint(first);
  const secondFingerprint = getProductNameFingerprint(second);

  if (!firstFingerprint || !secondFingerprint) {
    return false;
  }

  if (firstFingerprint === secondFingerprint) {
    return true;
  }

  const firstTokens = firstFingerprint.split(' ');
  const secondTokens = secondFingerprint.split(' ');
  const containment = getTokenContainmentRatio(firstTokens, secondTokens);
  const softContainment = getSoftTokenContainmentRatio(firstTokens, secondTokens);

  if (
    (containment >= 1 || softContainment >= 1)
    && Math.abs(firstTokens.length - secondTokens.length) <= 1
  ) {
    return true;
  }

  const longerLength = Math.max(firstFingerprint.length, secondFingerprint.length);
  const distance = levenshteinDistance(firstFingerprint, secondFingerprint);
  const similarity = 1 - distance / longerLength;

  return longerLength >= 6 && similarity >= 0.9;
};

const getProductNameTokenCount = (value: string) => {
  return getProductNameFingerprint(value)
    .split(' ')
    .filter(Boolean)
    .length;
};

const productNamesRepresentSameProduct = (first: string, second: string) => {
  const firstFingerprint = getProductNameFingerprint(first);
  const secondFingerprint = getProductNameFingerprint(second);

  if (!firstFingerprint || !secondFingerprint) {
    return false;
  }

  if (firstFingerprint === secondFingerprint) {
    return true;
  }

  const firstTokens = firstFingerprint.split(' ');
  const secondTokens = secondFingerprint.split(' ');

  if (firstTokens.length !== secondTokens.length) {
    return false;
  }

  return getSoftTokenContainmentRatio(firstTokens, secondTokens) >= 1;
};

const pricesAreClose = (first: number | string, second: number | string) => {
  const firstPrice = Number(first);
  const secondPrice = Number(second);

  if (!Number.isFinite(firstPrice) || !Number.isFinite(secondPrice)) {
    return false;
  }

  return Math.abs(firstPrice - secondPrice) <= 0.01;
};

const categoriesAreCompatible = (
  first?: null | string,
  second?: null | string,
) => {
  const firstCategory = normalizeProductTextForComparison(first);
  const secondCategory = normalizeProductTextForComparison(second);

  return !firstCategory || !secondCategory || firstCategory === secondCategory;
};

const identityFieldsAreCompatible = (
  first?: null | string,
  second?: null | string,
) => {
  const normalizedFirst = normalizeProductTextForComparison(first);
  const normalizedSecond = normalizeProductTextForComparison(second);

  return !normalizedFirst || !normalizedSecond || normalizedFirst === normalizedSecond;
};

const productIdentityIsCompatible = (
  candidate: ProductDuplicateCandidate,
  existing: ProductDuplicateCandidate,
) => {
  return identityFieldsAreCompatible(candidate.productType, existing.productType)
    && identityFieldsAreCompatible(candidate.brand, existing.brand)
    && identityFieldsAreCompatible(candidate.unit, existing.unit);
};

export const productsLookDuplicate = (
  candidate: ProductDuplicateCandidate,
  existing: ProductDuplicateCandidate,
) => {
  if (!productIdentityIsCompatible(candidate, existing)) {
    return false;
  }

  if (productNamesRepresentSameProduct(candidate.name, existing.name)) {
    return true;
  }

  if (!areProductNamesTooSimilar(candidate.name, existing.name)) {
    return false;
  }

  if (!categoriesAreCompatible(candidate.category, existing.category)) {
    return false;
  }

  const candidateTokenCount = getProductNameTokenCount(candidate.name);
  const existingTokenCount = getProductNameTokenCount(existing.name);

  return candidateTokenCount === existingTokenCount
    || pricesAreClose(candidate.price, existing.price);
};

export const hasDuplicateProductInBatch = (
  products: ProductDuplicateCandidate[],
) => {
  for (let index = 0; index < products.length; index += 1) {
    const product = products[index]!;

    for (let compareIndex = index + 1; compareIndex < products.length; compareIndex += 1) {
      const comparisonProduct = products[compareIndex]!;

      if (productsLookDuplicate(product, comparisonProduct)) {
        return true;
      }
    }
  }

  return false;
};
