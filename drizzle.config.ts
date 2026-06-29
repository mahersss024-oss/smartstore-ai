import { defineConfig } from 'drizzle-kit';
import { normalizePostgresSslMode } from './src/utils/DatabaseUrl';

export default defineConfig({
  out: './migrations',
  schema: './src/models/Schema.ts',
  dialect: 'postgresql',
  dbCredentials: {
    url: normalizePostgresSslMode(process.env.DATABASE_URL ?? ''),
  },
  verbose: true,
  strict: true,
});
