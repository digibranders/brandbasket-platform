import type { Plan } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import type { ChecklistItem } from "@brandbasket/shared/lib/onboarding/checklist";
import { afterPaymentHref, billingBanner, paymentStep, type BannerInput, type PaymentStepInput } from "./payment-step";

// The plan rows as migration 0184 leaves them: terms at a price of 0, the website being a line of the subscription.
const USD = {
  id: "plan-usd",
  currency: "USD",
  initialAmountCents: 0,
  taxRateBasisPoints: 0,
  initialTermMonths: 1,
  recurringAmountCents: 0,
} as Plan;
const INR = {
  id: "plan-inr",
  currency: "INR",
  initialAmountCents: 0,
  taxRateBasisPoints: 1800,
  initialTermMonths: 1,
  recurringAmountCents: 0,
} as Plan;
const USD_TERMS = "$65 a month. Your first payment covers your first month, then it renews monthly.";
const MISSING: ChecklistItem = { key: "domain", label: "Your domain, confirmed as yours", step: "domain", passed: false };

const OPEN_UNPAID: PaymentStepInput = {
  status: "unpaid",
  plan: USD,
  hasProject: true,
  locked: false,
  missing: null,
  paymentUnderReview: false,
  discount: null,
};

describe("paymentStep", () => {
  it("offers to pay and send, priced from the plan", () => {
    expect(paymentStep(OPEN_UNPAID)).toEqual({
      kind: "pay-and-send",
      amount: "$65",
      terms: USD_TERMS,
      ready: true,
    });
    expect(paymentStep({ ...OPEN_UNPAID, plan: INR })).toMatchObject({
      amount: "₹2,999",
      terms: "₹2,999 a month, GST included. Your first payment covers your first month, then it renews monthly.",
    });
  });

  it("is not ready while something is missing", () => {
    expect(paymentStep({ ...OPEN_UNPAID, missing: MISSING })).toMatchObject({ kind: "pay-and-send", ready: false });
  });

  it("offers payment alone when the answers were sent before payment was required", () => {
    expect(paymentStep({ ...OPEN_UNPAID, locked: true })).toEqual({
      kind: "pay",
      amount: "$65",
      terms: USD_TERMS,
    });
  });

  it("offers plain sending once paid, carrying what is still missing", () => {
    expect(paymentStep({ ...OPEN_UNPAID, status: "paid" })).toEqual({ kind: "send", missing: null });
    expect(paymentStep({ ...OPEN_UNPAID, status: "paid", missing: MISSING })).toEqual({ kind: "send", missing: MISSING });
  });

  it("offers nothing once paid and sent", () => {
    expect(paymentStep({ ...OPEN_UNPAID, status: "paid", locked: true })).toEqual({ kind: "none" });
  });

  it("points a lapsed customer at reactivation instead of a second first payment", () => {
    expect(paymentStep({ ...OPEN_UNPAID, status: "lapsed" })).toEqual({ kind: "reactivate" });
    expect(paymentStep({ ...OPEN_UNPAID, status: "lapsed", locked: true })).toEqual({ kind: "none" });
  });

  it("charges nothing when the currency has no plan", () => {
    expect(paymentStep({ ...OPEN_UNPAID, plan: null })).toEqual({ kind: "no-plan" });
  });

  it("offers no payment while a received one is under review", () => {
    expect(paymentStep({ ...OPEN_UNPAID, paymentUnderReview: true })).toEqual({ kind: "under-review" });
    expect(paymentStep({ ...OPEN_UNPAID, paymentUnderReview: true, locked: true })).toEqual({ kind: "under-review" });
    expect(paymentStep({ ...OPEN_UNPAID, status: "paid", paymentUnderReview: true })).toEqual({
      kind: "send",
      missing: null,
    });
  });

  it("offers nothing without a project", () => {
    expect(paymentStep({ ...OPEN_UNPAID, hasProject: false })).toEqual({ kind: "none" });
  });
});

