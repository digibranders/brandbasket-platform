import { describe, expect, it } from "vitest";
import { conversionValueCents } from "./value";

describe("conversionValueCents", () => {
  it("takes the GST on the tax invoice off a rupee payment", () => {
    expect(conversionValueCents({ amountCents: 299900, currency: "INR", gstCents: 45746 })).toBe(254154);
  });

  it("works the GST out of an 18 percent inclusive price when there is no invoice", () => {
    expect(conversionValueCents({ amountCents: 299900, currency: "INR", gstCents: null })).toBe(254153);
    expect(conversionValueCents({ amountCents: 11800, currency: "INR", gstCents: null })).toBe(10000);
  });

  it("leaves a dollar payment as it was paid: it carries no GST", () => {
    expect(conversionValueCents({ amountCents: 6500, currency: "USD", gstCents: null })).toBe(6500);
    expect(conversionValueCents({ amountCents: 6500, currency: "USD", gstCents: 0 })).toBe(6500);
  });

  it("never goes below zero", () => {
    expect(conversionValueCents({ amountCents: 100, currency: "INR", gstCents: 500 })).toBe(0);
  });
});
