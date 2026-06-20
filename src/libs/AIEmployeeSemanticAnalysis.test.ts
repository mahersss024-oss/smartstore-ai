import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  analyzeAIEmployeeMessageSemantics,
  analyzeAIEmployeeModelReplySystemNeed,
  parseAIEmployeeSemanticUnderstanding,
} from './AIEmployeeSemanticAnalysis';

const mocks = vi.hoisted(() => ({
  generatePlatformAIText: vi.fn(),
  getPlatformAIProviderConfig: vi.fn(),
  validateAIEmployeeRequestedCustomerNeed: vi.fn(() => null as any),
}));

vi.mock('./PlatformAIProviderConfig', () => ({
  getPlatformAIProviderConfig: mocks.getPlatformAIProviderConfig,
}));

vi.mock('./PlatformAIClient', () => ({
  generatePlatformAIText: mocks.generatePlatformAIText,
}));

vi.mock('./AIEmployeeCheckout', () => ({
  getAllowedAIEmployeeDeliveryPreferences: vi.fn(() => ['delivery', 'pickup']),
  getAllowedAIEmployeePaymentPreferences: vi.fn(() => ['cash_on_delivery']),
}));

vi.mock('./AIEmployeeOrchestration', () => ({
  validateAIEmployeeRequestedCustomerNeed: mocks.validateAIEmployeeRequestedCustomerNeed,
}));

describe('parseAIEmployeeSemanticUnderstanding', () => {
  it('accepts only canonical structured values', () => {
    expect(parseAIEmployeeSemanticUnderstanding(JSON.stringify({
      dialogueState: 'order_request',
      requestedCustomerNeed: 'requested_product',
      requestedQuantity: 3.8,
    }))).toEqual(expect.objectContaining({
      dialogueState: 'order_request',
      requestedCustomerNeed: 'requested_product',
      requestedQuantity: 3,
    }));
  });

  it('drops unknown values and caps quantity', () => {
    expect(parseAIEmployeeSemanticUnderstanding(JSON.stringify({
      dialogueState: 'unknown',
      requestedCustomerNeed: 'unknown',
      requestedQuantity: 1000,
    }))).toEqual(expect.objectContaining({
      dialogueState: undefined,
      requestedCustomerNeed: undefined,
      requestedQuantity: 99,
    }));
  });

  it('does not treat non-JSON text as system facts', () => {
    expect(parseAIEmployeeSemanticUnderstanding('normal customer reply')).toEqual({});
  });

  it('returns empty object for undefined or empty input', () => {
    expect(parseAIEmployeeSemanticUnderstanding(undefined)).toEqual({});
    expect(parseAIEmployeeSemanticUnderstanding('')).toEqual({});
  });

  it('returns empty object when JSON parse throws', () => {
    expect(parseAIEmployeeSemanticUnderstanding('{"bad": [unclosed}')).toEqual({});
  });

  it('normalizes boolean fields and trims string fields', () => {
    const result = parseAIEmployeeSemanticUnderstanding(JSON.stringify({
      cartItemRemovalRequested: true,
      checkoutRequested: false,
      customerAddress: '  Riyadh, King Fahd Road  ',
      customerName: '  Ahmed  ',
      existingOrderModificationConfirmed: true,
      existingOrderModificationRequested: false,
      replaceExistingQuantity: true,
      supportEscalationConfirmed: false,
    }));

    expect(result.cartItemRemovalRequested).toBe(true);
    expect(result.checkoutRequested).toBe(false);
    expect(result.customerAddress).toBe('Riyadh, King Fahd Road');
    expect(result.customerName).toBe('Ahmed');
    expect(result.existingOrderModificationConfirmed).toBe(true);
    expect(result.existingOrderModificationRequested).toBe(false);
    expect(result.replaceExistingQuantity).toBe(true);
    expect(result.supportEscalationConfirmed).toBe(false);
  });

  it('drops non-string customerName and customerAddress', () => {
    const result = parseAIEmployeeSemanticUnderstanding(JSON.stringify({
      customerAddress: 123,
      customerName: true,
    }));

    expect(result.customerName).toBeUndefined();
    expect(result.customerAddress).toBeUndefined();
  });

  it('drops zero and negative requestedQuantity', () => {
    expect(parseAIEmployeeSemanticUnderstanding(JSON.stringify({ requestedQuantity: 0 })).requestedQuantity).toBeUndefined();
    expect(parseAIEmployeeSemanticUnderstanding(JSON.stringify({ requestedQuantity: -5 })).requestedQuantity).toBeUndefined();
  });

  it('drops whitespace-only customerName and customerAddress', () => {
    const result = parseAIEmployeeSemanticUnderstanding(JSON.stringify({
      customerAddress: '   ',
      customerName: '   ',
    }));

    expect(result.customerName).toBeUndefined();
    expect(result.customerAddress).toBeUndefined();
  });
});

