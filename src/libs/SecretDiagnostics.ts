import { logger } from './Logger';

type SecretLengthDiagnostics = {
  decryptedLength?: number | null;
  inputLength?: number | null;
  retrievedLength?: number | null;
  storedLength?: number | null;
};

const isSecretDiagnosticsEnabled = () => {
  return process.env.SECRET_DIAGNOSTICS_ENABLED === 'true';
};

const normalizeLength = (value: number | null | undefined) => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
};

export const logSecretLengthDiagnostics = (
  lifecycle: string,
  diagnostics: SecretLengthDiagnostics,
) => {
  if (!isSecretDiagnosticsEnabled()) {
    return;
  }

  logger.info('Secret lifecycle length diagnostics', {
    decryptedLength: normalizeLength(diagnostics.decryptedLength),
    inputLength: normalizeLength(diagnostics.inputLength),
    lifecycle,
    retrievedLength: normalizeLength(diagnostics.retrievedLength),
    storedLength: normalizeLength(diagnostics.storedLength),
  });
};
