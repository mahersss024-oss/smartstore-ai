import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInfo = vi.fn();

vi.mock('./Logger', () => ({
  logger: { info: mockInfo },
}));

describe('SecretDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SECRET_DIAGNOSTICS_ENABLED;
  });

  afterEach(() => {
    delete process.env.SECRET_DIAGNOSTICS_ENABLED;
  });

  it('does not log when SECRET_DIAGNOSTICS_ENABLED is not set', async () => {
    const { logSecretLengthDiagnostics } = await import('./SecretDiagnostics');

    logSecretLengthDiagnostics('test', { inputLength: 32 });

    expect(mockInfo).not.toHaveBeenCalled();
  });

  it('does not log when SECRET_DIAGNOSTICS_ENABLED is set to a non-true value', async () => {
    process.env.SECRET_DIAGNOSTICS_ENABLED = 'false';
    const { logSecretLengthDiagnostics } = await import('./SecretDiagnostics');

    logSecretLengthDiagnostics('test', { inputLength: 32 });

    expect(mockInfo).not.toHaveBeenCalled();
  });

  it('logs normalized lengths when SECRET_DIAGNOSTICS_ENABLED is true', async () => {
    process.env.SECRET_DIAGNOSTICS_ENABLED = 'true';
    vi.resetModules();
    const { logSecretLengthDiagnostics } = await import('./SecretDiagnostics');

    logSecretLengthDiagnostics('encrypt', {
      decryptedLength: 64,
      inputLength: 32,
      retrievedLength: null,
      storedLength: undefined,
    });

    expect(mockInfo).toHaveBeenCalledWith('Secret lifecycle length diagnostics', {
      decryptedLength: 64,
      inputLength: 32,
      lifecycle: 'encrypt',
      retrievedLength: null,
      storedLength: null,
    });
  });

  it('normalizes negative and non-finite lengths to null', async () => {
    process.env.SECRET_DIAGNOSTICS_ENABLED = 'true';
    vi.resetModules();
    const { logSecretLengthDiagnostics } = await import('./SecretDiagnostics');

    logSecretLengthDiagnostics('validate', {
      inputLength: -1,
      storedLength: Number.NaN,
    });

    expect(mockInfo).toHaveBeenCalledWith('Secret lifecycle length diagnostics', expect.objectContaining({
      inputLength: null,
      storedLength: null,
    }));
  });
});
