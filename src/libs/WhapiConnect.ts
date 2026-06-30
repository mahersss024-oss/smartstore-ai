import { Buffer } from 'node:buffer';
import { Env } from './Env';

export class WhapiConnectError extends Error {
  detail?: string;
  status?: number;

  constructor(message: string, params?: { detail?: string; status?: number }) {
    super(message);
    this.name = 'WhapiConnectError';
    this.detail = params?.detail;
    this.status = params?.status;
  }
}

export type WhapiManagedChannel = {
  apiToken: string;
  channelId: string;
  displayPhoneNumber?: string;
};

const getRecord = (value: unknown): Record<string, unknown> | null => {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
};

const getString = (record: null | Record<string, unknown>, keys: string[]) => {
  if (!record) {
    return '';
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
};

const getNestedString = (record: null | Record<string, unknown>, keys: string[], nestedKeys: string[]) => {
  for (const key of keys) {
    const value = getRecord(record?.[key]);
    const nestedValue = getString(value, nestedKeys);

    if (nestedValue) {
      return nestedValue;
    }
  }

  return '';
};

export const isWhapiManagedConnectConfigured = () => {
  return Boolean(Env.WHAPI_PARTNER_API_TOKEN && Env.WHAPI_PROJECT_ID);
};

export const parseWhapiManagedChannel = (payload: unknown): WhapiManagedChannel => {
  const root = getRecord(payload);
  const channel = getRecord(root?.channel)
    ?? getRecord(root?.data)
    ?? getRecord(root?.result)
    ?? root;
  const channelId = getString(channel, ['id', 'channelId', 'channel_id', 'uuid'])
    || getNestedString(root, ['channel', 'data', 'result'], ['id', 'channelId', 'channel_id', 'uuid']);
  const apiToken = getString(channel, ['token', 'apiToken', 'api_token', 'bearerToken', 'bearer_token'])
    || getNestedString(root, ['channel', 'data', 'result'], ['token', 'apiToken', 'api_token', 'bearerToken', 'bearer_token']);
  const displayPhoneNumber = getString(channel, ['phone', 'phoneNumber', 'displayPhoneNumber', 'number'])
    || getNestedString(root, ['channel', 'data', 'result'], ['phone', 'phoneNumber', 'displayPhoneNumber', 'number'])
    || undefined;

  if (!channelId || !apiToken) {
    throw new WhapiConnectError('whapi_channel_response_missing_credentials');
  }

  return {
    apiToken,
    channelId,
    displayPhoneNumber,
  };
};

const sanitizeErrorDetail = (responseText: string) => {
  const token = Env.WHAPI_PARTNER_API_TOKEN;
  const redacted = token
    ? responseText.replaceAll(token, '[redacted]')
    : responseText;

  return redacted.slice(0, 500);
};

const createWhapiChannelRequest = async (params: {
  authMode: 'bearer' | 'query';
  name: string;
}) => {
  const url = new URL(`${Env.WHAPI_PARTNER_API_BASE}/channels`);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (params.authMode === 'query') {
    url.searchParams.set('token', Env.WHAPI_PARTNER_API_TOKEN ?? '');
  } else {
    headers.Authorization = `Bearer ${Env.WHAPI_PARTNER_API_TOKEN}`;
  }

  const response = await fetch(url.toString(), {
    body: JSON.stringify({
      name: params.name,
      projectId: Env.WHAPI_PROJECT_ID,
    }),
    headers,
    method: 'PUT',
  });
  const responseText = await response.text().catch(() => '');

  return {
    authMode: params.authMode,
    response,
    responseText,
  };
};

export const createWhapiManagedChannel = async (params: {
  name: string;
}) => {
  if (!Env.WHAPI_PARTNER_API_TOKEN || !Env.WHAPI_PROJECT_ID) {
    throw new WhapiConnectError('whapi_partner_credentials_missing');
  }

  const bearerAttempt = await createWhapiChannelRequest({
    authMode: 'bearer',
    name: params.name,
  });
  const finalAttempt = [401, 403].includes(bearerAttempt.response.status)
    ? await createWhapiChannelRequest({
        authMode: 'query',
        name: params.name,
      })
    : bearerAttempt;

  if (!finalAttempt.response.ok) {
    throw new WhapiConnectError('whapi_channel_create_failed', {
      detail: sanitizeErrorDetail(
        `auth=${finalAttempt.authMode} body=${finalAttempt.responseText || 'empty_response'}`,
      ),
      status: finalAttempt.response.status,
    });
  }

  try {
    return parseWhapiManagedChannel(finalAttempt.responseText ? JSON.parse(finalAttempt.responseText) : {});
  } catch (error) {
    if (error instanceof WhapiConnectError) {
      throw error;
    }

    throw new WhapiConnectError('whapi_channel_response_invalid');
  }
};

export const configureWhapiChannelWebhook = async (params: {
  apiToken: string;
  webhookUrl: string;
}) => {
  const response = await fetch(`${Env.WHAPI_GATE_API_BASE}/settings`, {
    body: JSON.stringify({
      webhooks: [{
        events: [
          {
            method: 'post',
            type: 'messages',
          },
        ],
        mode: 'method',
        url: params.webhookUrl,
      }],
    }),
    headers: {
      'Authorization': `Bearer ${params.apiToken}`,
      'Content-Type': 'application/json',
    },
    method: 'PATCH',
  });

  if (!response.ok) {
    throw new WhapiConnectError('whapi_webhook_configure_failed', { status: response.status });
  }
};

export const fetchWhapiQrCodeDataUrl = async (params: {
  apiToken: string;
}) => {
  const response = await fetch(`${Env.WHAPI_GATE_API_BASE}/users/login/image`, {
    headers: {
      Authorization: `Bearer ${params.apiToken}`,
    },
    method: 'GET',
  });
  const contentType = response.headers.get('content-type') ?? '';
  const buffer = Buffer.from(await response.arrayBuffer());

  if (!response.ok) {
    throw new WhapiConnectError('whapi_qr_fetch_failed', { status: response.status });
  }

  if (contentType.startsWith('image/')) {
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  }

  const bodyText = buffer.toString('utf8');
  let parsed: Record<string, unknown> = {};

  try {
    parsed = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : {};
  } catch {
    throw new WhapiConnectError('whapi_qr_response_invalid');
  }

  const image = getString(parsed, ['image', 'qr', 'qrCode', 'qr_code', 'base64']);

  if (image.startsWith('data:image/')) {
    return image;
  }

  if (image) {
    return `data:image/png;base64,${image}`;
  }

  throw new WhapiConnectError('whapi_qr_response_missing_image');
};
