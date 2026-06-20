import { describe, expect, it } from 'vitest';
import {
  customerPhonesMatch,
  getCustomerPhoneIdentityVariants,
} from './CustomerIdentity';

describe('CustomerIdentity', () => {
  it('builds equivalent Saudi phone variants', () => {
    expect(getCustomerPhoneIdentityVariants('+966 54 976 4152')).toEqual(
      expect.arrayContaining(['966549764152', '0549764152']),
    );
    expect(getCustomerPhoneIdentityVariants('549764152')).toEqual(
      expect.arrayContaining(['549764152', '0549764152', '966549764152']),
    );
  });

  it('matches only complete equivalent phone identities', () => {
    expect(customerPhonesMatch('0549764152', '+966 54 976 4152')).toBe(true);
    expect(customerPhonesMatch('549764152', '00966549764152')).toBe(true);
    expect(customerPhonesMatch('0501234567', '966501234567')).toBe(true);
  });

  it('rejects different numbers that share the same final seven digits', () => {
    expect(customerPhonesMatch('0501234567', '0591234567')).toBe(false);
    expect(customerPhonesMatch('966501234567', '966591234567')).toBe(false);
  });

  it('rejects empty or incomplete identities', () => {
    expect(customerPhonesMatch('', '966549764152')).toBe(false);
    expect(customerPhonesMatch(undefined, '966549764152')).toBe(false);
    expect(customerPhonesMatch('1234567', '991234567')).toBe(false);
  });
});
