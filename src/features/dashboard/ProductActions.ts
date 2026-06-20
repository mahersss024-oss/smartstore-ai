'use server';

import type { ProductAvailability } from '@/libs/ProductCatalogMetadata';
import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import * as z from 'zod';
import { db } from '@/libs/DB';
import {
  normalizeProductCatalogMetadata,
  parseProductTags,
  PRODUCT_AVAILABILITY,
} from '@/libs/ProductCatalogMetadata';
import { getImageStorageMb, isStoredImageDataUrl, isUploadedFile, saveProductImage } from '@/libs/ProductImageStorage';
import {
  buildStoreProductInsertValues,
  findStoreProductDuplicate,
} from '@/libs/StoreProductCreation';
import {
  assertStoreFeatureEnabled,
  StoreFeatureDisabledError,
  StoreSubscriptionInactiveError,
} from '@/libs/StoreServiceControls';
import { assertCanCreateProducts, isSubscriptionFeatureError, isSubscriptionLimitError } from '@/libs/SubscriptionEntitlements';
import { productsTable } from '@/models/Schema';
import { getI18nPath } from '@/utils/Helpers';

const productInputSchema = z.object({
  brand: z.string().trim().max(120),
  category: z.string().trim().max(120),
  description: z.string().trim().max(2000),
  image: z.union([
    z.url(),
    z.string().startsWith('/uploads/'),
    z.string().refine(isStoredImageDataUrl),
    z.literal(''),
  ]).optional(),
  aiVisible: z.boolean(),
  availability: z.enum(PRODUCT_AVAILABILITY),
  isActive: z.boolean(),
  name: z.string().trim().min(1).max(200),
  price: z.coerce.number().min(0).max(99999999.99),
  productType: z.string().trim().max(120),
  tags: z.array(z.string().trim().min(1).max(60)).max(20),
  unit: z.string().trim().max(120),
});

const bulkProductsSchema = z.array(productInputSchema).min(1).max(100);
const duplicateProductSearchParams = new URLSearchParams({
  productError: 'duplicate',
});

const getFormValue = (formData: FormData, key: string) => {
  const value = formData.get(key);

  return typeof value === 'string' ? value : '';
};

const parseDelimitedLine = (line: string) => {
  const delimiter = line.includes('|')
    ? '|'
    : line.includes('\t') ? '\t' : ',';
  const values: string[] = [];
  let current = '';
  let isQuoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"' && nextChar === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (char === '"') {
      isQuoted = !isQuoted;
      continue;
    }

    if (char === delimiter && !isQuoted) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());

  return values;
};

const isHeaderLine = (line: string) => {
  const [, price = ''] = parseDelimitedLine(line);
  const numericPrice = Number(price.trim().replace(',', '.'));

  return !Number.isFinite(numericPrice) || numericPrice <= 0;
};

const parseBulkProductLine = (line: string) => {
  const [name = '', price = '', category = '', description = '', image = ''] = parseDelimitedLine(line);

  return productInputSchema.parse({
    category,
    description,
    image,
    aiVisible: true,
    availability: 'available',
    brand: '',
    isActive: true,
    name,
    price,
    productType: '',
    tags: [],
    unit: '',
  });
};

const getActiveOrganizationId = async () => {
  const { orgId } = await auth();

  if (!orgId) {
    throw new Error('No active organization selected');
  }

  return orgId;
};

const redirectToProductLimit = (locale: string, feature: string) => {
  redirect(getI18nPath(`/dashboard/products/new?limit=${feature}`, locale));
};

const redirectToSubscriptionRequired = (locale: string) => {
  redirect(getI18nPath('/dashboard/subscription?required=paid', locale));
};

const redirectToDuplicateProduct = (
  locale: string,
  productId: number | undefined,
  path = '/dashboard/products/new',
) => {
  const searchParams = new URLSearchParams(duplicateProductSearchParams);

  if (productId) {
    searchParams.set('duplicateProductId', String(productId));
  }

  redirect(getI18nPath(`${path}?${searchParams.toString()}`, locale));
};

const handleProductSubscriptionError = (locale: string, error: unknown) => {
  if (isSubscriptionLimitError(error)) {
    redirectToProductLimit(locale, error.feature);
  }

  if (
    isSubscriptionFeatureError(error)
    || error instanceof StoreFeatureDisabledError
    || error instanceof StoreSubscriptionInactiveError
  ) {
    redirectToSubscriptionRequired(locale);
  }

  throw error;
};

