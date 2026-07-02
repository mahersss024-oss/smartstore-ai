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

  return redacted.slice(0, 1200);
};

type WhapiCreateChannelAuthMode = 'bearer' | 'query';
type WhapiCreateChannelPath = '/channel' | '/channels';
type WhapiProjectProbePath = '/projects' | `/projects/${string}`;

type WhapiCreateChannelAttemptResult = {
  authMode: WhapiCreateChannelAuthMode;
  path: WhapiCreateChannelPath | WhapiProjectProbePath;
  response: Response;
  responseText: string;
};

const buildWhapiManagerUrl = (path: string) => {
  const base = Env.WHAPI_PARTNER_API_BASE.replace(/\/+$/, '');

  return new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);
};

const createWhapiChannelRequest = async (params: {
  authMode: WhapiCreateChannelAuthMode;
  name: string;
  path: WhapiCreateChannelPath;
}): Promise<WhapiCreateChannelAttemptResult> => {
  const url = buildWhapiManagerUrl(params.path);
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
    path: params.path,
    response,
    responseText,
  };
};

const probeWhapiProjectRequest = async (
  authMode: WhapiCreateChannelAuthMode,
): Promise<WhapiCreateChannelAttemptResult> => {
  const path = '/projects' as const;
  const url = buildWhapiManagerUrl(path);
  const headers: Record<string, string> = {};

  if (authMode === 'query') {
    url.searchParams.set('token', Env.WHAPI_PARTNER_API_TOKEN ?? '');
  } else {
    headers.Authorization = `Bearer ${Env.WHAPI_PARTNER_API_TOKEN}`;
  }

  const response = await fetch(url.toString(), {
    headers,
    method: 'GET',
  });
  const responseText = await response.text().catch(() => '');

  return {
    authMode,
    path,
    response,
    responseText,
  };
};

const probeWhapiProjectByIdRequest = async (
  authMode: WhapiCreateChannelAuthMode,
): Promise<WhapiCreateChannelAttemptResult> => {
  const path = `/projects/${encodeURIComponent(Env.WHAPI_PROJECT_ID ?? '')}` as WhapiProjectProbePath;
  const url = buildWhapiManagerUrl(path);
  const headers: Record<string, string> = {};

  if (authMode === 'query') {
    url.searchParams.set('token', Env.WHAPI_PARTNER_API_TOKEN ?? '');
  } else {
    headers.Authorization = `Bearer ${Env.WHAPI_PARTNER_API_TOKEN}`;
  }

  const response = await fetch(url.toString(), {
    headers,
    method: 'GET',
  });
  const responseText = await response.text().catch(() => '');

  return {
    authMode,
    path,
    response,
    responseText,
  };
};

const summarizeWhapiCreateChannelAttempt = (result: WhapiCreateChannelAttemptResult) => {
  return [
    result.path,
    result.authMode,
    result.response.status,
    result.responseText || 'empty_response',
  ].join(':');
};

const responseContainsConfiguredProjectId = (responseText: string) => {
  return Boolean(Env.WHAPI_PROJECT_ID && responseText.includes(Env.WHAPI_PROJECT_ID));
};

const extractAvailableProjectIds = (responseText: string) => {
  try {
    const payload = JSON.parse(responseText) as unknown;
    const root = getRecord(payload);
    const projects = Array.isArray(root?.projects)
      ? root.projects
      : Array.isArray(root?.data)
        ? root.data
        : [];

    return projects
      .map(project => getString(getRecord(project), ['id', 'projectId', 'project_id']))
      .filter(Boolean)
      .slice(0, 10);
  } catch {
    return [];
  }
};

const probeWhapiProject = async () => {
  const results: WhapiCreateChannelAttemptResult[] = [];
  const availableProjectIds = new Set<string>();

  for (const authMode of ['bearer', 'query'] as const) {
    const result = await probeWhapiProjectRequest(authMode);

    results.push(result);
    extractAvailableProjectIds(result.responseText).forEach(id => availableProjectIds.add(id));

    if (result.response.ok && responseContainsConfiguredProjectId(result.responseText)) {
      return {
        ok: true,
        summary: results.map(summarizeWhapiCreateChannelAttempt).join(' | '),
      };
    }
  }

  for (const authMode of ['bearer', 'query'] as const) {
    const result = await probeWhapiProjectByIdRequest(authMode);

    results.push(result);

    if (result.response.ok) {
      return {
        ok: true,
        summary: results.map(summarizeWhapiCreateChannelAttempt).join(' | '),
      };
    }
  }

  if (availableProjectIds.size > 0) {
    return {
      ok: false,
      summary: [
        results.map(summarizeWhapiCreateChannelAttempt).join(' | '),
        `availableProjectIds=${[...availableProjectIds].join(',')}`,
        `configuredProjectId=${Env.WHAPI_PROJECT_ID ?? ''}`,
      ].join(' | '),
    };
  }

  return {
    ok: false,
    summary: results.map(summarizeWhapiCreateChannelAttempt).join(' | '),
  };
};

