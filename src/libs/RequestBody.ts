export class RequestBodyTooLargeError extends Error {
  constructor(public readonly maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes`);
  }
}

export const readRequestTextWithLimit = async (
  request: Request,
  maxBytes: number,
) => {
  const contentLength = Number(request.headers.get('content-length'));

  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError(maxBytes);
  }

  if (!request.body) {
    return '';
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytesRead = 0;
  let result = '';

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      bytesRead += value.byteLength;

      if (bytesRead > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError(maxBytes);
      }

      result += decoder.decode(value, { stream: true });
    }

    return result + decoder.decode();
  } finally {
    reader.releaseLock();
  }
};

export const readRequestJsonWithLimit = async (
  request: Request,
  maxBytes: number,
) => {
  return JSON.parse(await readRequestTextWithLimit(request, maxBytes)) as unknown;
};
