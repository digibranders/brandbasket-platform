import { describe, expect, it } from "vitest";
import { BillingRangeError } from "./billing-range-error";
import { splitGst, splitGstAcross, supplyTypeOf } from "./gst";
import { UnknownStateError } from "./gst-states";
import { GST_BASIS_POINTS } from "./tax";

describe("splitGst", () => {
  it("splits 18% into equal CGST and SGST within a state: ₹5,599.20 gives ₹503.93 each", () => {
    expect(splitGst(559_920, GST_BASIS_POINTS, "intra_state")).toEqual({
      cgstCents: 50_393,
      sgstCents: 50_393,
      igstCents: 0,
      taxCents: 100_786,
    });
  });

  it("charges IGST across states, rounded once", () => {
    expect(splitGst(559_920, GST_BASIS_POINTS, "inter_state")).toEqual({
      cgstCents: 0,
      sgstCents: 0,
      igstCents: 100_786,
      taxCents: 100_786,
    });
  });

  it("rounds each half on its own, so CGST always equals SGST even when that loses a paisa", () => {
    // 9% of 25 paise is 2.25: each half rounds to 2, total 4. One rounding of 18% would give 5.
    expect(splitGst(25, GST_BASIS_POINTS, "intra_state")).toEqual({
      cgstCents: 2,
      sgstCents: 2,
      igstCents: 0,
      taxCents: 4,
    });
    expect(splitGst(25, GST_BASIS_POINTS, "inter_state").taxCents).toBe(5);
  });

  it("has nothing to split at a zero rate", () => {
    expect(splitGst(10_000, 0, "intra_state").taxCents).toBe(0);
  });

  it("refuses a rate that cannot be halved into whole basis points within a state", () => {
    expect(() => splitGst(10_000, 1_801, "intra_state")).toThrow(RangeError);
    expect(() => splitGst(10_000, 1_801, "intra_state")).toThrow(BillingRangeError);
  });

  it("refuses a taxable value that is not a whole, non-negative number of paise", () => {
    expect(() => splitGst(Number.NaN, GST_BASIS_POINTS, "intra_state")).toThrow(RangeError);
    expect(() => splitGst(-1, GST_BASIS_POINTS, "intra_state")).toThrow(RangeError);
    expect(() => splitGst(10.5, GST_BASIS_POINTS, "inter_state")).toThrow(RangeError);
  });

  it("refuses a rate that is not a whole number of basis points between 0 and 10000", () => {
    expect(() => splitGst(10_000, 10_001, "inter_state")).toThrow(RangeError);
    expect(() => splitGst(10_000, -1, "inter_state")).toThrow(RangeError);
    expect(() => splitGst(10_000, Number.NaN, "inter_state")).toThrow(RangeError);
    expect(() => splitGst(10_000, 1_800.5, "inter_state")).toThrow(RangeError);
  });
});

describe("splitGstAcross", () => {
  const line = (taxableCents: number, rateBasisPoints = GST_BASIS_POINTS) => ({ taxableCents, rateBasisPoints });

  it("spreads the GST on the total over the lines, so they add up to it where rounding each line would not", () => {
    // 239,920 + 799,920 at 18% is 43,185.6 + 143,985.6: each rounds up to 187,172 together, the total (187,171.2) rounds down to 187,171.
    const lines = splitGstAcross([line(239_920), line(799_920)], "inter_state");
    expect(lines.map((tax) => tax.igstCents)).toEqual([43_186, 143_985]);
    expect(lines.reduce((total, tax) => total + tax.taxCents, 0)).toBe(splitGst(1_039_840, GST_BASIS_POINTS, "inter_state").taxCents);
  });

  it("gives each line equal CGST and SGST that add up to the halves of the total", () => {
    const lines = splitGstAcross([line(239_920), line(799_920)], "intra_state");
    const total = splitGst(1_039_840, GST_BASIS_POINTS, "intra_state");
    expect(lines.every((tax) => tax.cgstCents === tax.sgstCents && tax.igstCents === 0 && tax.taxCents === 2 * tax.cgstCents)).toBe(true);
    expect(lines.reduce((sum, tax) => sum + tax.cgstCents, 0)).toBe(total.cgstCents);
    expect(lines.reduce((sum, tax) => sum + tax.sgstCents, 0)).toBe(total.sgstCents);
  });

  it("hands the spare paisa to the line with the largest remainder, and to the earlier line on a tie", () => {
    // 25 paise at 18% is 4.5: two lines floor to 4 + 4 and the total, 9, needs one more.
    expect(splitGstAcross([line(25), line(25)], "inter_state").map((tax) => tax.igstCents)).toEqual([5, 4]);
    // 10 paise is 1.8 and 20 paise is 3.6: the total 5.4 rounds to 5, the floors give 1 + 3, and 10 paise has the larger remainder.
    expect(splitGstAcross([line(10), line(20)], "inter_state").map((tax) => tax.igstCents)).toEqual([2, 3]);
  });

  it("works each rate on its own", () => {
    const lines = splitGstAcross([line(10_000), line(10_000, 500), line(10_000, 0)], "intra_state");
    expect(lines.map((tax) => tax.taxCents)).toEqual([1_800, 500, 0]);
  });

  it("gives no line a negative amount, and refuses a line that is not whole paise", () => {
    expect(splitGstAcross([line(1), line(1), line(1)], "inter_state").every((tax) => tax.igstCents >= 0)).toBe(true);
    expect(() => splitGstAcross([line(-1)], "inter_state")).toThrow(RangeError);
  });
});

describe("supplyTypeOf", () => {
  it("is intra-state when the place of supply is our own state", () => {
    expect(supplyTypeOf("mh", "mh")).toBe("intra_state");
    expect(supplyTypeOf("mh", "ka")).toBe("inter_state");
  });

  it("throws for a state code it does not know, rather than quietly choosing IGST", () => {
    expect(() => supplyTypeOf("mh", "MH")).toThrow(UnknownStateError);
    expect(() => supplyTypeOf("mh", "xx")).toThrow(UnknownStateError);
    expect(() => supplyTypeOf("xx", "mh")).toThrow(UnknownStateError);
  });
});
