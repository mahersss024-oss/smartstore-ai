import type { ChromaticConfig } from '@chromatic-com/playwright';
import { defineConfig, devices } from '@playwright/test';

const PORT = process.env.PORT ?? '3000';
const DB_PORT = process.env.DB_PORT ?? '5433';
const WEB_SERVER_TIMEOUT_MS = Number(process.env.PLAYWRIGHT_WEB_SERVER_TIMEOUT_MS ?? 180_000);
const E2E_PLATFORM_ENCRYPTION_KEY = 'playwright_platform_encryption_key_2026';
const reuseExistingServer = process.env.PLAYWRIGHT_REUSE_SERVER === 'true' && !process.env.CI;
const nonEmptyEnv = (value: string | undefined, fallback: string) => {
  return value && value.trim().length > 0 ? value : fallback;
};

// Set webServer.url and use.baseURL with the location of the WebServer respecting the correct set port
const baseURL = `http://localhost:${PORT}`;
// E2E uses a loopback AI provider. Production mode correctly blocks private
// outbound URLs, so browser tests run against Next's isolated dev server.
// The workflow's separate build job remains the production compilation gate.
const webServerCommand
  = `npm run clean:dev && pglite-server -m 100 --port=${DB_PORT} --include-database-url --run "node ./node_modules/npm-run-all/bin/run-s/index.js db:migrate dev:next"`;

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig<ChromaticConfig>({
  testDir: './tests',
  // Browser tests share the same seeded database and platform AI provider.
  // Keep execution sequential so one test cannot replace another test's
  // seeded organization or mock provider configuration while it is still
  // running.
  workers: 1,
  // Look for files with the .integ.js or .e2e.js extension
  testMatch: '*.@(integ|e2e).?(c|m)[jt]s?(x)',
  // Timeout per test, test running locally are slower due to database connections with PGLite
  timeout: 30 * 1000,
  // Fail the build on CI if you accidentally left test.only in the source code.
  forbidOnly: !!process.env.CI,
  // Reporter to use. See https://playwright.dev/docs/test-reporters
  reporter: process.env.CI ? 'github' : 'list',

  expect: {
    // Set timeout for async expect matchers
    timeout: 15 * 1000,
  },

  // Run your local dev server before starting the tests:
  // https://playwright.dev/docs/test-advanced#launching-a-development-web-server-during-the-tests
  webServer: {
    command: webServerCommand,
    url: baseURL,
    timeout: WEB_SERVER_TIMEOUT_MS,
    reuseExistingServer,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 2 * 1000 },
    env: {
      BROWSER_TO_TERMINAL_DISABLED: 'true',
      CLERK_SECRET_KEY: nonEmptyEnv(process.env.CLERK_SECRET_KEY, 'sk_test_playwright'),
      DATABASE_URL: nonEmptyEnv(
        process.env.DATABASE_URL,
        `postgresql://postgres:postgres@localhost:${DB_PORT}/postgres`,
      ),
      NEXT_PUBLIC_SENTRY_DISABLED: 'true',
      NEXT_PUBLIC_APP_URL: baseURL,
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
        nonEmptyEnv(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, 'pk_test_playwright'),
      PLATFORM_ADMIN_USER_IDS: nonEmptyEnv(process.env.PLATFORM_ADMIN_USER_IDS, 'user_playwright_admin'),
      PLATFORM_SECRETS_ENCRYPTION_KEY: E2E_PLATFORM_ENCRYPTION_KEY,
      PORT,
    },
  },

  // Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions.
  use: {
    // Use baseURL so to make navigations relative.
    // More information: https://playwright.dev/docs/api/class-testoptions#test-options-base-url
    baseURL,

    // Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer
    trace: process.env.CI ? 'on' : 'retain-on-failure',

    // Record videos when retrying the failed test.
    video: process.env.CI ? 'retain-on-failure' : undefined,

    // Disable automatic screenshots at test completion when using Chromatic test fixture.
    disableAutoSnapshot: true,
  },

  projects: [
    // `setup` and `teardown` run before and after all E2E tests.
    { name: 'setup', testMatch: /.*\.setup\.ts/, teardown: 'teardown' },
    { name: 'teardown', testMatch: /.*\.teardown\.ts/ },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    ...(process.env.CI
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
            dependencies: ['setup'],
          },
        ]
      : []),
  ],
});
