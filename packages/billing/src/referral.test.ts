import { describe, expect, it } from "vitest";
import {
  discountCentsFor,
  isChargeableDiscount,
  MAX_REFERRAL_CODE_LENGTH,
  MIN_DISCOUNT_AMOUNT_CENTS,
  discountPlanCode,
  normaliseReferralCode,
  rewardCentsFor,
} from "./referral";
import { chargedAmountCents, GST_BASIS_POINTS } from "./tax";

describe("normaliseReferralCode", () => {
  it("trims surrounding space and uppercases", () => {
    expect(normaliseReferralCode("  save15 ")).toBe("SAVE15");
  });

  it("leaves an already normalised code alone", () => {
    expect(normaliseReferralCode("SAVE15")).toBe("SAVE15");
  });

  it("accepts a hyphen inside the code", () => {
    expect(normaliseReferralCode("friend-15")).toBe("FRIEND-15");
  });

  it("returns null rather than throwing for anything that is not a code", () => {
    const notCodes = [
      "",
      "   ",
      "ab",
      "-friend",
      "has space",
      "sym!bol",
      "a".repeat(MAX_REFERRAL_CODE_LENGTH + 1),
    ];
    for (const input of notCodes) expect(normaliseReferralCode(input)).toBeNull();
  });

  it("accepts a code of exactly the maximum length", () => {
    const longest = "A".repeat(MAX_REFERRAL_CODE_LENGTH);
    expect(normaliseReferralCode(longest)).toBe(longest);
  });
});


describe("isChargeableDiscount", () => {
  it("accepts an amount that leaves something to charge", () => {
    expect(isChargeableDiscount(350_000, 50_000)).toBe(true);
    expect(isChargeableDiscount(7_500, 1_500)).toBe(true);
    expect(isChargeableDiscount(7_500, MIN_DISCOUNT_AMOUNT_CENTS)).toBe(true);
    expect(isChargeableDiscount(7_500, 7_499)).toBe(true);
  });

  it("refuses a discount that leaves nothing to authorise", () => {
    expect(isChargeableDiscount(7_500, 7_500)).toBe(false);
    expect(isChargeableDiscount(7_500, 9_000)).toBe(false);
  });

  it("refuses a discount that is not a whole, positive number of minor units", () => {
    for (const amount of [0, -100, 10.5, Number.NaN]) expect(isChargeableDiscount(7_500, amount)).toBe(false);
  });

  it("refuses a plan amount that is not a positive whole number", () => {
    for (const plan of [0, -1, 10.5]) expect(isChargeableDiscount(plan, 100)).toBe(false);
  });
});


describe("discountCentsFor", () => {
  it("returns a flat amount as it stands, whatever the plan costs", () => {
    expect(discountCentsFor({ kind: "amount", amountCents: 50_000 }, 299_900)).toBe(50_000);
    expect(discountCentsFor({ kind: "amount", amountCents: 1_500 }, 6_900)).toBe(1_500);
  });

  it("takes a percentage of the plan's pre-tax price", () => {
    // 10% of ₹2,999 is ₹299.90.
    expect(discountCentsFor({ kind: "percent", basisPoints: 1_000 }, 299_900)).toBe(29_990);
    expect(discountCentsFor({ kind: "percent", basisPoints: 2_000 }, 6_900)).toBe(1_380);
  });

  it("rounds half a minor unit up and anything less down", () => {
    // 12.5% of ₹2,999 is ₹374.875, which is 37,487.5 paise: half a paisa rounds up to ₹374.88.
    expect(discountCentsFor({ kind: "percent", basisPoints: 1_250 }, 299_900)).toBe(37_488);
    // 0.01% of $69 is 0.69 cents → 1. 0.01% of 49 cents is 0.0049 → 0.
    expect(discountCentsFor({ kind: "percent", basisPoints: 1 }, 6_900)).toBe(1);
    expect(discountCentsFor({ kind: "percent", basisPoints: 1 }, 49)).toBe(0);
  });

  it("takes 99% and still leaves something to charge", () => {
    const cents = discountCentsFor({ kind: "percent", basisPoints: 9_900 }, 299_900);
    expect(cents).toBe(296_901);
    expect(isChargeableDiscount(299_900, cents)).toBe(true);
  });

  it("can round a tiny percentage of a tiny price to nothing, which is then not chargeable", () => {
    const cents = discountCentsFor({ kind: "percent", basisPoints: 1 }, 49);
    expect(isChargeableDiscount(49, cents)).toBe(false);
  });

  it("puts the 10% INR example at ₹2,699.10 before GST, ₹3,184.94 with it", () => {
    const cents = discountCentsFor({ kind: "percent", basisPoints: 1_000 }, 299_900);
    expect(299_900 - cents).toBe(269_910);
    expect(chargedAmountCents(299_900, cents, GST_BASIS_POINTS)).toBe(318_494);
  });

  it("refuses a plan price or a percentage it cannot work with", () => {
    expect(() => discountCentsFor({ kind: "percent", basisPoints: 1_000 }, 10.5)).toThrow(RangeError);
    expect(() => discountCentsFor({ kind: "percent", basisPoints: 10_001 }, 6_900)).toThrow(RangeError);
    expect(() => discountCentsFor({ kind: "percent", basisPoints: 0.5 }, 6_900)).toThrow(RangeError);
  });
});

describe("discountPlanCode", () => {
  it("names the base plan and the discount", () => {
    expect(discountPlanCode("care-inr-2026-09", 50_000)).toBe("care-inr-2026-09-less-50000");
  });

  it("refuses a discount that is not a whole number of minor units", () => {
    expect(() => discountPlanCode("care-inr-2026-09", 12.5)).toThrow(RangeError);
  });
});

describe("rewardCentsFor", () => {
  it("returns a flat reward as it stands", () => {
    expect(rewardCentsFor({ kind: "amount", amountCents: 20_000 }, 249_900)).toBe(20_000);
    expect(rewardCentsFor({ kind: "amount", amountCents: 0 }, 249_900)).toBe(0);
  });

  it("takes a percentage of what the customer pays before GST, after their discount", () => {
    // 5% of ₹2,699.10 is ₹134.955, rounded down: a referrer is never owed a fraction we did not receive.
    expect(rewardCentsFor({ kind: "percent", basisPoints: 500 }, 269_910)).toBe(13_495);
    expect(rewardCentsFor({ kind: "percent", basisPoints: 10_000 }, 5_400)).toBe(5_400);
  });

  it("refuses a payment or a percentage it cannot work with", () => {
    expect(() => rewardCentsFor({ kind: "percent", basisPoints: 500 }, -1)).toThrow(RangeError);
    expect(() => rewardCentsFor({ kind: "percent", basisPoints: 10_001 }, 5_400)).toThrow(RangeError);
  });
});
