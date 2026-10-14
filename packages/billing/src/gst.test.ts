import { describe, expect, it } from "vitest";
import { BillingRangeError } from "./billing-range-error";
import { splitGst, supplyTypeOf } from "./gst";
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
