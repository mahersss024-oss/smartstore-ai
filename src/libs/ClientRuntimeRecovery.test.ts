import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isStaleClientRuntimeError,
  recoverFromStaleClientRuntime,
} from './ClientRuntimeRecovery';

describe('ClientRuntimeRecovery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    'Failed to find Server Action "abc"',
    'Loading chunk 99 failed',
    'ChunkLoadError: chunk failed',
    'Uncaught Error: Minified React error #418; visit https://react.dev/errors/418?args[]=HTML',
    'Hydration failed because the server rendered HTML did not match the client.',
    'No intl context found. Have you configured the provider?',
    'This request might be from an older or newer deployment.',
  ])('recognizes stale browser runtime failures: %s', (message) => {
    expect(isStaleClientRuntimeError(new Error(message))).toBe(true);
  });

  it('does not treat application errors as stale browser state', () => {
    expect(isStaleClientRuntimeError(new Error('Database connection failed'))).toBe(false);
    expect(isStaleClientRuntimeError(new Error('Missing translation message'))).toBe(false);
  });

  it('recognizes string and message-shaped stale errors', () => {
    expect(isStaleClientRuntimeError('Loading chunk 12 failed')).toBe(true);
    expect(isStaleClientRuntimeError({ message: 'Server rendered HTML mismatch' })).toBe(true);
    expect(isStaleClientRuntimeError({ message: 12 })).toBe(false);
    expect(isStaleClientRuntimeError(null)).toBe(false);
  });

  it('does nothing outside the browser or for unrelated errors', () => {
    expect(recoverFromStaleClientRuntime(new Error('ChunkLoadError'))).toBe(false);

    vi.stubGlobal('window', {
      sessionStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
      },
    });

    expect(recoverFromStaleClientRuntime(new Error('Business validation failed'))).toBe(false);
  });

  it('cleans application caches, updates service workers, and reloads once', async () => {
    const cacheDelete = vi.fn().mockResolvedValue(true);
    const cacheKeys = vi.fn().mockResolvedValue([
      'smartstore-ai-runtime',
      'unrelated-cache',
      'smartstore-ai-assets',
    ]);
    const registrationUpdate = vi.fn().mockResolvedValue(undefined);
    const reload = vi.fn();
    const setItem = vi.fn();
    vi.spyOn(Date, 'now').mockReturnValue(100_000);
    vi.stubGlobal('window', {
      caches: {
        delete: cacheDelete,
        keys: cacheKeys,
      },
      location: { reload },
      sessionStorage: {
        getItem: vi.fn(() => null),
        setItem,
      },
    });
    vi.stubGlobal('navigator', {
      serviceWorker: {
        getRegistrations: vi.fn().mockResolvedValue([
          { update: registrationUpdate },
        ]),
      },
    });

    expect(recoverFromStaleClientRuntime(new Error('Loading chunk 42 failed'))).toBe(true);

    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());

    expect(setItem).toHaveBeenCalledWith('smartstore-stale-client-recovery', '100000');
    expect(cacheDelete).toHaveBeenCalledTimes(2);
    expect(cacheDelete).toHaveBeenCalledWith('smartstore-ai-runtime');
    expect(cacheDelete).toHaveBeenCalledWith('smartstore-ai-assets');
    expect(registrationUpdate).toHaveBeenCalledOnce();
  });

  it('respects the recovery cooldown and still reloads if cleanup fails', async () => {
    const reload = vi.fn();
    vi.spyOn(Date, 'now').mockReturnValue(100_000);
    const getItem = vi.fn(() => '90001');
    vi.stubGlobal('window', {
      caches: {
        delete: vi.fn(),
        keys: vi.fn().mockRejectedValue(new Error('cache unavailable')),
      },
      location: { reload },
      sessionStorage: {
        getItem,
        setItem: vi.fn(),
      },
    });
    vi.stubGlobal('navigator', {});

    expect(recoverFromStaleClientRuntime(new Error('ChunkLoadError'))).toBe(false);

    getItem.mockReturnValue('invalid');

    expect(recoverFromStaleClientRuntime(new Error('ChunkLoadError'))).toBe(true);

    await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
  });
});
