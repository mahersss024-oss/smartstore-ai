import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  secretKey: undefined as string | undefined,
}));

vi.mock('@/libs/Env', () => ({
  Env: {
    get MOYASAR_SECRET_KEY() {
      return mocks.secretKey;
    },
  },
}));

vi.mock('@/libs/OutboundHttp', () => ({
  fetchWithTimeout: mocks.fetchWithTimeout,
}));

describe('Moyasar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.secretKey = undefined;
  });

  it('fails closed when Moyasar is not configured', async () => {
    const { fetchMoyasarInvoice, isMoyasarConfigured } = await import('./Moyasar');

    expect(isMoyasarConfigured()).toBe(false);
    await expect(fetchMoyasarInvoice('inv_1')).rejects.toThrow('Moyasar is not configured');
    expect(mocks.fetchWithTimeout).not.toHaveBeenCalled();
  });

  it('fetches and returns a configured invoice', async () => {
    mocks.secretKey = 'moyasar-secret';
    mocks.fetchWithTimeout.mockResolvedValueOnce({
      ok: true,
      json: vi.fn(async () => ({ id: 'inv_1', status: 'paid' })),
    });
    const { fetchMoyasarInvoice, isMoyasarConfigured } = await import('./Moyasar');

    expect(isMoyasarConfigured()).toBe(true);
    await expect(fetchMoyasarInvoice('inv_1')).resolves.toEqual({
      id: 'inv_1',
      status: 'paid',
    });
    expect(mocks.fetchWithTimeout).toHaveBeenCalledWith(
      'https://api.moyasar.com/v1/invoices/inv_1',
      expect.objectContaining({
        headers: {
          authorization: expect.stringMatching(/^Basic /),
        },
        method: 'GET',
      }),
    );
  });

  it('rejects provider failures without exposing the response body', async () => {
    mocks.secretKey = 'moyasar-secret';
    mocks.fetchWithTimeout.mockResolvedValueOnce({
      ok: false,
      status: 503,
    });
    const { fetchMoyasarInvoice } = await import('./Moyasar');

    await expect(fetchMoyasarInvoice('inv_1')).rejects.toThrow(
      'Moyasar invoice fetch failed: 503',
    );
  });
});
