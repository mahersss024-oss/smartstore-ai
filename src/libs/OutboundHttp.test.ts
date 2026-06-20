import * as dns from 'node:dns/promises';
import { describe, expect, it, vi } from 'vitest';
import { assertSafeOutboundUrl, isPrivateNetworkAddress } from './OutboundHttp';

vi.mock('node:dns/promises', () => ({
  lookup: vi.fn(),
}));

describe('OutboundHttp', () => {
  it.each([
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.168.1.1',
    '::1',
    'fc00::1',
    'fe80::1',
  ])('recognizes private or non-routable address %s', (address) => {
    expect(isPrivateNetworkAddress(address)).toBe(true);
  });

  it.each([
    '1.1.1.1',
    '8.8.8.8',
    '2606:4700:4700::1111',
  ])('accepts public address %s', (address) => {
    expect(isPrivateNetworkAddress(address)).toBe(false);
  });

  it('treats a non-IP hostname string as private in isPrivateNetworkAddress', () => {
    expect(isPrivateNetworkAddress('internal.corp')).toBe(true);
    expect(isPrivateNetworkAddress('localhost')).toBe(true);
  });

  it('recognizes IPv4-mapped IPv6 private addresses', () => {
    expect(isPrivateNetworkAddress('::ffff:10.0.0.1')).toBe(true);
    expect(isPrivateNetworkAddress('::ffff:192.168.1.1')).toBe(true);
  });

  it('accepts IPv4-mapped IPv6 public addresses', () => {
    expect(isPrivateNetworkAddress('::ffff:1.1.1.1')).toBe(false);
  });

  it('recognizes the loopback alias :: as private', () => {
    expect(isPrivateNetworkAddress('::')).toBe(true);
  });

  it('allows localhost HTTP only when explicitly enabled for development', async () => {
    await expect(assertSafeOutboundUrl('http://localhost:11434', {
      allowLocalDevelopment: true,
    })).resolves.toBeInstanceOf(URL);

    await expect(assertSafeOutboundUrl('http://localhost:11434'))
      .rejects
      .toThrow('HTTPS');
  });

  it('rejects URL credentials and private IP literals', async () => {
    await expect(assertSafeOutboundUrl('https://user:pass@example.com'))
      .rejects
      .toThrow('credentials');
    await expect(assertSafeOutboundUrl('https://127.0.0.1'))
      .rejects
      .toThrow('private network');
  });

  it('resolves a public hostname and returns the URL', async () => {
    vi.mocked(dns.lookup).mockResolvedValueOnce([{ address: '1.1.1.1', family: 4 }] as any);

    await expect(assertSafeOutboundUrl('https://api.example.com/path')).resolves.toBeInstanceOf(URL);
  });

  it('rejects a hostname that resolves to a private address', async () => {
    vi.mocked(dns.lookup).mockResolvedValueOnce([{ address: '192.168.1.1', family: 4 }] as any);

    await expect(assertSafeOutboundUrl('https://internal.example.com')).rejects.toThrow('private network');
  });

  it('rejects a hostname that resolves to no addresses', async () => {
    vi.mocked(dns.lookup).mockResolvedValueOnce([] as any);

    await expect(assertSafeOutboundUrl('https://nonexistent.example.com')).rejects.toThrow('private network');
  });
});
