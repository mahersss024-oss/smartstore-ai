import { describe, expect, it } from 'vitest';
import { formatDatabaseDateTime, formatDateTime } from './DateTime';

describe('DateTime', () => {
  it('formats local store timestamps with the configured store timezone', () => {
    const localTimestamp = new Date('2026-06-04T23:29:47.000Z');

    expect(formatDateTime(localTimestamp, 'en-GB', 'Asia/Riyadh')).toContain('02:29:47');
  });

  it('formats database timestamps without timezone as UTC in the store timezone', () => {
    expect(formatDatabaseDateTime('2026-06-06 00:25:14.413', 'en-GB')).toContain('03:25:14');
  });

  it('uses the same store timezone rule for chat timestamp strings', () => {
    expect(formatDateTime('2026-06-06 00:25:14.413', 'en-GB', 'Asia/Riyadh')).toContain('03:25:14');
  });

  it('formats database Date values in the store timezone', () => {
    const timestampParsedFromDatabase = new Date('2026-06-06T01:12:30.046Z');

    expect(formatDatabaseDateTime(timestampParsedFromDatabase, 'en-GB')).toContain('04:12:30');
  });

  it('keeps dashboard order timestamps aligned with chat timestamps', () => {
    const orderTimestamp = new Date('2026-06-06T01:42:26.795Z');

    expect(formatDatabaseDateTime(orderTimestamp, 'en-GB')).toContain('04:42:26');
  });

  it('returns null for null value in formatDateTime', () => {
    expect(formatDateTime(null, 'en-GB')).toBeNull();
  });

  it('returns null for undefined value in formatDateTime', () => {
    expect(formatDateTime(undefined, 'en-GB')).toBeNull();
  });

  it('returns null for null value in formatDatabaseDateTime', () => {
    expect(formatDatabaseDateTime(null, 'en-GB')).toBeNull();
  });

  it('returns null for an invalid date string', () => {
    expect(formatDateTime('not-a-date', 'en-GB')).toBeNull();
  });

  it('falls back to default timezone when an invalid timezone is supplied', () => {
    const ts = new Date('2026-06-06T01:00:00.000Z');
    const result = formatDateTime(ts, 'en-GB', 'Invalid/Zone');

    expect(result).not.toBeNull();
    expect(result).toContain('04:00:00');
  });

  it('formats an ISO 8601 string that does not match the database pattern directly', () => {
    expect(formatDateTime('2026-06-06T03:25:14Z', 'en-GB', 'Asia/Riyadh')).toContain('06:25:14');
  });
});
