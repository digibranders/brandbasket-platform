/** The request body went past the byte limit, whatever its Content-Length said. */
export class BodyTooLargeError extends Error {
  readonly limit: number;

  constructor(limit: number) {
    super(`The request body is larger than ${limit} bytes.`);
    this.name = "BodyTooLargeError";
    this.limit = limit;
  }
}

/**
 * Reads a request body into memory, counting bytes as they arrive and cancelling the stream the moment the count
 * passes `limit`, so a body that lies about its length is never buffered beyond the limit. A missing body reads as
 * empty.
 */
export async function readLimitedBody(body: ReadableStream<Uint8Array> | null, limit: number): Promise<Uint8Array> {
  if (body === null) return new Uint8Array(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => undefined);
        throw new BodyTooLargeError(limit);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
