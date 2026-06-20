import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const rows: unknown[][] = [];
  const where = vi.fn(async () => rows.shift() ?? []);
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));

  return {
    rows,
    select,
  };
});

vi.mock('./DB', () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock('@/models/Schema', () => ({
  deliveryMethodsTable: {
    fee: 'fee',
    id: 'id',
    isActive: 'isActive',
    organizationId: 'organizationId',
    type: 'type',
  },
  paymentMethodsTable: {
    id: 'id',
    isActive: 'isActive',
    organizationId: 'organizationId',
    provider: 'provider',
    supportedDeliveryMethods: 'supportedDeliveryMethods',
  },
}));

vi.mock('drizzle-orm', () => ({
  and: vi.fn((...conditions: unknown[]) => conditions),
  eq: vi.fn((field: unknown, value: unknown) => ({ field, value })),
  or: vi.fn((...conditions: unknown[]) => conditions),
}));

describe('resolveAIEmployeeOrderServiceMethodIds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows.length = 0;
  });

  it('selects the highest-priority delivery method and compatible payment method', async () => {
    mocks.rows.push(
      [
        { fee: '5', id: 1, type: 'curbside_pickup' },
        { fee: '0', id: 2, type: 'pickup' },
      ],
      [
        {
          id: 10,
          provider: 'cash_on_pickup',
          supportedDeliveryMethods: ['pickup'],
        },
      ],
    );
    const { resolveAIEmployeeOrderServiceMethodIds } = await import('./AIEmployeeCheckout');

    await expect(resolveAIEmployeeOrderServiceMethodIds({
      customerDetails: {
        deliveryPreference: 'pickup',
        paymentPreference: 'cash_on_pickup',
      },
      organizationId: 'org_1',
    })).resolves.toEqual({
      deliveryFee: '0',
      deliveryMethodId: 2,
      paymentMethodId: 10,
    });
  });

  it('does not bind an incompatible payment method and defaults missing fees', async () => {
    mocks.rows.push(
      [{ fee: null, id: 3, type: 'local_delivery' }],
      [{
        id: 11,
        provider: 'card_on_delivery',
        supportedDeliveryMethods: ['pickup'],
      }],
    );
    const { resolveAIEmployeeOrderServiceMethodIds } = await import('./AIEmployeeCheckout');

    await expect(resolveAIEmployeeOrderServiceMethodIds({
      customerDetails: {
        deliveryPreference: 'delivery',
        paymentPreference: 'card_on_delivery',
      },
      organizationId: 'org_1',
    })).resolves.toEqual({
      deliveryFee: '0',
      deliveryMethodId: 3,
      paymentMethodId: undefined,
    });
  });

  it('returns empty service identifiers when checkout choices are absent', async () => {
    mocks.rows.push([], []);
    const { resolveAIEmployeeOrderServiceMethodIds } = await import('./AIEmployeeCheckout');

    await expect(resolveAIEmployeeOrderServiceMethodIds({
      organizationId: 'org_1',
    })).resolves.toEqual({
      deliveryFee: '0',
      deliveryMethodId: undefined,
      paymentMethodId: undefined,
    });
  });
});