describe("billingBanner", () => {
  const base: BannerInput = {
    status: "unpaid",
    plan: USD,
    setupComplete: false,
    locked: false,
    paymentUnderReview: false,
    nextStepHref: "/onboarding/brand",
    discount: null,
    renewalFailingUntil: null,
  };
  const TITLE = "Make your payment to continue";
  const USD_PRICE = { amount: "$65", term: "First month" };

  it("shows the price but sends the customer to finish setup first", () => {
    expect(billingBanner(base)).toEqual({
      kind: "pay",
      title: TITLE,
      price: USD_PRICE,
      action: { href: "/onboarding/brand", label: "Finish setup" },
    });
  });

  it("offers the payment once setup is complete", () => {
    expect(billingBanner({ ...base, setupComplete: true })).toEqual({
      kind: "pay",
      title: TITLE,
      price: USD_PRICE,
      action: { href: "/onboarding/review", label: "Pay now" },
    });
  });

  it("prices an Indian plan in rupees for its one-month start", () => {
    expect(billingBanner({ ...base, setupComplete: true, plan: INR })).toMatchObject({
      price: { amount: "₹2,999", term: "First month" },
    });
  });

  it("names no price when there is no plan", () => {
    expect(billingBanner({ ...base, setupComplete: true, plan: null })).toMatchObject({
      price: null,
      action: { href: "/onboarding/review", label: "Check and send" },
    });
  });

  it("asks to carry on building when the answers were sent before payment was required", () => {
    expect(billingBanner({ ...base, setupComplete: true, locked: true })).toEqual({
      kind: "pay",
      title: TITLE,
      message: "Once it’s done, we’ll carry on building your website.",
      price: USD_PRICE,
      action: { href: "/onboarding/review", label: "Pay now" },
    });
  });

  it("offers a lapsed customer Reactivate on Billing, where the price is shown", () => {
    for (const locked of [true, false]) {
      expect(billingBanner({ ...base, status: "lapsed", locked, setupComplete: true })).toEqual({
        kind: "reactivate",
        title: "Your plan has ended",
        message: "Your website and content are safe. Restart it from Billing.",
        action: { href: "/billing", label: "Reactivate" },
      });
    }
  });

  it("tells a paying customer whose renewal failed that it will be tried again, and when the website goes offline if not", () => {
    expect(billingBanner({ ...base, status: "paid", renewalFailingUntil: new Date("2026-11-09T00:00:00.000Z") })).toEqual({
      kind: "retrying",
      title: "We couldn’t take your last payment",
      message: "We’ll try again. Your website stays online until 9 November 2026; if the payments keep failing, it goes offline then.",
      action: { href: "/billing", label: "See Billing" },
    });
  });

  it("shows no banner inside a paid period when nothing is failing", () => {
    expect(billingBanner({ ...base, status: "paid", renewalFailingUntil: null })).toBeNull();
  });

  it("only reassures while a received payment is under review", () => {
    expect(billingBanner({ ...base, setupComplete: true, paymentUnderReview: true })).toEqual({
      kind: "notice",
      title: "Payment received",
      message: "Our team will be in touch shortly to sort out your account.",
    });
  });

  it("shows no banner inside a paid period", () => {
    expect(billingBanner({ ...base, status: "paid", setupComplete: true })).toBeNull();
    expect(billingBanner({ ...base, status: "paid", paymentUnderReview: true })).toBeNull();
  });
});

describe("afterPaymentHref", () => {
  it("lands on the Website page once it is sent, and on Check and send while it is open", () => {
    expect(afterPaymentHref(false)).toBe("/website");
    expect(afterPaymentHref(true)).toBe("/onboarding/review");
  });
});

describe("a referral discount", () => {
  // 15% of the website's 299,900 paise (44,985 rounded half up), frozen when the checkout opened.
  const FIFTEEN_OFF = { code: "SAVE15", amountCents: 44_985, months: null, stated: { kind: "amount", amountCents: 44_985 } } as const;

  it("prices the button from the discount, so it matches what the checkout charges", () => {
    expect(paymentStep({ ...OPEN_UNPAID, plan: INR, discount: FIFTEEN_OFF })).toMatchObject({
      kind: "pay-and-send",
      amount: "₹2,549.15",
    });
  });

  it("quotes the discounted monthly price, because a code with no length runs for as long as the plan does", () => {
    const step = paymentStep({ ...OPEN_UNPAID, plan: INR, discount: FIFTEEN_OFF });
    expect(step).toMatchObject({
      terms: "₹2,549.15 a month, GST included, instead of ₹2,999, for as long as your plan runs. Your first payment covers your first month, then it renews monthly.",
    });
  });

  it("discounts the pay-alone step too, for answers sent before payment was required", () => {
    expect(paymentStep({ ...OPEN_UNPAID, plan: INR, locked: true, discount: FIFTEEN_OFF })).toMatchObject({
      kind: "pay",
      amount: "₹2,549.15",
    });
  });

  it("shows the same discounted price on the banner as on the button", () => {
    const banner = billingBanner({
      status: "unpaid",
      plan: INR,
      setupComplete: true,
      locked: false,
      paymentUnderReview: false,
      nextStepHref: "/onboarding/brand",
      discount: FIFTEEN_OFF,
      renewalFailingUntil: null,
    });
    const step = paymentStep({ ...OPEN_UNPAID, plan: INR, discount: FIFTEEN_OFF });
    if (banner?.kind !== "pay" || step.kind !== "pay-and-send") throw new Error("expected a pay banner and step");
    expect(banner.price?.amount).toBe(step.amount);
    expect(banner.price).toEqual({ amount: "₹2,549.15", term: "First month" });
  });

  it("changes nothing for a customer with no code applied", () => {
    expect(paymentStep({ ...OPEN_UNPAID, discount: null })).toMatchObject({ amount: "$65", terms: USD_TERMS });
  });
});
