import { describe, expect, it } from 'vitest';
import {
  appendWebOrderChatMessage,
  buildWebOrderSafeReplyText,
  createWebOrderChatId,
  getLatestWebOrderAssistantMessage,
  mergeWebOrderChatMessages,
  normalizeRemoteWebOrderMessage,
  normalizeWebOrderCustomerDetails,
  normalizeWebOrderVisibleSystemActions,
  webOrderChatRequiresChoiceResponse,
} from './WebOrderChatState';

describe('WebOrderChatState', () => {
  it('accepts only system actions known by the orchestration contract', () => {
    expect(normalizeWebOrderVisibleSystemActions([
      'cart_controls',
      'unknown_action',
      'payment_choices',
    ])).toEqual(['cart_controls', 'payment_choices']);
  });

  it('normalizes optional table numbers in customer details', () => {
    expect(normalizeWebOrderCustomerDetails({
      deliveryPreference: 'pickup',
      fulfillmentType: 'dine_in',
      tableNumber: ' A12 ',
    })).toMatchObject({
      deliveryPreference: 'pickup',
      fulfillmentType: 'dine_in',
      tableNumber: 'A12',
    });
  });

  it('hides internal customer system actions from the chat transcript', () => {
    expect(normalizeRemoteWebOrderMessage({
      body: 'system_action',
      direction: 'inbound',
      id: 1,
      metadata: {
        shouldDisplayInChat: false,
      },
      senderType: 'customer',
    })).toBeUndefined();
  });

  it('gates free text only when the latest assistant message requires a choice', () => {
    expect(webOrderChatRequiresChoiceResponse({
      id: '1',
      sender: 'ai',
      text: '',
      visibleSystemActions: ['payment_choices'],
    })).toBe(true);
    expect(webOrderChatRequiresChoiceResponse({
      freeTextAllowed: true,
      id: '2',
      sender: 'ai',
      text: '',
      visibleSystemActions: ['payment_choices'],
    })).toBe(false);
  });

  it('requires the location share action instead of free-text delivery addresses', () => {
    expect(webOrderChatRequiresChoiceResponse({
      id: 'location-step',
      sender: 'ai',
      text: '',
      visibleSystemActions: ['location_share'],
    })).toBe(true);
    expect(webOrderChatRequiresChoiceResponse({
      freeTextAllowed: true,
      id: 'location-step-unlocked',
      sender: 'ai',
      text: '',
      visibleSystemActions: ['location_share'],
    })).toBe(false);
  });

  it('reconciles one optimistic message without hiding a repeated remote message', () => {
    const messages = mergeWebOrderChatMessages(
      [{
        createdAt: '2026-06-06T12:00:00.000Z',
        id: 'optimistic-1',
        sender: 'customer',
        text: 'نعم',
      }],
      [{
        createdAt: '2026-06-06T12:00:01.000Z',
        id: 'remote-10',
        remoteId: 10,
        sender: 'customer',
        text: 'نعم',
      }, {
        createdAt: '2026-06-06T12:00:05.000Z',
        id: 'remote-11',
        remoteId: 11,
        sender: 'customer',
        text: 'نعم',
      }],
    );

    expect(messages).toHaveLength(2);
    expect(messages.map(message => message.remoteId)).toEqual([10, 11]);
    expect(messages[0]?.id).toBe('optimistic-1');
  });

  it('does not append a local response when the same remote response already exists', () => {
    const messages = appendWebOrderChatMessage(
      [{
        createdAt: '2026-06-06T12:00:01.000Z',
        id: 'remote-20',
        remoteId: 20,
        sender: 'ai',
        text: 'وعليكم السلام\nأهلاً بك',
      }],
      {
        createdAt: '2026-06-06T12:00:03.000Z',
        id: 'local-ai-1',
        sender: 'ai',
        text: 'وعليكم السلام  أهلاً بك',
      },
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe('remote-20');
    expect(messages[0]?.remoteId).toBe(20);
  });

  it('reconciles repeated assistant replies even when database timestamps use a different timezone', () => {
    const messages = mergeWebOrderChatMessages(
      [{
        createdAt: '2026-06-11T23:10:53.000Z',
        id: 'customer-1',
        sender: 'customer',
        text: 'I want E2E Meal',
      }, {
        createdAt: '2026-06-11T23:10:55.000Z',
        id: 'local-ai-product',
        products: [{ availability: 'available', id: 1, name: 'E2E Meal', price: '25.00' }],
        sender: 'ai',
        text: 'E2E Meal is available for 25.00. I can help you choose it or answer any question.',
        visibleSystemActions: ['product_choices'],
      }, {
        createdAt: '2026-06-11T23:10:58.000Z',
        id: 'customer-2',
        sender: 'customer',
        text: '0500000000',
      }, {
        createdAt: '2026-06-11T23:10:59.000Z',
        id: 'local-ai-fulfillment',
        sender: 'ai',
        text: 'Your phone number is saved. Choose delivery or pickup from branch to continue.',
        visibleSystemActions: ['fulfillment_choices'],
      }],
      [{
        createdAt: '2026-06-11 20:10:55',
        id: 'remote-ai-product',
        products: [{ availability: 'available', id: 1, name: 'E2E Meal', price: '25.00' }],
        remoteId: 50,
        sender: 'ai',
        text: 'E2E Meal is available for 25.00. I can help you choose it or answer any question.',
        visibleSystemActions: ['product_choices'],
      }],
    );

    expect(messages).toHaveLength(4);
    expect(messages[1]?.id).toBe('local-ai-product');
    expect(messages[1]?.remoteId).toBe(50);
    expect(messages.at(-1)?.id).toBe('local-ai-fulfillment');
    expect(messages.at(-1)?.visibleSystemActions).toEqual(['fulfillment_choices']);
  });

  it('keeps the latest actionable assistant turn based on message time, not network arrival order', () => {
    const messages = [{
      createdAt: '2026-06-11T23:17:08.000Z',
      id: 'customer-1',
      sender: 'customer' as const,
      text: 'I want E2E Meal',
    }, {
      createdAt: '2026-06-11T23:17:15.000Z',
      id: 'ai-fulfillment',
      sender: 'ai' as const,
      text: 'Your phone number is saved. Choose delivery or pickup from branch to continue.',
      visibleSystemActions: ['fulfillment_choices' as const],
    }, {
      createdAt: '2026-06-11T23:17:11.000Z',
      id: 'late-arriving-ai-product',
      sender: 'ai' as const,
      text: 'E2E Meal is available for 25.00. I can help you choose it or answer any question.',
      visibleSystemActions: ['product_choices' as const],
    }];

    expect(getLatestWebOrderAssistantMessage(messages)?.id).toBe('ai-fulfillment');
    expect(webOrderChatRequiresChoiceResponse(getLatestWebOrderAssistantMessage(messages))).toBe(true);
  });

  it('does not let a stale product choice regain control after the product is already in the cart', () => {
    const messages = [{
      createdAt: '2026-06-11T23:17:15.000Z',
      id: 'ai-fulfillment',
      sender: 'ai' as const,
      text: 'Your phone number is saved. Choose delivery or pickup from branch to continue.',
      visibleSystemActions: ['fulfillment_choices' as const],
    }, {
      createdAt: '2026-06-12 02:17:11',
      id: 'late-arriving-ai-product',
      products: [{ availability: 'available' as const, id: 1, name: 'E2E Meal', price: '25.00' }],
      sender: 'ai' as const,
      text: 'E2E Meal is available for 25.00. I can help you choose it or answer any question.',
      visibleSystemActions: ['product_choices' as const],
    }];

    expect(getLatestWebOrderAssistantMessage(messages, {
      currentCart: {
        items: [{ name: 'E2E Meal', productId: 1, quantity: 1, unitPrice: 25 }],
        status: 'collecting',
        subtotal: 25,
        updatedAt: '2026-06-11T23:17:14.000Z',
      },
    })?.id).toBe('ai-fulfillment');
  });

  it('generates unique chat IDs', () => {
    const id1 = createWebOrderChatId();
    const id2 = createWebOrderChatId();

    expect(typeof id1).toBe('string');
    expect(id1).toContain('-');
    expect(id1).not.toBe(id2);
  });

  it('appends a new message when no duplicate is found', () => {
    const existing = [{
      id: 'msg-1',
      sender: 'customer' as const,
      text: 'Hello',
    }];
    const newMessage = {
      id: 'msg-2',
      sender: 'ai' as const,
      text: 'Hi there',
    };

    const result = appendWebOrderChatMessage(existing, newMessage);

    expect(result).toHaveLength(2);
    expect(result[1]).toMatchObject({ id: 'msg-2' });
  });

  it('merges a duplicate in a multi-item list and preserves other items unchanged', () => {
    const existing = [
      { id: 'msg-1', sender: 'customer' as const, text: 'Hello' },
      { id: 'msg-2', sender: 'ai' as const, text: 'Hi there' },
    ];
    const duplicate = {
      id: 'msg-2-updated',
      remoteId: 5,
      sender: 'ai' as const,
      text: 'Hi there',
    };

    const result = appendWebOrderChatMessage(existing, duplicate);

    expect(result).toHaveLength(2);
    expect(result[0]?.id).toBe('msg-1');
    expect(result[1]?.id).toBe('msg-2');
    expect(result[1]?.remoteId).toBe(5);
  });

  it('skips remote messages whose remoteId is already in the current list', () => {
    const current = [{
      createdAt: '2026-06-06T12:00:00.000Z',
      id: 'msg-existing',
      remoteId: 100,
      sender: 'customer' as const,
      text: 'Hello',
    }];

    const result = mergeWebOrderChatMessages(current, [{
      createdAt: '2026-06-06T12:00:00.000Z',
      id: 'msg-duplicate',
      remoteId: 100,
      sender: 'customer' as const,
      text: 'Hello',
    }]);

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe('msg-existing');
  });

  it('uses a safe continuation instead of rendering a silent visual assistant bubble', () => {
    expect(buildWebOrderSafeReplyText({
      fallbackText: 'تعذر إكمال المحادثة مؤقتاً.',
      hasStructuredVisualContinuation: true,
      replyText: '   ',
    })).toBe('تعذر إكمال المحادثة مؤقتاً.');

    expect(buildWebOrderSafeReplyText({
      fallbackText: 'تعذر إكمال المحادثة مؤقتاً.',
      hasStructuredVisualContinuation: false,
      replyText: '   ',
    })).toBe('');
  });
});
