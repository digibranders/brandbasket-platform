import { describe, expect, it } from "vitest";
import { countryOptions, COUNTRY_CODES, HOME_COUNTRY, isCountryCode } from "./countries";

describe("countries", () => {
  it("knows India and rejects anything that is not a listed code", () => {
    expect(HOME_COUNTRY).toBe("IN");
    expect(isCountryCode("IN")).toBe(true);
    expect(isCountryCode("US")).toBe(true);
    expect(isCountryCode("in")).toBe(false);
    expect(isCountryCode("XX")).toBe(false);
    expect(isCountryCode("")).toBe(false);
  });

  it("names every code once, in English", () => {
    const options = countryOptions();
    expect(options).toHaveLength(COUNTRY_CODES.length);
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
    expect(options.find((option) => option.code === "IN")?.name).toBe("India");
    expect(options.every((option) => option.name.length > 1)).toBe(true);
  });
});
