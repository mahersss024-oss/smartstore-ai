import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const sourceRoot = path.resolve('src');
const thisFile = fileURLToPath(import.meta.url);

const collectSourceFiles = (directory: string): string[] => {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(target);
    }

    return /\.(?:ts|tsx|js|jsx)$/.test(entry.name) ? [target] : [];
  });
};

// The WhatsApp channel must run only through the approved platform provider.
// Unofficial local QR/pairing automation libraries violate WhatsApp's terms and
// risk permanent number bans, so they must never appear in application code.
describe('WhatsApp provider architecture', () => {
  it('contains no unofficial / QR automation libraries', () => {
    const files = collectSourceFiles(sourceRoot).filter(file => file !== thisFile);
    const source = files
      .map(file => fs.readFileSync(file, 'utf8'))
      .join('\n');
    const forbidden = [
      'baileys',
      ['whatsapp', 'web', 'js'].join('-'),
      'venom-bot',
      '@open-wa',
    ];

    for (const fragment of forbidden) {
      expect(source).not.toContain(fragment);
    }
  });
});
