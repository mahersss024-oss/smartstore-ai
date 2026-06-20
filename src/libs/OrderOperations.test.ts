import { describe, expect, it } from 'vitest';
import {
  buildOrderTimeline,
  formatOrderAge,
  getOrderAgeMinutes,
  getOrderPriority,
  getProductionOrderActions,
  mapOrderStatusToProductionState,
} from './OrderOperations';

describe('OrderOperations', () => {
  it('maps internal order statuses to the production operations states', () => {
    expect(mapOrderStatusToProductionState('pending_store_review')).toBe('new');
    expect(mapOrderStatusToProductionState('draft')).toBe('new');
    expect(mapOrderStatusToProductionState('approved_by_store')).toBe('accepted');
    expect(mapOrderStatusToProductionState('confirmed')).toBe('accepted');
    expect(mapOrderStatusToProductionState('ready_for_pickup')).toBe('ready');
    expect(mapOrderStatusToProductionState('out_for_delivery')).toBe('out_for_delivery');
    expect(mapOrderStatusToProductionState('waiting_payment')).toBe('needs_customer_confirmation');
    expect(mapOrderStatusToProductionState('sent_to_customer')).toBe('needs_customer_confirmation');
    expect(mapOrderStatusToProductionState('preparing')).toBe('preparing');
    expect(mapOrderStatusToProductionState('completed')).toBe('completed');
    expect(mapOrderStatusToProductionState('cancelled')).toBe('cancelled');
    expect(mapOrderStatusToProductionState('unknown_status')).toBe('new');
  });

  it('returns the expected operation actions for all production order states', () => {
    expect(getProductionOrderActions('new')).toEqual([
      'accept_order',
      'reject_order',
      'request_clarification',
    ]);
    expect(getProductionOrderActions('needs_customer_confirmation')).toEqual([
      'contact_customer',
      'reject_order',
    ]);
    expect(getProductionOrderActions('accepted')).toEqual([
      'start_preparing',
      'update_preparation_time',
    ]);
    expect(getProductionOrderActions('preparing')).toContain('mark_ready');
    expect(getProductionOrderActions('ready')).toContain('mark_delivered');
    expect(getProductionOrderActions('out_for_delivery')).toContain('mark_delivered');
    expect(getProductionOrderActions('completed')).toEqual(['view_summary']);
    expect(getProductionOrderActions('cancelled')).toEqual(['view_summary']);
    expect(getProductionOrderActions('rejected')).toEqual(['view_summary']);
  });

  it('raises priority for new orders waiting too long', () => {
    expect(getOrderPriority({
      createdAt: new Date('2026-06-11T09:00:00.000Z'),
      now: new Date('2026-06-11T09:11:00.000Z'),
      status: 'pending_store_review',
    })).toBe('high');
  });

  it('raises priority for accepted or preparing orders that are stale', () => {
    expect(getOrderPriority({
      createdAt: new Date('2026-06-11T08:00:00.000Z'),
      now: new Date('2026-06-11T09:00:00.000Z'),
      status: 'approved_by_store',
      updatedAt: new Date('2026-06-11T08:10:00.000Z'),
    })).toBe('high');
  });

  it('returns medium priority for non-new orders older than 30 minutes that are not yet complete', () => {
    expect(getOrderPriority({
      createdAt: new Date('2026-06-11T08:00:00.000Z'),
      now: new Date('2026-06-11T08:35:00.000Z'),
      status: 'waiting_payment',
    })).toBe('medium');
  });

  it('returns normal priority for new fresh orders', () => {
    expect(getOrderPriority({
      createdAt: new Date('2026-06-11T09:00:00.000Z'),
      now: new Date('2026-06-11T09:05:00.000Z'),
      status: 'pending_store_review',
    })).toBe('normal');
  });

  it('computes order age in minutes and clamps negative values to zero', () => {
    const createdAt = new Date('2026-06-11T09:00:00.000Z');
    const now = new Date('2026-06-11T09:05:30.000Z');

    expect(getOrderAgeMinutes(createdAt, now)).toBe(5);
    expect(getOrderAgeMinutes(now, createdAt)).toBe(0);
  });

  it('formats order age in minutes only when under an hour', () => {
    expect(formatOrderAge(0)).toBe('0m');
    expect(formatOrderAge(45)).toBe('45m');
  });

  it('formats order age in hours and minutes', () => {
    expect(formatOrderAge(90)).toBe('1h 30m');
    expect(formatOrderAge(120)).toBe('2h');
    expect(formatOrderAge(61)).toBe('1h 1m');
  });

  it('builds order timeline milestones from order events', () => {
    const timeline = buildOrderTimeline({
      createdAt: new Date('2026-06-11T09:00:00.000Z'),
      events: [
        {
          createdAt: new Date('2026-06-11T09:01:00.000Z'),
          eventType: 'order_approved',
          toStatus: 'approved_by_store',
        },
        {
          createdAt: new Date('2026-06-11T09:05:00.000Z'),
          eventType: 'status_changed',
          toStatus: 'preparing',
        },
        {
          createdAt: new Date('2026-06-11T09:06:00.000Z'),
          eventType: 'status_changed',
          metadata: { notificationStatus: 'sent' },
          toStatus: 'preparing',
        },
      ],
      status: 'preparing',
    });

    expect(timeline.find(item => item.key === 'created')).toMatchObject({ status: 'done' });
    expect(timeline.find(item => item.key === 'accepted')).toMatchObject({ status: 'done' });
    expect(timeline.find(item => item.key === 'preparing')).toMatchObject({ status: 'done' });
    expect(timeline.find(item => item.key === 'notifications')).toMatchObject({ status: 'done' });
  });

  it('marks the cancelled milestone as done for a cancelled order', () => {
    const timeline = buildOrderTimeline({
      createdAt: new Date('2026-06-11T09:00:00.000Z'),
      events: [
        {
          createdAt: new Date('2026-06-11T09:02:00.000Z'),
          eventType: 'status_changed',
          toStatus: 'cancelled',
        },
      ],
      status: 'cancelled',
    });

    expect(timeline.find(item => item.key === 'cancelled')).toMatchObject({ status: 'done' });
  });

  it('marks the delivered milestone as done for a completed order', () => {
    const timeline = buildOrderTimeline({
      createdAt: new Date('2026-06-11T09:00:00.000Z'),
      events: [
        {
          createdAt: new Date('2026-06-11T09:10:00.000Z'),
          eventType: 'order_completed',
          toStatus: 'completed',
        },
      ],
      status: 'completed',
    });

    expect(timeline.find(item => item.key === 'delivered')).toMatchObject({ status: 'done' });
  });

  it('marks notifications as failed when an event has a failed notification status', () => {
    const timeline = buildOrderTimeline({
      createdAt: new Date('2026-06-11T09:00:00.000Z'),
      events: [
        {
          eventType: 'status_changed',
          metadata: { customerNotificationStatus: 'failed' },
          toStatus: 'approved_by_store',
        },
      ],
      status: 'approved_by_store',
    });

    expect(timeline.find(item => item.key === 'notifications')).toMatchObject({ status: 'failed' });
  });

  it('marks notifications as done when the review conversation thread id is present', () => {
    const timeline = buildOrderTimeline({
      createdAt: new Date('2026-06-11T09:00:00.000Z'),
      events: [
        {
          eventType: 'review_requested',
          metadata: { reviewConversationThreadId: 'thread_123' },
          toStatus: 'completed',
        },
      ],
      status: 'completed',
    });

    expect(timeline.find(item => item.key === 'notifications')).toMatchObject({ status: 'done' });
  });

  it('marks pending milestones when order has no events', () => {
    const timeline = buildOrderTimeline({
      createdAt: new Date('2026-06-11T09:00:00.000Z'),
      events: [],
      status: 'new',
    });

    expect(timeline.find(item => item.key === 'created')).toMatchObject({ status: 'done' });
    expect(timeline.find(item => item.key === 'accepted')).toMatchObject({ status: 'pending' });
    expect(timeline.find(item => item.key === 'notifications')).toMatchObject({ status: 'pending' });
  });
});
