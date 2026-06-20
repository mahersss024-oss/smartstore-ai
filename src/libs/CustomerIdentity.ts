export type CustomerIdentityParts = {
  email?: null | string;
  externalId?: null | string;
  phone?: null | string;
};

const normalizeCustomerPhoneDigits = (value?: null | string) => {
  return value?.replace(/\D/g, '') ?? '';
};

export const getCustomerPhoneIdentityVariants = (value?: null | string) => {
  const digits = normalizeCustomerPhoneDigits(value);
  const variants = new Set<string>();

  if (!digits) {
    return [];
  }

  variants.add(digits);

  if (digits.startsWith('00') && digits.length > 2) {
    variants.add(digits.slice(2));
  }

  if (digits.startsWith('966') && digits.length > 3) {
    variants.add(`0${digits.slice(3)}`);
  }

  if (digits.startsWith('0') && digits.length > 1) {
    variants.add(`966${digits.slice(1)}`);
  }

  if (digits.startsWith('5') && digits.length === 9) {
    variants.add(`0${digits}`);
    variants.add(`966${digits}`);
  }

  return Array.from(variants);
};

export const customerPhonesMatch = (
  first?: null | string,
  second?: null | string,
) => {
  const firstVariants = getCustomerPhoneIdentityVariants(first);

  if (firstVariants.length === 0) {
    return false;
  }

  const secondVariants = new Set(getCustomerPhoneIdentityVariants(second));

  return secondVariants.size > 0
    && firstVariants.some(variant => secondVariants.has(variant));
};

export const getCustomerIdentityKeys = (identity: CustomerIdentityParts) => {
  const keys = new Set<string>();
  const email = identity.email?.trim().toLowerCase();
  const externalId = identity.externalId?.trim();

  if (email) {
    keys.add(`email:${email}`);
  }

  if (externalId) {
    keys.add(`external:${externalId}`);
  }

  for (const phone of getCustomerPhoneIdentityVariants(identity.phone)) {
    keys.add(`phone:${phone}`);
  }

  for (const phone of getCustomerPhoneIdentityVariants(identity.externalId)) {
    keys.add(`phone:${phone}`);
  }

  return Array.from(keys);
};
