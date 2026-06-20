const staleClientErrorPatterns = [
  'failed to find server action',
  'loading chunk',
  'chunkloaderror',
  'minified react error #418',
  'hydration failed',
  'no intl context found',
  'older or newer deployment',
  'server rendered html',
];

const recoveryStorageKey = 'smartstore-stale-client-recovery';
const recoveryCooldownMs = 30_000;

const getErrorMessage = (value: unknown): string => {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (value && typeof value === 'object' && 'message' in value) {
    const message = (value as { message?: unknown }).message;

    return typeof message === 'string' ? message : '';
  }

  return '';
};

export const isStaleClientRuntimeError = (value: unknown) => {
  const message = getErrorMessage(value).toLowerCase();

  return staleClientErrorPatterns.some(pattern => message.includes(pattern));
};

export const recoverFromStaleClientRuntime = (value: unknown) => {
  if (!isStaleClientRuntimeError(value) || typeof window === 'undefined') {
    return false;
  }

  const lastRecovery = Number(window.sessionStorage.getItem(recoveryStorageKey) ?? 0);
  const now = Date.now();

  if (Number.isFinite(lastRecovery) && now - lastRecovery < recoveryCooldownMs) {
    return false;
  }

  window.sessionStorage.setItem(recoveryStorageKey, String(now));
  void (async () => {
    try {
      if ('caches' in window) {
        const keys = await window.caches.keys();
        await Promise.all(
          keys
            .filter(key => key.startsWith('smartstore-ai-'))
            .map(key => window.caches.delete(key)),
        );
      }

      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.update()));
      }
    } catch {
      // Cache and service-worker cleanup are best-effort recovery steps.
    } finally {
      window.location.reload();
    }
  })();

  return true;
};
