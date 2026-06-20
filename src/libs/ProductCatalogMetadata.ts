export const PRODUCT_AVAILABILITY = [
  'available',
  'limited',
  'unavailable',
] as const;

export type ProductAvailability = typeof PRODUCT_AVAILABILITY[number];

export type ProductCatalogMetadata = {
  aiVisible: boolean;
  availability: ProductAvailability;
  brand?: string;
  productType?: string;
  tags: string[];
  unit?: string;
};

const DEFAULT_PRODUCT_CATALOG_METADATA: ProductCatalogMetadata = {
  aiVisible: true,
  availability: 'available',
  tags: [],
};

const normalizeOptionalIdentityField = (value: unknown) => {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 120)
    : undefined;
};

export const parseProductTags = (value: string) => {
  return value
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean)
    .slice(0, 20);
};

export const normalizeProductCatalogMetadata = (value: unknown): ProductCatalogMetadata => {
  const metadata = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {};
  const availability = typeof metadata.availability === 'string'
    && PRODUCT_AVAILABILITY.includes(metadata.availability as ProductAvailability)
    ? metadata.availability as ProductAvailability
    : DEFAULT_PRODUCT_CATALOG_METADATA.availability;
  const tags = Array.isArray(metadata.tags)
    ? metadata.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map(tag => tag.trim())
        .filter(Boolean)
        .slice(0, 20)
    : DEFAULT_PRODUCT_CATALOG_METADATA.tags;

  return {
    aiVisible: typeof metadata.aiVisible === 'boolean'
      ? metadata.aiVisible
      : DEFAULT_PRODUCT_CATALOG_METADATA.aiVisible,
    availability,
    brand: normalizeOptionalIdentityField(metadata.brand),
    productType: normalizeOptionalIdentityField(metadata.productType),
    tags,
    unit: normalizeOptionalIdentityField(metadata.unit),
  };
};

export const canAIRecommendProduct = (value: unknown) => {
  const metadata = normalizeProductCatalogMetadata(value);

  return metadata.aiVisible && metadata.availability !== 'unavailable';
};
