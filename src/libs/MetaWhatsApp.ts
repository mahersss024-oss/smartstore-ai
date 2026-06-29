import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { channelConnectionsTable } from '@/models/Schema';
import { db } from './DB';
import { decryptSecret } from './PlatformAIProviderConfig';

// WhatsApp Cloud API (graph) version. Kept as a constant so the lib stays
// self-contained; can be promoted to an env var later if a pin is needed.
const GRAPH_API_VERSION = 'v25.0';
const GRAPH_API_BASE = 'https://graph.facebook.com';
const WHATSAPP_CHANNEL = 'whatsapp';

// WhatsApp interactive limits — truncate defensively so a send never 400s.
const BUTTON_TITLE_MAX = 20;
const LIST_TITLE_MAX = 24;
const LIST_DESCRIPTION_MAX = 72;
const MAX_REPLY_BUTTONS = 3;
const MAX_LIST_ROWS = 10;

const truncate = (value: string, max: number) => {
  const trimmed = value.trim();

  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1).trimEnd()}…`;
};

export const buildMetaAppSecretProof = (params: {
  accessToken: string;
  appSecret: string;
}) => {
  return createHmac('sha256', params.appSecret).update(params.accessToken).digest('hex');
};

export type MetaInboundMessage = {
  body: string;
  from: string;
  /** Set when the customer tapped a reply button / list row — the payload id. */
  interactiveReplyId?: string;
  messageId: string;
  phoneNumberId: string;
  profileName?: string;
};

export type MetaWebhookStatusError = {
  code?: number;
  details?: string;
  message?: string;
  title?: string;
};

export type MetaWebhookStatusUpdate = {
  errors?: MetaWebhookStatusError[];
  messageId: string;
  phoneNumberId: string;
  recipientId?: string;
  status: string;
  timestamp?: string;
};

export type MetaReplyButton = {
  id: string;
  title: string;
};

export type MetaListRow = {
  description?: string;
  id: string;
  title: string;
};

export type MetaStoreConnection = {
  accessToken: string;
  displayPhoneNumber?: string;
  organizationId: string;
  phoneNumberId: string;
};

type MetaConnectionConfig = {
  displayPhoneNumber?: null | string;
  encryptedAccessToken?: null | string;
  phoneNumberId?: null | string;
  provider?: null | string;
  wabaId?: null | string;
};

type MetaGraphErrorResponse = {
  error?: {
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
    message?: string;
    type?: string;
  };
};

export class MetaWhatsAppSendError extends Error {
  code?: number;
  fbtraceId?: string;
  status: number;
  subcode?: number;
  type?: string;

  constructor(params: {
    code?: number;
    fbtraceId?: string;
    message?: string;
    status: number;
    subcode?: number;
    type?: string;
  }) {
    const details = [
      `status=${params.status}`,
      params.code === undefined ? undefined : `code=${params.code}`,
      params.subcode === undefined ? undefined : `subcode=${params.subcode}`,
      params.type ? `type=${params.type}` : undefined,
      params.fbtraceId ? `fbtrace_id=${params.fbtraceId}` : undefined,
      params.message ? `message="${params.message}"` : undefined,
    ].filter(Boolean).join(' ');

    super(`Meta WhatsApp send failed: ${details}`);
    this.name = 'MetaWhatsAppSendError';
    this.code = params.code;
    this.fbtraceId = params.fbtraceId;
    this.status = params.status;
    this.subcode = params.subcode;
    this.type = params.type;
  }
}

/**
 * Verify the `X-Hub-Signature-256` header Meta sends with every webhook POST.
 * The signature is HMAC-SHA256(rawBody) keyed with the Meta app secret, prefixed
 * with `sha256=`. Uses a constant-time comparison.
 */
export const verifyMetaSignature = (
  rawBody: string,
  signatureHeader: null | string,
  appSecret: string,
): boolean => {
  if (!signatureHeader || !appSecret) {
    return false;
  }

  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const receivedBuffer = Buffer.from(signatureHeader, 'utf8');

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return timingSafeEqual(expectedBuffer, receivedBuffer);
};

/**
 * Normalize a Meta WhatsApp webhook payload into a single inbound message, or
 * `null` for anything we do not act on (status updates, empty changes, etc.).
 * Handles plain text and interactive (button / list) replies.
 */
export const parseMetaWebhookPayload = (payload: unknown): MetaInboundMessage | null => {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const entry = (payload as { entry?: unknown[] }).entry?.[0] as
    | { changes?: unknown[] }
    | undefined;
  const change = entry?.changes?.[0] as
    | { value?: Record<string, unknown> }
    | undefined;
  const value = change?.value;

  if (!value) {
    return null;
  }

  const metadata = value.metadata as { phone_number_id?: string } | undefined;
  const phoneNumberId = metadata?.phone_number_id;
  const message = (value.messages as unknown[] | undefined)?.[0] as
    | Record<string, unknown>
    | undefined;

  if (!phoneNumberId || !message) {
    return null;
  }

  const from = typeof message.from === 'string' ? message.from : '';
  const messageId = typeof message.id === 'string' ? message.id : '';

  if (!from || !messageId) {
    return null;
  }

  const contacts = value.contacts as
    | Array<{ profile?: { name?: string } }>
    | undefined;
  const profileName = contacts?.[0]?.profile?.name;

  let body = '';
  let interactiveReplyId: string | undefined;

  if (message.type === 'text') {
    body = (message.text as { body?: string } | undefined)?.body ?? '';
  } else if (message.type === 'interactive') {
    const interactive = message.interactive as
      | { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string }; type?: string }
      | undefined;
    const reply = interactive?.button_reply ?? interactive?.list_reply;
    interactiveReplyId = reply?.id;
    body = reply?.title ?? '';
  } else {
    // Unsupported message type (image, audio, location, ...) — surface no body.
    return null;
  }

  if (!body && !interactiveReplyId) {
    return null;
  }

  return {
    body,
    from,
    interactiveReplyId,
    messageId,
    phoneNumberId,
    profileName,
  };
};

export const parseMetaWebhookStatusUpdates = (payload: unknown): MetaWebhookStatusUpdate[] => {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const entry = (payload as { entry?: unknown[] }).entry?.[0] as
    | { changes?: unknown[] }
    | undefined;
  const change = entry?.changes?.[0] as
    | { value?: Record<string, unknown> }
    | undefined;
  const value = change?.value;

  if (!value) {
    return [];
  }

  const metadata = value.metadata as { phone_number_id?: string } | undefined;
  const phoneNumberId = metadata?.phone_number_id;
  const statuses = value.statuses as unknown[] | undefined;

  if (!phoneNumberId || !Array.isArray(statuses)) {
    return [];
  }

  return statuses
    .flatMap((statusUpdate): MetaWebhookStatusUpdate[] => {
      if (!statusUpdate || typeof statusUpdate !== 'object') {
        return [];
      }

      const status = statusUpdate as Record<string, unknown>;
      const messageId = typeof status.id === 'string' ? status.id : '';
      const deliveryStatus = typeof status.status === 'string' ? status.status : '';

      if (!messageId || !deliveryStatus) {
        return [];
      }

      const errors = Array.isArray(status.errors)
        ? status.errors
            .flatMap((error): MetaWebhookStatusError[] => {
              if (!error || typeof error !== 'object') {
                return [];
              }

              const record = error as Record<string, unknown>;
              const errorData = record.error_data as Record<string, unknown> | undefined;

              return [{
                code: typeof record.code === 'number' ? record.code : undefined,
                details: typeof errorData?.details === 'string' ? errorData.details : undefined,
                message: typeof record.message === 'string' ? record.message : undefined,
                title: typeof record.title === 'string' ? record.title : undefined,
              }];
            })
        : undefined;

      return [{
        errors,
        messageId,
        phoneNumberId,
        recipientId: typeof status.recipient_id === 'string' ? status.recipient_id : undefined,
        status: deliveryStatus,
        timestamp: typeof status.timestamp === 'string' ? status.timestamp : undefined,
      }];
    });
};

const sendMetaPayload = async (params: {
  accessToken: string;
  appSecret: string;
  payload: Record<string, unknown>;
  phoneNumberId: string;
  to: string;
}): Promise<string | undefined> => {
  if (!params.appSecret.trim()) {
    throw new MetaWhatsAppSendError({
      message: 'meta_app_secret_missing',
      status: 0,
    });
  }

  const url = new URL(`${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${params.phoneNumberId}/messages`);
  url.searchParams.set('appsecret_proof', buildMetaAppSecretProof({
    accessToken: params.accessToken,
    appSecret: params.appSecret,
  }));

  const response = await fetch(
    url,
    {
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: params.to,
        ...params.payload,
      }),
      headers: {
        'Authorization': `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  );

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    let parsedError: MetaGraphErrorResponse['error'];

    try {
      parsedError = (JSON.parse(detail) as MetaGraphErrorResponse).error;
    } catch {
      parsedError = undefined;
    }

    throw new MetaWhatsAppSendError({
      code: parsedError?.code,
      fbtraceId: parsedError?.fbtrace_id,
      message: parsedError?.message ?? (detail ? 'unparseable_meta_error' : undefined),
      status: response.status,
      subcode: parsedError?.error_subcode,
      type: parsedError?.type,
    });
  }

  const data = (await response.json()) as { messages?: Array<{ id?: string }> };

  return data.messages?.[0]?.id;
};

