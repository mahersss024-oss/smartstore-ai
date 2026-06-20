import type { loadStoreAIContext } from './StoreAIContext';
import { analyzeSalesConversation } from './SalesConversationIntelligence';

type StoreAIContext = Awaited<ReturnType<typeof loadStoreAIContext>>;
type CatalogProduct = StoreAIContext['catalog'][number];

export type AISimulationResult = {
  missingDetails: string[];
  recommendedProducts: CatalogProduct[];
  reply: string;
};

export const matchAISimulationProducts = (
  products: CatalogProduct[],
  message: string,
) => {
  const analysis = analyzeSalesConversation({
    // StoreAIContext already excludes products that are hidden from AI.
    catalog: products.map(product => ({
      ...product,
      aiVisible: true,
    })),
    message,
  });
  const orderedProductIds = Array.from(new Set([
    ...analysis.requestedItems.map(item => item.productId),
    ...analysis.suggestedProducts.map(product => product.id),
  ]));
  const productsById = new Map(products.map(product => [product.id, product]));

  return orderedProductIds
    .map(productId => productsById.get(productId))
    .filter((product): product is CatalogProduct => Boolean(product));
};

export const simulateAIEmployeeReply = (
  context: StoreAIContext,
  customerMessage: string,
): AISimulationResult => {
  const recommendedProducts = matchAISimulationProducts(
    context.catalog,
    customerMessage,
  ).slice(0, 4);
  const missingDetails = [
    recommendedProducts.length === 0 ? 'product' : null,
    context.deliveryMethods.length > 0 ? 'delivery_preference' : null,
    context.paymentMethods.length > 0 ? 'payment_method' : null,
  ].filter((detail): detail is string => Boolean(detail));

  return {
    missingDetails,
    recommendedProducts,
    reply: 'simulation_result_ready',
  };
};
