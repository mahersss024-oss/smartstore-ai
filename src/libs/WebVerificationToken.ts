import { Buffer } from 'node:buffer';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Env } from './Env';

// Pattern B web verification: instead of an SMS OTP, a customer proves they own
// their phone number by opening a link delivered *inside their WhatsApp
// conversation*. The link carries an HMAC-signed token of {organizationId,
// phone, expiry}; only the server (which holds the signing key) can mint it, so
// a web visitor cannot forge access to another customer's verified phone.

const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;
const TOKEN_SEPARATOR = '.';

export type WebVerificationPayload = {
  organizationId: string;
  phone: string;
};

const getSigningKey = () => Env.PLATFORM_SECRETS_ENCRYPTION_KEY ?? '';

const sign = (encodedPayload: string, key: string) => {
  return createHmac('sha256', key).update(encodedPayload).digest('base64url');
};

export const signWebVerificationToken = (params: {
  organizationId: string;
  phone: string;
  ttlMs?: number;
}): string => {
  const key = getSigningKey();

  if (!key) {
    throw new Error('Web verification signing key is not configured');
  }

  const expiresAt = Date.now() + (params.ttlMs ?? DEFAULT_TTL_MS);
  const encodedPayload = Buffer
    .from(`${params.organizationId}${TOKEN_SEPARATOR}${params.phone}${TOKEN_SEPARATOR}${expiresAt}`, 'utf8')
    .toString('base64url');

  return `${encodedPayload}${TOKEN_SEPARATOR}${sign(encodedPayload, key)}`;
};

export const verifyWebVerificationToken = (token: string): WebVerificationPayload | null => {
  const key = getSigningKey();

  if (!key || !token) {
    return null;
  }

  const [encodedPayload, signature] = token.split(TOKEN_SEPARATOR);

  if (!encodedPayload || !signature) {
    return null;
  }

  const expected = sign(encodedPayload, key);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (signatureBuffer.length !== expectedBuffer.length || !timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }

  const [organizationId, phone, expiresAtRaw] = Buffer
    .from(encodedPayload, 'base64url')
    .toString('utf8')
    .split(TOKEN_SEPARATOR);
  const expiresAt = Number(expiresAtRaw);

  if (!organizationId || !phone || !Number.isFinite(expiresAt) || expiresAt < Date.now()) {
    return null;
  }

  return { organizationId, phone };
};

/**
 * Build the verified web-order link to surface inside a WhatsApp conversation.
 * Locale is left to the app's middleware to prefix.
 */
export const buildWebVerificationLink = (params: {
  organizationId: string;
  phone: string;
  ttlMs?: number;
}): string => {
  const base = (Env.NEXT_PUBLIC_APP_URL ?? '').replace(/\/+$/, '');
  const token = signWebVerificationToken(params);

  return `${base}/web-order/${params.organizationId}?vt=${token}`;
};
