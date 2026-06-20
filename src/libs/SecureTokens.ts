import { createHash, timingSafeEqual } from 'node:crypto';

const digestToken = (value: string) => {
  return createHash('sha256').update(value).digest();
};

export const secureTokenEquals = (
  actual: null | string | undefined,
  expected: null | string | undefined,
) => {
  if (!actual || !expected) {
    return false;
  }

  return timingSafeEqual(digestToken(actual), digestToken(expected));
};
