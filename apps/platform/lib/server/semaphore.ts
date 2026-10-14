/**
 * Runs at most `limit` tasks at once in this process; up to `maxWaiting` more wait in arrival order, and any beyond
 * that are refused at once with SemaphoreFullError rather than queued. Used to bound how many images are decoded
 * together, since each decode can hold a large pixel buffer, and how many uploads can sit in memory waiting to.
 */
export interface Semaphore {
  run<T>(task: () => Promise<T>): Promise<T>;
  /** Tasks running right now. */
  readonly active: number;
  /** Tasks waiting for a slot. */
  readonly waiting: number;
  /**
   * Whether a task started now would be accepted (run or queued) rather than refused. A snapshot: by the time the
   * task is started another may have taken the last place, and `run` still refuses it then.
   */
  readonly hasCapacity: boolean;
}

export interface SemaphoreOptions {
  /** Tasks that may run at once: a whole number, at least 1. */
  readonly limit: number;
  /** Tasks that may wait for a slot: a whole number, 0 or more. */
  readonly maxWaiting: number;
}

/** Every slot is taken and the waiting line is full. The task was not started and will not be. */
export class SemaphoreFullError extends Error {
  constructor(limit: number, maxWaiting: number) {
    super(`All ${String(limit)} slots are busy and ${String(maxWaiting)} tasks are already waiting.`);
    this.name = "SemaphoreFullError";
  }
}

export function createSemaphore({ limit, maxWaiting }: SemaphoreOptions): Semaphore {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError(`A semaphore needs a whole-number limit of at least 1, received ${String(limit)}`);
  }
  if (!Number.isInteger(maxWaiting) || maxWaiting < 0) {
    throw new RangeError(`A semaphore needs a whole-number waiting bound of 0 or more, received ${String(maxWaiting)}`);
  }
  let active = 0;
  const queue: (() => void)[] = [];

  function acquire(): Promise<void> {
    if (active < limit) {
      active += 1;
      return Promise.resolve();
    }
    if (queue.length >= maxWaiting) return Promise.reject(new SemaphoreFullError(limit, maxWaiting));
    return new Promise((resolve) => {
      // The slot is handed over directly by release(), so `active` does not change here.
      queue.push(resolve);
    });
  }

  function release(): void {
    const next = queue.shift();
    if (next === undefined) {
      active -= 1;
    } else {
      next();
    }
  }

  return {
    async run<T>(task: () => Promise<T>): Promise<T> {
      // A refusal rejects here, before the try: it never held a slot, so it must not release one.
      await acquire();
      try {
        return await task();
      } finally {
        release();
      }
    },
    get active() {
      return active;
    },
    get waiting() {
      return queue.length;
    },
    get hasCapacity() {
      return active < limit || queue.length < maxWaiting;
    },
  };
}