const assertNoDuplicateProduct = async (params: {
  category?: null | string;
  excludeProductId?: number;
  locale: string;
  name: string;
  organizationId: string;
  redirectPath?: string;
  price: number;
  productType?: string;
  brand?: string;
  unit?: string;
}) => {
  const duplicate = await findStoreProductDuplicate({
    candidates: [{
      category: params.category,
      metadata: normalizeProductCatalogMetadata({
        brand: params.brand,
        productType: params.productType,
        unit: params.unit,
      }),
      name: params.name,
      price: params.price,
    }],
    excludeProductId: params.excludeProductId,
    organizationId: params.organizationId,
  });

  if (duplicate) {
    redirectToDuplicateProduct(
      params.locale,
      duplicate.kind === 'existing' ? duplicate.productId : undefined,
      params.redirectPath,
    );
  }
};

const assertNoDuplicateProductsInBatch = async (
  organizationId: string,
  products: Array<{
    category?: null | string;
    brand?: string;
    name: string;
    price: number;
    productType?: string;
    unit?: string;
  }>,
  locale: string,
) => {
  const duplicate = await findStoreProductDuplicate({
    candidates: products.map(product => ({
      category: product.category,
      metadata: normalizeProductCatalogMetadata({
        brand: product.brand,
        productType: product.productType,
        unit: product.unit,
      }),
      name: product.name,
      price: product.price,
    })),
    organizationId,
  });

  if (duplicate) {
    redirectToDuplicateProduct(
      locale,
      duplicate.kind === 'existing' ? duplicate.productId : undefined,
    );
  }
};

export const createProduct = async (locale: string, formData: FormData) => {
  const organizationId = await getActiveOrganizationId();
  await assertStoreFeatureEnabled(organizationId, 'productPublishing').catch((error: unknown) => {
    handleProductSubscriptionError(locale, error);
  });
  const uploadedImage = formData.get('imageFile');
  const productInput = productInputSchema.parse({
    category: getFormValue(formData, 'category'),
    description: getFormValue(formData, 'description'),
    image: getFormValue(formData, 'image'),
    aiVisible: formData.get('aiVisible') === 'on',
    availability: getFormValue(formData, 'availability') || 'available',
    brand: getFormValue(formData, 'brand'),
    isActive: formData.get('isActive') === 'on',
    name: getFormValue(formData, 'name'),
    price: getFormValue(formData, 'price'),
    productType: getFormValue(formData, 'productType'),
    tags: parseProductTags(getFormValue(formData, 'tags')),
    unit: getFormValue(formData, 'unit'),
  });
  const metadata = normalizeProductCatalogMetadata({
    aiVisible: productInput.aiVisible,
    availability: productInput.availability,
    brand: productInput.brand,
    productType: productInput.productType,
    tags: productInput.tags,
    unit: productInput.unit,
  });
  await assertNoDuplicateProduct({
    brand: productInput.brand,
    category: productInput.category,
    locale,
    name: productInput.name,
    organizationId,
    price: productInput.price,
    productType: productInput.productType,
    unit: productInput.unit,
  });
  const imageStorageMb = isUploadedFile(uploadedImage)
    ? getImageStorageMb([uploadedImage])
    : 0;
  await assertCanCreateProducts(
    organizationId,
    productInput.isActive ? 1 : 0,
    imageStorageMb,
  ).catch((error: unknown) => {
    handleProductSubscriptionError(locale, error);
  });
  const uploadedImageResult = isUploadedFile(uploadedImage)
    ? await saveProductImage(uploadedImage, organizationId)
    : null;
  const image = uploadedImageResult?.url ?? productInput.image;

  await db.insert(productsTable).values(buildStoreProductInsertValues(organizationId, [{
    category: productInput.category,
    description: productInput.description,
    image,
    imageSizeBytes: uploadedImageResult?.sizeBytes,
    isActive: productInput.isActive,
    metadata,
    name: productInput.name,
    price: productInput.price,
  }]));

  revalidatePath(getI18nPath('/dashboard/products', locale));
  redirect(getI18nPath('/dashboard/products', locale));
};

