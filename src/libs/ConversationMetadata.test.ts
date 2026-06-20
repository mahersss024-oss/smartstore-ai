import { describe, expect, it } from 'vitest';
import { readOrderIdFromConversationMetadata } from './ConversationMetadata';

describe('ConversationMetadata', () => {
  it('prefers the last submitted order id for feedback linkage', () => {
    expect(readOrderIdFromConversationMetadata({
      currentCart: {
        orderId: 41,
      },
      lastOrder: {
        id: 42,
      },
    })).toBe(42);
  });

  it('falls back to current cart order id and root order id', () => {
    expect(readOrderIdFromConversationMetadata({
      currentCart: {
        orderId: '43',
      },
    })).toBe(43);
    expect(readOrderIdFromConversationMetadata({
      orderId: '44',
    })).toBe(44);
  });

  it('ignores malformed order ids', () => {
    expect(readOrderIdFromConversationMetadata({
      currentCart: {
        orderId: '4.5',
      },
      lastOrder: {
        id: -1,
      },
      orderId: 'abc',
    })).toBeUndefined();
  });
});
