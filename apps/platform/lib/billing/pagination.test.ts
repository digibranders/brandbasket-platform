import { describe, expect, it } from "vitest";
import { pageWindow } from "./pagination";

describe("pageWindow", () => {
  it("covers ten items a page", () => {
    expect(pageWindow(23, 1, 10)).toEqual({ page: 1, pageCount: 3, start: 0, end: 10 });
    expect(pageWindow(23, 2, 10)).toEqual({ page: 2, pageCount: 3, start: 10, end: 20 });
    expect(pageWindow(23, 3, 10)).toEqual({ page: 3, pageCount: 3, start: 20, end: 23 });
  });

  it("has exactly one page for a full page of items", () => {
    expect(pageWindow(10, 1, 10)).toEqual({ page: 1, pageCount: 1, start: 0, end: 10 });
  });

  it("clamps a page past either end to a real one", () => {
    expect(pageWindow(23, 9, 10).page).toBe(3);
    expect(pageWindow(23, 0, 10).page).toBe(1);
    expect(pageWindow(23, Number.NaN, 10).page).toBe(1);
  });

  it("gives an empty list one empty page", () => {
    expect(pageWindow(0, 1, 10)).toEqual({ page: 1, pageCount: 1, start: 0, end: 0 });
  });

  it("refuses a nonsense total or page size", () => {
    expect(() => pageWindow(-1, 1, 10)).toThrow(RangeError);
    expect(() => pageWindow(5, 1, 0)).toThrow(RangeError);
  });
});
