import { describe, expect, it, vi } from 'vitest';

const {
  mockDbSelect,
  mockDbTransaction,
  mockFetchMoyasarInvoice,
  mockIsMoyasarConfigured,
  mockReadRequestTextWithLimit,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbTransaction: vi.fn(),
  mockFetchMoyasarInvoice: vi.fn(),
  mockIsMoyasarConfigured: vi.fn(),
  mockReadRequestTextWithLimit: vi.fn(),
}));

vi.mock('@/libs/DB', () => ({
  db: {
    select: mockDbSelect,
    transaction: mockDbTransaction,
  },
}));

vi.mock('@/libs/payments/Moyasar', () => ({
  fetchMoyasarInvoice: mockFetchMoyasarInvoice,
  isMoyasarConfigured: mockIsMoyasarConfigured,
}));

vi.mock('@/libs/RequestBody', () => ({
  readRequestTextWithLimit: mockReadRequestTextWithLimit,
  RequestBodyTooLargeError: class RequestBodyTooLargeError extends Error {},
}));

vi.mock('@/models/Schema', () => ({
  invoicesTable: {},
  orderEventsTable: {},
  ordersTable: {},
}));

describe('Moyasar callback route', () => {
  it('fails closed before parsing or provider access while online payments are deferred', async () => {
    const { POST } = await import('./route');

    const response = await POST(new Request(
      'https://www.smartstore-ai.com/api/payments/moyasar/callback',
      {
        body: JSON.stringify({
          id: 'invoice_that_must_not_be_processed',
        }),
        headers: {
          'content-type': 'application/json',
        },
        method: 'POST',
      },
    ));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: 'Customer online payments are not active yet',
    });
    expect(mockIsMoyasarConfigured).not.toHaveBeenCalled();
    expect(mockReadRequestTextWithLimit).not.toHaveBeenCalled();
    expect(mockFetchMoyasarInvoice).not.toHaveBeenCalled();
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbTransaction).not.toHaveBeenCalled();
  }, 15_000);
});
