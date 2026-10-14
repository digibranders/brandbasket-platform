import { describe, expect, it } from "vitest";
import { contourPaths, createRandom, type ContourOptions } from "./contours";

const base: ContourOptions = {
  cx: 300,
  cy: 300,
  rings: 6,
  baseRadius: 20,
  spacing: 18,
  wobble: 0.15,
  seed: 7,
};

describe("createRandom", () => {
  it("repeats the same sequence for the same seed and stays in [0, 1)", () => {
    const first = createRandom(42);
    const second = createRandom(42);
    for (let index = 0; index < 50; index += 1) {
      const value = first();
      expect(value).toBe(second());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("contourPaths", () => {
  it("returns one closed path per ring", () => {
    const paths = contourPaths(base);
    expect(paths).toHaveLength(6);
    for (const path of paths) {
      expect(path.startsWith("M")).toBe(true);
      expect(path.endsWith("Z")).toBe(true);
    }
  });

  it("is deterministic for a seed and varies across seeds", () => {
    expect(contourPaths(base)).toEqual(contourPaths(base));
    expect(contourPaths({ ...base, seed: 8 })).not.toEqual(contourPaths(base));
  });

  it("draws circles when wobble is zero", () => {
    const [path] = contourPaths({ ...base, rings: 1, wobble: 0, samples: 8 });
    expect(path?.startsWith("M320 300")).toBe(true);
  });

  it("rejects invalid options", () => {
    expect(() => contourPaths({ ...base, rings: 0 })).toThrow(RangeError);
    expect(() => contourPaths({ ...base, wobble: 0.5 })).toThrow(RangeError);
    expect(() => contourPaths({ ...base, samples: 4 })).toThrow(RangeError);
    expect(() => contourPaths({ ...base, spacing: 0 })).toThrow(RangeError);
    expect(() => contourPaths({ ...base, seed: Number.NaN })).toThrow(RangeError);
  });
});
