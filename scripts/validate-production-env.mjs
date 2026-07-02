import fs from 'node:fs';

const placeholderMarkers = [
  'replace_me',
  'replace-with',
  'example',
  'dummy',
  'placeholder',
  'your_',
  'changeme',
];

const requiredVariables = [
  'DATABASE_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'CLERK_SECRET_KEY',
];

const recommendedVariables = [
  'AI_EMPLOYEE_WEBHOOK_SECRET',
  'CRON_SECRET',
  'MAINTENANCE_SECRET',
  'PLATFORM_ADMIN_USER_IDS',
  'PLATFORM_SECRETS_ENCRYPTION_KEY',
  'PLATFORM_SECRETS_PREVIOUS_ENCRYPTION_KEYS',
  'WHAPI_PARTNER_API_TOKEN',
  'WHAPI_PROJECT_ID',
];

const qstashVariables = [
  'QSTASH_TOKEN',
  'QSTASH_CURRENT_SIGNING_KEY',
  'QSTASH_NEXT_SIGNING_KEY',
];

const stripeVariables = [
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'STRIPE_PRICE_STARTER_MONTHLY',
  'STRIPE_PRICE_GROWTH_MONTHLY',
  'STRIPE_PRICE_PRO_MONTHLY',
  'STRIPE_PRICE_EXTRA_AI_ORDERS',
  'STRIPE_PRICE_EXTRA_CATALOG_ITEMS',
  'STRIPE_PRICE_EXTRA_IMAGE_STORAGE',
  'STRIPE_PRICE_EXTRA_TEAM_MEMBER',
];

const args = new Set(process.argv.slice(2));
const demoMode = args.has('--demo') || process.env.DEMO_MODE === 'true';
const strictMode = args.has('--strict') || args.has('--certification');

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

const getEnvValue = key => process.env[key]?.trim() ?? '';

const validateUrl = (key, value, issues) => {
  try {
    const url = new URL(value);

    if (key === 'NEXT_PUBLIC_APP_URL' && url.protocol !== 'https:') {
      issues.push(`${key} must use HTTPS in production.`);
    }
  } catch {
    issues.push(`${key} must be a valid URL.`);
  }
};

const isLocalDatabaseHost = (hostname) => {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  return [
    '0.0.0.0',
    '127.0.0.1',
    '::1',
    'localhost',
  ].includes(normalizedHostname);
};

const validateDatabaseUrl = (key, value, issues, warnings) => {
  if (!/^postgres(?:ql)?:\/\//i.test(value)) {
    issues.push(`${key} must be a PostgreSQL connection string.`);
    return;
  }

  try {
    const url = new URL(value);

    if (isLocalDatabaseHost(url.hostname)) {
      const message = `${key} points to a local database host (${url.hostname}). Production must use a managed PostgreSQL endpoint.`;

      if (strictMode) {
        issues.push(message);
      } else {
        warnings.push(message);
      }
    }
  } catch {
    issues.push(`${key} must be a valid PostgreSQL connection string.`);
  }
};

const validateSecretLength = (key, value, issues) => {
  if (
    (
      key === 'MAINTENANCE_SECRET'
      || key === 'CRON_SECRET'
      || key === 'AI_EMPLOYEE_WEBHOOK_SECRET'
      || key === 'PLATFORM_SECRETS_ENCRYPTION_KEY'
    )
    && value.length < 32
  ) {
    issues.push(`${key} must be at least 32 characters.`);
  }
};

const doesValueLookLikeProviderSecret = value =>
  /^(?:sk|pk)_(?:live|test)_/.test(value)
  || value.startsWith('GOCSPX-')
  || value.startsWith('whapi_');

const validateDedicatedEncryptionKey = (key, value, issues) => {
  if (key !== 'PLATFORM_SECRETS_ENCRYPTION_KEY' || !value) {
    return;
  }

  if (doesValueLookLikeProviderSecret(value)) {
    issues.push(`${key} must be a dedicated random encryption key, not a provider API key.`);
  }
};

const validatePreviousEncryptionKeys = (key, value, issues) => {
  if (key !== 'PLATFORM_SECRETS_PREVIOUS_ENCRYPTION_KEYS' || !value) {
    return;
  }

  for (const previousKey of value.split(',').map(item => item.trim()).filter(Boolean)) {
    if (previousKey.length < 32) {
      issues.push(`${key} contains a key shorter than 32 characters.`);
    }

    if (doesValueLookLikeProviderSecret(previousKey)) {
      issues.push(`${key} must contain only dedicated encryption roots, not provider API keys.`);
    }
  }
};

const validateClerkProductionKey = (key, value, issues, warnings) => {
  if (!value) {
    return;
  }

  if (key === 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY' && !value.startsWith('pk_live_')) {
    const message = `${key} is using a Clerk development key. Replace it with pk_live_ before full production launch.`;
    if (strictMode) {
      issues.push(message);
    } else {
      warnings.push(message);
    }
  }

  if (key === 'CLERK_SECRET_KEY' && !value.startsWith('sk_live_')) {
    const message = `${key} is using a Clerk development key. Replace it with sk_live_ before full production launch.`;
    if (strictMode) {
      issues.push(message);
    } else {
      warnings.push(message);
    }
  }
};

const validateVariable = (key, warnings, options = {}) => {
  const issues = [];
  const value = getEnvValue(key);

  if (!value) {
    if (options.required) {
      issues.push(`${key} is missing.`);
    }

    return issues;
  }

  if (placeholderMarkers.some(marker => value.toLowerCase().includes(marker))) {
    issues.push(`${key} still looks like a placeholder.`);
  }

  if (key === 'NEXT_PUBLIC_APP_URL') {
    validateUrl(key, value, issues);
  }

  if (key === 'DATABASE_URL') {
    validateDatabaseUrl(key, value, issues, warnings);
  }

  validateSecretLength(key, value, issues);
  validateDedicatedEncryptionKey(key, value, issues);
  validatePreviousEncryptionKeys(key, value, issues);

  return issues;
};

const failures = [];
const warnings = [];

for (const key of requiredVariables) {
  failures.push(...validateVariable(key, warnings, { required: true }));
  validateClerkProductionKey(key, getEnvValue(key), failures, warnings);
}

for (const key of recommendedVariables) {
  const issues = validateVariable(key, warnings);

  if (strictMode && key.startsWith('PLATFORM_SECRETS_')) {
    failures.push(...issues);
  } else {
    warnings.push(...issues);
  }
}

for (const key of stripeVariables) {
  warnings.push(...validateVariable(key, warnings));
}

if (getEnvValue('AI_PROCESSING_MODE') === 'outbox') {
  for (const key of qstashVariables) {
    failures.push(...validateVariable(key, warnings, { required: true }));
  }

  if (!getEnvValue('CRON_SECRET') && !getEnvValue('MAINTENANCE_SECRET')) {
    failures.push('Outbox processing requires CRON_SECRET or MAINTENANCE_SECRET for recovery sweeps.');
  }
}

if (!getEnvValue('WHAPI_PARTNER_API_TOKEN') || !getEnvValue('WHAPI_PROJECT_ID')) {
  warnings.push('WHAPI_PARTNER_API_TOKEN or WHAPI_PROJECT_ID is missing. Whapi QR connection will be unavailable until both are configured.');
}

if (warnings.length > 0) {
  console.warn('Production environment warnings:');
  for (const warning of warnings) {
    console.warn(`- ${warning}`);
  }
}

if (failures.length > 0) {
  console.error('Production environment validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Production environment validation passed${demoMode ? ' in demo mode' : ''}${strictMode ? ' with strict certification checks' : ''}.`);
