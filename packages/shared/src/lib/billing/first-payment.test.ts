import { describe, expect, it } from "vitest";
import { planFirstPayment, type FirstPaymentLine } from "./first-payment";

const PRICE = 299_900;
const line = (addOn: FirstPaymentLine["addOn"], hadService = false): FirstPaymentLine => ({ addOn, netCents: PRICE, hadService });
const base = { interval: "month", provider: "razorpay", currency: "INR", discountCents: 0 } as const;

describe("planFirstPayment", () => {
  it("is ordinary when no service is on the offer: the Website alone, or a service the business had before", () => {
    expect(planFirstPayment({ ...base, lines: [line("managed-website")] })).toEqual({ kind: "ordinary" });
    expect(planFirstPayment({ ...base, lines: [line("social-media", true)] })).toEqual({ kind: "ordinary" });
  });

  it("takes ₹1 for Social alone (the plan's case 1)", () => {
    expect(planFirstPayment({ ...base, lines: [line("social-media")] })).toEqual({
      kind: "offer", firstPaymentCents: 100, trialPriceByAddOn: { "social-media": 100 }, firstChargeMonths: 1, deferredAddOns: [], firstPaymentDiscountCents: 0,
    });
  });

  it("takes the Website in full and ₹1 for Social (case 3), and ₹1 each for Social and Ads (case 4)", () => {
    expect(planFirstPayment({ ...base, lines: [line("managed-website"), line("social-media")] })).toMatchObject({ kind: "offer", firstPaymentCents: PRICE + 100 });
    expect(planFirstPayment({ ...base, lines: [line("social-media"), line("paid-ads")] })).toMatchObject({ kind: "offer", firstPaymentCents: 200 });
  });

  it("charges full price for a service the business had before while another is on the offer", () => {
    expect(planFirstPayment({ ...base, lines: [line("social-media", true), line("paid-ads")] })).toMatchObject({ kind: "offer", firstPaymentCents: PRICE + 100, trialPriceByAddOn: { "paid-ads": 100 } });
  });

  it("takes the code's discount off the services that pay full price, and refuses a code with nothing to come off", () => {
    expect(planFirstPayment({ ...base, discountCents: 50_000, lines: [line("managed-website"), line("social-media")] })).toMatchObject({ kind: "offer", firstPaymentCents: PRICE + 100 - 50_000 });
    expect(planFirstPayment({ ...base, discountCents: 50_000, lines: [line("social-media")] })).toEqual({ kind: "code-refused" });
    expect(planFirstPayment({ ...base, discountCents: PRICE + 1, lines: [line("managed-website"), line("social-media")] })).toEqual({ kind: "code-refused" });
    expect(planFirstPayment({ ...base, discountCents: PRICE, lines: [line("managed-website"), line("social-media")] })).toMatchObject({ kind: "offer", firstPaymentCents: 100 });
  });

  it("is ordinary on a yearly plan, for a bank-transfer customer, and for a service the offer does not cover", () => {
    expect(planFirstPayment({ ...base, interval: "year", lines: [line("social-media")] })).toEqual({ kind: "ordinary" });
    expect(planFirstPayment({ ...base, provider: "manual", lines: [line("social-media")] })).toEqual({ kind: "ordinary" });
    expect(planFirstPayment({ ...base, lines: [line("expert-monitoring")] })).toEqual({ kind: "ordinary" });
  });

  it("takes $1 for the offer service in dollars", () => {
    expect(planFirstPayment({ ...base, currency: "USD", lines: [line("social-media")] })).toMatchObject({ firstPaymentCents: 100 });
  });
});

describe("planFirstPayment with a build fee (plan 65)", () => {
  const withFee = (over: Partial<Parameters<typeof planFirstPayment>[0]>): ReturnType<typeof planFirstPayment> =>
    planFirstPayment({ ...base, setupFeeNetCents: 3_500_000, lines: [{ addOn: "managed-website", netCents: PRICE, hadService: false }], ...over });

  it("charges the fee alone for a website on its own, monthly, and starts the monthly price a month on", () => {
    expect(withFee({})).toEqual({
      kind: "offer", firstPaymentCents: 3_500_000, trialPriceByAddOn: {}, firstChargeMonths: 1, deferredAddOns: ["managed-website"], firstPaymentDiscountCents: 0,
    });
  });

  it("adds the other services' first month at list, or on their first-month offer", () => {
    const atList = withFee({ lines: [{ addOn: "managed-website", netCents: PRICE, hadService: false }, { addOn: "social-media", netCents: PRICE, hadService: true }] });
    expect(atList).toMatchObject({ kind: "offer", firstPaymentCents: 3_500_000 + PRICE, trialPriceByAddOn: {} });
    const onOffer = withFee({
      setupFeeNetCents: 5_000_000,
      lines: [{ addOn: "managed-website", netCents: 399_900, hadService: false }, { addOn: "social-media", netCents: PRICE, hadService: false }],
    });
    expect(onOffer).toMatchObject({ kind: "offer", firstPaymentCents: 5_000_100, trialPriceByAddOn: { "social-media": 100 } });
  });

  it("takes no code off a monthly build-fee payment, and never refuses the code", () => {
    expect(withFee({ discountCents: 100_000 })).toMatchObject({ kind: "offer", firstPaymentCents: 3_500_000, firstPaymentDiscountCents: 0 });
  });

  it("charges the fee and every service's whole year for a yearly deal, and renews 13 months on", () => {
    const lines = [{ addOn: "managed-website", netCents: 3_238_900, hadService: false }, { addOn: "social-media", netCents: 3_238_900, hadService: false }] as const;
    expect(withFee({ interval: "year", lines })).toEqual({
      kind: "offer", firstPaymentCents: 3_500_000 + 6_477_800, trialPriceByAddOn: {}, firstChargeMonths: 13, deferredAddOns: [], firstPaymentDiscountCents: 0,
    });
  });

  it("refuses a code on a yearly build-fee deal: staff discount the fee instead", () => {
    const lines = [{ addOn: "managed-website", netCents: 3_238_900, hadService: false }] as const;
    expect(withFee({ interval: "year", discountCents: 100_000, lines })).toEqual({ kind: "code-refused" });
  });

  it("is the ordinary checkout when the fee is waived or none is owed", () => {
    expect(withFee({ setupFeeNetCents: 0 })).toEqual({ kind: "ordinary" });
    expect(planFirstPayment({ ...base, lines: [{ addOn: "managed-website", netCents: PRICE, hadService: false }] })).toEqual({ kind: "ordinary" });
  });

  it("refuses a fee on a basket with no website, and a nonsense fee", () => {
    expect(() => withFee({ lines: [{ addOn: "social-media", netCents: PRICE, hadService: false }] })).toThrow(RangeError);
    expect(() => withFee({ setupFeeNetCents: -1 })).toThrow(RangeError);
    expect(() => withFee({ setupFeeNetCents: 1.5 })).toThrow(RangeError);
  });

  it("keeps the first-month offer as it was when no fee is owed, now saying when the first full charge is", () => {
    expect(planFirstPayment({ ...base, lines: [line("social-media")] })).toMatchObject({ firstChargeMonths: 1, deferredAddOns: [], firstPaymentDiscountCents: 0 });
    expect(planFirstPayment({ ...base, discountCents: 50_000, lines: [line("managed-website"), line("social-media")] })).toMatchObject({ firstPaymentDiscountCents: 50_000 });
  });
});
