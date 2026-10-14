import { describe, expect, it } from "vitest";
import {
  describeReferralDiscount,
  describeReferralReward,
  formatPercent,
  isNoReward,
  parsePercent,
} from "./referral-value";

describe("formatPercent", () => {
  it("shows up to two decimals and drops trailing zeros", () => {
    expect(formatPercent(1_000)).toBe("10%");
    expect(formatPercent(1_250)).toBe("12.5%");
    expect(formatPercent(1_234)).toBe("12.34%");
    expect(formatPercent(1)).toBe("0.01%");
    expect(formatPercent(10_000)).toBe("100%");
  });
});

describe("describeReferralDiscount", () => {
  it("names a flat amount in the code's currency", () => {
    expect(describeReferralDiscount({ kind: "amount", amountCents: 50_000 }, "INR")).toBe("₹500 off");
    expect(describeReferralDiscount({ kind: "amount", amountCents: 1_250 }, "USD")).toBe("$12.50 off");
  });

  it("names a percentage as a percentage", () => {
    expect(describeReferralDiscount({ kind: "percent", basisPoints: 1_000 }, "INR")).toBe("10% off");
    expect(describeReferralDiscount({ kind: "percent", basisPoints: 1_250 }, "USD")).toBe("12.5% off");
  });
});

describe("describeReferralReward", () => {
  it("names a flat reward per month", () => {
    expect(describeReferralReward({ kind: "amount", amountCents: 20_000 }, "INR")).toBe("₹200 a month");
  });

  it("names a percentage reward as a share of each payment", () => {
    expect(describeReferralReward({ kind: "percent", basisPoints: 1_000 }, "INR")).toBe("10% of each payment");
  });
});

describe("isNoReward", () => {
  it("is true only for a flat reward of nothing", () => {
    expect(isNoReward({ kind: "amount", amountCents: 0 })).toBe(true);
    expect(isNoReward({ kind: "amount", amountCents: 1 })).toBe(false);
    expect(isNoReward({ kind: "percent", basisPoints: 1 })).toBe(false);
  });
});

describe("parsePercent", () => {
  it("reads a percentage as basis points, with or without a percent sign", () => {
    expect(parsePercent("10")).toBe(1_000);
    expect(parsePercent("12.5")).toBe(1_250);
    expect(parsePercent(" 12.34 % ")).toBe(1_234);
    expect(parsePercent("0.01")).toBe(1);
    expect(parsePercent("100")).toBe(10_000);
  });

  it("reads decimals from the digits, never through a float", () => {
    // Each of these multiplied by 100 in floating point misses the whole number: 0.29 * 100 is 28.999999999999996.
    expect(parsePercent("12.35")).toBe(1_235);
    expect(parsePercent("0.29")).toBe(29);
    expect(parsePercent("1.15")).toBe(115);
    expect(parsePercent("4.35")).toBe(435);
  });

  it("refuses a decimal comma rather than guessing which separator was meant", () => {
    expect(parsePercent("12,5")).toBeNull();
    expect(parsePercent("1,000")).toBeNull();
  });

  it("refuses anything with a third decimal, a sign or no number at all, rather than rounding", () => {
    for (const typed of ["", "%", "12.345", "-5", "1e2", "ten", "12.", ".5"]) expect(parsePercent(typed)).toBeNull();
  });
});
