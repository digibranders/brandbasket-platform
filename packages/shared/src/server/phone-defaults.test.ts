import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { savedPhoneStart, VISITOR_COUNTRY_HEADER, visitorPhoneCountry } = await import("./phone-defaults");

function headersWith(country: string | null): Headers {
  const headers = new Headers();
  if (country !== null) headers.set(VISITOR_COUNTRY_HEADER, country);
  return headers;
}

describe("visitorPhoneCountry", () => {
  it("uses Vercel's country when it is a supported code", () => {
    expect(visitorPhoneCountry(headersWith("GB"))).toBe("GB");
    expect(visitorPhoneCountry(headersWith(" US "))).toBe("US");
  });

  it("falls back to India without a usable header", () => {
    for (const value of [null, "", "XX", "gb", "GBR", "constructor", "A1", "<b>"]) {
      expect(visitorPhoneCountry(headersWith(value)), String(value)).toBe("IN");
    }
  });
});

describe("savedPhoneStart", () => {
  it("splits a saved E.164 number into its country and national layout", () => {
    expect(savedPhoneStart("+919876543210")).toEqual({ country: "IN", number: "98765 43210" });
    expect(savedPhoneStart("+442079460958")).toEqual({ country: "GB", number: "020 7946 0958" });
    expect(savedPhoneStart("+14165550123")).toMatchObject({ country: "CA" });
  });

  it("has no country for nothing saved", () => {
    expect(savedPhoneStart(null)).toEqual({ country: null, number: "" });
    expect(savedPhoneStart("  ")).toEqual({ country: null, number: "" });
  });

  it("shows an older number as it was saved when it cannot be read", () => {
    expect(savedPhoneStart("98765 43210")).toEqual({ country: null, number: "98765 43210" });
  });

  it("keeps a number with no single country in international form", () => {
    expect(savedPhoneStart("+80012345678")).toEqual({ country: null, number: "+80012345678" });
  });
});
