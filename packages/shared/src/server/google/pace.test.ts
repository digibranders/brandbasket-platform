import { describe, expect, it } from "vitest";
import { mapPaced, MAX_ATTEMPTS, MAX_IN_FLIGHT, withBackoff } from "./pace";

const noWait = { sleep: async () => undefined, random: () => 0 };

describe("mapPaced", () => {
  it("never has more than the limit in flight and keeps the order of the items", async () => {
    let active = 0;
    let peak = 0;
    const out = await mapPaced(
      [1, 2, 3, 4, 5, 6, 7],
      async (n) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return n * 2;
      },
      noWait,
    );
    expect(out).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBe(MAX_IN_FLIGHT);
  });
  it("starts each item after a random wait", async () => {
    const waits: number[] = [];
    await mapPaced([1, 2], async () => 0, { sleep: async (ms) => void waits.push(ms), random: () => 0.5 });
    expect(waits).toEqual([1500, 1500]);
  });
});

describe("withBackoff", () => {
  it("retries a retryable failure with growing waits, then gives the answer", async () => {
    const waits: number[] = [];
    let calls = 0;
    const result = await withBackoff(async () => { calls += 1; if (calls < 3) throw new Error("slow down"); return "ok"; }, () => true, { sleep: async (ms) => void waits.push(ms), random: () => 0 });
    expect(result).toBe("ok");
    expect(waits).toEqual([2000, 4000]);
  });
  it("gives up after the attempt limit and never retries what cannot pass", async () => {
    let calls = 0;
    await expect(withBackoff(async () => { calls += 1; throw new Error("nope"); }, () => true, noWait)).rejects.toThrow("nope");
    expect(calls).toBe(MAX_ATTEMPTS);
    calls = 0;
    await expect(withBackoff(async () => { calls += 1; throw new Error("denied"); }, () => false, noWait)).rejects.toThrow("denied");
    expect(calls).toBe(1);
  });
});
