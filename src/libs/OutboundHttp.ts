import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const DEFAULT_OUTBOUND_TIMEOUT_MS = 20_000;

const isPrivateIpv4 = (address: string) => {
  const octets = address.split('.').map(Number);
  const [first, second] = octets;

  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet))) {
    return true;
  }

  return first === 0
    || first === 10
    || first === 127
    || (first === 100 && second! >= 64 && second! <= 127)
    || (first === 169 && second === 254)
    || (first === 172 && second! >= 16 && second! <= 31)
    || (first === 192 && second === 168)
    || first! >= 224;
};

const isPrivateIpv6 = (address: string) => {
  const normalized = address.toLowerCase().split('%')[0] ?? '';

  if (
    normalized === '::'
    || normalized === '::1'
    || normalized.startsWith('fc')
    || normalized.startsWith('fd')
    || /^fe[89ab]/.test(normalized)
  ) {
    return true;
  }

  const mappedIpv4 = normalized.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];

  return mappedIpv4 ? isPrivateIpv4(mappedIpv4) : false;
};

export const isPrivateNetworkAddress = (address: string) => {
  const version = isIP(address);

  if (version === 4) {
    return isPrivateIpv4(address);
  }

  if (version === 6) {
    return isPrivateIpv6(address);
  }

  return true;
};

export const assertSafeOutboundUrl = async (
  value: string,
  options?: {
    allowLocalDevelopment?: boolean;
  },
) => {
  const url = new URL(value);

  if (url.protocol !== 'https:') {
    if (
      options?.allowLocalDevelopment
      && url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    ) {
      return url;
    }

    throw new Error('Outbound URL must use HTTPS');
  }

  if (url.username || url.password) {
    throw new Error('Outbound URL credentials are not allowed');
  }

  if (url.hostname === 'localhost' || isIP(url.hostname)) {
    if (!options?.allowLocalDevelopment || url.hostname !== 'localhost') {
      if (url.hostname === 'localhost' || isPrivateNetworkAddress(url.hostname)) {
        throw new Error('Outbound URL resolves to a private network');
      }
    }
  }

  if (!isIP(url.hostname)) {
    const addresses = await lookup(url.hostname, { all: true, verbatim: true });

    if (
      addresses.length === 0
      || addresses.some(result => isPrivateNetworkAddress(result.address))
    ) {
      throw new Error('Outbound URL resolves to a private network');
    }
  }

  return url;
};

export const fetchWithTimeout = async (
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_OUTBOUND_TIMEOUT_MS,
) => {
  return fetch(input, {
    ...init,
    redirect: 'error',
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
};
