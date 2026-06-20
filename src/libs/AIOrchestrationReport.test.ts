import { describe, expect, it } from 'vitest';
import { buildAIOrchestrationReport } from './AIOrchestrationReport';

describe('AIOrchestrationReport', () => {
  it('summarizes orchestration quality, issues, penalties, and decision reasons', () => {
    expect(buildAIOrchestrationReport([
      {
        conversationId: 10,
        id: 1,
        trace: {
          issues: [],
          quality: {
            level: 'excellent',
            penalties: [],
            score: 100,
          },
          systemDecisionReasons: ['cart_empty'],
        },
      },
      {
        conversationId: 11,
        createdAt: '2026-06-05T00:00:00.000Z',
        id: 2,
        trace: {
          issues: ['model_reply_guarded'],
          quality: {
            level: 'healthy',
            penalties: ['issue_model_reply_guarded'],
            score: 90,
          },
          systemDecisionReasons: ['cart_active', 'visible_action_cart_controls'],
        },
      },
      {
        conversationId: 12,
        id: 3,
        trace: {
          issues: ['delivery_address_need_without_location_action'],
          quality: {
            level: 'warning',
            penalties: [
              'issue_delivery_address_need_without_location_action',
              'missing_visible_action_location_share',
            ],
            score: 45,
          },
          systemDecisionReasons: ['cart_active'],
        },
      },
      {
        conversationId: 13,
        id: 4,
        trace: null,
      },
    ])).toEqual({
      averageScore: 78.33,
      issueCounts: [
        { count: 1, key: 'delivery_address_need_without_location_action' },
        { count: 1, key: 'model_reply_guarded' },
      ],
      levelCounts: {
        critical: 0,
        excellent: 1,
        healthy: 1,
        warning: 1,
      },
      penaltyCounts: [
        { count: 1, key: 'issue_delivery_address_need_without_location_action' },
        { count: 1, key: 'issue_model_reply_guarded' },
        { count: 1, key: 'missing_visible_action_location_share' },
      ],
      reasonCounts: [
        { count: 2, key: 'cart_active' },
        { count: 1, key: 'cart_empty' },
        { count: 1, key: 'visible_action_cart_controls' },
      ],
      recordCount: 4,
      scoredRecordCount: 3,
      weakestRecords: [
        {
          conversationId: 12,
          createdAt: undefined,
          id: 3,
          issues: ['delivery_address_need_without_location_action'],
          penalties: [
            'issue_delivery_address_need_without_location_action',
            'missing_visible_action_location_share',
          ],
          score: 45,
        },
        {
          conversationId: 11,
          createdAt: '2026-06-05T00:00:00.000Z',
          id: 2,
          issues: ['model_reply_guarded'],
          penalties: ['issue_model_reply_guarded'],
          score: 90,
        },
        {
          conversationId: 10,
          createdAt: undefined,
          id: 1,
          issues: [],
          penalties: [],
          score: 100,
        },
      ],
    });
  });

  it('returns an empty report when no scored traces exist yet', () => {
    expect(buildAIOrchestrationReport([
      {
        id: 1,
        trace: null,
      },
    ])).toMatchObject({
      averageScore: null,
      recordCount: 1,
      scoredRecordCount: 0,
      weakestRecords: [],
    });
  });
});