export const createWhapiManagedChannel = async (params: {
  name: string;
}) => {
  if (!Env.WHAPI_PARTNER_API_TOKEN || !Env.WHAPI_PROJECT_ID) {
    throw new WhapiConnectError('whapi_partner_credentials_missing');
  }

  const attempts = [
    { authMode: 'bearer', path: '/channels' },
    { authMode: 'bearer', path: '/channel' },
    { authMode: 'query', path: '/channels' },
    { authMode: 'query', path: '/channel' },
  ] as const;
  const results: WhapiCreateChannelAttemptResult[] = [];

  for (const attempt of attempts) {
    const result = await createWhapiChannelRequest({
      authMode: attempt.authMode,
      name: params.name,
      path: attempt.path,
    });

    results.push(result);

    if (result.response.ok) {
      try {
        return parseWhapiManagedChannel(result.responseText ? JSON.parse(result.responseText) : {});
      } catch (error) {
        if (error instanceof WhapiConnectError) {
          throw error;
        }

        throw new WhapiConnectError('whapi_channel_response_invalid');
      }
    }

    if (![401, 403, 404, 405].includes(result.response.status)) {
      break;
    }
  }

  if (results.length > 0) {
    const projectProbe = await probeWhapiProject().catch((error: unknown) => ({
      ok: false,
      summary: error instanceof Error ? error.message : 'project_probe_failed',
    }));

    throw new WhapiConnectError('whapi_channel_create_failed', {
      detail: sanitizeErrorDetail(
        [
          `create=${results.map(summarizeWhapiCreateChannelAttempt).join(' | ')}`,
          `projectProbe=${projectProbe.ok ? 'ok' : 'failed'}:${projectProbe.summary}`,
        ].join(' :: '),
      ),
      status: results.at(-1)?.response.status,
    });
  }

  throw new WhapiConnectError('whapi_channel_create_failed');
};

const callWhapiPartnerChannelAction = async (params: {
  body: Record<string, unknown>;
  channelId: string;
  errorMessage: string;
  method: 'PATCH' | 'POST';
  pathSuffix: 'extend' | 'mode' | 'restart';
}) => {
  if (!Env.WHAPI_PARTNER_API_TOKEN) {
    throw new WhapiConnectError('whapi_partner_credentials_missing');
  }

  const url = buildWhapiManagerUrl(`/channels/${encodeURIComponent(params.channelId)}/${params.pathSuffix}`);
  const response = await fetch(url.toString(), {
    body: JSON.stringify(params.body),
    headers: {
      'Authorization': `Bearer ${Env.WHAPI_PARTNER_API_TOKEN}`,
      'Content-Type': 'application/json',
      'accept': 'application/json',
    },
    method: params.method,
  });
  const responseText = await response.text().catch(() => '');

  if (!response.ok) {
    throw new WhapiConnectError(params.errorMessage, {
      detail: sanitizeErrorDetail(responseText || 'empty_response'),
      status: response.status,
    });
  }
};

export const checkWhapiManagedChannelExists = async (params: {
  channelId: string;
}) => {
  if (!Env.WHAPI_PARTNER_API_TOKEN) {
    throw new WhapiConnectError('whapi_partner_credentials_missing');
  }

  const url = buildWhapiManagerUrl(`/channels/${encodeURIComponent(params.channelId)}`);
  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${Env.WHAPI_PARTNER_API_TOKEN}`,
      accept: 'application/json',
    },
    method: 'GET',
  });

  if (response.ok) {
    return true;
  }

  const responseText = await response.text().catch(() => '');

  if (response.status === 404) {
    return false;
  }

  throw new WhapiConnectError('whapi_channel_lookup_failed', {
    detail: sanitizeErrorDetail(responseText || 'empty_response'),
    status: response.status,
  });
};

export const changeWhapiManagedChannelMode = async (params: {
  channelId: string;
  mode: 'live' | 'sandbox' | 'trial';
}) => {
  await callWhapiPartnerChannelAction({
    body: { mode: params.mode },
    channelId: params.channelId,
    errorMessage: 'whapi_channel_mode_change_failed',
    method: 'PATCH',
    pathSuffix: 'mode',
  });
};

export const extendWhapiManagedChannel = async (params: {
  channelId: string;
  comment?: string;
  days: number;
}) => {
  if (params.days <= 0) {
    return;
  }

  await callWhapiPartnerChannelAction({
    body: {
      comment: params.comment ?? '[SmartStore AI] Managed channel activation',
      days: params.days,
    },
    channelId: params.channelId,
    errorMessage: 'whapi_channel_extend_failed',
    method: 'POST',
    pathSuffix: 'extend',
  });
};

export const restartWhapiManagedChannel = async (params: {
  channelId: string;
}) => {
  await callWhapiPartnerChannelAction({
    body: {},
    channelId: params.channelId,
    errorMessage: 'whapi_channel_restart_failed',
    method: 'POST',
    pathSuffix: 'restart',
  });
};

export const activateWhapiManagedChannel = async (params: {
  channelId: string;
}) => {
  await changeWhapiManagedChannelMode({
    channelId: params.channelId,
    mode: 'live',
  });

  await extendWhapiManagedChannel({
    channelId: params.channelId,
    days: Env.WHAPI_MANAGED_CHANNEL_EXTEND_DAYS,
  });
};

export const configureWhapiChannelWebhook = async (params: {
  apiToken: string;
  webhookUrl: string;
}) => {
  const response = await fetch(`${Env.WHAPI_GATE_API_BASE.replace(/\/+$/, '')}/settings`, {
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
  const responseText = await response.text().catch(() => '');

  if (!response.ok) {
    throw new WhapiConnectError('whapi_webhook_configure_failed', {
      detail: sanitizeErrorDetail(responseText || 'empty_response'),
      status: response.status,
    });
  }
};

export const fetchWhapiQrCodeDataUrl = async (params: {
  apiToken: string;
}) => {
  const response = await fetch(`${Env.WHAPI_GATE_API_BASE.replace(/\/+$/, '')}/users/login/image`, {
    headers: {
      Authorization: `Bearer ${params.apiToken}`,
    },
    method: 'GET',
  });
  const contentType = response.headers.get('content-type') ?? '';
  const buffer = Buffer.from(await response.arrayBuffer());

  if (!response.ok) {
    throw new WhapiConnectError('whapi_qr_fetch_failed', {
      detail: sanitizeErrorDetail(buffer.toString('utf8') || 'empty_response'),
      status: response.status,
    });
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
