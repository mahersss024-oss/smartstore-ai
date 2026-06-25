const buildCspReportOnly = () => [
  'default-src \'self\'',
  'base-uri \'self\'',
  'object-src \'none\'',
  'frame-ancestors \'self\'',
  'form-action \'self\' https://accounts.clerk.com https://*.clerk.accounts.dev',
  [
    'script-src \'self\'',
    '\'unsafe-inline\'',
    '\'unsafe-eval\'',
    'https://*.clerk.com',
    'https://*.clerk.accounts.dev',
    'https://clerk.smartstore-ai.com',
    'https://browser.sentry-cdn.com',
  ].join(' '),
  [
    'connect-src \'self\'',
    'https://*.clerk.com',
    'https://*.clerk.accounts.dev',
    'https://clerk.smartstore-ai.com',
    'https://*.sentry.io',
    'https://api.deepseek.com',
  ].join(' '),
  'img-src \'self\' data: blob: https:',
  'style-src \'self\' \'unsafe-inline\'',
  'font-src \'self\' data:',
  [
    'frame-src \'self\'',
    'https://*.clerk.com',
    'https://*.clerk.accounts.dev',
    'https://accounts.smartstore-ai.com',
  ].join(' '),
  'worker-src \'self\' blob:',
  'upgrade-insecure-requests',
].join('; ');

export const getSecurityHeaders = (nodeEnv = process.env.NODE_ENV) => [
  ...(nodeEnv === 'production'
    ? [{
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains; preload',
      }]
    : []),
  {
    key: 'Content-Security-Policy-Report-Only',
    value: buildCspReportOnly(),
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: [
      'camera=()',
      'microphone=()',
      'payment=()',
      'usb=()',
      'bluetooth=()',
      'accelerometer=()',
      'gyroscope=()',
      'magnetometer=()',
    ].join(', '),
  },
  {
    key: 'X-Permitted-Cross-Domain-Policies',
    value: 'none',
  },
  {
    key: 'Cross-Origin-Opener-Policy',
    value: 'same-origin-allow-popups',
  },
];
