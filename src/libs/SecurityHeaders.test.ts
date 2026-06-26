import { describe, expect, it } from 'vitest';
import { getSecurityHeaders } from './SecurityHeaders';

describe('SecurityHeaders', () => {
  it('adds production HSTS and compatible CSP report-only coverage', () => {
    const headers = getSecurityHeaders('production');
    const byKey = new Map(headers.map(header => [header.key, header.value]));

    expect(byKey.get('Strict-Transport-Security')).toBe('max-age=63072000; includeSubDomains; preload');
    expect(byKey.get('X-Content-Type-Options')).toBe('nosniff');
    expect(byKey.get('X-Frame-Options')).toBe('SAMEORIGIN');
    expect(byKey.get('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(byKey.get('Permissions-Policy')).toContain('camera=()');
    expect(byKey.get('Permissions-Policy')).toContain('bluetooth=()');
    expect(byKey.get('X-Permitted-Cross-Domain-Policies')).toBe('none');
    expect(byKey.get('Cross-Origin-Opener-Policy')).toBe('same-origin-allow-popups');

    const csp = byKey.get('Content-Security-Policy-Report-Only') ?? '';

    expect(csp).toContain('default-src \'self\'');
    expect(csp).toContain('object-src \'none\'');
    expect(csp).toContain('frame-ancestors \'self\'');
    expect(csp).toContain('https://clerk.smartstore-ai.com');
    expect(csp).toContain('https://*.sentry.io');
    expect(csp).toContain('https://api.deepseek.com');
  });

  it('does not send HSTS outside production builds', () => {
    const headers = getSecurityHeaders('development');

    expect(headers.some(header => header.key === 'Strict-Transport-Security')).toBe(false);
    expect(headers.some(header => header.key === 'Content-Security-Policy-Report-Only')).toBe(true);
  });
});
