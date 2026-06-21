import { describe, expect, it } from 'vitest';
import {
  getOperationalRetentionCutoffs,
  OPERATIONAL_RETENTION,
} from './OperationalDataRetention';

describe('operational data retention', () => {
  it('calculates stable UTC cutoffs without depending on server timezone', () => {
    const now = new Date('2026-06-07T12:00:00.000Z');
    const cutoffs = getOperationalRetentionCutoffs(now);

    expect(cutoffs.rateLimitsBefore.toISOString()).toBe(
      '2026-06-06T12:00:00.000Z',
    );
    expect(cutoffs.failedWebhooksBefore.toISOString()).toBe(
      '2026-05-08T12:00:00.000Z',
    );
    expect(cutoffs.finishedWebhooksBefore.toISOString()).toBe(
      '2026-03-09T12:00:00.000Z',
    );
    expect(cutoffs.finishedAiInboundJobsBefore.toISOString()).toBe(
      '2026-05-08T12:00:00.000Z',
    );
    expect(cutoffs.deadAiInboundJobsBefore.toISOString()).toBe(
      '2026-03-09T12:00:00.000Z',
    );
    expect(OPERATIONAL_RETENTION).toEqual({
      deadAiInboundJobDays: 90,
      failedWebhookDays: 30,
      finishedAiInboundJobDays: 30,
      finishedWebhookDays: 90,
      rateLimitGraceDays: 1,
    });
  });
});
