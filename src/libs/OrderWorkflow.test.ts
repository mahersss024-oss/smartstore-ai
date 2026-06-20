import type { OrderStatus } from './OrderWorkflow';
import { describe, expect, it } from 'vitest';
import {
  assertCanTransitionOrderStatus,
  canTransitionOrderStatus,
  ORDER_STATUS,
} from './OrderWorkflow';

describe('OrderWorkflow', () => {
  const transitionContract: Record<OrderStatus, OrderStatus[]> = {
    [ORDER_STATUS.APPROVED_BY_STORE]: [
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.PREPARING,
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.CANCELLED,
    ],
    [ORDER_STATUS.CANCELLED]: [],
    [ORDER_STATUS.COMPLETED]: [],
    [ORDER_STATUS.CONFIRMED]: [
      ORDER_STATUS.PREPARING,
      ORDER_STATUS.READY_FOR_PICKUP,
      ORDER_STATUS.OUT_FOR_DELIVERY,
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.CANCELLED,
    ],
    [ORDER_STATUS.DRAFT]: [
      ORDER_STATUS.PENDING_STORE_REVIEW,
      ORDER_STATUS.CANCELLED,
    ],
    [ORDER_STATUS.OUT_FOR_DELIVERY]: [
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.CANCELLED,
    ],
    [ORDER_STATUS.PENDING_STORE_REVIEW]: [
      ORDER_STATUS.APPROVED_BY_STORE,
      ORDER_STATUS.WAITING_PAYMENT,
      ORDER_STATUS.CANCELLED,
    ],
    [ORDER_STATUS.PREPARING]: [
      ORDER_STATUS.READY_FOR_PICKUP,
      ORDER_STATUS.OUT_FOR_DELIVERY,
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.CANCELLED,
    ],
    [ORDER_STATUS.READY_FOR_PICKUP]: [
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.CANCELLED,
    ],
    [ORDER_STATUS.SENT_TO_CUSTOMER]: [
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.WAITING_PAYMENT,
      ORDER_STATUS.CANCELLED,
    ],
    [ORDER_STATUS.WAITING_PAYMENT]: [
      ORDER_STATUS.CONFIRMED,
      ORDER_STATUS.CANCELLED,
    ],
  };

  it('allows valid operational transitions', () => {
    expect(canTransitionOrderStatus(
      ORDER_STATUS.PENDING_STORE_REVIEW,
      ORDER_STATUS.APPROVED_BY_STORE,
    )).toBe(true);
    expect(canTransitionOrderStatus(
      ORDER_STATUS.WAITING_PAYMENT,
      ORDER_STATUS.CONFIRMED,
    )).toBe(true);
  });

  it('blocks invalid transitions after cancellation or completion', () => {
    expect(canTransitionOrderStatus(
      ORDER_STATUS.CANCELLED,
      ORDER_STATUS.PREPARING,
    )).toBe(false);
    expect(canTransitionOrderStatus(
      ORDER_STATUS.COMPLETED,
      ORDER_STATUS.PREPARING,
    )).toBe(false);
  });

  it('throws for invalid transitions', () => {
    expect(() => assertCanTransitionOrderStatus(
      ORDER_STATUS.CANCELLED,
      ORDER_STATUS.PREPARING,
    )).toThrowError('Invalid order status transition');
  });

  it('rejects repeated transitions to the current status', () => {
    for (const status of Object.values(ORDER_STATUS)) {
      expect(canTransitionOrderStatus(status, status), `${status} -> ${status}`).toBe(false);
      expect(() => assertCanTransitionOrderStatus(status, status))
        .toThrowError('Invalid order status transition');
    }
  });

  it('enforces the complete order transition contract', () => {
    const statuses = Object.values(ORDER_STATUS);

    for (const from of statuses) {
      for (const to of statuses) {
        const expected = transitionContract[from].includes(to);

        expect(
          canTransitionOrderStatus(from, to),
          `${from} -> ${to}`,
        ).toBe(expected);
      }
    }
  });

  it('rejects unknown status values without throwing', () => {
    expect(canTransitionOrderStatus('unknown', ORDER_STATUS.CONFIRMED)).toBe(false);
    expect(canTransitionOrderStatus(ORDER_STATUS.CONFIRMED, 'unknown')).toBe(false);
  });
});
