const WEB_ORDER_GUEST_ID_STORAGE_KEY = 'smartstore-web-order-guest-id';
const WEB_ORDER_THREAD_ID_STORAGE_KEY_PREFIX = 'smartstore-web-order-thread-id';
const WEB_ORDER_GUEST_ID_CHANGED_EVENT = 'smartstore-web-order-guest-id-changed';

const getThreadStorageKey = (scope: string) => {
  return `${WEB_ORDER_THREAD_ID_STORAGE_KEY_PREFIX}:${scope}`;
};

export const createWebOrderGuestId = () => {
  return `guest-${crypto.randomUUID()}`;
};

export const createWebOrderThreadId = (customerId: string) => {
  return `${customerId}-session-${crypto.randomUUID()}`;
};

export const readStoredWebOrderGuestId = () => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(WEB_ORDER_GUEST_ID_STORAGE_KEY) ?? '';
};

export const readStoredWebOrderThreadId = (scope: string) => {
  if (typeof window === 'undefined') {
    return '';
  }

  return window.localStorage.getItem(getThreadStorageKey(scope)) ?? '';
};

export const writeStoredWebOrderGuestId = (guestId: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(WEB_ORDER_GUEST_ID_STORAGE_KEY, guestId);
  window.dispatchEvent(new Event(WEB_ORDER_GUEST_ID_CHANGED_EVENT));
};

export const writeStoredWebOrderThreadId = (scope: string, threadId: string) => {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(getThreadStorageKey(scope), threadId);
  window.dispatchEvent(new Event(WEB_ORDER_GUEST_ID_CHANGED_EVENT));
};

export const subscribeToWebOrderGuestId = (onStoreChange: () => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(WEB_ORDER_GUEST_ID_CHANGED_EVENT, onStoreChange);

  return () => {
    window.removeEventListener(WEB_ORDER_GUEST_ID_CHANGED_EVENT, onStoreChange);
  };
};

export const getWebOrderCustomerIdSnapshot = () => {
  const guestId = readStoredWebOrderGuestId();

  if (!guestId) {
    return '';
  }

  return `web-chat-${guestId}`;
};

export const getWebOrderCustomerIdServerSnapshot = () => '';

export const getWebOrderThreadIdSnapshot = (scope: string) => {
  const storedThreadId = readStoredWebOrderThreadId(scope);

  return storedThreadId || getWebOrderCustomerIdSnapshot();
};

export const getWebOrderThreadIdServerSnapshot = () => '';
