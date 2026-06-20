import { describe, expect, it } from 'vitest';
import {
  readRequestJsonWithLimit,
  readRequestTextWithLimit,
  RequestBodyTooLargeError,
} from './RequestBody';

describe('RequestBody', () => {
  it('reads a request body within the byte limit', async () => {
    const request = new Request('https://example.com', {
      body: JSON.stringify({ message: 'hello' }),
      method: 'POST',
    });

    await expect(readRequestJsonWithLimit(request, 100))
      .resolves
      .toEqual({ message: 'hello' });
  });

  it('rejects content-length above the limit before reading', async () => {
    const request = new Request('https://example.com', {
      body: 'small',
      headers: {
        'content-length': '1000',
      },
      method: 'POST',
    });

    await expect(readRequestTextWithLimit(request, 100))
      .rejects
      .toBeInstanceOf(RequestBodyTooLargeError);
  });

  it('rejects streamed content that exceeds the limit', async () => {
    const request = new Request('https://example.com', {
      body: 'x'.repeat(101),
      method: 'POST',
    });

    await expect(readRequestTextWithLimit(request, 100))
      .rejects
      .toBeInstanceOf(RequestBodyTooLargeError);
  });
});
