import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and joins words with hyphens", () => {
    expect(slugify("Riverside Plumbing")).toBe("riverside-plumbing");
  });

  it("strips punctuation and accents", () => {
    expect(slugify("Café Niño & Co.")).toBe("cafe-nino-co");
  });

  it("collapses repeated separators and trims them", () => {
    expect(slugify("  --Bella   Vista--  ")).toBe("bella-vista");
  });

  it("falls back when nothing usable is left", () => {
    expect(slugify("!!!")).toBe("business");
  });

  it("never ends with a separator after the length cap", () => {
    expect(slugify(`${"a".repeat(59)} b`)).toBe("a".repeat(59));
  });

  it("caps the length", () => {
    expect(slugify("a".repeat(100))).toHaveLength(60);
  });
});
