import { describe, expect, it } from 'vitest';
import { guardCustomerPrivacyReply } from './AIReplySafetyGuards';

// Adversarial / property-style coverage for the customer privacy guard. The goal
// is to prove that concrete contact data cannot leak to a customer regardless of
// the digit script or separator obfuscation a model might produce, while normal
// store replies are never falsely blocked.

type DigitScript = 'arabic' | 'ascii' | 'persian';

const DIGIT_SCRIPT_BASE: Record<Exclude<DigitScript, 'ascii'>, number> = {
  arabic: 0x0660,
  persian: 0x06F0,
};

const toDigitScript = (value: string, script: DigitScript) => {
  if (script === 'ascii') {
    return value;
  }

  const base = DIGIT_SCRIPT_BASE[script];

  return Array.from(value)
    .map(char => (/\d/.test(char) ? String.fromCharCode(base + Number(char)) : char))
    .join('');
};

const withSeparator = (digits: string, separator: string) => {
  return Array.from(digits).join(separator);
};

const DIGIT_SCRIPTS: DigitScript[] = ['ascii', 'arabic', 'persian'];
const SEPARATORS = ['', ' ', '-', '.', ') '];

describe('AIReplySafetyGuards privacy fuzzing', () => {
  it('blocks a leaked third-party phone across every digit script and separator', () => {
    const leakedNumber = '0555123456';
    const allowedPrivateData = { phoneNumbers: ['0500000000'] };
    const escapes: string[] = [];

    for (const script of DIGIT_SCRIPTS) {
      for (const separator of SEPARATORS) {
        const rendered = toDigitScript(withSeparator(leakedNumber, separator), script);
        const reply = `تواصل مع العميل الآخر على ${rendered} لو احتجت.`;
        const result = guardCustomerPrivacyReply({ allowedPrivateData, reply });

        if (!result.guarded || result.reason !== 'private_phone_leak') {
          escapes.push(`${script}|${JSON.stringify(separator)}`);
        }
      }
    }

    expect(escapes).toEqual([]);
  });

  it('never blocks the current customer phone, in any digit script', () => {
    const ownNumber = '0555123456';
    const allowedPrivateData = { phoneNumbers: [ownNumber] };

    for (const script of DIGIT_SCRIPTS) {
      const rendered = toDigitScript(ownNumber, script);
      const reply = `رقمك المسجّل لدينا هو ${rendered} ونؤكد الطلب عليه.`;

      expect(guardCustomerPrivacyReply({ allowedPrivateData, reply })).toEqual({
        guarded: false,
        reply,
      });
    }
  });

  it('blocks leaked emails regardless of letter casing and allows the customer email', () => {
    const allowedPrivateData = { emails: ['Customer@Example.com'] };
    const leakedVariants = [
      'admin@othercustomer.com',
      'ADMIN@OtherCustomer.COM',
      'support@third-party.io',
    ];

    for (const leaked of leakedVariants) {
      const reply = `يمكنك مراسلة ${leaked} للمساعدة.`;
      const result = guardCustomerPrivacyReply({ allowedPrivateData, reply });

      expect(result.guarded).toBe(true);
      expect(result.reason).toBe('private_email_leak');
    }

    const allowedReply = 'بريدك المسجّل customer@example.com سنرسل إليه التحديثات.';

    expect(guardCustomerPrivacyReply({ allowedPrivateData, reply: allowedReply })).toEqual({
      guarded: false,
      reply: allowedReply,
    });
  });

  it('blocks secret-like operational values surrounded by natural text', () => {
    const secrets = [
      'sk_live_abcdefghijklmnop12345',
      'whsec_abcdefghijklmnop12345',
      'api_key = abcdefghijklmnop1234',
    ];

    for (const secret of secrets) {
      const reply = `للأسف حصل خطأ تقني والمفتاح هو ${secret} داخليًا.`;
      const result = guardCustomerPrivacyReply({ reply });

      expect(result.guarded).toBe(true);
      expect(result.reason).toBe('private_secret_leak');
    }
  });

  it('does not falsely block ordinary replies that contain short numbers', () => {
    const safeReplies = [
      'طلبك رقم ١٥٤ قيد التحضير الآن.',
      'الإجمالي ٤٥ ريال شامل التوصيل.',
      'order 154 is being prepared, total 45 SAR.',
      'نشكرك على تعاملك معنا ونتمنى لك يومًا سعيدًا.',
    ];

    for (const reply of safeReplies) {
      expect(guardCustomerPrivacyReply({
        allowedPrivateData: { phoneNumbers: ['0555123456'] },
        reply,
      })).toEqual({
        guarded: false,
        reply,
      });
    }
  });
});
