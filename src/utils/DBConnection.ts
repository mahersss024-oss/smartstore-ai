import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { Env } from '@/libs/Env';
import { logger } from '@/libs/Logger';
import * as schema from '@/models/Schema';
import { normalizePostgresSslMode } from '@/utils/DatabaseUrl';

export const createDbConnection = () => {
  const pool = new Pool({
    connectionTimeoutMillis: Env.DATABASE_CONNECTION_TIMEOUT_MS,
    connectionString: normalizePostgresSslMode(Env.DATABASE_URL),
    idleTimeoutMillis: Env.DATABASE_IDLE_TIMEOUT_MS,
    max: Env.DATABASE_POOL_MAX,
  });

  pool.on('error', (error) => {
    logger.error(`Database pool error: ${error.message}`);
  });

  return drizzle({
    client: pool,
    schema,
  });
};
