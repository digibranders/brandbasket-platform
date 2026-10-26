import { describe, expect, it } from "vitest";
import { splitGstInside, supplyTypeOf } from "./gst";
import { UnknownStateError } from "./gst-states";
import { GST_BASIS_POINTS, gstInsideCents } from "./tax";

describe("splitGstInside", () => {
  const line = (paidCents: number, rateBasisPoints = GST_BASIS_POINTS) => ({ paidCents, rateBasisPoints });

  it("works the GST out of a price that includes it: ₹2,999 holds ₹2,541.52 taxable and ₹228.74 each of CGST and SGST", () => {
    const [only] = splitGstInside([line(299_900)], "intra_state");
    expect(only).toMatchObject({ taxableCents: 254_152, cgstCents: 22_874, sgstCents: 22_874, igstCents: 0, taxCents: 45_748 });
  });

  it("charges one IGST across states, the same tax as CGST plus SGST", () => {
    const [only] = splitGstInside([line(299_900)], "inter_state");
    expect(only).toMatchObject({ taxableCents: 254_152, cgstCents: 0, sgstCents: 0, igstCents: 45_748, taxCents: 45_748 });
  });

  it("shares the GST of the total over the lines by the largest remainder, so the lines add up to it to the paisa (Website + Social)", () => {
    // Worked out on their own: 269,910 + 899,990 paid is 1,169,900, which holds 178,460 of GST.
    expect(splitGstInside([line(269_910), line(899_990)], "intra_state")).toMatchObject([
      { taxableCents: 228_738, cgstCents: 20_586, sgstCents: 20_586, taxCents: 41_172 },
      { taxableCents: 762_702, cgstCents: 68_644, sgstCents: 68_644, taxCents: 137_288 },
    ]);
    expect(splitGstInside([line(269_910), line(899_990)], "inter_state")).toMatchObject([
      { taxableCents: 228_737, igstCents: 41_173, taxCents: 41_173 },
      { taxableCents: 762_703, igstCents: 137_287, taxCents: 137_287 },
    ]);
  });

  it("gives every line equal CGST and SGST, adding up to the halves of the tax inside the total", () => {
    const lines = splitGstInside([line(269_910), line(899_990), line(1_869_900)], "intra_state");
    const tax = gstInsideCents(269_910 + 899_990 + 1_869_900, GST_BASIS_POINTS);
    expect(lines.every((part) => part.cgstCents === part.sgstCents && part.igstCents === 0 && part.taxCents === 2 * part.cgstCents)).toBe(true);
    expect(lines.reduce((total, part) => total + part.taxCents, 0)).toBe(tax);
  });

  it("lets every line's taxable value and tax add up to what it was paid", () => {
    const paid = [269_910, 899_990, 1_869_900, 1];
    for (const supply of ["intra_state", "inter_state"] as const) {
      const lines = splitGstInside(paid.map((cents) => line(cents)), supply);
      lines.forEach((part, index) => expect(part.taxableCents + part.taxCents).toBe(paid[index]));
    }
  });

  it("hands the spare paisa to the line with the largest remainder, and to the earlier line on a tie", () => {
    // Two lines of 5,000: the tax inside 10,000 is 1,526, shared 763 each, so no spare. Odd sizes leave one to hand out.
    expect(splitGstInside([line(5_000), line(5_000)], "inter_state").map((part) => part.igstCents)).toEqual([763, 763]);
    const spare = splitGstInside([line(100), line(100), line(100)], "inter_state").map((part) => part.igstCents);
    expect(spare.reduce((total, tax) => total + tax, 0)).toBe(gstInsideCents(300, GST_BASIS_POINTS));
    expect(spare[0]).toBeGreaterThanOrEqual(spare[2] ?? 0);
  });

  it("works each rate on its own, a zero rate having no tax", () => {
    const lines = splitGstInside([line(10_000), line(10_000, 500), line(10_000, 0)], "intra_state");
    expect(lines.map((part) => part.taxCents)).toEqual([1_526, 476, 0]);
    expect(lines.map((part) => part.taxableCents)).toEqual([8_474, 9_524, 10_000]);
  });

  it("gives no line a negative amount, and refuses a line that is not whole paise", () => {
    expect(splitGstInside([line(1), line(1), line(1)], "inter_state").every((part) => part.igstCents >= 0 && part.taxableCents >= 0)).toBe(true);
    expect(() => splitGstInside([line(-1)], "inter_state")).toThrow(RangeError);
    expect(() => splitGstInside([line(10.5)], "inter_state")).toThrow(RangeError);
  });

  it("refuses a rate that cannot split into two equal halves", () => {
    expect(() => splitGstInside([line(10_000, 1_801)], "intra_state")).toThrow(RangeError);
    expect(() => splitGstInside([line(10_000, 1_801)], "inter_state")).toThrow(RangeError);
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
