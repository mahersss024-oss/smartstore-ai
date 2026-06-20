import { Env } from './Env';
import { getTwilioClient } from './TwilioClient';

export type OtpSendResult
  = | { success: true }
    | { success: false; error: 'not_configured' | 'invalid_phone' | 'rate_limited' | 'send_failed' };

export type OtpCheckResult
  = | { success: true }
    | { success: false; error: 'not_configured' | 'invalid_code' | 'expired' | 'check_failed' };

const normalizePhone = (phone: string) => {
  const cleaned = phone.trim().replace(/\s+/g, '');

  if (!cleaned) {
    return null;
  }

  if (cleaned.startsWith('+')) {
    return cleaned;
  }

  return `+${cleaned}`;
};

export const sendOtp = async (rawPhone: string): Promise<OtpSendResult> => {
  if (!Env.TWILIO_VERIFY_SERVICE_SID) {
    return { error: 'not_configured', success: false };
  }

  const phone = normalizePhone(rawPhone);

  if (!phone || phone.length < 8) {
    return { error: 'invalid_phone', success: false };
  }

  try {
    const client = getTwilioClient();

    const verification = await client.verify.v2
      .services(Env.TWILIO_VERIFY_SERVICE_SID)
      .verifications
      .create({ channel: 'sms', to: phone });

    if (verification.status === 'pending') {
      return { success: true };
    }

    return { error: 'send_failed', success: false };
  } catch (err: unknown) {
    const code = (err as { code?: number }).code;

    if (code === 60203 || code === 60212) {
      return { error: 'rate_limited', success: false };
    }

    return { error: 'send_failed', success: false };
  }
};

export const checkOtp = async (rawPhone: string, code: string): Promise<OtpCheckResult> => {
  if (!Env.TWILIO_VERIFY_SERVICE_SID) {
    return { error: 'not_configured', success: false };
  }

  const phone = normalizePhone(rawPhone);

  if (!phone) {
    return { error: 'invalid_code', success: false };
  }

  const trimmedCode = code.trim();

  if (!/^\d{4,8}$/.test(trimmedCode)) {
    return { error: 'invalid_code', success: false };
  }

  try {
    const client = getTwilioClient();

    const check = await client.verify.v2
      .services(Env.TWILIO_VERIFY_SERVICE_SID)
      .verificationChecks
      .create({ code: trimmedCode, to: phone });

    if (check.status === 'approved') {
      return { success: true };
    }

    if (check.status === 'expired') {
      return { error: 'expired', success: false };
    }

    return { error: 'invalid_code', success: false };
  } catch {
    return { error: 'check_failed', success: false };
  }
};
