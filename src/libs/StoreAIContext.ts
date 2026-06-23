import { and, desc, eq, inArray, ne } from 'drizzle-orm';
import { normalizeAIEmployeeSettings } from '@/libs/AIEmployeeSettings';
import { db } from '@/libs/DB';
import {
  canAIRecommendProduct,
  normalizeProductCatalogMetadata,
} from '@/libs/ProductCatalogMetadata';
import {
  conversationsTable,
  deliveryMethodsTable,
  paymentMethodsTable,
  productsTable,
  storeSettingsTable,
} from '@/models/Schema';

type StoreSettingsMetadata = {
  aiEmployee?: unknown;
  businessType?: string;
  knowledgeBase?: {
    deliveryAreas?: string;
    faqs?: string;
    paymentInstructions?: string;
    returnPolicy?: string;
    serviceNotes?: string;
    warrantyPolicy?: string;
    workingHoursNotes?: string;
  };
  location?: {
    address?: string;
    city?: string;
    deliveryNotes?: string;
    district?: string;
    mapsUrl?: string;
    pickupInstructions?: string;
  };
};

export const loadStoreAIContext = async (params: {
  conversationId?: number;
  organizationId: string;
}) => {
  const [settings] = await db
    .select()
    .from(storeSettingsTable)
    .where(eq(storeSettingsTable.organizationId, params.organizationId))
    .limit(1);
  const metadata = (settings?.metadata ?? {}) as StoreSettingsMetadata;
  // `image` is intentionally NOT selected here: catalog images are base64 data
  // URLs (megabytes each) and this context is loaded on every AI message. The
  // only consumer that needs images (the AI simulation) hydrates them for the
  // few matched products via `loadProductImageMap`.
  const products = await db
    .select({
      category: productsTable.category,
      description: productsTable.description,
      id: productsTable.id,
      isActive: productsTable.isActive,
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
    )
    .orderBy(productsTable.sortOrder, productsTable.createdAt);
  const paymentMethods = await db
    .select({
      config: paymentMethodsTable.config,
      displayName: paymentMethodsTable.displayName,
      provider: paymentMethodsTable.provider,
      supportedDeliveryMethods: paymentMethodsTable.supportedDeliveryMethods,
      type: paymentMethodsTable.type,
    })
    .from(paymentMethodsTable)
    .where(
      and(
        eq(paymentMethodsTable.organizationId, params.organizationId),
        eq(paymentMethodsTable.isActive, true),
        ne(paymentMethodsTable.provider, 'bank_transfer'),
      ),
    );
  const deliveryMethods = await db
    .select({
      config: deliveryMethodsTable.config,
      displayName: deliveryMethodsTable.displayName,
      estimatedTime: deliveryMethodsTable.estimatedTime,
      fee: deliveryMethodsTable.fee,
      type: deliveryMethodsTable.type,
    })
    .from(deliveryMethodsTable)
    .where(
      and(
        eq(deliveryMethodsTable.organizationId, params.organizationId),
        eq(deliveryMethodsTable.isActive, true),
      ),
    );
  const conversation = params.conversationId
    ? await db
        .select({
          channel: conversationsTable.channel,
          id: conversationsTable.id,
          metadata: conversationsTable.metadata,
          status: conversationsTable.status,
        })
        .from(conversationsTable)
        .where(
          and(
            eq(conversationsTable.organizationId, params.organizationId),
            eq(conversationsTable.id, params.conversationId),
          ),
        )
        .orderBy(desc(conversationsTable.createdAt))
        .limit(1)
    : [];

  return {
    aiSettings: normalizeAIEmployeeSettings(metadata.aiEmployee),
    catalog: products
      .filter(product => canAIRecommendProduct(product.metadata))
      .map((product) => {
        const catalogMetadata = normalizeProductCatalogMetadata(product.metadata);

        return {
          availability: catalogMetadata.availability,
          brand: catalogMetadata.brand,
          category: product.category,
          description: product.description,
          id: product.id,
          image: null,
          name: product.name,
          price: product.price,
          productType: catalogMetadata.productType,
          tags: catalogMetadata.tags,
          unit: catalogMetadata.unit,
        };
      }),
    conversation: conversation[0] ?? null,
    deliveryMethods,
    knowledgeBase: metadata.knowledgeBase ?? {},
    organizationId: params.organizationId,
    paymentMethods: paymentMethods.map(method => ({
      displayName: method.displayName,
      provider: method.provider,
      safeInstructions: typeof method.config === 'object' && method.config
        ? (method.config as Record<string, unknown>).instructions
        : undefined,
      supportedDeliveryPreferences: Array.isArray(method.supportedDeliveryMethods)
        ? method.supportedDeliveryMethods.filter((item): item is 'delivery' | 'pickup' => {
            return item === 'delivery' || item === 'pickup';
          })
        : [],
      type: method.type,
    })),
    store: {
      businessType: metadata.businessType,
      currency: settings?.currency ?? 'SAR',
      description: settings?.storeDescription,
      location: metadata.location ?? {},
      name: settings?.storeName,
      timezone: settings?.timezone ?? 'Asia/Riyadh',
      welcomeMessage: settings?.welcomeMessage,
    },
  };
};

/**
 * Loads catalog images for a small set of product ids on demand. Catalog images
 * are base64 data URLs, so they are excluded from the bulk catalog loads and
 * hydrated only for the few products actually shown to a customer (suggestions)
 * or store user (simulation results).
 */
export const loadProductImageMap = async (
  organizationId: string,
  productIds: number[],
): Promise<Map<number, null | string>> => {
  const uniqueIds = [...new Set(productIds)].filter(id => Number.isInteger(id));

  if (uniqueIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select({ id: productsTable.id, image: productsTable.image })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.organizationId, organizationId),
        inArray(productsTable.id, uniqueIds),
      ),
    );

  return new Map(rows.map(row => [row.id, row.image]));
};
