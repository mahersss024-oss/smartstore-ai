import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const rows = {
    conversation: [] as unknown[],
    delivery: [] as unknown[],
    payment: [] as unknown[],
    products: [] as unknown[],
    settings: [] as unknown[],
  };
  const tables = {
    conversationsTable: { __table: 'conversations' },
    deliveryMethodsTable: { __table: 'delivery' },
    paymentMethodsTable: { __table: 'payment' },
    productsTable: { __table: 'products' },
    storeSettingsTable: { __table: 'settings' },
  };

  const resultFor = (table: unknown) => {
    const tableName = table && typeof table === 'object' && '__table' in table
      ? (table as { __table?: unknown }).__table
      : undefined;

    if (tableName === tables.storeSettingsTable.__table) {
      return rows.settings;
    }
    if (tableName === tables.productsTable.__table) {
      return rows.products;
    }
    if (tableName === tables.paymentMethodsTable.__table) {
      return rows.payment;
    }
    if (tableName === tables.deliveryMethodsTable.__table) {
      return rows.delivery;
    }
    return rows.conversation;
  };

  const select = vi.fn(() => ({
    from: vi.fn((table: unknown) => {
      const result = resultFor(table);
      const limit = vi.fn(async () => result);
      const orderBy = vi.fn(() => ({
        limit,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      }));
      const where = vi.fn(() => ({
        limit,
        orderBy,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
      }));

      return { where };
    }),
  }));

  return {
    rows,
    select,
    tables,
  };
});

vi.mock('@/libs/DB', () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock('@/models/Schema', () => ({
  conversationsTable: {
    ...mocks.tables.conversationsTable,
    channel: 'channel',
    createdAt: 'createdAt',
    id: 'id',
    metadata: 'metadata',
    organizationId: 'organizationId',
    status: 'status',
  },
  deliveryMethodsTable: {
    ...mocks.tables.deliveryMethodsTable,
    config: 'config',
    displayName: 'displayName',
    estimatedTime: 'estimatedTime',
    fee: 'fee',
    isActive: 'isActive',
    organizationId: 'organizationId',
    type: 'type',
  },
  paymentMethodsTable: {
    ...mocks.tables.paymentMethodsTable,
    config: 'config',
    displayName: 'displayName',
    isActive: 'isActive',
    organizationId: 'organizationId',
    provider: 'provider',
    supportedDeliveryMethods: 'supportedDeliveryMethods',
    type: 'type',
  },
  productsTable: {
    ...mocks.tables.productsTable,
    category: 'category',
    createdAt: 'createdAt',
    description: 'description',
    id: 'id',
    image: 'image',
    isActive: 'isActive',
    metadata: 'metadata',
    name: 'name',
    organizationId: 'organizationId',
    price: 'price',
    sortOrder: 'sortOrder',
  },
  storeSettingsTable: {
    ...mocks.tables.storeSettingsTable,
    organizationId: 'organizationId',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  desc: vi.fn((value: unknown) => value),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  ne: vi.fn((field: unknown, value: unknown) => ({ field, value, op: 'ne' })),
}));

describe('loadStoreAIContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows.settings = [];
    mocks.rows.products = [];
    mocks.rows.payment = [];
    mocks.rows.delivery = [];
    mocks.rows.conversation = [];
  });

  it('builds a safe default context for an empty store', async () => {
    const { loadStoreAIContext } = await import('./StoreAIContext');

    await expect(loadStoreAIContext({
      organizationId: 'org_1',
    })).resolves.toMatchObject({
      catalog: [],
      conversation: null,
      deliveryMethods: [],
      knowledgeBase: {},
      organizationId: 'org_1',
      paymentMethods: [],
      store: {
        currency: 'SAR',
        location: {},
        timezone: 'Asia/Riyadh',
      },
    });
  });

  it('filters the AI catalog and normalizes payment context', async () => {
    mocks.rows.settings = [{
      currency: 'SAR',
      metadata: {
        businessType: 'restaurant',
        knowledgeBase: { faqs: 'FAQ' },
        location: { city: 'Tabuk' },
      },
      storeDescription: 'Traditional food',
      storeName: 'Store',
      timezone: 'Asia/Riyadh',
      welcomeMessage: 'Welcome',
    }];
    mocks.rows.products = [
      {
        category: 'Meals',
        description: 'Visible',
        id: 1,
        image: null,
        isActive: true,
        metadata: {
          aiVisible: true,
          availability: 'available',
          tags: ['popular'],
        },
        name: 'Kabsa',
        price: '25.00',
      },
      {
        category: 'Meals',
        description: 'Hidden',
        id: 2,
        image: null,
        isActive: true,
        metadata: {
          aiVisible: false,
          availability: 'available',
        },
        name: 'Hidden meal',
        price: '20.00',
      },
    ];
    mocks.rows.payment = [{
      config: { instructions: 'Pay at pickup' },
      displayName: 'Cash',
      provider: 'cash_on_pickup',
      supportedDeliveryMethods: ['pickup', 'invalid'],
      type: 'offline',
    }];
    mocks.rows.delivery = [{
      config: { instructions: 'Main branch' },
      displayName: 'Pickup',
      estimatedTime: '10 min',
      fee: '0',
      type: 'pickup',
    }];
    mocks.rows.conversation = [{
      channel: 'whatsapp',
      id: 7,
      metadata: {},
      status: 'active',
    }];
    const { loadStoreAIContext } = await import('./StoreAIContext');

    const result = await loadStoreAIContext({
      conversationId: 7,
      organizationId: 'org_1',
    });

    expect(result.catalog).toHaveLength(1);
    expect(result.catalog[0]).toMatchObject({
      id: 1,
      name: 'Kabsa',
      tags: ['popular'],
    });
    expect(result.conversation).toMatchObject({ id: 7 });
    expect(result.paymentMethods).toEqual([{
      displayName: 'Cash',
      provider: 'cash_on_pickup',
      safeInstructions: 'Pay at pickup',
      supportedDeliveryPreferences: ['pickup'],
      type: 'offline',
    }]);
    expect(result.store).toMatchObject({
      businessType: 'restaurant',
      name: 'Store',
    });
  });
});
