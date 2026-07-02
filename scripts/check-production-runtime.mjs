import fs from 'node:fs';
import pg from 'pg';

const { Client } = pg;

const runtimeSettingKey = 'runtime_config';
const aiProviderSettingKey = 'ai_provider';

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

const isLocalDatabaseHost = (hostname) => {
  const normalizedHostname = hostname.toLowerCase().replace(/^\[|\]$/g, '');

  return [
    '0.0.0.0',
    '127.0.0.1',
    '::1',
    'localhost',
  ].includes(normalizedHostname);
};

const normalizePostgresSslMode = (connectionString) => {
  try {
    const url = new URL(connectionString);

    if (!/^postgres(?:ql)?:$/i.test(url.protocol) || isLocalDatabaseHost(url.hostname)) {
      return connectionString;
    }

    const sslMode = url.searchParams.get('sslmode');

    if (!sslMode || ['prefer', 'require', 'verify-ca'].includes(sslMode)) {
      url.searchParams.set('sslmode', 'verify-full');
    }

    return url.toString();
  } catch {
    return connectionString;
  }
};

const getDatabaseConnectionOptions = (connectionString) => {
  const normalizedConnectionString = normalizePostgresSslMode(connectionString);
  const url = new URL(normalizedConnectionString);
  const isLocal = isLocalDatabaseHost(url.hostname);

  return {
    connectionString: normalizedConnectionString,
    connectionTimeoutMillis: 10_000,
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
  };
};

const getObjectValue = (value) => {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
};

const getRuntimeStatus = (runtimeConfig) => {
  const config = getObjectValue(runtimeConfig);
  const internal = getObjectValue(config.internal);

  return {
    exists: Object.keys(config).length > 0,
    internal: {
      aiEmployeeWebhookSecretStored: typeof internal.encryptedAIEmployeeWebhookSecret === 'string' && internal.encryptedAIEmployeeWebhookSecret.length > 0,
      maintenanceSecretStored: typeof internal.encryptedMaintenanceSecret === 'string' && internal.encryptedMaintenanceSecret.length > 0,
    },
    whatsapp: {
      gateApiBase: getEnvValue('WHAPI_GATE_API_BASE') || 'https://gate.whapi.cloud',
      partnerApiTokenConfigured: Boolean(getEnvValue('WHAPI_PARTNER_API_TOKEN')),
      projectIdConfigured: Boolean(getEnvValue('WHAPI_PROJECT_ID')),
      provider: 'whapi',
    },
  };
};

const getAIProviderStatus = (aiProviderConfig) => {
  const config = getObjectValue(aiProviderConfig);

  return {
    exists: Object.keys(config).length > 0,
    enabled: config.enabled === true,
    hasEncryptedApiKey: typeof config.encryptedApiKey === 'string' && config.encryptedApiKey.length > 0,
    model: typeof config.model === 'string' && config.model ? config.model : 'not_configured',
    provider: typeof config.provider === 'string' && config.provider ? config.provider : 'not_configured',
  };
};

const getSettingMap = (rows) => {
  return Object.fromEntries(rows.map(row => [row.key, row.value]));
};

const main = async () => {
  const databaseUrl = getEnvValue('DATABASE_URL');

  if (!databaseUrl) {
    console.error('Production runtime check failed: DATABASE_URL is missing.');
    process.exit(1);
  }

  let client;

  try {
    client = new Client(getDatabaseConnectionOptions(databaseUrl));
    await client.connect();

    const ping = await client.query('select current_database() as database_name');
    const settings = await client.query(
      `
        select key, value
        from platform_settings
        where key in ($1, $2)
      `,
      [runtimeSettingKey, aiProviderSettingKey],
    );
    const settingMap = getSettingMap(settings.rows);
    const runtimeStatus = getRuntimeStatus(settingMap[runtimeSettingKey]);
    const aiProviderStatus = getAIProviderStatus(settingMap[aiProviderSettingKey]);
    const url = new URL(databaseUrl);

    console.log(JSON.stringify({
      aiProvider: aiProviderStatus,
      database: {
        connected: true,
        databaseNameAvailable: Boolean(ping.rows[0]?.database_name),
        hostKind: isLocalDatabaseHost(url.hostname) ? 'local' : 'remote',
      },
      runtimeConfig: runtimeStatus,
    }, null, 2));

    const failures = [];

    if (isLocalDatabaseHost(url.hostname)) {
      failures.push('DATABASE_URL points to a local database host.');
    }

    if (!runtimeStatus.exists) {
      failures.push('platform_settings.runtime_config is missing.');
    }

    if (!aiProviderStatus.exists) {
      failures.push('platform_settings.ai_provider is missing.');
    }

    if (failures.length > 0) {
      console.error('Production runtime check failed:');
      for (const failure of failures) {
        console.error(`- ${failure}`);
      }
      process.exit(1);
    }

    console.log('Production runtime check passed.');
  } catch (error) {
    console.error('Production runtime check failed:');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await client?.end().catch(() => {});
  }
};

await main();
