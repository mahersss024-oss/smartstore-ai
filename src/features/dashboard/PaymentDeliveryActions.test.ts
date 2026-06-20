import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockAuth = vi.fn();
const mockRevalidatePath = vi.fn();
const mockTxInsertValues = vi.fn(() => ({
  onConflictDoUpdate: vi.fn(),
}));
const mockTxInsert = vi.fn(() => ({
  values: mockTxInsertValues,
}));
const mockDbTransaction = vi.fn(async (callback: (tx: unknown) => Promise<void>) => {
  await callback({
    insert: mockTxInsert,
  });
});

vi.mock('@clerk/nextjs/server', () => ({
  auth: mockAuth,
}));

vi.mock('next/cache', () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock('@/libs/DB', () => ({
  db: {
    transaction: mockDbTransaction,
  },
}));

vi.mock('@/models/Schema', () => ({
  deliveryMethodsTable: {
    organizationId: 'organizationId',
    type: 'type',
  },
  paymentMethodsTable: {
    organizationId: 'organizationId',
    provider: 'provider',
  },
}));

vi.mock('@/utils/Helpers', () => ({
  getI18nPath: vi.fn((path: string) => path),
}));

describe('PaymentDeliveryActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ orgId: 'org_1' });
  });

  it('rejects saving payment and delivery settings without an active store', async () => {
    const { savePaymentAndDeliverySettings } = await import('./PaymentDeliveryActions');
    const formData = new FormData();

    mockAuth.mockResolvedValueOnce({ orgId: null });

    await expect(savePaymentAndDeliverySettings('ar', formData))
      .rejects
      .toThrow('No active organization selected');

    expect(mockDbTransaction).not.toHaveBeenCalled();
  });

  it('does not keep a payment method active without an explicit supported scope', async () => {
    const { savePaymentAndDeliverySettings } = await import('./PaymentDeliveryActions');
    const formData = new FormData();

    formData.set('payment_cash_on_delivery', 'on');

    await savePaymentAndDeliverySettings('ar', formData);

    expect(mockTxInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      isActive: false,
      provider: 'cash_on_delivery',
      supportedDeliveryMethods: [],
    }));
  });

  it('keeps a payment method active when the matching scope is explicit', async () => {
    const { savePaymentAndDeliverySettings } = await import('./PaymentDeliveryActions');
    const formData = new FormData();

    formData.set('payment_cash_on_delivery', 'on');
    formData.set('payment_delivery_cash_on_delivery', 'on');

    await savePaymentAndDeliverySettings('ar', formData);

    expect(mockTxInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      isActive: true,
      provider: 'cash_on_delivery',
      supportedDeliveryMethods: ['delivery'],
    }));
  });

  it('keeps pickup payment methods separate from delivery payment methods', async () => {
    const { savePaymentAndDeliverySettings } = await import('./PaymentDeliveryActions');
    const formData = new FormData();

    formData.set('payment_cash_on_pickup', 'on');
    formData.set('payment_pickup_cash_on_pickup', 'on');
    formData.set('payment_delivery_cash_on_pickup', 'on');

    await savePaymentAndDeliverySettings('ar', formData);

    expect(mockTxInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      isActive: true,
      organizationId: 'org_1',
      provider: 'cash_on_pickup',
      supportedDeliveryMethods: ['pickup'],
    }));
  });

  it('stores delivery method fees, expected times, and instructions per active store', async () => {
    const { savePaymentAndDeliverySettings } = await import('./PaymentDeliveryActions');
    const formData = new FormData();

    formData.set('delivery_local_delivery', 'on');
    formData.set('delivery_fee_local_delivery', '10');
    formData.set('delivery_time_local_delivery', '45 minutes');
    formData.set('delivery_instructions_local_delivery', 'Call before arrival');

    await savePaymentAndDeliverySettings('ar', formData);

    expect(mockTxInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      config: {
        instructions: 'Call before arrival',
      },
      estimatedTime: '45 minutes',
      fee: '10.00',
      isActive: true,
      organizationId: 'org_1',
      type: 'local_delivery',
    }));
  });

  it('keeps reserved online payment providers inactive until post-launch activation', async () => {
    const { savePaymentAndDeliverySettings } = await import('./PaymentDeliveryActions');
    const formData = new FormData();

    await savePaymentAndDeliverySettings('ar', formData);

    expect(mockTxInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      config: {
        activationStatus: 'planned',
        note: 'Reserved for future customer online payment activation.',
      },
      isActive: false,
      organizationId: 'org_1',
      provider: 'custom_payment_link',
      requiresOnlinePayment: true,
    }));
    expect(mockTxInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      isActive: false,
      organizationId: 'org_1',
      provider: 'apple_pay',
      requiresOnlinePayment: true,
    }));
    expect(mockTxInsertValues).toHaveBeenCalledWith(expect.objectContaining({
      isActive: false,
      organizationId: 'org_1',
      provider: 'google_pay',
      requiresOnlinePayment: true,
    }));
  });
});
