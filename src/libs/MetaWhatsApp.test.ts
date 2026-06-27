import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildMetaAppSecretProof,
  MetaWhatsAppSendError,
  parseMetaWebhookPayload,
  sendMetaWhatsAppText,
  verifyMetaSignature,
} from './MetaWhatsApp';

describe('MetaWhatsApp', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('verifyMetaSignature', () => {
    const secret = 'meta_app_secret';
    const body = JSON.stringify({ hello: 'world' });
    const signature = `sha256=${createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;

    it('accepts a correct signature', () => {
      expect(verifyMetaSignature(body, signature, secret)).toBe(true);
    });

    it('rejects a wrong secret, missing header, or tampered body', () => {
      expect(verifyMetaSignature(body, signature, 'other_secret')).toBe(false);
      expect(verifyMetaSignature(body, null, secret)).toBe(false);
      expect(verifyMetaSignature(`${body} `, signature, secret)).toBe(false);
    });
  });

  describe('parseMetaWebhookPayload', () => {
    const buildPayload = (message: unknown) => ({
      entry: [{
        changes: [{
          value: {
            contacts: [{ profile: { name: 'Maher' } }],
            messages: [message],
            metadata: { phone_number_id: '123456' },
          },
        }],
      }],
    });

    it('parses a plain text message', () => {
      const result = parseMetaWebhookPayload(buildPayload({
        from: '966500000000',
        id: 'wamid.text',
        text: { body: 'مرحبا' },
        type: 'text',
      }));

      expect(result).toEqual({
        body: 'مرحبا',
        from: '966500000000',
        interactiveReplyId: undefined,
        messageId: 'wamid.text',
        phoneNumberId: '123456',
        profileName: 'Maher',
      });
    });

    it('parses an interactive button reply into its payload id', () => {
      const result = parseMetaWebhookPayload(buildPayload({
        from: '966500000000',
        id: 'wamid.btn',
        interactive: {
          button_reply: { id: 'fulfillment:delivery', title: 'توصيل' },
          type: 'button_reply',
        },
        type: 'interactive',
      }));

      expect(result?.interactiveReplyId).toBe('fulfillment:delivery');
      expect(result?.body).toBe('توصيل');
    });

    it('parses an interactive list reply', () => {
      const result = parseMetaWebhookPayload(buildPayload({
        from: '966500000000',
        id: 'wamid.list',
        interactive: {
          list_reply: { id: 'product:15', title: 'برجر دجاج' },
          type: 'list_reply',
        },
        type: 'interactive',
      }));

      expect(result?.interactiveReplyId).toBe('product:15');
    });

    it('ignores status updates, unsupported types, and malformed payloads', () => {
      expect(parseMetaWebhookPayload({
        entry: [{ changes: [{ value: { metadata: { phone_number_id: '123' }, statuses: [{}] } }] }],
      })).toBeNull();
      expect(parseMetaWebhookPayload(buildPayload({
        from: '966',
        id: 'wamid.img',
        image: {},
        type: 'image',
      }))).toBeNull();
      expect(parseMetaWebhookPayload(null)).toBeNull();
      expect(parseMetaWebhookPayload({})).toBeNull();
    });
  });

  describe('sendMetaWhatsAppText', () => {
    it('adds appsecret_proof to Meta Graph send requests', async () => {
      const accessToken = 'EA_TEST_SECRET_TOKEN';
      const appSecret = 'meta_app_secret';
      const fetchMock = vi.fn(async () => new Response(JSON.stringify({
        messages: [{ id: 'wamid.outbound' }],
      }), { status: 200 }));

      vi.stubGlobal('fetch', fetchMock);

      await expect(sendMetaWhatsAppText({
        accessToken,
        appSecret,
        body: 'hello',
        phoneNumberId: '1173797649153295',
        to: '966549764152',
      })).resolves.toBe('wamid.outbound');

      expect(fetchMock).toHaveBeenCalledTimes(1);

      const [requestInput] = fetchMock.mock.calls[0] as unknown as [URL | string, RequestInit?];
      const requestUrl = new URL(String(requestInput));

      expect(requestUrl.searchParams.get('appsecret_proof')).toBe(buildMetaAppSecretProof({
        accessToken,
        appSecret,
      }));
    });

    it('throws a structured Meta error without leaking the access token', async () => {
      const accessToken = 'EA_TEST_SECRET_TOKEN';
      const appSecret = 'meta_app_secret';

      vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
        error: {
          code: 190,
          error_subcode: 463,
          fbtrace_id: 'trace123',
          message: 'Invalid OAuth access token.',
          type: 'OAuthException',
        },
      }), { status: 401 })));

      await expect(sendMetaWhatsAppText({
        accessToken,
        appSecret,
        body: 'hello',
        phoneNumberId: '1173797649153295',
        to: '966549764152',
      })).rejects.toMatchObject({
        code: 190,
        fbtraceId: 'trace123',
        status: 401,
        subcode: 463,
        type: 'OAuthException',
      });

      await sendMetaWhatsAppText({
        accessToken,
        appSecret,
        body: 'hello',
        phoneNumberId: '1173797649153295',
        to: '966549764152',
      }).catch((error) => {
        expect(error).toBeInstanceOf(MetaWhatsAppSendError);
        expect(error.message).not.toContain(accessToken);
      });
    });
  });
});
