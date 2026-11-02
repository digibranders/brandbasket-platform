import { describe, expect, it } from "vitest";
import { BodyTooLargeError, readLimitedBody } from "./read-limited-body";

/** A stream that hands out `chunks` one at a time and records how many were pulled and whether it was cancelled. */
function trackedStream(chunks: readonly Uint8Array[]) {
  const state = { pulled: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[state.pulled];
      if (chunk === undefined) {
        controller.close();
        return;
      }
      state.pulled += 1;
      controller.enqueue(chunk);
    },
    cancel() {
      state.cancelled = true;
    },
  }, { highWaterMark: 0 });
  return { stream, state };
}

describe("readLimitedBody", () => {
  it("joins the chunks of a body within the limit", async () => {
    const { stream } = trackedStream([new Uint8Array([1, 2]), new Uint8Array([3]), new Uint8Array([4, 5])]);
    await expect(readLimitedBody(stream, 5)).resolves.toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it("reads a missing body as empty", async () => {
    await expect(readLimitedBody(null, 5)).resolves.toEqual(new Uint8Array(0));
  });

  it("stops and cancels the stream as soon as the count passes the limit", async () => {
    const chunks = Array.from({ length: 50 }, () => new Uint8Array(4));
    const { stream, state } = trackedStream(chunks);

    await expect(readLimitedBody(stream, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(state.pulled).toBe(3);
    expect(state.cancelled).toBe(true);
  });
});
