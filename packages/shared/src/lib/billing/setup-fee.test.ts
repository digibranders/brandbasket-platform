import { describe, expect, it } from "vitest";
import { buildDiscountCents, setupFeeFor } from "./setup-fee";

describe("buildDiscountCents", () => {
  it("takes an amount, a percentage or a final price", () => {
    expect(buildDiscountCents(3_500_000, { kind: "amount", cents: 1_000_000 })).toBe(1_000_000);
    expect(buildDiscountCents(3_500_000, { kind: "percent", basisPoints: 2_000 })).toBe(700_000);
    expect(buildDiscountCents(3_500_000, { kind: "final", cents: 2_000_000 })).toBe(1_500_000);
  });
  it("rounds a percentage down to a whole rupee or dollar", () => {
    expect(buildDiscountCents(3_500_000, { kind: "percent", basisPoints: 3_333 })).toBe(1_166_500);
  });
  it("allows nothing off and the whole fee off", () => {
    expect(buildDiscountCents(3_500_000, { kind: "amount", cents: 0 })).toBe(0);
    expect(buildDiscountCents(3_500_000, { kind: "percent", basisPoints: 10_000 })).toBe(3_500_000);
    expect(buildDiscountCents(3_500_000, { kind: "final", cents: 0 })).toBe(3_500_000);
  });
  it("refuses a discount outside the fee", () => {
    expect(() => buildDiscountCents(3_500_000, { kind: "amount", cents: 3_500_001 })).toThrow(RangeError);
    expect(() => buildDiscountCents(3_500_000, { kind: "amount", cents: -1 })).toThrow(RangeError);
    expect(() => buildDiscountCents(3_500_000, { kind: "percent", basisPoints: 10_001 })).toThrow(RangeError);
    expect(() => buildDiscountCents(3_500_000, { kind: "final", cents: 3_500_001 })).toThrow(RangeError);
    expect(() => buildDiscountCents(3_500_000, { kind: "amount", cents: 1.5 })).toThrow(RangeError);
  });
});

describe("setupFeeFor", () => {
  it("is the list fee for the kind, less the discount", () => {
    expect(setupFeeFor("ecommerce", "INR", 1_500_000)).toEqual({ listCents: 6_500_000, discountCents: 1_500_000, netCents: 5_000_000 });
    expect(setupFeeFor("b2b", "USD", 0)).toEqual({ listCents: 120_000, discountCents: 0, netCents: 120_000 });
  });
  it("refuses a discount above the fee", () => {
    expect(() => setupFeeFor("b2b", "INR", 3_500_001)).toThrow(RangeError);
  });
});
