import { describe, expect, it } from "vitest";
import { chargedAmountCents, GST_BASIS_POINTS, NO_TAX } from "./tax";

describe("chargedAmountCents", () => {
  it("adds 18% GST to the Indian plan: ₹2,999 becomes ₹3,538.82", () => {
    expect(chargedAmountCents(299_900, 0, GST_BASIS_POINTS)).toBe(353_882);
  });

  it("charges the dollar plan as it stands, with no tax of ours", () => {
    expect(chargedAmountCents(6_900, 0, NO_TAX)).toBe(6_900);
  });

  it("takes a referral discount off before tax, as GST is charged on what is actually sold", () => {
    // ₹2,999 − ₹500 = ₹2,499, plus 18% = ₹2,948.82. Not ₹3,538.82 − ₹500.
    expect(chargedAmountCents(299_900, 50_000, GST_BASIS_POINTS)).toBe(294_882);
    expect(chargedAmountCents(6_900, 1_500, NO_TAX)).toBe(5_400);
  });

  it("rounds a half minor unit of tax up, and anything less down", () => {
    // 1 paise × 18% = 0.18 paise → 0. 3 paise × 18% = 0.54 → 1. 25 paise × 18% = 4.5 → 5.
    expect(chargedAmountCents(1, 0, GST_BASIS_POINTS)).toBe(1);
    expect(chargedAmountCents(3, 0, GST_BASIS_POINTS)).toBe(4);
    expect(chargedAmountCents(25, 0, GST_BASIS_POINTS)).toBe(30);
  });

  it("refuses a discount that leaves nothing to charge", () => {
    expect(() => chargedAmountCents(6_900, 6_900, NO_TAX)).toThrow(RangeError);
    expect(() => chargedAmountCents(6_900, 7_000, NO_TAX)).toThrow(RangeError);
  });

  it("refuses amounts and rates that are not whole, non-negative numbers", () => {
    expect(() => chargedAmountCents(-1, 0, NO_TAX)).toThrow(RangeError);
    expect(() => chargedAmountCents(10.5, 0, NO_TAX)).toThrow(RangeError);
    expect(() => chargedAmountCents(6_900, -1, NO_TAX)).toThrow(RangeError);
    expect(() => chargedAmountCents(6_900, 0, -1)).toThrow(RangeError);
    expect(() => chargedAmountCents(6_900, 0, 18.5)).toThrow(RangeError);
  });
});

describe("a discounted provider plan", () => {
  it("charges exactly what the webhook expects of a discounted subscription, for every discount on both plans", () => {
    // The Razorpay plan a code runs on is created at chargedAmountCents(net - discount, 0, tax); the webhook expects
    // chargedAmountCents(net, discount, tax). Both tax the same figure, so they can never differ by a paisa.
    for (const [net, tax] of [
      [299_900, GST_BASIS_POINTS],
      [6_900, NO_TAX],
    ] as const) {
      for (let discount = 1; discount < net; discount += 7) {
        expect(chargedAmountCents(net - discount, 0, tax)).toBe(chargedAmountCents(net, discount, tax));
      }
    }
  });
});