export const createProductsBulk = async (locale: string, formData: FormData) => {
  const organizationId = await getActiveOrganizationId();
  await assertStoreFeatureEnabled(organizationId, 'productPublishing').catch((error: unknown) => {
    handleProductSubscriptionError(locale, error);
  });
  const bulkInput = getFormValue(formData, 'products');
  const productsFile = formData.get('productsFile');
  const fileInput = productsFile instanceof File && productsFile.size > 0
    ? await productsFile.text()
    : '';
  const combinedInput = [bulkInput, fileInput].filter(Boolean).join('\n');
  const imageFiles = formData
    .getAll('productImages')
    .filter(isUploadedFile);
  const productInputs = bulkProductsSchema.parse(
    combinedInput
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .filter((line, index) => index !== 0 || !isHeaderLine(line))
      .map(parseBulkProductLine),
  );
  await assertNoDuplicateProductsInBatch(organizationId, productInputs, locale);

  const newImageStorageMb = getImageStorageMb(imageFiles);
  await assertCanCreateProducts(organizationId, productInputs.length, newImageStorageMb).catch((error: unknown) => {
    handleProductSubscriptionError(locale, error);
  });
  const productsWithImages = await Promise.all(
    productInputs.map(async (productInput, index) => {
      const uploadedProductImage = imageFiles[index]
        ? await saveProductImage(imageFiles[index], organizationId)
        : null;

      return {
        ...productInput,
        image: productInput.image || uploadedProductImage?.url || '',
        imageSizeBytes: uploadedProductImage?.sizeBytes ?? 0,
        metadata: normalizeProductCatalogMetadata({
          aiVisible: true,
          availability: productInput.availability,
          brand: productInput.brand,
          productType: productInput.productType,
          tags: productInput.tags,
          unit: productInput.unit,
        }),
      };
    }),
  );

  await db.insert(productsTable).values(buildStoreProductInsertValues(
    organizationId,
    productsWithImages,
  ));

  revalidatePath(getI18nPath('/dashboard/products', locale));
  redirect(getI18nPath('/dashboard/products', locale));
};

export const updateProduct = async (
  locale: string,
  productId: number,
  formData: FormData,
) => {
  const organizationId = await getActiveOrganizationId();
  await assertStoreFeatureEnabled(organizationId, 'productPublishing').catch((error: unknown) => {
    handleProductSubscriptionError(locale, error);
  });
  const [existingProduct] = await db
    .select({
      image: productsTable.image,
      imageSizeBytes: productsTable.imageSizeBytes,
      metadata: productsTable.metadata,
    })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, productId),
        eq(productsTable.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!existingProduct) {
    redirect(getI18nPath('/dashboard/products', locale));
  }

  const uploadedImage = formData.get('imageFile');
  const uploadedImageStorageMb = isUploadedFile(uploadedImage)
    ? getImageStorageMb([uploadedImage])
    : 0;
  const existingImageStorageMb = Number(existingProduct.imageSizeBytes ?? 0) / 1024 / 1024;
  const imageStorageDeltaMb = Math.max(0, uploadedImageStorageMb - existingImageStorageMb);
  await assertCanCreateProducts(organizationId, 0, imageStorageDeltaMb).catch((error: unknown) => {
    handleProductSubscriptionError(locale, error);
  });
  const uploadedImageResult = isUploadedFile(uploadedImage)
    ? await saveProductImage(uploadedImage, organizationId)
    : null;
  const shouldRemoveImage = formData.get('removeImage') === 'on';
  const image = uploadedImageResult?.url
    ?? (shouldRemoveImage ? '' : getFormValue(formData, 'image') || existingProduct.image || '');
  const productInput = productInputSchema.parse({
    category: getFormValue(formData, 'category'),
    description: getFormValue(formData, 'description'),
    image,
    aiVisible: formData.get('aiVisible') === 'on',
    availability: getFormValue(formData, 'availability') || 'available',
    brand: getFormValue(formData, 'brand'),
    isActive: formData.get('isActive') === 'on',
    name: getFormValue(formData, 'name'),
    price: getFormValue(formData, 'price'),
    productType: getFormValue(formData, 'productType'),
    tags: parseProductTags(getFormValue(formData, 'tags')),
    unit: getFormValue(formData, 'unit'),
  });
  const metadata = normalizeProductCatalogMetadata({
    ...normalizeProductCatalogMetadata(existingProduct.metadata),
    aiVisible: productInput.aiVisible,
    availability: productInput.availability,
    brand: productInput.brand,
    productType: productInput.productType,
    tags: productInput.tags,
    unit: productInput.unit,
  });
  await assertNoDuplicateProduct({
    brand: productInput.brand,
    category: productInput.category,
    redirectPath: `/dashboard/products/${productId}/edit`,
    excludeProductId: productId,
    locale,
    name: productInput.name,
    organizationId,
    price: productInput.price,
    productType: productInput.productType,
    unit: productInput.unit,
  });

  await db
    .update(productsTable)
    .set({
      category: productInput.category || null,
      description: productInput.description || null,
      image: productInput.image || null,
      imageSizeBytes: productInput.image
        ? uploadedImageResult?.sizeBytes ?? existingProduct.imageSizeBytes
        : 0,
      isActive: productInput.isActive,
      metadata,
      name: productInput.name,
      price: productInput.price.toFixed(2),
    })
    .where(
      and(
        eq(productsTable.id, productId),
        eq(productsTable.organizationId, organizationId),
      ),
    );

  revalidatePath(getI18nPath('/dashboard/products', locale));
  redirect(getI18nPath('/dashboard/products', locale));
};

