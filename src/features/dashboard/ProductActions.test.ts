import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.fn();
const mockRevalidatePath = vi.fn();
let mockDbSelectWhereRows: unknown[] = [];
const mockDbSelectLimit = vi.fn();
const mockDbSelectWhere = vi.fn(() => ({
  limit: mockDbSelectLimit,
  then: (
    resolve: (value: unknown[]) => unknown,
    reject: (reason: unknown) => unknown,
  ) => Promise.resolve(mockDbSelectWhereRows).then(resolve, reject),
}));
const mockDbSelectFrom = vi.fn(() => ({ where: mockDbSelectWhere }));
const mockDbSelect = vi.fn(() => ({ from: mockDbSelectFrom }));
const mockDbInsertValues = vi.fn(() => Promise.resolve());
const mockDbInsert = vi.fn(() => ({ values: mockDbInsertValues }));
const mockDbUpdateWhere = vi.fn();
const mockDbUpdateSet = vi.fn(() => ({ where: mockDbUpdateWhere }));
const mockDbUpdate = vi.fn(() => ({ set: mockDbUpdateSet }));
const mockAssertStoreFeatureEnabled = vi.fn(() => Promise.resolve());
const mockAssertCanCreateProducts = vi.fn(() => Promise.resolve());
const mockGetImageStorageMb = vi.fn(() => 0);
const mockIsUploadedFile = vi.fn(() => false);
const mockSaveProductImage = vi.fn();

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('next/navigation', () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock('@/libs/DB', () => ({
  db: {
    insert: mockDbInsert,
    select: mockDbSelect,
    update: mockDbUpdate,
  },
}));

vi.mock('@/models/Schema', () => ({
  productsTable: {
    category: 'category',
    id: 'id',
    isActive: 'isActive',
    metadata: 'metadata',
    name: 'name',
    organizationId: 'organizationId',
    price: 'price',
  },
}));

vi.mock('@/libs/StoreServiceControls', () => ({
  assertStoreFeatureEnabled: mockAssertStoreFeatureEnabled,
  StoreFeatureDisabledError: class StoreFeatureDisabledError extends Error {},
  StoreSubscriptionInactiveError: class StoreSubscriptionInactiveError extends Error {},
}));

vi.mock('@/libs/SubscriptionEntitlements', () => ({
  assertCanCreateProducts: mockAssertCanCreateProducts,
  isSubscriptionFeatureError: vi.fn(() => false),
  isSubscriptionLimitError: vi.fn(() => false),
}));

vi.mock('@/libs/ProductImageStorage', () => ({
  getImageStorageMb: mockGetImageStorageMb,
  isStoredImageDataUrl: vi.fn((value: string) => value.startsWith('data:image/')),
  isUploadedFile: mockIsUploadedFile,
  saveProductImage: mockSaveProductImage,
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => ({ conditions, type: 'and' })),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, type: 'eq', value })),
}));

vi.mock('@/utils/Helpers', () => ({
  getI18nPath: vi.fn((path: string) => path),
}));

