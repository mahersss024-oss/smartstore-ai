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

export type MetaInboundMessage = {
  body: string;
  from: string;
  /** Set when the customer tapped a reply button / list row — the payload id. */
  interactiveReplyId?: string;
  messageId: string;
  phoneNumberId: string;
  profileName?: string;
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

const sendMetaPayload = async (params: {
  accessToken: string;
  payload: Record<string, unknown>;
  phoneNumberId: string;
  to: string;
}): Promise<string | undefined> => {
  const response = await fetch(
    `${GRAPH_API_BASE}/${GRAPH_API_VERSION}/${params.phoneNumberId}/messages`,
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

    throw new Error(`Meta WhatsApp send failed: ${response.status} ${detail}`);
  }

  const data = (await response.json()) as { messages?: Array<{ id?: string }> };

  return data.messages?.[0]?.id;
};

export const sendMetaWhatsAppText = async (params: {
  accessToken: string;
  body: string;
  phoneNumberId: string;
  to: string;
}) => {
  return sendMetaPayload({
    accessToken: params.accessToken,
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
