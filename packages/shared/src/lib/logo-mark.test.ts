import { describe, expect, it } from "vitest";
import { createLogoMarkPaths } from "./logo-mark";

function numbersIn(path: string): number[] {
  return (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number);
}

function horizontalExtent(path: string): number {
  const xs = numbersIn(path).filter((_, index) => index % 2 === 0);
  return Math.max(...xs) - Math.min(...xs);
}

describe("createLogoMarkPaths", () => {
  it("draws one closed ring per requested ring", () => {
    const paths = createLogoMarkPaths({ rings: 5, size: 100 });
    expect(paths).toHaveLength(5);
    for (const path of paths) {
      expect(path.startsWith("M")).toBe(true);
      expect(path.endsWith("Z")).toBe(true);
    }
  });

  it("keeps every ring inside the square with room for the stroke", () => {
    for (const rings of [3, 5]) {
      for (const path of createLogoMarkPaths({ rings, size: 100 })) {
        for (const value of numbersIn(path)) {
          expect(value).toBeGreaterThanOrEqual(2);
          expect(value).toBeLessThanOrEqual(98);
        }
      }
    }
  });

  it("nests rings from the innermost outwards", () => {
    const extents = createLogoMarkPaths({ rings: 5, size: 100 }).map(horizontalExtent);
    for (let index = 1; index < extents.length; index += 1) {
      expect(extents[index]).toBeGreaterThan(extents[index - 1] ?? Number.POSITIVE_INFINITY);
    }
  });

  it("points the outer ring's top lobe straight up", () => {
    const outer = createLogoMarkPaths({ rings: 5, size: 100 }).at(-1) ?? "";
    const [startX, startY] = numbersIn(outer);
    expect(startX).toBe(50);
    expect(startY).toBeLessThan(10);
  });

  it("is deterministic", () => {
    expect(createLogoMarkPaths({ rings: 5, size: 100 })).toEqual(createLogoMarkPaths({ rings: 5, size: 100 }));
  });

  it("rejects invalid ring counts and sizes", () => {
    expect(() => createLogoMarkPaths({ rings: 0, size: 100 })).toThrow(RangeError);
    expect(() => createLogoMarkPaths({ rings: 2.5, size: 100 })).toThrow(RangeError);
    expect(() => createLogoMarkPaths({ rings: 9, size: 100 })).toThrow(RangeError);
    expect(() => createLogoMarkPaths({ rings: 5, size: 0 })).toThrow(RangeError);
  });
});