describe('analyzeAIEmployeeMessageSemantics', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns empty object when AI is disabled', async () => {
    mocks.getPlatformAIProviderConfig.mockResolvedValueOnce({ enabled: false, apiKey: null });

    const result = await analyzeAIEmployeeMessageSemantics({
      message: 'I want a burger',
      storeName: 'Test Store',
    });

    expect(result).toEqual({});
    expect(mocks.generatePlatformAIText).not.toHaveBeenCalled();
  });

  it('returns empty object when API key is missing', async () => {
    mocks.getPlatformAIProviderConfig.mockResolvedValueOnce({ enabled: true, apiKey: null });

    const result = await analyzeAIEmployeeMessageSemantics({
      message: 'I want a burger',
      storeName: 'Test Store',
    });

    expect(result).toEqual({});
    expect(mocks.generatePlatformAIText).not.toHaveBeenCalled();
  });

  it('returns parsed semantics when AI responds with valid JSON', async () => {
    mocks.getPlatformAIProviderConfig.mockResolvedValueOnce({ enabled: true, apiKey: 'sk-test' });
    mocks.generatePlatformAIText.mockResolvedValueOnce(JSON.stringify({
      dialogueState: 'order_request',
      requestedCustomerNeed: 'requested_product',
    }));

    const result = await analyzeAIEmployeeMessageSemantics({
      message: 'I want a burger',
      storeName: 'Test Store',
    });

    expect(result.dialogueState).toBe('order_request');
    expect(result.requestedCustomerNeed).toBe('requested_product');
  });

  it('returns empty object when AI call throws', async () => {
    mocks.getPlatformAIProviderConfig.mockResolvedValueOnce({ enabled: true, apiKey: 'sk-test' });
    mocks.generatePlatformAIText.mockRejectedValueOnce(new Error('AI timeout'));

    const result = await analyzeAIEmployeeMessageSemantics({
      message: 'I want a burger',
      storeName: 'Test Store',
    });

    expect(result).toEqual({});
  });
});

describe('analyzeAIEmployeeModelReplySystemNeed', () => {
  beforeEach(() => vi.clearAllMocks());

  const baseParams = {
    currentVisibleSystemActions: [] as any[],
    decision: { reply: 'Sure!', systemUnderstanding: {} } as any,
    pendingOrderModificationNeedsConfirmation: false,
    reply: 'Sure!',
    storeName: 'Test Store',
  };

  it('returns null when AI is disabled', async () => {
    mocks.getPlatformAIProviderConfig.mockResolvedValueOnce({ enabled: false, apiKey: null });

    const result = await analyzeAIEmployeeModelReplySystemNeed(baseParams);

    expect(result).toBeNull();
    expect(mocks.generatePlatformAIText).not.toHaveBeenCalled();
  });

  it('returns null when API key is missing', async () => {
    mocks.getPlatformAIProviderConfig.mockResolvedValueOnce({ enabled: true, apiKey: null });

    const result = await analyzeAIEmployeeModelReplySystemNeed(baseParams);

    expect(result).toBeNull();
  });

  it('returns null when AI call throws', async () => {
    mocks.getPlatformAIProviderConfig.mockResolvedValueOnce({ enabled: true, apiKey: 'sk-test' });
    mocks.generatePlatformAIText.mockRejectedValueOnce(new Error('AI error'));

    const result = await analyzeAIEmployeeModelReplySystemNeed(baseParams);

    expect(result).toBeNull();
  });

  it('calls AI and delegates to validateAIEmployeeRequestedCustomerNeed', async () => {
    mocks.getPlatformAIProviderConfig.mockResolvedValueOnce({ enabled: true, apiKey: 'sk-test' });
    mocks.generatePlatformAIText.mockResolvedValueOnce(JSON.stringify({ requestedCustomerNeed: 'payment_method' }));
    mocks.validateAIEmployeeRequestedCustomerNeed.mockReturnValueOnce('payment_method');

    const result = await analyzeAIEmployeeModelReplySystemNeed(baseParams);

    expect(result).toBe('payment_method');
    expect(mocks.validateAIEmployeeRequestedCustomerNeed).toHaveBeenCalled();
  });
});
