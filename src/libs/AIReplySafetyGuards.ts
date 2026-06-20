type GuardResult = {
  guarded: boolean;
  reason?: string;
  reply: string;
};

export type SafetyAllowedPrivateData = {
  emails?: Array<null | string | undefined>;
  phoneNumbers?: Array<null | string | undefined>;
};

const countMatches = (value: string, pattern: RegExp) => {
  return value.match(pattern)?.length ?? 0;
};

const countArabicMojibakeMarkers = (reply: string) => {
  const markers = [
    '\u0637\u00A7',
    '\u0637\u00A3',
    '\u0637\u00A5',
    '\u0637\u06BE',
    '\u0637\u0679',
    '\u0638\u201E',
    '\u0638\u2026',
    '\u0638\u2020',
    '\u0638\u0679',
    '\u0638\u02C6',
  ];

  return markers.reduce((total, marker) => {
    return total + reply.split(marker).length - 1;
  }, 0);
};

const hasBrokenTextEncoding = (reply: string) => {
  if (reply.includes('\uFFFD') || /\?{3,}/.test(reply)) {
    return true;
  }

  // These code points commonly appear when UTF-8 bytes are decoded as a
  // single-byte encoding. Requiring several markers avoids blocking names or
  // ordinary borrowed words that happen to contain one such character.
  const suspiciousMarkers = countMatches(reply, /[ÃÂØÙ]/g)
    + countMatches(reply, /â[€™œžŸ]/g);
  const arabicMojibakeMarkers = countArabicMojibakeMarkers(reply);
  const hasMixedArabicAndHanToken = reply
    .split(/\s+/)
    .some(token => /[\u0600-\u06FF]/u.test(token) && /\p{Script=Han}/u.test(token));
  const hasArabicText = /[\u0600-\u06FF]/u.test(reply);
  const hasUnexpectedHanText = hasArabicText && /\p{Script=Han}/u.test(reply);

  return suspiciousMarkers >= 4
    || arabicMojibakeMarkers >= 3
    || hasMixedArabicAndHanToken
    || hasUnexpectedHanText;
};

/**
 * This guard validates transport/encoding integrity only. Language and dialect
 * suitability require conversation context and are reviewed semantically by
 * the model reviewer.
 */
export const guardReplyLanguageAndDialect = (params: {
  customerMessage?: string;
  locale?: string;
  reply: string;
}): GuardResult => {
  if (hasBrokenTextEncoding(params.reply)) {
    return {
      guarded: true,
      reason: 'broken_text_encoding',
      reply: params.reply,
    };
  }

  return {
    guarded: false,
    reply: params.reply,
  };
};

const normalizePrivateDigits = (value: string) => value.replace(/\D/g, '');

const normalizeAllowedPrivateValues = (values: Array<null | string | undefined> | undefined) => {
  return new Set((values ?? [])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .flatMap(value => [value.trim().toLocaleLowerCase(), normalizePrivateDigits(value)])
    .filter(value => value.length > 0));
};

const secretValuePatterns = [
  /\b(?:sk|pk)_(?:live|test)_[\w-]{12,}\b/,
  /\bwhsec_[\w-]{12,}\b/,
  /\bEA\w{35,}\b/,
  /\b(?:api[_-]?key|secret|token)\s*[:=]\s*[\w.-]{16,}\b/i,
];

const hasSecretLikeValue = (reply: string) => {
  return secretValuePatterns.some(pattern => pattern.test(reply));
};

/**
 * Detects concrete contact data that is not present in the current customer's
 * trusted context. It returns validation metadata and never writes a customer
 * response.
 */
export const guardCustomerPrivacyReply = (params: {
  allowedPrivateData?: SafetyAllowedPrivateData;
  reply: string;
}): GuardResult => {
  const allowedEmails = normalizeAllowedPrivateValues(params.allowedPrivateData?.emails);
  const allowedPhones = normalizeAllowedPrivateValues(params.allowedPrivateData?.phoneNumbers);

  if (hasSecretLikeValue(params.reply)) {
    return {
      guarded: true,
      reason: 'private_secret_leak',
      reply: params.reply,
    };
  }

  const replyEmails = params.reply.match(/[\w.%+-]+@[\w.-]+\.[A-Z]{2,}/gi) ?? [];
  const leakedEmail = replyEmails.find(email => !allowedEmails.has(email.toLocaleLowerCase()));

  if (leakedEmail) {
    return {
      guarded: true,
      reason: 'private_email_leak',
      reply: params.reply,
    };
  }

  const replyPhones = params.reply.match(/(?:\+?\d[\s().-]*){9,16}/g) ?? [];
  const leakedPhone = replyPhones.find((phone) => {
    const normalizedPhone = normalizePrivateDigits(phone);

    return normalizedPhone.length >= 9 && !allowedPhones.has(normalizedPhone);
  });

  if (leakedPhone) {
    return {
      guarded: true,
      reason: 'private_phone_leak',
      reply: params.reply,
    };
  }

  return {
    guarded: false,
    reply: params.reply,
  };
};
