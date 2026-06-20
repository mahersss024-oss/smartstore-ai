import type { ProductCatalogMetadata } from './ProductCatalogMetadata';
import { eq } from 'drizzle-orm';
import { productsTable } from '@/models/Schema';
import { db } from './DB';
import { normalizeProductCatalogMetadata } from './ProductCatalogMetadata';
import {
  hasDuplicateProductInBatch,
  productsLookDuplicate,
} from './ProductDuplicateDetection';

export type StoreProductCreationInput = {
  category?: null | string;
  description?: null | string;
  image?: null | string;
  imageSizeBytes?: number;
  isActive?: boolean;
  metadata: ProductCatalogMetadata;
  name: string;
  price: number;
};

export type StoreProductDuplicateResult
  = | { kind: 'batch' }
    | { kind: 'existing'; productId: number };

export const findStoreProductDuplicate = async (params: {
  candidates: StoreProductCreationInput[];
  excludeProductId?: number;
  organizationId: string;
}): Promise<StoreProductDuplicateResult | null> => {
  const candidateIdentities = params.candidates.map(candidate => ({
    brand: candidate.metadata.brand,
    category: candidate.category,
    name: candidate.name,
    price: candidate.price,
    productType: candidate.metadata.productType,
    unit: candidate.metadata.unit,
  }));

  if (hasDuplicateProductInBatch(candidateIdentities)) {
    return { kind: 'batch' };
  }

  const existingProducts = await db
    .select({
      category: productsTable.category,
      id: productsTable.id,
      metadata: productsTable.metadata,
      name: productsTable.name,
      price: productsTable.price,
    })
    .from(productsTable)
    .where(eq(productsTable.organizationId, params.organizationId));

  for (const candidate of candidateIdentities) {
    const duplicateProduct = existingProducts.find((product) => {
      if (product.id === params.excludeProductId) {
        return false;
      }

      const productMetadata = normalizeProductCatalogMetadata(product.metadata);

      return productsLookDuplicate(candidate, {
        brand: productMetadata.brand,
        category: product.category,
        name: product.name,
        price: product.price,
        productType: productMetadata.productType,
        unit: productMetadata.unit,
      });
    });

    if (duplicateProduct) {
      return {
        kind: 'existing',
        productId: duplicateProduct.id,
      };
    }
  }

  return null;
};

export const buildStoreProductInsertValues = (
  organizationId: string,
  products: StoreProductCreationInput[],
) => {
  return products.map(product => ({
    category: product.category || null,
    description: product.description || null,
    image: product.image || null,
    imageSizeBytes: product.imageSizeBytes ?? 0,
    isActive: product.isActive ?? true,
    metadata: product.metadata,
    name: product.name,
    organizationId,
    price: product.price.toFixed(2),
  }));
};
