import { describe, expect, it } from "vitest";
import { dealAmounts, dealLines } from "./deal";
import { planFirstPayment, type FirstPaymentLine } from "./first-payment";

const RUPEE = 100;
const SITE = 2_999 * RUPEE;
const YEAR = 32_389 * RUPEE; // 2,999 x 12 less the 10% annual discount; asserted against the catalogue below
const line = (addOn: FirstPaymentLine["addOn"], netCents: number, hadService = false): FirstPaymentLine => ({ addOn, netCents, hadService });
const base = { interval: "month", provider: "razorpay", currency: "INR", discountCents: 0 } as const;
const deal = (advance: Parameters<typeof dealAmounts>[0]["advance"], discountCents = 0): ReturnType<typeof dealAmounts> =>
  dealAmounts({ currency: "INR", kind: "b2b", listCents: 10_000 * RUPEE, discountCents, advance });

describe("dealAmounts", () => {
  it("splits the page's worked example: list 10,000, advance 5,000", () => {
    expect(deal({ kind: "amount", cents: 5_000 * RUPEE })).toEqual({ listCents: 1_000_000, discountCents: 0, netCents: 1_000_000, advanceCents: 500_000, balanceCents: 500_000 });
  });

  it("takes a percentage of the net price, rounded down to a whole rupee", () => {
    expect(deal({ kind: "percent", basisPoints: 3_333 }, 1_001 * RUPEE)).toMatchObject({ netCents: 8_999 * RUPEE, advanceCents: 2_999 * RUPEE, balanceCents: 6_000 * RUPEE });
  });

  it("lets the advance be the whole price, leaving no balance", () => {
    expect(deal({ kind: "full" }, 2_000 * RUPEE)).toMatchObject({ advanceCents: 8_000 * RUPEE, balanceCents: 0 });
    expect(deal({ kind: "amount", cents: 1_000_000 })).toMatchObject({ balanceCents: 0 });
  });

  it("refuses an advance of 0, above the net price, negative or fractional", () => {
    expect(() => deal({ kind: "amount", cents: 0 })).toThrow(RangeError);
    expect(() => deal({ kind: "amount", cents: 1_000_001 })).toThrow("net price 1000000");
    expect(() => deal({ kind: "amount", cents: -1 })).toThrow(RangeError);
    expect(() => deal({ kind: "amount", cents: 100.5 })).toThrow(RangeError);
    expect(() => deal({ kind: "percent", basisPoints: 0 })).toThrow(RangeError);
    expect(() => deal({ kind: "percent", basisPoints: 10_001 })).toThrow(RangeError);
  });

  it("refuses an advance on a waived build and a discount beyond the list", () => {
    expect(() => deal({ kind: "full" }, 10_000 * RUPEE)).toThrow("waived");
    expect(() => deal({ kind: "amount", cents: 100 }, 10_001 * RUPEE)).toThrow(RangeError);
  });
});

describe("dealLines", () => {
  const input = { services: ["managed-website", "social-media"], interval: "month", currency: "INR", kind: "b2b", customPrices: {} } as const;

  it("uses the catalogue price, then a custom price for the month and for the year", () => {
    expect(dealLines(input)).toMatchObject([{ addOn: "managed-website", listCents: SITE, netCents: SITE, isCustom: false }, { addOn: "social-media", isCustom: false }]);
    expect(dealLines({ ...input, customPrices: { "managed-website": 199_900 } })[0]).toEqual({ addOn: "managed-website", listCents: 199_900, netCents: 199_900, isCustom: true });
    const yearly = dealLines({ ...input, interval: "year" });
    expect(yearly[0]?.listCents).toBe(YEAR);
    expect(dealLines({ ...input, interval: "year", customPrices: { "social-media": 2_000_000 } })[1]).toMatchObject({ listCents: 2_000_000, isCustom: true });
  });

  it("throws for a custom price on a service not in the basket, or one that is not a positive whole number", () => {
    expect(() => dealLines({ ...input, customPrices: { "paid-ads": 100_000 } })).toThrow("paid-ads");
    expect(() => dealLines({ ...input, customPrices: { "managed-website": 0 } })).toThrow(RangeError);
    expect(() => dealLines({ ...input, customPrices: { "managed-website": 10.5 } })).toThrow(RangeError);
  });
});