describe('ProductActions', () => {
  const getLastMockArgument = (calls: unknown[][]) => {
    return calls.at(-1)?.[0];
  };

  const conditionScopesProductToActiveStore = (condition: unknown, productId: number) => {
    const conditions = (condition as { conditions?: unknown[] }).conditions ?? [];
    const hasProductId = conditions.some((entry) => {
      const scopedCondition = entry as { field?: unknown; type?: unknown; value?: unknown };

      return scopedCondition.field === 'id'
        && scopedCondition.type === 'eq'
        && scopedCondition.value === productId;
    });
    const hasOrganizationId = conditions.some((entry) => {
      const scopedCondition = entry as { field?: unknown; type?: unknown; value?: unknown };

      return scopedCondition.field === 'organizationId'
        && scopedCondition.type === 'eq'
        && scopedCondition.value === 'org_1';
    });

    return hasProductId && hasOrganizationId;
  };

  const expectConditionScopesProductToActiveStore = (condition: unknown, productId: number) => {
    expect(condition).toMatchObject({
      conditions: expect.arrayContaining([
        expect.objectContaining({
          field: 'id',
          type: 'eq',
          value: productId,
        }),
        expect.objectContaining({
          field: 'organizationId',
          type: 'eq',
          value: 'org_1',
        }),
      ]),
      type: 'and',
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbSelectWhereRows = [];
    mockAuth.mockResolvedValue({ orgId: 'org_1' });
    mockAssertCanCreateProducts.mockResolvedValue(undefined);
    mockAssertStoreFeatureEnabled.mockResolvedValue(undefined);
    mockGetImageStorageMb.mockReturnValue(0);
    mockIsUploadedFile.mockReturnValue(false);
    mockSaveProductImage.mockResolvedValue(undefined);
  });

  it('blocks strongly similar product names even when word order changes', async () => {
    const { createProduct } = await import('./ProductActions');
    const formData = new FormData();

    formData.set('name', 'p001 q002');
    formData.set('price', '27');
    formData.set('category', 'c001');
    formData.set('description', '');
    formData.set('image', '');
    formData.set('isActive', 'on');
    formData.set('aiVisible', 'on');
    formData.set('availability', 'available');
    formData.set('tags', '');
    mockDbSelectWhereRows = [{
      category: 'c001',
      id: 7,
      name: 'q002 p001',
      price: '27.00',
    }];

    await expect(createProduct('ar', formData)).rejects.toThrow(
      'redirect:/dashboard/products/new?productError=duplicate&duplicateProductId=7',
    );
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it('blocks updates that become another product even when the price changed', async () => {
    const { updateProduct } = await import('./ProductActions');
    const formData = new FormData();

    formData.set('name', 'p001 q002');
    formData.set('price', '15');
    formData.set('category', 'c001');
    formData.set('description', '');
    formData.set('image', '');
    formData.set('isActive', 'on');
    formData.set('aiVisible', 'on');
    formData.set('availability', 'available');
    formData.set('tags', '');
    mockDbSelectLimit.mockResolvedValueOnce([{
      image: null,
      imageSizeBytes: 0,
      metadata: {
        aiVisible: true,
        availability: 'available',
        tags: [],
      },
    }]);
    mockDbSelectWhereRows = [{
      category: 'c001',
      id: 8,
      name: 'q002 p002',
      price: '27.00',
    }];

    await expect(updateProduct('ar', 12, formData)).rejects.toThrow(
      'redirect:/dashboard/products/12/edit?productError=duplicate&duplicateProductId=8',
    );
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('blocks updates that become another product even when categories differ', async () => {
    const { updateProduct } = await import('./ProductActions');
    const formData = new FormData();

    formData.set('name', 'p001 q002');
    formData.set('price', '15');
    formData.set('category', 'c002');
    formData.set('description', '');
    formData.set('image', '');
    formData.set('isActive', 'on');
    formData.set('aiVisible', 'on');
    formData.set('availability', 'available');
    formData.set('tags', '');
    mockDbSelectLimit.mockResolvedValueOnce([{
      image: null,
      imageSizeBytes: 0,
      metadata: {
        aiVisible: true,
        availability: 'available',
        tags: [],
      },
    }]);
    mockDbSelectWhereRows = [{
      category: 'c003',
      id: 9,
      name: 'q002 p001',
      price: '27.00',
    }];

    await expect(updateProduct('ar', 12, formData)).rejects.toThrow(
      'redirect:/dashboard/products/12/edit?productError=duplicate&duplicateProductId=9',
    );
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('archives products without deleting records', async () => {
    const { deleteProduct } = await import('./ProductActions');

    mockDbSelectLimit.mockResolvedValueOnce([{
      metadata: {
        aiVisible: true,
        availability: 'available',
        tags: ['lunch'],
      },
    }]);

    await deleteProduct('ar', 12);

    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockDbUpdateSet).toHaveBeenCalledWith({
      isActive: false,
      metadata: {
        aiVisible: false,
        availability: 'unavailable',
        brand: undefined,
        productType: undefined,
        tags: ['lunch'],
        unit: undefined,
      },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/products');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/products/archive');
  });

  it('scopes product archive reads and writes to the active organization', async () => {
    const { deleteProduct } = await import('./ProductActions');

    mockDbSelectLimit.mockResolvedValueOnce([{
      metadata: {
        aiVisible: true,
        availability: 'available',
        tags: [],
      },
    }]);

    await deleteProduct('ar', 12);

    expectConditionScopesProductToActiveStore(getLastMockArgument(
      mockDbSelectWhere.mock.calls as unknown[][],
    ), 12);
    expectConditionScopesProductToActiveStore(getLastMockArgument(
      mockDbUpdateWhere.mock.calls as unknown[][],
    ), 12);
  });

  it('counts only active products when creating a product', async () => {
    const { createProduct } = await import('./ProductActions');
    const formData = new FormData();

    formData.set('name', 'p010');
    formData.set('price', '27');
    formData.set('category', 'c010');
    formData.set('description', '');
    formData.set('image', '');
    formData.set('aiVisible', 'on');
    formData.set('availability', 'available');
    formData.set('tags', '');

    await expect(createProduct('ar', formData)).rejects.toThrow(
      'redirect:/dashboard/products',
    );

    expect(mockAssertCanCreateProducts).toHaveBeenCalledWith('org_1', 0, 0);
  });

  it('counts only replacement image storage delta when updating a product image', async () => {
    const { updateProduct } = await import('./ProductActions');
    const formData = new FormData();

    formData.set('name', 'p011');
    formData.set('price', '27');
    formData.set('category', 'c011');
    formData.set('description', '');
    formData.set('image', '');
    formData.set('isActive', 'on');
    formData.set('aiVisible', 'on');
    formData.set('availability', 'available');
    formData.set('tags', '');
    formData.set('imageFile', new File(['image'], 'product.png', { type: 'image/png' }));
    mockIsUploadedFile.mockReturnValue(true);
    mockGetImageStorageMb.mockReturnValue(1);
    mockSaveProductImage.mockResolvedValue({
      sizeBytes: 1024 * 1024,
      url: '/uploads/products/org_1/product.png',
    });
    mockDbSelectLimit.mockResolvedValueOnce([{
      image: '/uploads/products/org_1/old.png',
      imageSizeBytes: 512 * 1024,
      metadata: {
        aiVisible: true,
        availability: 'available',
        tags: [],
      },
    }]);

    await expect(updateProduct('ar', 12, formData)).rejects.toThrow(
      'redirect:/dashboard/products',
    );

    expect(mockAssertCanCreateProducts).toHaveBeenCalledWith('org_1', 0, 0.5);
  });

  it('restores archived products to the active catalog', async () => {
    const { restoreArchivedProduct } = await import('./ProductActions');

    mockDbSelectLimit.mockResolvedValueOnce([{
      category: 'meals',
      metadata: {
        aiVisible: false,
        availability: 'unavailable',
        brand: 'brand-a',
        productType: 'meal',
        tags: ['lunch'],
        unit: 'plate',
      },
      name: 'p001 q002',
      price: '27.00',
    }]);
    mockDbSelectWhereRows = [];

    await restoreArchivedProduct('ar', 12);

    expect(mockAssertStoreFeatureEnabled).toHaveBeenCalledWith('org_1', 'productPublishing');
    expect(mockAssertCanCreateProducts).toHaveBeenCalledWith('org_1', 1);
    expect(mockDbUpdate).toHaveBeenCalled();
    expect(mockDbUpdateSet).toHaveBeenCalledWith({
      isActive: true,
      metadata: {
        aiVisible: true,
        availability: 'available',
        brand: 'brand-a',
        productType: 'meal',
        tags: ['lunch'],
        unit: 'plate',
      },
    });
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/products');
    expect(mockRevalidatePath).toHaveBeenCalledWith('/dashboard/products/archive');
  });

  it('scopes archived product restore reads and writes to the active organization', async () => {
    const { restoreArchivedProduct } = await import('./ProductActions');

    mockDbSelectLimit.mockResolvedValueOnce([{
      category: 'meals',
      metadata: {
        aiVisible: false,
        availability: 'unavailable',
        tags: [],
      },
      name: 'p001 q002',
      price: '27.00',
    }]);
    mockDbSelectWhereRows = [];

    await restoreArchivedProduct('ar', 12);

    const productIdScopedSelect = (mockDbSelectWhere.mock.calls as unknown[][])
      .map(([condition]) => condition)
      .find(condition => conditionScopesProductToActiveStore(condition, 12));

    expect(productIdScopedSelect).toBeDefined();

    expectConditionScopesProductToActiveStore(getLastMockArgument(
      mockDbUpdateWhere.mock.calls as unknown[][],
    ), 12);
  });

  it('blocks restoring archived products when they duplicate another catalog item', async () => {
    const { restoreArchivedProduct } = await import('./ProductActions');

    mockDbSelectLimit.mockResolvedValueOnce([{
      category: 'meals',
      metadata: {
        aiVisible: false,
        availability: 'unavailable',
        tags: [],
      },
      name: 'p001 q002',
      price: '27.00',
    }]);
    mockDbSelectWhereRows = [{
      category: 'meals',
      id: 99,
      metadata: {
        aiVisible: true,
        availability: 'available',
        tags: [],
      },
      name: 'q002 p001',
      price: '27.00',
    }];

    await expect(restoreArchivedProduct('ar', 12)).rejects.toThrow(
      'redirect:/dashboard/products/archive?productError=duplicate&duplicateProductId=99',
    );
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it('scopes AI visibility changes to one product in the active organization', async () => {
    const { updateProductAIVisibility } = await import('./ProductActions');

    mockDbSelectLimit.mockResolvedValueOnce([{
      metadata: {
        aiVisible: true,
        availability: 'available',
        tags: [],
      },
    }]);

    await updateProductAIVisibility('ar', 42, false);

    expectConditionScopesProductToActiveStore(getLastMockArgument(
      mockDbSelectWhere.mock.calls as unknown[][],
    ), 42);
    expectConditionScopesProductToActiveStore(getLastMockArgument(
      mockDbUpdateWhere.mock.calls as unknown[][],
    ), 42);

    expect(mockDbUpdateSet).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        aiVisible: false,
      }),
    });
  });

  it('scopes availability changes to one product in the active organization', async () => {
    const { updateProductAvailability } = await import('./ProductActions');

    mockDbSelectLimit.mockResolvedValueOnce([{
      metadata: {
        aiVisible: true,
        availability: 'available',
        tags: [],
      },
    }]);

    await updateProductAvailability('en', 43, 'limited');

    expectConditionScopesProductToActiveStore(getLastMockArgument(
      mockDbSelectWhere.mock.calls as unknown[][],
    ), 43);
    expectConditionScopesProductToActiveStore(getLastMockArgument(
      mockDbUpdateWhere.mock.calls as unknown[][],
    ), 43);

    expect(mockDbUpdateSet).toHaveBeenCalledWith({
      metadata: expect.objectContaining({
        availability: 'limited',
      }),
    });
  });

  it('fails closed before product access without an active organization', async () => {
    mockAuth.mockResolvedValueOnce({ orgId: null });
    const { updateProductAvailability } = await import('./ProductActions');

    await expect(updateProductAvailability('ar', 43, 'available'))
      .rejects
      .toThrow('No active organization selected');

    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});
