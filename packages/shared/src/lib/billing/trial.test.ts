import { describe, expect, it } from "vitest";
import {
  billedAfterTrialCents,
  isTrialAddOnId,
  TRIAL_ADD_ON_IDS,
  trialEligible,
  trialEndsAt,
  trialPriceCents,
  type TrialEligibilityInput,
} from "./trial";

const PRICE = 299_900;

function eligibility(overrides: Partial<TrialEligibilityInput> = {}): TrialEligibilityInput {
  return { service: "social-media", interval: "month", provider: "razorpay", hadService: false, ...overrides };
}

describe("the offer", () => {
  it("covers Social Media and Paid Ads only", () => {
    expect(TRIAL_ADD_ON_IDS).toEqual(["social-media", "paid-ads"]);
    expect(isTrialAddOnId("paid-ads")).toBe(true);
    expect(isTrialAddOnId("managed-website")).toBe(false);
    expect(isTrialAddOnId("expert-monitoring")).toBe(false);
  });

  it("costs ₹1 or $1, in minor units", () => {
    expect(trialPriceCents("INR")).toBe(100);
    expect(trialPriceCents("USD")).toBe(100);
  });
});

describe("trialEligible", () => {
  it("lets a business that never had the plan take it on a monthly subscription", () => {
    expect(trialEligible(eligibility())).toBe(true);
    expect(trialEligible(eligibility({ service: "paid-ads" }))).toBe(true);
  });

  it("gives a Website customer adding Social later the trial (the owner's example)", () => {
    expect(trialEligible(eligibility({ hadService: false }))).toBe(true);
  });

  it("refuses a business that has had the plan before, paid or on a trial", () => {
    expect(trialEligible(eligibility({ hadService: true }))).toBe(false);
  });

  it("refuses the plans the offer does not cover", () => {
    expect(trialEligible(eligibility({ service: "managed-website" }))).toBe(false);
    expect(trialEligible(eligibility({ service: "expert-monitoring" }))).toBe(false);
  });

  it("refuses yearly billing (owner, D5)", () => {
    expect(trialEligible(eligibility({ interval: "year" }))).toBe(false);
  });

  it("refuses bank-transfer billing, which staff run by hand", () => {
    expect(trialEligible(eligibility({ provider: "manual" }))).toBe(false);
  });
});

describe("trialEndsAt", () => {
  it("is one calendar month after the payment", () => {
    expect(trialEndsAt(new Date("2026-11-12T09:30:00.000Z"))).toEqual(new Date("2026-12-12T09:30:00.000Z"));
  });

  it("clamps to the end of a shorter month", () => {
    expect(trialEndsAt(new Date("2027-01-30T00:00:00.000Z"))).toEqual(new Date("2027-02-28T00:00:00.000Z"));
  });

  it("refuses an invalid payment date", () => {
    expect(() => trialEndsAt(new Date(Number.NaN))).toThrow(RangeError);
  });
});

describe("billedAfterTrialCents", () => {
  // Plan 63, case 6: Website billed on the 1st, Social bought on 11 Nov, trial to 11 Dec, renewal on 1 Dec.
  const cycle = { start: new Date("2026-12-01T00:00:00.000Z"), end: new Date("2027-01-01T00:00:00.000Z") };

  it("bills only the days of the cycle after the trial: 21 of 31 days of ₹2,999", () => {
    // 299,900 x 21 / 31 = 203,158.06, taken as 203,158.
    expect(billedAfterTrialCents(PRICE, new Date("2026-12-11T00:00:00.000Z"), cycle)).toBe(203_158);
  });

  it("counts a trial day that has begun as a trial day", () => {
    // Trial ends at 10:00 on 11 Dec: 11 Dec is still a trial day, so 20 days are billed. 299,900 x 20 / 31 = 193,483.87.
    expect(billedAfterTrialCents(PRICE, new Date("2026-12-11T10:00:00.000Z"), cycle)).toBe(193_484);
  });

  it("bills the full price once the trial ended at or before the cycle starts", () => {
    expect(billedAfterTrialCents(PRICE, cycle.start, cycle)).toBe(PRICE);
    expect(billedAfterTrialCents(PRICE, new Date("2026-11-20T00:00:00.000Z"), cycle)).toBe(PRICE);
  });

  it("bills nothing when the trial covers the whole cycle", () => {
    expect(billedAfterTrialCents(PRICE, cycle.end, cycle)).toBe(0);
    expect(billedAfterTrialCents(PRICE, new Date("2027-01-05T00:00:00.000Z"), cycle)).toBe(0);
  });

  it("bills the full price on a line with no trial", () => {
    expect(billedAfterTrialCents(PRICE, null, cycle)).toBe(PRICE);
  });

  it("refuses a cycle that ends before it starts", () => {
    expect(() => billedAfterTrialCents(PRICE, null, { start: cycle.end, end: cycle.start })).toThrow(RangeError);
  });

  it("refuses a price that is not whole, non-negative minor units", () => {
    expect(() => billedAfterTrialCents(1.5, null, cycle)).toThrow(RangeError);
    expect(() => billedAfterTrialCents(-1, null, cycle)).toThrow(RangeError);
  });
});
