import { describe, expect, it } from 'vitest';
import {
  buildAIEmployeeAddOnOrderSnapshot,
  canAIEmployeeAddItemsToExistingOrder,
  canAIEmployeeModifyOrderBeforeStoreApproval,
  getAIEmployeeOrderCancellationPolicy,
  getMostRelevantAIEmployeeDeliveryStageOpenOrder,
  isAIEmployeeOrderInDeliveryStage,
} from './AIEmployeeOrderLifecycle';
import { DELIVERY_STATUS, ORDER_STATUS } from './OrderWorkflow';

describe('AIEmployeeOrderLifecycle', () => {
  it('allows automatic cancellation only before store approval', () => {
    expect(canAIEmployeeModifyOrderBeforeStoreApproval(
      ORDER_STATUS.PENDING_STORE_REVIEW,
    )).toBe(true);
    expect(getAIEmployeeOrderCancellationPolicy({
      status: ORDER_STATUS.PENDING_STORE_REVIEW,
    })).toMatchObject({
      canCancelAutomatically: true,
      reason: 'before_store_approval',
      requiresStoreReview: false,
    });
  });

  it('requires store review after preparation starts', () => {
    expect(getAIEmployeeOrderCancellationPolicy({
      status: ORDER_STATUS.PREPARING,
    })).toMatchObject({
      canCancelAutomatically: false,
      reason: 'preparing_or_approved',
      requiresStoreReview: true,
    });
  });

  it('blocks additions after the order leaves for delivery', () => {
    const order = {
      deliveryStatus: DELIVERY_STATUS.OUT_FOR_DELIVERY,
      status: ORDER_STATUS.CONFIRMED,
    };

    expect(isAIEmployeeOrderInDeliveryStage(order)).toBe(true);
    expect(canAIEmployeeAddItemsToExistingOrder(order)).toBe(false);
  });

  it.each([
    ORDER_STATUS.DRAFT,
    ORDER_STATUS.SENT_TO_CUSTOMER,
    ORDER_STATUS.WAITING_PAYMENT,
  ])('allows pre-approval modification for %s', (status) => {
    expect(canAIEmployeeModifyOrderBeforeStoreApproval(status)).toBe(true);
  });

  it('distinguishes all cancellation policy stages', () => {
    expect(getAIEmployeeOrderCancellationPolicy({
      deliveryStatus: DELIVERY_STATUS.OUT_FOR_DELIVERY,
      status: ORDER_STATUS.CONFIRMED,
    })).toMatchObject({
      reason: 'out_for_delivery',
      requiresStoreReview: true,
    });
    expect(getAIEmployeeOrderCancellationPolicy({
      status: ORDER_STATUS.READY_FOR_PICKUP,
    })).toMatchObject({
      reason: 'ready_for_pickup',
      requiresStoreReview: true,
    });
    expect(getAIEmployeeOrderCancellationPolicy({
      status: ORDER_STATUS.APPROVED_BY_STORE,
    })).toMatchObject({
      reason: 'preparing_or_approved',
      requiresStoreReview: true,
    });
    expect(getAIEmployeeOrderCancellationPolicy({
      status: ORDER_STATUS.CONFIRMED,
    })).toMatchObject({
      reason: 'preparing_or_approved',
      requiresStoreReview: true,
    });
    expect(getAIEmployeeOrderCancellationPolicy({
      status: ORDER_STATUS.COMPLETED,
    })).toMatchObject({
      reason: 'completed',
      requiresStoreReview: false,
    });
    expect(getAIEmployeeOrderCancellationPolicy({
      status: ORDER_STATUS.CANCELLED,
    })).toMatchObject({
      reason: 'already_cancelled',
      requiresStoreReview: false,
    });
  });

  it('allows additions only while the order remains open and before delivery', () => {
    expect(canAIEmployeeAddItemsToExistingOrder({
      status: ORDER_STATUS.PREPARING,
    })).toBe(true);
    expect(canAIEmployeeAddItemsToExistingOrder({
      status: ORDER_STATUS.COMPLETED,
    })).toBe(false);
    expect(canAIEmployeeAddItemsToExistingOrder({
      status: ORDER_STATUS.CANCELLED,
    })).toBe(false);
    expect(isAIEmployeeOrderInDeliveryStage({
      status: ORDER_STATUS.OUT_FOR_DELIVERY,
    })).toBe(true);
  });

  it('selects the first delivery-stage order and snapshots add-on items immutably', () => {
    const orders = {
      completed: [],
      open: [
        {
          createdAt: '2026-06-15T00:00:00.000Z',
          id: 1,
          items: [],
          matchReasons: ['latest'],
          status: ORDER_STATUS.PREPARING,
          totalPrice: '10.00',
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
        {
          createdAt: '2026-06-15T00:00:00.000Z',
          deliveryStatus: DELIVERY_STATUS.OUT_FOR_DELIVERY,
          id: 2,
          items: [],
          matchReasons: ['latest'],
          status: ORDER_STATUS.CONFIRMED,
          totalPrice: '20.00',
          updatedAt: '2026-06-15T00:00:00.000Z',
        },
      ],
    };
    const items = [{
      name: 'Kabsa',
      productId: 10,
      quantity: 2,
      unitPrice: 15,
    }];

    expect(getMostRelevantAIEmployeeDeliveryStageOpenOrder(orders)?.id).toBe(2);

    const snapshot = buildAIEmployeeAddOnOrderSnapshot(items, {
      name: 'Customer',
    });
    items[0]!.quantity = 9;

    expect(snapshot).toMatchObject({
      customerDetails: { name: 'Customer' },
      items: [{ quantity: 2 }],
      subtotal: 30,
    });
    expect(new Date(snapshot.updatedAt).toString()).not.toBe('Invalid Date');
  });
});