export const sendMetaWhatsAppText = async (params: {
  accessToken: string;
  appSecret: string;
  body: string;
  phoneNumberId: string;
  to: string;
}) => {
  return sendMetaPayload({
    accessToken: params.accessToken,
    appSecret: params.appSecret,
    payload: {
      text: { body: params.body, preview_url: false },
      type: 'text',
    },
    phoneNumberId: params.phoneNumberId,
    to: params.to,
  });
};

export const sendMetaWhatsAppButtons = async (params: {
  accessToken: string;
  appSecret: string;
  body: string;
  buttons: MetaReplyButton[];
  phoneNumberId: string;
  to: string;
}) => {
  const buttons = params.buttons.slice(0, MAX_REPLY_BUTTONS).map(button => ({
    reply: { id: button.id, title: truncate(button.title, BUTTON_TITLE_MAX) },
    type: 'reply',
  }));

  return sendMetaPayload({
    accessToken: params.accessToken,
    appSecret: params.appSecret,
    payload: {
      interactive: {
        action: { buttons },
        body: { text: params.body },
        type: 'button',
      },
      type: 'interactive',
    },
    phoneNumberId: params.phoneNumberId,
    to: params.to,
  });
};

export const sendMetaWhatsAppList = async (params: {
  accessToken: string;
  appSecret: string;
  body: string;
  buttonLabel: string;
  phoneNumberId: string;
  rows: MetaListRow[];
  sectionTitle?: string;
  to: string;
}) => {
  const rows = params.rows.slice(0, MAX_LIST_ROWS).map(row => ({
    description: row.description ? truncate(row.description, LIST_DESCRIPTION_MAX) : undefined,
    id: row.id,
    title: truncate(row.title, LIST_TITLE_MAX),
  }));

  return sendMetaPayload({
    accessToken: params.accessToken,
    appSecret: params.appSecret,
    payload: {
      interactive: {
        action: {
          button: truncate(params.buttonLabel, BUTTON_TITLE_MAX),
          sections: [{ rows, title: params.sectionTitle ? truncate(params.sectionTitle, LIST_TITLE_MAX) : undefined }],
        },
        body: { text: params.body },
        type: 'list',
      },
      type: 'interactive',
    },
    phoneNumberId: params.phoneNumberId,
    to: params.to,
  });
};

