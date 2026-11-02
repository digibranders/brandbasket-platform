import { describe, expect, it, vi } from "vitest";
import { createSemaphore, SemaphoreFullError } from "./semaphore";

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

function deferred(): Deferred {
  let resolve: () => void = () => undefined;
  let reject: (error: Error) => void = () => undefined;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

async function settle(): Promise<void> {
  for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();
}

describe("createSemaphore", () => {
  it("runs at most the limit at once and starts the rest in arrival order", async () => {
    const semaphore = createSemaphore({ limit: 2, maxWaiting: 2 });
    const gates = [deferred(), deferred(), deferred(), deferred()];
    const started: number[] = [];
    const runs = gates.map((gate, index) =>
      semaphore.run(async () => {
        started.push(index);
        await gate.promise;
        return index;
      }),
    );

    await settle();
    expect(started).toEqual([0, 1]);
    expect([semaphore.active, semaphore.waiting]).toEqual([2, 2]);

    gates[1]?.resolve();
    await settle();
    expect(started).toEqual([0, 1, 2]);
    expect([semaphore.active, semaphore.waiting]).toEqual([2, 1]);

    gates[0]?.resolve();
    gates[2]?.resolve();
    await settle();
    expect(started).toEqual([0, 1, 2, 3]);

    gates[3]?.resolve();
    await expect(Promise.all(runs)).resolves.toEqual([0, 1, 2, 3]);
    expect([semaphore.active, semaphore.waiting]).toEqual([0, 0]);
  });

  it("frees the slot when a task fails, and passes the failure on", async () => {
    const semaphore = createSemaphore({ limit: 1, maxWaiting: 1 });
    const failing = deferred();
    const first = semaphore.run(() => failing.promise);
    const second = semaphore.run(async () => "second");

    await settle();
    expect(semaphore.waiting).toBe(1);
    failing.reject(new Error("decode failed"));

    await expect(first).rejects.toThrow("decode failed");
    await expect(second).resolves.toBe("second");
    expect([semaphore.active, semaphore.waiting]).toEqual([0, 0]);
  });

  it("refuses a task at once when every slot is busy and the line is full, without running it", async () => {
    const semaphore = createSemaphore({ limit: 2, maxWaiting: 1 });
    const gates = [deferred(), deferred(), deferred()];
    const runs = gates.map((gate) => semaphore.run(() => gate.promise));
    await settle();
    expect([semaphore.active, semaphore.waiting]).toEqual([2, 1]);

    const refusedTask = vi.fn(async () => "never");
    await expect(semaphore.run(refusedTask)).rejects.toBeInstanceOf(SemaphoreFullError);
    expect(refusedTask).not.toHaveBeenCalled();
    // The refusal took no slot and left the line as it was.
    expect([semaphore.active, semaphore.waiting]).toEqual([2, 1]);

    gates[0]?.resolve();
    await settle();
    expect([semaphore.active, semaphore.waiting]).toEqual([2, 0]);
    // With room in the line again, the next task is queued rather than refused.
    const admitted = semaphore.run(async () => "admitted");
    await settle();
    expect(semaphore.waiting).toBe(1);

    gates[1]?.resolve();
    gates[2]?.resolve();
    await expect(admitted).resolves.toBe("admitted");
    await Promise.all(runs);
    expect([semaphore.active, semaphore.waiting]).toEqual([0, 0]);
  });

  it("with no waiting room, refuses anything past the limit", async () => {
    const semaphore = createSemaphore({ limit: 1, maxWaiting: 0 });
    const gate = deferred();
    const first = semaphore.run(() => gate.promise);
    await expect(semaphore.run(async () => "second")).rejects.toBeInstanceOf(SemaphoreFullError);
    gate.resolve();
    await first;
    await expect(semaphore.run(async () => "third")).resolves.toBe("third");
  });

  it("reports whether a task started now would be accepted", async () => {
    const semaphore = createSemaphore({ limit: 1, maxWaiting: 1 });
    expect(semaphore.hasCapacity).toBe(true);
    let releaseFirst: () => void = () => undefined;
    const first = semaphore.run(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    expect(semaphore.hasCapacity).toBe(true);
    const second = semaphore.run(async () => undefined);
    expect(semaphore.hasCapacity).toBe(false);
    await expect(semaphore.run(async () => undefined)).rejects.toBeInstanceOf(SemaphoreFullError);

    releaseFirst();
    await Promise.all([first, second]);
    expect(semaphore.hasCapacity).toBe(true);
  });

  it("refuses bounds that make no sense", () => {
    expect(() => createSemaphore({ limit: 0, maxWaiting: 1 })).toThrow(RangeError);
    expect(() => createSemaphore({ limit: 1.5, maxWaiting: 1 })).toThrow(RangeError);
    expect(() => createSemaphore({ limit: 1, maxWaiting: -1 })).toThrow(RangeError);
    expect(() => createSemaphore({ limit: 1, maxWaiting: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  });
});