describe("planFirstPayment with a deal balance (plan 66, 3.4)", () => {
  const site = line("managed-website", SITE);
  const social = line("social-media", SITE);
  const advance = 5_000 * RUPEE;

  it("monthly, balance 0, no trial: ordinary", () => {
    expect(planFirstPayment({ ...base, dealBalanceCents: 0, lines: [site] })).toEqual({ kind: "ordinary" });
    expect(planFirstPayment({ ...base, dealBalanceCents: 0, lines: [site, line("social-media", SITE, true)] })).toEqual({ kind: "ordinary" });
  });

  it("monthly, balance > 0, no trial: payment 2 is the balance plus the website's month (5,000 + 2,999 = 7,999)", () => {
    expect(planFirstPayment({ ...base, dealBalanceCents: advance, lines: [site] })).toEqual({
      kind: "offer", firstPaymentCents: 7_999 * RUPEE, trialPriceByAddOn: {}, firstChargeMonths: 1, deferredAddOns: [], firstPaymentDiscountCents: 0,
    });
  });

  it("monthly, balance > 0, with Social on its first-month offer: 5,000 + 2,999 + 1 = 8,000", () => {
    expect(planFirstPayment({ ...base, dealBalanceCents: advance, lines: [site, social] })).toEqual({
      kind: "offer", firstPaymentCents: 8_000 * RUPEE, trialPriceByAddOn: { "social-media": 100 }, firstChargeMonths: 1, deferredAddOns: [], firstPaymentDiscountCents: 0,
    });
  });

  it("monthly, balance 0, with a trial line (the free deal): 2,999 + 1 = 3,000, no balance", () => {
    expect(planFirstPayment({ ...base, dealBalanceCents: 0, lines: [site, social] })).toMatchObject({ kind: "offer", firstPaymentCents: 3_000 * RUPEE, firstChargeMonths: 1 });
  });

  it("monthly: a coupon comes off the full-price lines, never the balance; one larger than them is refused", () => {
    expect(planFirstPayment({ ...base, discountCents: 500 * RUPEE, dealBalanceCents: advance, lines: [site, social] })).toMatchObject({
      kind: "offer", firstPaymentCents: advance + SITE + 100 - 500 * RUPEE, firstPaymentDiscountCents: 500 * RUPEE,
    });
    expect(planFirstPayment({ ...base, discountCents: SITE + 1, dealBalanceCents: advance, lines: [site, social] })).toEqual({ kind: "code-refused" });
    expect(planFirstPayment({ ...base, discountCents: 1, dealBalanceCents: advance, lines: [site] })).toMatchObject({ kind: "offer", firstPaymentCents: advance + SITE - 1 });
  });

  it("annual, balance 0: ordinary; with a trial-eligible line it is still ordinary (a trial is never on annual)", () => {
    expect(planFirstPayment({ ...base, interval: "year", dealBalanceCents: 0, lines: [line("managed-website", YEAR)] })).toEqual({ kind: "ordinary" });
    expect(planFirstPayment({ ...base, interval: "year", dealBalanceCents: 0, lines: [line("managed-website", YEAR), line("social-media", YEAR)] })).toEqual({ kind: "ordinary" });
  });

  it("annual, balance > 0: the balance plus every line's year, charged again in 12 months, with no trial price", () => {
    expect(planFirstPayment({ ...base, interval: "year", dealBalanceCents: advance, lines: [line("managed-website", YEAR), line("social-media", YEAR)] })).toEqual({
      kind: "offer", firstPaymentCents: advance + 2 * YEAR, trialPriceByAddOn: {}, firstChargeMonths: 12, deferredAddOns: [], firstPaymentDiscountCents: 0,
    });
  });

  it("annual: a coupon larger than the lines is refused", () => {
    expect(planFirstPayment({ ...base, interval: "year", discountCents: YEAR + 1, dealBalanceCents: advance, lines: [line("managed-website", YEAR)] })).toEqual({ kind: "code-refused" });
  });

  it("throws when both fee inputs are given, for a balance that is negative or fractional, or with no website line", () => {
    expect(() => planFirstPayment({ ...base, dealBalanceCents: advance, setupFeeNetCents: 3_500_000, lines: [site] })).toThrow("cannot both");
    expect(() => planFirstPayment({ ...base, dealBalanceCents: -1, lines: [site] })).toThrow(RangeError);
    expect(() => planFirstPayment({ ...base, dealBalanceCents: 1.5, lines: [site] })).toThrow(RangeError);
    expect(() => planFirstPayment({ ...base, dealBalanceCents: advance, lines: [social] })).toThrow("Website Management");
  });
});
