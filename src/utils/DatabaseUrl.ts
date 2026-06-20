const LOCAL_DATABASE_HOSTS = new Set([
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  'localhost',
]);

const isLocalDatabaseHost = (hostname: string) => {
  return LOCAL_DATABASE_HOSTS.has(hostname.toLowerCase().replace(/^\[|\]$/g, ''));
};

export const normalizePostgresSslMode = (connectionString: string) => {
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
