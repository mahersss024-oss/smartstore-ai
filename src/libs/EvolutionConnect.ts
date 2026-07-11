import QRCode from 'qrcode';
import { Env } from './Env';

export class EvolutionConnectError extends Error {
  detail?: string;
  status?: number;

  constructor(message: string, params?: { detail?: string; status?: number }) {
    super(message);
    this.name = 'EvolutionConnectError';
    this.detail = params?.detail;
    this.status = params?.status;
  }
}

const getEvolutionApiBase = () => {
  if (!Env.EVOLUTION_API_BASE_URL) {
    throw new EvolutionConnectError('evolution_api_not_configured');
  }

  return Env.EVOLUTION_API_BASE_URL.replace(/\/+$/, '');
};

const getEvolutionApiKey = () => {
  if (!Env.EVOLUTION_API_KEY) {
    throw new EvolutionConnectError('evolution_api_key_missing');
  }

  return Env.EVOLUTION_API_KEY;
};

const sanitizeErrorDetail = (value: string) => {
  const apiKey = Env.EVOLUTION_API_KEY;
  const redacted = apiKey ? value.replaceAll(apiKey, '[redacted]') : value;

  return redacted
    .replace(/apikey["']?\s*[:=]\s*["']?[\w.-]{8,}/gi, 'apikey=[redacted]')
    .slice(0, 1200);
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

const requestEvolution = async (params: {
  body?: unknown;
  method?: 'DELETE' | 'GET' | 'POST' | 'PUT';
  path: string;
  timeoutMs?: number;
}) => {
  const response = await fetch(`${getEvolutionApiBase()}${params.path}`, {
    body: params.body === undefined ? undefined : JSON.stringify(params.body),
    headers: {
      apikey: getEvolutionApiKey(),
      ...(params.body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    method: params.method ?? 'GET',
    signal: AbortSignal.timeout(params.timeoutMs ?? 15_000),
  });
  const responseText = await response.text().catch(() => '');

  let payload: unknown;

  if (responseText) {
    try {
      payload = JSON.parse(responseText) as unknown;
    } catch {
      payload = responseText;
    }
  }

  return {
    ok: response.ok,
    payload,
    responseText,
    status: response.status,
  };
};

const isExistingInstanceResponse = (status: number, responseText: string) => {
  return [400, 403, 409].includes(status)
    && /already|exists|in use|em uso|j[aá]\s+existe/i.test(responseText);
};

export const normalizeEvolutionInstanceName = (organizationId: string) => {
  const prefix = Env.EVOLUTION_INSTANCE_PREFIX || 'smartstore';
  const normalizedPrefix = prefix.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
    || 'smartstore';
  const normalizedOrgId = organizationId.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

  return `${normalizedPrefix}-${normalizedOrgId}`.slice(0, 80);
};

const buildWebhookPayload = (webhookUrl: string) => ({
  webhook: {
    base64: false,
    byEvents: false,
    enabled: true,
    events: ['MESSAGES_UPSERT'],
    url: webhookUrl,
  },
});

const extractQrFromPayload = async (payload: unknown) => {
  const root = getRecord(payload);
  const qrcode = getRecord(root?.qrcode) ?? getRecord(root?.qrCode) ?? getRecord(root?.qr);
  const base64 = getString(qrcode, ['base64', 'image', 'qrCode', 'qrcode'])
    || getString(root, ['base64', 'qrCode', 'qrcode']);

  if (base64.startsWith('data:image/')) {
    return base64;
  }

  if (base64) {
    return `data:image/png;base64,${base64}`;
  }

  const code = getString(qrcode, ['code', 'pairingCode']) || getString(root, ['code', 'pairingCode']);

  if (code) {
    return QRCode.toDataURL(code, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 320,
    });
  }

  return '';
};

export const ensureEvolutionInstanceForQr = async (params: {
  instanceName: string;
  webhookUrl: string;
}) => {
  const createPayload = {
    instanceName: params.instanceName,
    integration: Env.EVOLUTION_CONNECT_INTEGRATION,
    qrcode: true,
    ...buildWebhookPayload(params.webhookUrl),
  };
  const createResult = await requestEvolution({
    body: createPayload,
    method: 'POST',
    path: '/instance/create',
    timeoutMs: 30_000,
  });

  let qrDataUrl = createResult.ok ? await extractQrFromPayload(createResult.payload) : '';

  if (!createResult.ok && !isExistingInstanceResponse(createResult.status, createResult.responseText)) {
    throw new EvolutionConnectError('evolution_instance_create_failed', {
      detail: sanitizeErrorDetail(createResult.responseText || 'empty_response'),
      status: createResult.status,
    });
  }

  const webhookResult = await requestEvolution({
    body: buildWebhookPayload(params.webhookUrl),
    method: 'POST',
    path: `/webhook/set/${encodeURIComponent(params.instanceName)}`,
  });

  if (!webhookResult.ok) {
    throw new EvolutionConnectError('evolution_webhook_configure_failed', {
      detail: sanitizeErrorDetail(webhookResult.responseText || 'empty_response'),
      status: webhookResult.status,
    });
  }

  if (!qrDataUrl) {
    const connectResult = await requestEvolution({
      method: 'GET',
      path: `/instance/connect/${encodeURIComponent(params.instanceName)}`,
      timeoutMs: 40_000,
    });

    if (!connectResult.ok) {
      throw new EvolutionConnectError('evolution_qr_fetch_failed', {
        detail: sanitizeErrorDetail(connectResult.responseText || 'empty_response'),
        status: connectResult.status,
      });
    }

    qrDataUrl = await extractQrFromPayload(connectResult.payload);
  }

  if (!qrDataUrl) {
    throw new EvolutionConnectError('evolution_qr_response_missing_image');
  }

  return {
    instanceName: params.instanceName,
    qrDataUrl,
  };
};

export const sendEvolutionText = async (params: {
  body: string;
  instanceName: string;
  to: string;
}) => {
  const result = await requestEvolution({
    body: {
      number: params.to.replace(/\D/g, ''),
      text: params.body,
    },
    method: 'POST',
    path: `/message/sendText/${encodeURIComponent(params.instanceName)}`,
  });

  if (!result.ok) {
    throw new EvolutionConnectError('evolution_send_text_failed', {
      detail: sanitizeErrorDetail(result.responseText || 'empty_response'),
      status: result.status,
    });
  }

  const root = getRecord(result.payload);
  const message = getRecord(root?.message);

  return getString(root, ['id', 'messageId'])
    || getString(message, ['id', 'messageId'])
    || undefined;
};

export const isEvolutionConnectConfigured = () => {
  return Boolean(Env.EVOLUTION_API_BASE_URL && Env.EVOLUTION_API_KEY);
};
