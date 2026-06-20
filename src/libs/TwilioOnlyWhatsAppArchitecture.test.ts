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

    return /\.(?:ts|tsx|js|jsx|json)$/.test(entry.name) ? [target] : [];
  });
};

describe('Twilio-only WhatsApp architecture', () => {
  it('contains no Meta Cloud API route, adapter, environment key, or provider reference', () => {
    const files = collectSourceFiles(sourceRoot).filter(file => file !== thisFile);
    const source = files
      .map(file => fs.readFileSync(file, 'utf8'))
      .join('\n');
    const forbiddenFragments = [
      ['graph', 'facebook', 'com'].join('.'),
      ['WhatsApp', 'Cloud', 'Api'].join(''),
      ['WHATSAPP', 'APP', 'SECRET'].join('_'),
      ['WHATSAPP', 'WEBHOOK', 'VERIFY', 'TOKEN'].join('_'),
      ['WHATSAPP', 'GRAPH', 'API', 'VERSION'].join('_'),
      ['meta', 'whatsapp', 'cloud', 'api'].join('_'),
      ['phone', 'Number', 'Id'].join(''),
      ['business', 'Account', 'Id'].join(''),
    ];

    for (const fragment of forbiddenFragments) {
      expect(source).not.toContain(fragment);
    }

    expect(
      fs.existsSync(path.resolve('src/app/api/whatsapp/webhook/route.ts')),
    ).toBe(false);
  });
});
