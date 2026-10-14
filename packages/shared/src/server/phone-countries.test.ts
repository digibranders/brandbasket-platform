import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { flagOf, phoneCountryOptions } = await import("./phone-countries");

describe("phoneCountryOptions", () => {
  const options = phoneCountryOptions();

  it("lists every supported country once", () => {
    expect(options.length).toBeGreaterThan(200);
    expect(new Set(options.map((option) => option.code)).size).toBe(options.length);
  });

  it("uses two capital letters for every code", () => {
    for (const option of options) expect(option.code, option.name).toMatch(/^[A-Z]{2}$/);
  });

  it("carries the dial code, English name and flag", () => {
    const byCode = new Map(options.map((option) => [option.code, option]));
    expect(byCode.get("IN")).toMatchObject({ name: "India", dialCode: "+91", flag: flagOf("IN") });
    expect(byCode.get("US")).toMatchObject({ name: "United States", dialCode: "+1" });
    expect(byCode.get("GB")).toMatchObject({ name: "United Kingdom", dialCode: "+44" });
    for (const option of options) expect(option.dialCode, option.code).toMatch(/^\+\d{1,3}$/);
  });

  it("gives an example national number for the placeholder", () => {
    const india = options.find((option) => option.code === "IN");
    expect(india?.example).toMatch(/^[\d\s()-]+$/);
    // Written as it's typed beside the +91 select: no country code, and no leading trunk 0.
    expect(india?.example).toMatch(/^[1-9]/);
  });

  it("gives the shortest and longest national number each country dials, for the browser's length check", () => {
    const byCode = new Map(options.map((option) => [option.code, option]));
    expect(byCode.get("US")?.digits).toEqual({ min: 10, max: 10 });
    expect(byCode.get("IN")?.digits).toEqual({ min: 8, max: 13 });
    for (const option of options) expect(option.digits.min, option.code).toBeLessThanOrEqual(option.digits.max);
  });

  it("is sorted by name", () => {
    const names = options.map((option) => option.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en")));
  });

  it("is built once", () => {
    expect(phoneCountryOptions()).toBe(options);
  });
});

describe("flagOf", () => {
  it("builds the regional indicator pair for a code", () => {
    expect(Array.from(flagOf("IN"), (symbol) => symbol.codePointAt(0))).toEqual([0x1f1ee, 0x1f1f3]);
    expect(Array.from(flagOf("GB"), (symbol) => symbol.codePointAt(0))).toEqual([0x1f1ec, 0x1f1e7]);
  });
});
