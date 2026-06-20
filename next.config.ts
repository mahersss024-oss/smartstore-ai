import type { NextConfig } from 'next';
import withBundleAnalyzer from '@next/bundle-analyzer';
import { withSentryConfig } from '@sentry/nextjs';
import createNextIntlPlugin from 'next-intl/plugin';
import { getSecurityHeaders } from './src/libs/SecurityHeaders';
import './src/libs/Env';

const imageRemoteHosts = (process.env.NEXT_IMAGE_REMOTE_HOSTS ?? '')
  .split(',')
  .map(host => host.trim())
  .filter(Boolean);
const isSentryDisabled = process.env.NEXT_PUBLIC_SENTRY_DISABLED === 'true';

// Define the base Next.js configuration
const baseConfig: NextConfig = {
  // Keep development artifacts isolated from production builds. Running
  // `next build` while the local server is open must not corrupt HMR state.
  distDir: process.env.NODE_ENV === 'development' ? '.next-dev' : '.next',
  devIndicators: {
    position: 'bottom-right',
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '6mb',
    },
  },
  images: {
    remotePatterns: imageRemoteHosts.map(hostname => ({
      hostname,
      protocol: 'https',
    })),
  },
  async headers() {
    return [
      {
        headers: getSecurityHeaders(),
        source: '/:path*',
      },
    ];
  },
  poweredByHeader: false,
  reactStrictMode: true,
  reactCompiler: process.env.NODE_ENV === 'production', // Keep the development environment fast
  logging: {
    browserToTerminal: process.env.BROWSER_TO_TERMINAL_DISABLED !== 'true',
  },
  outputFileTracingIncludes: {
    '/': ['./migrations/**/*'],
  },
};

// Initialize the Next-Intl plugin
let configWithPlugins = createNextIntlPlugin('./src/libs/I18n.ts')(baseConfig);

// Conditionally enable bundle analysis
if (process.env.ANALYZE === 'true') {
  configWithPlugins = withBundleAnalyzer()(configWithPlugins);
}

// Conditionally enable Sentry configuration
if (!isSentryDisabled) {
  configWithPlugins = withSentryConfig(configWithPlugins, {
    // For all available options, see:
    // https://www.npmjs.com/package/@sentry/webpack-plugin#options
    org: process.env.SENTRY_ORGANIZATION,
    project: process.env.SENTRY_PROJECT,

    // Only print logs for uploading source maps in CI
    silent: !process.env.CI,

    // For all available options, see:
    // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

    // Upload a larger set of source maps for prettier stack traces (increases build time)
    widenClientFileUpload: true,

    // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
    // This can increase your server load as well as your hosting bill.
    // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
    // side errors will fail.
    tunnelRoute: '/monitoring',

    webpack: {
      reactComponentAnnotation: {
        enabled: true,
      },

      // Tree-shake Sentry logger statements to reduce bundle size
      treeshake: {
        removeDebugLogging: true,
      },
    },

    // Disable Sentry telemetry
    telemetry: false,
  });
}

const nextConfig = configWithPlugins;
export default nextConfig;
