import { describe, expect, it } from 'vitest';
import {
  guardCustomerPrivacyReply,
  guardReplyLanguageAndDialect,
} from './AIReplySafetyGuards';

describe('AIReplySafetyGuards', () => {
  it('guards secret-like operational keys before a reply reaches the customer', () => {
    const reply = 'The platform secret is secret: abcdefghijklmnopqrstuvwxyz.';
    const result = guardCustomerPrivacyReply({
      allowedPrivateData: {
        phoneNumbers: ['0549764152'],
      },
      reply,
    });

    expect(result).toEqual({
      guarded: true,
      reason: 'private_secret_leak',
      reply,
    });
  });

  it('guards long WhatsApp access-token-like values in replies', () => {
    const reply = 'Meta token: EAAMGoR5ZC4ekBRimSJe4CzcnxCuWv11JdwJ7P7JZC7xeNm3';

    expect(guardCustomerPrivacyReply({ reply })).toEqual({
      guarded: true,
      reason: 'private_secret_leak',
      reply,
    });
  });

  it('returns validation metadata without replacing a reply that leaks another phone number', () => {
    const reply = 'The other customer phone number is 0555555555.';
    const result = guardCustomerPrivacyReply({
      allowedPrivateData: {
        phoneNumbers: ['0549764152'],
      },
      reply,
    });

    expect(result).toEqual({
      guarded: true,
      reason: 'private_phone_leak',
      reply,
    });
  });

  it('blocks a reply that leaks an email address not in the allowed list', () => {
    const reply = 'You can also contact admin@othercustomer.com for help.';
    const result = guardCustomerPrivacyReply({
      allowedPrivateData: {
        emails: ['customer@example.com'],
      },
      reply,
    });

    expect(result).toEqual({
      guarded: true,
      reason: 'private_email_leak',
      reply,
    });
  });

  it('allows contact data that belongs to the current customer context', () => {
    const reply = 'Your registered number is 0549764152.';
    const result = guardCustomerPrivacyReply({
      allowedPrivateData: {
        phoneNumbers: ['0549764152'],
      },
      reply,
    });

    expect(result).toEqual({
      guarded: false,
      reply,
    });
  });

  it('treats the customer own number written in another format as allowed (GUARDS-2)', () => {
    const reply = 'تم تسجيل رقمك 966549764152 للتواصل.';
    const result = guardCustomerPrivacyReply({
      allowedPrivateData: {
        phoneNumbers: ['0549764152'],
      },
      reply,
    });

    expect(result.guarded).toBe(false);
  });

  it('still flags a genuinely different third-party number', () => {
    const reply = 'Call our other branch on 0500000000 instead.';
    const result = guardCustomerPrivacyReply({
      allowedPrivateData: {
        phoneNumbers: ['0549764152'],
      },
      reply,
    });

    expect(result).toMatchObject({
      guarded: true,
      reason: 'private_phone_leak',
    });
  });

  it('detects replacement characters and repeated encoding placeholders', () => {
    const replacementCharacterReply = 'The response contains \uFFFD invalid text.';
    const placeholderReply = 'The response contains ???? invalid text.';

    expect(guardReplyLanguageAndDialect({
      reply: replacementCharacterReply,
    })).toEqual({
      guarded: true,
      reason: 'broken_text_encoding',
      reply: replacementCharacterReply,
    });
    expect(guardReplyLanguageAndDialect({
      reply: placeholderReply,
    })).toEqual({
      guarded: true,
      reason: 'broken_text_encoding',
      reply: placeholderReply,
    });
  });

  it('detects several common UTF-8 decoding markers', () => {
    const reply = 'ÃÂØÙ broken transport text';

    expect(guardReplyLanguageAndDialect({ reply })).toEqual({
      guarded: true,
      reason: 'broken_text_encoding',
      reply,
    });
  });

  it('detects mojibake that appears in Arabic customer replies', () => {
    const reply = '\u0637\u06BE\u0638\u2026 \u0637\u00A7\u0637\u00AE\u0637\u06BE\u0638\u0679\u0637\u00A7\u0637\u00B1 \u0637\u00A7\u0638\u201E\u0637\u06BE\u0638\u02C6\u0637\u00B5\u0638\u0679\u0638\u201E.';

    expect(guardReplyLanguageAndDialect({ reply })).toEqual({
      guarded: true,
      reason: 'broken_text_encoding',
      reply,
    });
  });

  it('detects isolated foreign script inserted into an Arabic reply', () => {
    const reply = '\u0637\u0644\u0628\u0643 \u0631\u0642\u0645 154 \u0645\u0643\u062A\u0645\u0644. \u0646\u0634\u0643\u0631\u0643 \u0639\u0644\u0649 \u0637\u0644\u0628\u0643. \u5982\u6709 \u0623\u064A \u0645\u0644\u0627\u062D\u0638\u0627\u062A\u060C \u064A\u0645\u0643\u0646\u0643 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0644\u0648\u062D\u0629 \u0627\u0644\u062A\u0642\u064A\u064A\u0645.';

    expect(guardReplyLanguageAndDialect({ reply })).toEqual({
      guarded: true,
      reason: 'broken_text_encoding',
      reply,
    });
  });

  it('leaves language and dialect interpretation to semantic review', () => {
    const reply = 'Sure, I can help you with the available order options.';

    expect(guardReplyLanguageAndDialect({
      customerMessage: 'ابي اطلب',
      locale: 'ar',
      reply,
    })).toEqual({
      guarded: false,
      reply,
    });
  });
});
