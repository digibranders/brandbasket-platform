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
    expect(planFirstPayment({ ...base, lines: [line("social-media")] })).toEqual({ kind: "offer", firstPaymentCents: 100, trialPriceByAddOn: { "social-media": 100 } });
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
