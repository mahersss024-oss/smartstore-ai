import { describe, expect, it } from 'vitest';
import { normalizePostgresSslMode } from './DatabaseUrl';

describe('normalizePostgresSslMode', () => {
  it('pins remote PostgreSQL URLs to verify-full when pg would warn about weaker sslmode aliases', () => {
    const normalized = normalizePostgresSslMode(
      'postgresql://user:pass@db.example.com:5432/app?sslmode=require',
    );

    expect(new URL(normalized).searchParams.get('sslmode')).toBe('verify-full');
  });

  it('adds verify-full for remote PostgreSQL URLs without an explicit sslmode', () => {
    const normalized = normalizePostgresSslMode(
      'postgresql://user:pass@db.example.com:5432/app',
    );

    expect(new URL(normalized).searchParams.get('sslmode')).toBe('verify-full');
  });

  it('does not rewrite local database URLs', () => {
    const connectionString = 'postgresql://postgres:postgres@127.0.0.1:5433/postgres?sslmode=require';

    expect(normalizePostgresSslMode(connectionString)).toBe(connectionString);
  });
});
