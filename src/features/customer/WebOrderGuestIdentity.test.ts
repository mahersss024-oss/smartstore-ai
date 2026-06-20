import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createWebOrderGuestId,
  createWebOrderThreadId,
  getWebOrderCustomerIdServerSnapshot,
  getWebOrderCustomerIdSnapshot,
  getWebOrderThreadIdServerSnapshot,
  getWebOrderThreadIdSnapshot,
  readStoredWebOrderGuestId,
  readStoredWebOrderThreadId,
  subscribeToWebOrderGuestId,
  writeStoredWebOrderGuestId,
  writeStoredWebOrderThreadId,
} from './WebOrderGuestIdentity';

const guestStorageKey = 'smartstore-web-order-guest-id';
const threadScope = 'org_1:web_chat';
const threadStorageKey = `smartstore-web-order-thread-id:${threadScope}`;

const createFakeWindow = () => {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  const storage = new Map<string, string>();

  return {
    window: {
      addEventListener: vi.fn((eventName: string, listener: (event: Event) => void) => {
        const eventListeners = listeners.get(eventName) ?? new Set();

        eventListeners.add(listener);
        listeners.set(eventName, eventListeners);
      }),
      dispatchEvent: vi.fn((event: Event) => {
        for (const listener of listeners.get(event.type) ?? []) {
          listener(event);
        }

        return true;
      }),
      localStorage: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
          storage.set(key, value);
        }),
      },
      removeEventListener: vi.fn((eventName: string, listener: (event: Event) => void) => {
        listeners.get(eventName)?.delete(listener);
      }),
    },
  };
};

describe('WebOrderGuestIdentity', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is safe when called without a browser window', () => {
    vi.stubGlobal('window', undefined);

    expect(readStoredWebOrderGuestId()).toBe('');
    expect(readStoredWebOrderThreadId(threadScope)).toBe('');
    expect(getWebOrderCustomerIdSnapshot()).toBe('');
    expect(getWebOrderCustomerIdServerSnapshot()).toBe('');
    expect(getWebOrderThreadIdSnapshot(threadScope)).toBe('');
    expect(getWebOrderThreadIdServerSnapshot()).toBe('');
    expect(() => writeStoredWebOrderGuestId('guest-123')).not.toThrow();
    expect(() => writeStoredWebOrderThreadId(threadScope, 'thread-123')).not.toThrow();
    expect(() => subscribeToWebOrderGuestId(() => {})()).not.toThrow();
  });

  it('keeps the customer identity stable while starting a new local chat session', () => {
    const { window } = createFakeWindow();

    vi.stubGlobal('window', window);

    const onStoreChange = vi.fn();
    const unsubscribe = subscribeToWebOrderGuestId(onStoreChange);

    writeStoredWebOrderGuestId('guest-123');

    expect(window.localStorage.setItem).toHaveBeenCalledWith(guestStorageKey, 'guest-123');
    expect(readStoredWebOrderGuestId()).toBe('guest-123');
    expect(getWebOrderCustomerIdSnapshot()).toBe('web-chat-guest-123');
    expect(getWebOrderThreadIdSnapshot(threadScope)).toBe('web-chat-guest-123');
    expect(onStoreChange).toHaveBeenCalledTimes(1);

    const newThreadId = createWebOrderThreadId(getWebOrderCustomerIdSnapshot());
    writeStoredWebOrderThreadId(threadScope, newThreadId);

    expect(window.localStorage.setItem).toHaveBeenCalledWith(threadStorageKey, newThreadId);
    expect(readStoredWebOrderThreadId(threadScope)).toBe(newThreadId);
    expect(getWebOrderThreadIdSnapshot(threadScope)).toBe(newThreadId);
    expect(getWebOrderCustomerIdSnapshot()).toBe('web-chat-guest-123');
    expect(onStoreChange).toHaveBeenCalledTimes(2);

    expect(getWebOrderThreadIdSnapshot('org_2:web_chat')).toBe('web-chat-guest-123');

    unsubscribe();
    writeStoredWebOrderGuestId('guest-456');

    expect(onStoreChange).toHaveBeenCalledTimes(2);
  });

  it('uses cryptographically strong UUIDs for guest and thread capabilities', () => {
    const guestId = createWebOrderGuestId();
    const threadId = createWebOrderThreadId('customer-1');

    expect(guestId).toMatch(
      /^guest-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(threadId).toMatch(
      /^customer-1-session-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(createWebOrderGuestId()).not.toBe(guestId);
  });

  it('separates multiple customers opening the same store link at the same time', () => {
    const firstBrowser = createFakeWindow();
    const secondBrowser = createFakeWindow();

    vi.stubGlobal('window', firstBrowser.window);
    const firstGuestId = createWebOrderGuestId();
    writeStoredWebOrderGuestId(firstGuestId);
    writeStoredWebOrderThreadId(threadScope, getWebOrderCustomerIdSnapshot());
    const firstCustomerId = getWebOrderCustomerIdSnapshot();
    const firstThreadId = getWebOrderThreadIdSnapshot(threadScope);

    vi.stubGlobal('window', secondBrowser.window);
    const secondGuestId = createWebOrderGuestId();
    writeStoredWebOrderGuestId(secondGuestId);
    writeStoredWebOrderThreadId(threadScope, getWebOrderCustomerIdSnapshot());
    const secondCustomerId = getWebOrderCustomerIdSnapshot();
    const secondThreadId = getWebOrderThreadIdSnapshot(threadScope);

    expect(firstCustomerId).toMatch(/^web-chat-guest-/);
    expect(secondCustomerId).toMatch(/^web-chat-guest-/);
    expect(firstCustomerId).not.toBe(secondCustomerId);
    expect(firstThreadId).not.toBe(secondThreadId);

    vi.stubGlobal('window', firstBrowser.window);

    expect(getWebOrderCustomerIdSnapshot()).toBe(firstCustomerId);
    expect(getWebOrderThreadIdSnapshot(threadScope)).toBe(firstThreadId);
  });
});
