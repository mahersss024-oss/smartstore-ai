import type { AIEmployeeConversationCart } from '@/libs/AIEmployeeCart';
import type { AIEmployeeSemanticUnderstanding } from '@/libs/AIEmployeeOrchestration';
import type { ConversationCatalogProduct, ConversationSuggestedProduct } from '@/libs/ConversationEngine';

export type AgentCatalogProduct = ConversationCatalogProduct & {
  aiVisible?: boolean;
};

const MAX_MODEL_CATALOG_CONTEXT = 20;

const normalize = (value: string) => value.trim().toLowerCase();

export const pushUniqueIssue = (issues: string[], issue: string) => {
  if (!issues.includes(issue)) {
    issues.push(issue);
  }
};

export const toSuggestedProduct = (product: AgentCatalogProduct): ConversationSuggestedProduct => ({
  availability: product.availability ?? 'available',
  category: product.category,
  id: product.id,
  image: product.image,
  name: product.name,
  price: product.price,
});

export const shouldApplyRequestedItemsToCart = (
  semanticUnderstanding: AIEmployeeSemanticUnderstanding,
) => {
  if (
    semanticUnderstanding.dialogueState === 'catalog_inquiry'
    || semanticUnderstanding.dialogueState === 'general'
    || semanticUnderstanding.dialogueState === 'order_followup'
    || semanticUnderstanding.dialogueState === 'order_pause'
    || semanticUnderstanding.dialogueState === 'post_purchase_support'
    || semanticUnderstanding.dialogueState === 'complaint'
    || semanticUnderstanding.dialogueState === 'review'
  ) {
    return false;
  }

  return semanticUnderstanding.dialogueState === undefined
    || semanticUnderstanding.dialogueState === 'order_request'
    || semanticUnderstanding.dialogueState === 'order_confirmation';
};

export const getCatalogSummary = (catalog: AgentCatalogProduct[]) => {
  const availableProducts = catalog.filter((product) => {
    return product.aiVisible !== false
      && (product.availability ?? 'available') !== 'unavailable';
  });
  const categories = Array.from(
    availableProducts.reduce((counts, product) => {
      const category = product.category?.trim() || 'uncategorized';
      counts.set(category, (counts.get(category) ?? 0) + 1);

      return counts;
    }, new Map<string, number>()),
  ).map(([category, count]) => ({ category, count }));

  return {
    categories: categories.slice(0, 12),
    totalAvailableProducts: availableProducts.length,
  };
};

const productRelevanceScore = (product: AgentCatalogProduct, message: string) => {
  const normalizedMessage = normalize(message);
  const tokens = normalizedMessage
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(token => token.length >= 3);
  const normalizedName = normalize(product.name);
  const normalizedProductType = normalize(product.productType ?? '');
  const normalizedBrand = normalize(product.brand ?? '');
  const normalizedUnit = normalize(product.unit ?? '');
  const normalizedCategory = normalize(product.category ?? '');
  const normalizedDescription = normalize(product.description ?? '');
  const normalizedTags = (product.tags ?? []).map(tag => normalize(tag)).join(' ');
  let score = normalizedMessage.includes(normalizedName) ? 30 : 0;

  for (const token of tokens) {
    if (normalizedName.includes(token)) {
      score += 8;
    }

    if (normalizedCategory.includes(token)) {
      score += 5;
    }

    if (normalizedProductType.includes(token)) {
      score += 6;
    }

    if (normalizedBrand.includes(token)) {
      score += 4;
    }

    if (normalizedUnit.includes(token)) {
      score += 3;
    }

    if (normalizedTags.includes(token)) {
      score += 4;
    }

    if (normalizedDescription.includes(token)) {
      score += 2;
    }
  }

  return score;
};

export const selectCatalogProductsForModel = (params: {
  cart?: AIEmployeeConversationCart;
  catalog: AgentCatalogProduct[];
  message: string;
  suggestedProducts: ConversationSuggestedProduct[];
}) => {
  const availableProducts = params.catalog.filter((product) => {
    return product.aiVisible !== false
      && (product.availability ?? 'available') !== 'unavailable';
  });
  const selected = new Map<number, AgentCatalogProduct>();
  const addProduct = (product?: AgentCatalogProduct) => {
    if (product && selected.size < MAX_MODEL_CATALOG_CONTEXT) {
      selected.set(product.id, product);
    }
  };

  for (const suggestion of params.suggestedProducts) {
    addProduct(availableProducts.find(product => product.id === suggestion.id));
  }

  for (const item of params.cart?.items ?? []) {
    addProduct(availableProducts.find(product => product.id === item.productId));
  }

  availableProducts
    .map(product => ({ product, score: productRelevanceScore(product, params.message) }))
    .filter(item => item.score > 0)
    .sort((first, second) => second.score - first.score)
    .forEach(item => addProduct(item.product));

  availableProducts.forEach(addProduct);

  return Array.from(selected.values());
};
