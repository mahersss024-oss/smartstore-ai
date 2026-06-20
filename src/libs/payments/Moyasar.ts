import { Buffer } from 'node:buffer';
import { Env } from '@/libs/Env';
import { fetchWithTimeout } from '@/libs/OutboundHttp';

const MOYASAR_API_BASE_URL = 'https://api.moyasar.com/v1';

type MoyasarInvoice = {
  amount: number;
  currency: string;
  id: string;
  metadata?: Record<string, string>;
  status: string;
  url?: string;
};

const getMoyasarAuthHeader = () => {
  const secretKey = Env.MOYASAR_SECRET_KEY;

  if (!secretKey) {
    return null;
  }

  return `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`;
};

export const isMoyasarConfigured = () => {
  return Boolean(Env.MOYASAR_SECRET_KEY);
};

export const fetchMoyasarInvoice = async (invoiceId: string) => {
  const authorization = getMoyasarAuthHeader();

  if (!authorization) {
    throw new Error('Moyasar is not configured');
  }

  const response = await fetchWithTimeout(`${MOYASAR_API_BASE_URL}/invoices/${invoiceId}`, {
    headers: {
      authorization,
    },
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Moyasar invoice fetch failed: ${response.status}`);
  }

  return response.json() as Promise<MoyasarInvoice>;
};
