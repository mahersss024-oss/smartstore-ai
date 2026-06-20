import * as Sentry from '@sentry/nextjs';

const isSpotlightEnabled = process.env.NEXT_PUBLIC_SENTRY_SPOTLIGHT === 'true';
const isSentryDisabled = process.env.NEXT_PUBLIC_SENTRY_DISABLED === 'true';

const sentryOptions: Sentry.NodeOptions | Sentry.EdgeOptions = {
  // Sentry DSN
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Enable Spotlight only when its local server is intentionally running.
  spotlight: process.env.NODE_ENV === 'development' && isSpotlightEnabled,

  integrations: [
    Sentry.consoleLoggingIntegration(),
  ],

  // Adds request headers and IP for users, for more info visit
  sendDefaultPii: false,

  // Adjust this value in production, or use tracesSampler for greater control
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Setting this option to true will print useful information to the console while you're setting up Sentry.
  debug: false,
};

export function register() {
  if (!isSentryDisabled) {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      // Node.js Sentry configuration
      Sentry.init(sentryOptions);
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
      // Edge Sentry configuration
      Sentry.init(sentryOptions);
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
