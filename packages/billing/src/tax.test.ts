import { describe, expect, it } from "vitest";
import { chargedAmountCents, GST_BASIS_POINTS, gstInsideCents, NO_TAX, taxableCents } from "./tax";

describe("chargedAmountCents", () => {
  it("charges the price as written: every price includes GST, so ₹2,999 is ₹2,999 (owner, 2026-10-26)", () => {
    expect(chargedAmountCents(299_900, 0)).toBe(299_900);
  });

  it("charges the dollar price as it stands too", () => {
    expect(chargedAmountCents(6_500, 0)).toBe(6_500);
  });

  it("takes a discount off the price the customer pays", () => {
    // A ₹500 code on the ₹2,999 plan: ₹2,499 paid, GST inside it. Not a discount on a price before GST.
    expect(chargedAmountCents(299_900, 50_000)).toBe(249_900);
    expect(chargedAmountCents(6_500, 1_500)).toBe(5_000);
  });

  it("refuses a discount that leaves nothing to charge", () => {
    expect(() => chargedAmountCents(6_500, 6_500)).toThrow(RangeError);
    expect(() => chargedAmountCents(6_500, 7_000)).toThrow(RangeError);
  });

  it("refuses amounts that are not whole, non-negative numbers", () => {
    expect(() => chargedAmountCents(-1, 0)).toThrow(RangeError);
    expect(() => chargedAmountCents(10.5, 0)).toThrow(RangeError);
    expect(() => chargedAmountCents(6_500, -1)).toThrow(RangeError);
  });
});

describe("gstInsideCents", () => {
  // Figures worked out on their own: tax = 2 x round half up (price x 900 / 11,800), so CGST and SGST are equal halves.
  it.each([
    [299_900, 45_748, 254_152],
    [999_900, 152_528, 847_372],
    [2_499_900, 381_340, 2_118_560],
    [1_169_900, 178_460, 991_440],
    [2_519_900, 384_392, 2_135_508],
    [3_149_900, 480_494, 2_669_406],
    [3_039_800, 463_698, 2_576_102],
    [249_900, 38_120, 211_780],
    [354_000, 54_000, 300_000],
  ])("finds the GST inside %i paise: %i of tax, %i taxable", (charged, tax, taxable) => {
    expect(gstInsideCents(charged, GST_BASIS_POINTS)).toBe(tax);
    expect(taxableCents(charged, GST_BASIS_POINTS)).toBe(taxable);
    expect(taxable + tax).toBe(charged);
  });

  it("is always an even number of paise, so CGST and SGST are never a paisa apart", () => {
    for (let charged = 1; charged <= 5_000; charged += 1) expect(gstInsideCents(charged, GST_BASIS_POINTS) % 2).toBe(0);
  });

  it("rounds a half paisa of each half up, and anything less down", () => {
    // 25 paise x 900 / 11,800 = 1.9 -> 2 per half. 1 paisa -> 0.08 -> 0.
    expect(gstInsideCents(25, GST_BASIS_POINTS)).toBe(4);
    expect(gstInsideCents(1, GST_BASIS_POINTS)).toBe(0);
  });

  it("has no tax of ours on a dollar price", () => {
    expect(gstInsideCents(6_500, NO_TAX)).toBe(0);
    expect(taxableCents(6_500, NO_TAX)).toBe(6_500);
  });

  it("refuses a rate that cannot split into two equal halves, or amounts that are not whole", () => {
    expect(() => gstInsideCents(299_900, 1_801)).toThrow(RangeError);
    expect(() => gstInsideCents(299_900, -2)).toThrow(RangeError);
    expect(() => gstInsideCents(10.5, GST_BASIS_POINTS)).toThrow(RangeError);
    expect(() => gstInsideCents(-1, GST_BASIS_POINTS)).toThrow(RangeError);
  });
});
