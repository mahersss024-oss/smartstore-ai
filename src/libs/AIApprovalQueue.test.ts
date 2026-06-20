import { describe, expect, it } from 'vitest';
import {
  approveLatestPendingApproval,
  createAIApprovalRequest,
  normalizeAIApprovalQueue,
} from './AIApprovalQueue';

describe('AIApprovalQueue', () => {
  it('normalizes invalid input to an empty queue', () => {
    expect(normalizeAIApprovalQueue({ items: [{ status: 'unsafe' }] })).toEqual({
      items: [],
    });
  });

  it('returns an empty queue for null, non-record, and non-array items inputs', () => {
    expect(normalizeAIApprovalQueue(null)).toEqual({ items: [] });
    expect(normalizeAIApprovalQueue('string')).toEqual({ items: [] });
    expect(normalizeAIApprovalQueue({ items: 'not-array' })).toEqual({ items: [] });
  });

  it('skips non-object items in the items array', () => {
    expect(normalizeAIApprovalQueue({ items: [null, 42, 'bad'] })).toEqual({ items: [] });
  });

  it('preserves approvedAt when present in a valid item', () => {
    const result = normalizeAIApprovalQueue({
      items: [{
        approvedAt: '2026-06-01T00:00:00.000Z',
        createdAt: '2026-05-28T00:00:00.000Z',
        id: 'req-1',
        payload: null,
        status: 'approved',
        summary: 'Done',
        title: 'Draft',
        type: 'product_drafts',
      }],
    });

    expect(result.items[0]?.approvedAt).toBe('2026-06-01T00:00:00.000Z');
  });

  it('creates and approves the latest pending request', () => {
    const request = createAIApprovalRequest({
      createdAt: '2026-05-28T00:00:00.000Z',
      id: 'approval-1',
      payload: { productDrafts: [] },
      summary: '2 products',
      title: 'Product drafts',
      type: 'product_drafts',
    });
    const queue = approveLatestPendingApproval(
      { items: [request] },
      'product_drafts',
      '2026-05-28T01:00:00.000Z',
    );

    expect(queue.items[0]).toMatchObject({
      approvedAt: '2026-05-28T01:00:00.000Z',
      status: 'approved',
    });
  });

  it('leaves already-approved items unchanged in approveLatestPendingApproval', () => {
    const pending = createAIApprovalRequest({
      createdAt: '2026-05-28T00:00:00.000Z',
      id: 'req-a',
      payload: {},
      summary: 'First',
      title: 'First',
      type: 'product_drafts',
    });
    const alreadyApproved = { ...pending, id: 'req-b', status: 'approved' as const };
    const result = approveLatestPendingApproval(
      { items: [pending, alreadyApproved] },
      'product_drafts',
      '2026-06-01T00:00:00.000Z',
    );

    expect(result.items[0]?.status).toBe('approved');
    expect(result.items[1]?.id).toBe('req-b');
    expect(result.items[1]?.status).toBe('approved');
  });
});
