import { describe, expect, it } from "vitest";
import {
  EXIT_REASON_OPTIONS,
  isExitReason,
  MAX_TOTAL_DISCOUNT_PERCENT,
  retentionDiscountCentsFor,
  retentionOfferPercent,
} from "./account-exit";

describe("the exit reasons", () => {
  it("lists every reason once, with a label", () => {
    expect(EXIT_REASON_OPTIONS.map((option) => option.value)).toEqual([
      "too_expensive",
      "not_enough_enquiries",
      "not_using",
      "missing_feature",
      "found_alternative",
      "closing_business",
      "other",
    ]);
    expect(EXIT_REASON_OPTIONS.every((option) => option.label.length > 0)).toBe(true);
  });

  it("recognises a reason and nothing else", () => {
    expect(isExitReason("too_expensive")).toBe(true);
    expect(isExitReason("toString")).toBe(false);
    expect(isExitReason("")).toBe(false);
    expect(isExitReason(undefined)).toBe(false);
  });

  it("offers nothing to someone who is closing the business, and something to those a price could keep", () => {
    expect(retentionOfferPercent("closing_business")).toBeNull();
    expect(retentionOfferPercent("other")).toBeNull();
    expect(retentionOfferPercent("too_expensive")).toBe(30);
  });
});

describe("retentionDiscountCentsFor", () => {
  it("takes the percentage off the net monthly price", () => {
    expect(retentionDiscountCentsFor({ recurringAmountCents: 999_900, currentDiscountCents: 0, percent: 30 })).toBe(299_970);
  });

  it("rounds to a whole minor unit", () => {
    expect(retentionDiscountCentsFor({ recurringAmountCents: 6_999, currentDiscountCents: 0, percent: 25 })).toBe(1_750);
  });

  it("adds to a discount the member already has", () => {
    expect(retentionDiscountCentsFor({ recurringAmountCents: 10_000, currentDiscountCents: 2_000, percent: 30 })).toBe(3_000);
  });

  it("never lets the two together pass the ceiling", () => {
    const given = retentionDiscountCentsFor({ recurringAmountCents: 10_000, currentDiscountCents: 6_000, percent: 30 });
    expect(given).toBe(2_000);
    expect(6_000 + (given ?? 0)).toBe((10_000 * MAX_TOTAL_DISCOUNT_PERCENT) / 100);
  });

  it("gives nothing when a code already takes the most", () => {
    expect(retentionDiscountCentsFor({ recurringAmountCents: 10_000, currentDiscountCents: 8_000, percent: 30 })).toBeNull();
    expect(retentionDiscountCentsFor({ recurringAmountCents: 10_000, currentDiscountCents: 9_000, percent: 30 })).toBeNull();
  });

  it.each([0, -5, 81, 2.5, Number.NaN])("refuses a percentage of %s", (percent) => {
    expect(() => retentionDiscountCentsFor({ recurringAmountCents: 10_000, currentDiscountCents: 0, percent })).toThrow(RangeError);
  });

  it("refuses an amount that is not a positive whole number", () => {
    expect(() => retentionDiscountCentsFor({ recurringAmountCents: 0, currentDiscountCents: 0, percent: 10 })).toThrow(RangeError);
    expect(() => retentionDiscountCentsFor({ recurringAmountCents: 100.5, currentDiscountCents: 0, percent: 10 })).toThrow(RangeError);
    expect(() => retentionDiscountCentsFor({ recurringAmountCents: 100, currentDiscountCents: -1, percent: 10 })).toThrow(RangeError);
  });
});
