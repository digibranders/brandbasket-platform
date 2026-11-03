/*
 * Keeps the nightly Google pull polite (plan 62, "Rate limits"): a few businesses at a time, each starting at a random moment,
 * and a failed request retried with growing waits only when Google said "slow down" or was briefly unavailable.
 */

export const MAX_IN_FLIGHT = 3;
export const MAX_ATTEMPTS = 3;
const BASE_WAIT_MS = 2_000;
const START_JITTER_MS = 3_000;

export interface PaceOptions {
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
}

const realSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `work` for every item with at most MAX_IN_FLIGHT at once, each after a random wait. Results keep the order of `items`. */
export async function mapPaced<T, R>(items: readonly T[], work: (item: T) => Promise<R>, options: PaceOptions = {}): Promise<R[]> {
  const sleep = options.sleep ?? realSleep;
  const random = options.random ?? Math.random;
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const lane = async (): Promise<void> => {
    for (let index = next++; index < items.length; index = next++) {
      await sleep(Math.floor(random() * START_JITTER_MS));
      results[index] = await work(items[index] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(MAX_IN_FLIGHT, items.length) }, lane));
  return results;
}

/** Tries up to MAX_ATTEMPTS times, waiting 2, 4 seconds (plus jitter) between, and only when `retryable` says the failure may pass. */
export async function withBackoff<R>(attempt: () => Promise<R>, retryable: (error: unknown) => boolean, options: PaceOptions = {}): Promise<R> {
  const sleep = options.sleep ?? realSleep;
  const random = options.random ?? Math.random;
  for (let tries = 1; ; tries += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (tries >= MAX_ATTEMPTS || !retryable(error)) throw error;
      await sleep(BASE_WAIT_MS * 2 ** (tries - 1) + Math.floor(random() * 1_000));
    }
  }
}

/** Google said "slow down" or was briefly unavailable: worth another try. A refused grant or a wrong id is not. */
export function isRetryable(error: unknown): boolean {
  if (error instanceof Error && error.name === "GoogleUnavailable") return true;
  const failure = typeof error === "object" && error !== null && "failure" in error ? (error as { failure: unknown }).failure : null;
  return failure === "quota" || failure === "unavailable";
}