/**
 * Resolve the store connection that owns the inbound number. Mirrors the previous
 * lookup but keys on the Cloud-API `phoneNumberId` (Meta sends it in the webhook
 * metadata) and decrypts the per-tenant access token.
 */
export const findMetaStoreConnection = async (
  phoneNumberId: string,
): Promise<MetaStoreConnection | null> => {
  const rows = await db
    .select({
      config: channelConnectionsTable.config,
      connectionStatus: channelConnectionsTable.connectionStatus,
      isActive: channelConnectionsTable.isActive,
      organizationId: channelConnectionsTable.organizationId,
    })
    .from(channelConnectionsTable)
    .where(
      and(
        eq(channelConnectionsTable.channel, WHATSAPP_CHANNEL),
        eq(channelConnectionsTable.isActive, true),
        sql`${channelConnectionsTable.config}->>'provider' = 'meta'`,
        sql`${channelConnectionsTable.config}->>'phoneNumberId' = ${phoneNumberId}`,
      ),
    );

  for (const row of rows) {
    const config = row.config as MetaConnectionConfig | null;
    const accessToken = config?.encryptedAccessToken
      ? decryptSecret(config.encryptedAccessToken)
      : undefined;

    if (
      config
      && config.provider === 'meta'
      && typeof config.phoneNumberId === 'string'
      && accessToken
      && row.connectionStatus === 'connected'
      && row.isActive
    ) {
      return {
        accessToken,
        displayPhoneNumber: typeof config.displayPhoneNumber === 'string'
          ? config.displayPhoneNumber
          : undefined,
        organizationId: row.organizationId,
        phoneNumberId: config.phoneNumberId,
      };
    }
  }

  return null;
};
