import { describe, expect, it, vi } from 'vitest';
import {
  buildOrderCustomerNotificationKey,
  writeOrderCustomerConversationMessage,
} from './OrderConversationWriter';

const createMockTransaction = (existingMessages: Array<{ id: number }> = []) => {
  const insertValues = vi.fn(async () => undefined);
  const insert = vi.fn(() => ({ values: insertValues }));
  const selectLimit = vi.fn(async () => existingMessages);
  const selectWhere = vi.fn(() => ({ limit: selectLimit }));
  const selectFrom = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from: selectFrom }));
  const updateReturning = vi.fn(async () => [{ id: 77 }]);
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set: updateSet }));

  return {
    insert,
    insertValues,
    select,
    update,
  };
};

describe('OrderConversationWriter', () => {
  it('builds stable order notification keys from the event type', () => {
    expect(buildOrderCustomerNotificationKey({
      conversationIntent: 'order_status_update',
      messageMetadata: {
        eventType: 'order_preparing',
      },
      orderId: 154,
      status: 'preparing',
    })).toBe('order:154:order_preparing:preparing');
  });

  it('skips duplicate customer notifications with the same notification key', async () => {
    const tx = createMockTransaction([{ id: 501 }]);

    const result = await writeOrderCustomerConversationMessage({
      aiAnalysis: {
        conversationId: 77,
      },
      body: 'طلبك قيد التحضير الآن.',
      channel: 'web',
      conversationIntent: 'order_status_update',
      fallbackThreadId: 'order-154-updates',
      messageMetadata: {
        eventType: 'order_preparing',
      },
      orderId: 154,
      organizationId: 'org_1',
      status: 'preparing',
      tx: tx as never,
    });

    expect(result).toEqual({
      channel: 'web',
      notificationKey: 'order:154:order_preparing:preparing',
      reason: 'duplicate_notification',
      status: 'skipped',
    });
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it('marks sent customer notifications with a durable notification key', async () => {
    const tx = createMockTransaction();

    const result = await writeOrderCustomerConversationMessage({
      aiAnalysis: {
        conversationId: 77,
      },
      body: 'طلبك قيد التحضير الآن.',
      channel: 'web',
      conversationIntent: 'order_status_update',
      fallbackThreadId: 'order-154-updates',
      messageMetadata: {
        eventType: 'order_preparing',
      },
      orderId: 154,
      organizationId: 'org_1',
      status: 'preparing',
      tx: tx as never,
    });

    expect(result).toEqual({
      channel: 'web',
      notificationKey: 'order:154:order_preparing:preparing',
      status: 'sent',
    });
    expect(tx.insertValues).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        notificationKey: 'order:154:order_preparing:preparing',
        notificationStatus: 'sent',
        shouldSendToCustomer: true,
      }),
      senderType: 'ai_employee',
    }));
  });
});
