import { describe, expect, it } from "vitest";
import { countWords, readingMinutes } from "./blog-text-stats";

describe("countWords", () => {
  it("counts words separated by any whitespace", () => {
    expect(countWords("  Fresh bread\n every   morning ")).toBe(4);
  });

  it("is zero for blank text", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });
});

describe("readingMinutes", () => {
  it("rounds up to whole minutes, with at least one for a short post", () => {
    expect(readingMinutes(1)).toBe(1);
    expect(readingMinutes(200)).toBe(1);
    expect(readingMinutes(201)).toBe(2);
  });

  it("is zero for an empty post", () => {
    expect(readingMinutes(0)).toBe(0);
  });
});