export const deleteProduct = async (locale: string, productId: number) => {
  const organizationId = await getActiveOrganizationId();
  const [product] = await db
    .select({ metadata: productsTable.metadata })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, productId),
        eq(productsTable.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!product) {
    return;
  }

  const metadata = normalizeProductCatalogMetadata(product.metadata);

  await db
    .update(productsTable)
    .set({
      isActive: false,
      metadata: {
        ...metadata,
        aiVisible: false,
        availability: 'unavailable',
      },
    })
    .where(
      and(
        eq(productsTable.id, productId),
        eq(productsTable.organizationId, organizationId),
      ),
    );

  revalidatePath(getI18nPath('/dashboard/products', locale));
  revalidatePath(getI18nPath('/dashboard/products/archive', locale));
};

export const restoreArchivedProduct = async (locale: string, productId: number) => {
  const organizationId = await getActiveOrganizationId();
  await assertStoreFeatureEnabled(organizationId, 'productPublishing').catch((error: unknown) => {
    handleProductSubscriptionError(locale, error);
  });
  const [product] = await db
    .select({
      category: productsTable.category,
      metadata: productsTable.metadata,
      name: productsTable.name,
      price: productsTable.price,
    })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, productId),
        eq(productsTable.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!product) {
    return;
  }

  await assertCanCreateProducts(organizationId, 1).catch((error: unknown) => {
    handleProductSubscriptionError(locale, error);
  });

  const metadata = normalizeProductCatalogMetadata(product.metadata);
  await assertNoDuplicateProduct({
    brand: metadata.brand,
    category: product.category,
    excludeProductId: productId,
    locale,
    name: product.name,
    organizationId,
    price: Number(product.price),
    productType: metadata.productType,
    redirectPath: '/dashboard/products/archive',
    unit: metadata.unit,
  });

  await db
    .update(productsTable)
    .set({
      isActive: true,
      metadata: {
        ...metadata,
        aiVisible: true,
        availability: 'available',
      },
    })
    .where(
      and(
        eq(productsTable.id, productId),
        eq(productsTable.organizationId, organizationId),
      ),
    );

  revalidatePath(getI18nPath('/dashboard/products', locale));
  revalidatePath(getI18nPath('/dashboard/products/archive', locale));
};

export const updateProductAIVisibility = async (
  locale: string,
  productId: number,
  aiVisible: boolean,
) => {
  const organizationId = await getActiveOrganizationId();
  const [product] = await db
    .select({ metadata: productsTable.metadata })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, productId),
        eq(productsTable.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!product) {
    return;
  }

  const metadata = normalizeProductCatalogMetadata(product.metadata);

  await db
    .update(productsTable)
    .set({
      metadata: {
        ...metadata,
        aiVisible,
      },
    })
    .where(
      and(
        eq(productsTable.id, productId),
        eq(productsTable.organizationId, organizationId),
      ),
    );

  revalidatePath(getI18nPath('/dashboard/products', locale));
};

export const updateProductAvailability = async (
  locale: string,
  productId: number,
  availability: ProductAvailability,
) => {
  const organizationId = await getActiveOrganizationId();
  const [product] = await db
    .select({ metadata: productsTable.metadata })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.id, productId),
        eq(productsTable.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!product) {
    return;
  }

  const metadata = normalizeProductCatalogMetadata(product.metadata);

  await db
    .update(productsTable)
    .set({
      metadata: {
        ...metadata,
        availability,
      },
    })
    .where(
      and(
        eq(productsTable.id, productId),
        eq(productsTable.organizationId, organizationId),
      ),
    );

  revalidatePath(getI18nPath('/dashboard/products', locale));
};
