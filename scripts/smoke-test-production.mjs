import fs from 'node:fs';

const DEFAULT_TIMEOUT_MS = 15_000;
const args = process.argv.slice(2);

const loadLocalProductionEnv = () => {
  if (process.env.CI === 'true' || !fs.existsSync('.env.production')) {
    return;
  }

  const content = fs.readFileSync('.env.production', 'utf8');

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith('\'') && value.endsWith('\''))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
};

loadLocalProductionEnv();

const getArgValue = (name) => {
  const prefix = `${name}=`;
  const explicit = args.find(arg => arg.startsWith(prefix));

  return explicit ? explicit.slice(prefix.length) : undefined;
};

const baseUrlInput = getArgValue('--base-url')
  ?? process.env.SMOKE_TEST_BASE_URL
  ?? process.env.NEXT_PUBLIC_APP_URL;
const locale = getArgValue('--locale') ?? process.env.SMOKE_TEST_LOCALE ?? 'ar';
const organizationId = getArgValue('--organization-id') ?? process.env.SMOKE_TEST_ORGANIZATION_ID;

if (!baseUrlInput) {
  console.error('Missing smoke test base URL. Set SMOKE_TEST_BASE_URL or NEXT_PUBLIC_APP_URL.');
  process.exit(1);
}

const baseUrl = new URL(baseUrlInput);
const paths = [
  `/${locale}`,
  `/${locale}/sign-in`,
  '/robots.txt',
  '/sitemap.xml',
];

if (organizationId) {
  paths.push(
    `/${locale}/connect/${organizationId}`,
    `/${locale}/web-order/${organizationId}`,
  );
}

const fetchWithTimeout = async (url) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    return await fetch(url, {
      redirect: 'manual',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const isExpectedStatus = (status) => {
  return (status >= 200 && status < 400) || status === 401 || status === 403;
};

const failures = [];

for (const path of paths) {
  const url = new URL(path, baseUrl);

  try {
    const response = await fetchWithTimeout(url);
    try {
      const ok = isExpectedStatus(response.status);
      const status = `${response.status} ${response.statusText}`.trim();

      console.log(`${ok ? 'PASS' : 'FAIL'} ${status} ${url.toString()}`);

      if (!ok) {
        failures.push(`${url.toString()} returned ${status}`);
      }
    } finally {
      await response.body?.cancel().catch(() => {});
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown_error';
    console.log(`FAIL ${url.toString()} ${message}`);
    failures.push(`${url.toString()} failed: ${message}`);
  }
}

if (failures.length > 0) {
  console.error('Production smoke test failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('Production smoke test passed.');
