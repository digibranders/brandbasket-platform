import { describe, expect, it } from "vitest";
import { type LinkDealInput, readBuildDiscount, readCustomPrice, readDealAdvance, summariseLink } from "./payment-link-summary";

const base: LinkDealInput = { services: ["managed-website"], interval: "month", currency: "INR", websiteKind: "b2b", build: null, customPrices: {}, coupon: null, provider: "razorpay" };
const PAID = { listCents: 3_500_000, discountCents: 0, advanceCents: 1_000_000 } as const;
const COUPON = { discount: { kind: "amount", amountCents: 50_000 }, discountMonths: null } as const;
const priced = (input: Partial<LinkDealInput>) => {
  const summary = summariseLink({ ...base, ...input });
  if (summary.kind !== "priced") throw new Error(`expected a price, got ${summary.reason}`);
  return summary;
};

describe("readBuildDiscount", () => {
  it("reads the three kinds against the list fee", () => {
    expect(readBuildDiscount("none", "", 3_500_000)).toEqual({ ok: true, cents: 0 });
    expect(readBuildDiscount("amount", "10,000", 3_500_000)).toEqual({ ok: true, cents: 1_000_000 });
    expect(readBuildDiscount("percent", "20", 3_500_000)).toEqual({ ok: true, cents: 700_000 });
    expect(readBuildDiscount("final", "20000", 3_500_000)).toEqual({ ok: true, cents: 1_500_000 });
    expect(readBuildDiscount("final", "0", 3_500_000)).toEqual({ ok: true, cents: 3_500_000 });
  });
  it("refuses what cannot be read or goes past the fee", () => {
    expect(readBuildDiscount("amount", "ten", 3_500_000)).toEqual({ ok: false, reason: "unreadable" });
    expect(readBuildDiscount("amount", "35,001", 3_500_000)).toEqual({ ok: false, reason: "too-much" });
    expect(readBuildDiscount("percent", "100.01", 3_500_000)).toEqual({ ok: false, reason: "too-much" });
    expect(readBuildDiscount("final", "35001", 3_500_000)).toEqual({ ok: false, reason: "too-much" });
  });
});

describe("readDealAdvance", () => {
  const build = { currency: "INR", kind: "b2b", listCents: 3_333_300, discountCents: 0 } as const;
  it("reads an amount, or a percentage rounded down to a whole rupee", () => {
    expect(readDealAdvance("amount", "10,000", build)).toMatchObject({ ok: true, amounts: { advanceCents: 1_000_000, balanceCents: 2_333_300 } });
    expect(readDealAdvance("percent", "30", build)).toMatchObject({ ok: true, amounts: { advanceCents: 999_900 } });
    expect(readDealAdvance("amount", "33333", build)).toMatchObject({ ok: true, amounts: { advanceCents: 3_333_300, balanceCents: 0 } });
  });
  it("holds the advance from 1 to the net price", () => {
    expect(readDealAdvance("amount", "0", build)).toEqual({ ok: false, reason: "out-of-range" });
    expect(readDealAdvance("amount", "33333.01", build)).toEqual({ ok: false, reason: "out-of-range" });
    expect(readDealAdvance("percent", "0", build)).toEqual({ ok: false, reason: "out-of-range" });
    expect(readDealAdvance("percent", "100.01", build)).toEqual({ ok: false, reason: "out-of-range" });
    expect(readDealAdvance("amount", "lots", build)).toEqual({ ok: false, reason: "unreadable" });
  });
  it("is worked on the price after the discount", () => {
    expect(readDealAdvance("percent", "50", { ...build, discountCents: 1_000_000 })).toMatchObject({ ok: true, amounts: { netCents: 2_333_300, advanceCents: 1_166_600 } });
  });
});

describe("readCustomPrice", () => {
  it("is the list price when blank, and whole major units as minor units otherwise", () => {
    expect(readCustomPrice("")).toEqual({ ok: true, cents: null });
    expect(readCustomPrice("  ")).toEqual({ ok: true, cents: null });
    expect(readCustomPrice("1,999")).toEqual({ ok: true, cents: 199_900 });
    expect(readCustomPrice("59")).toEqual({ ok: true, cents: 5_900 });
  });
  it("refuses zero, fractions, signs and absurd sizes", () => {
    for (const typed of ["0", "12.5", "-5", "1e3", "abc", "10000001"]) expect(readCustomPrice(typed)).toEqual({ ok: false });
  });
});

describe("summariseLink, free deal", () => {
  it("charges the services' first month and no build", () => {
    expect(priced({})).toMatchObject({ deal: null, payTodayCents: 299_900, secondPaymentCents: null, thenCents: 299_900, chargeInMonths: 1 });
  });
  it("adds the other services' first month, on the first-month offer for a new customer", () => {
    expect(priced({ services: ["managed-website", "social-media"] })).toMatchObject({ payTodayCents: 300_000, thenCents: 599_800 });
  });
  it("prices the website at the custom price and Social on trial: 1,999 + 1 = 2,000", () => {
    const summary = priced({ services: ["managed-website", "social-media"], customPrices: { "managed-website": 199_900 } });
    expect(summary).toMatchObject({ payTodayCents: 200_000, thenCents: 199_900 + 299_900 });
  });
  it("takes a custom price on a trial line as what the customer pays from month two", () => {
    expect(priced({ services: ["social-media"], websiteKind: null, customPrices: { "social-media": 99_900 } })).toMatchObject({ payTodayCents: 100, thenCents: 99_900 });
  });
  it("charges the whole year for a yearly deal and renews a year on", () => {
    expect(priced({ interval: "year" })).toMatchObject({ payTodayCents: 3_238_900, thenCents: 3_238_900, chargeInMonths: 12 });
  });
  it("starts a monthly coupon with the first charge", () => {
    expect(priced({ coupon: COUPON })).toMatchObject({ payTodayCents: 249_900, thenCents: 249_900, couponCents: 50_000 });
  });
  it("allows a coupon on a yearly free deal", () => {
    expect(priced({ interval: "year", coupon: COUPON })).toMatchObject({ payTodayCents: 3_238_900 - 600_000 });
  });
  it("refuses a coupon beside a custom price", () => {
    expect(summariseLink({ ...base, coupon: COUPON, customPrices: { "managed-website": 199_900 } })).toEqual({ kind: "refused", reason: "coupon-with-custom-price" });
  });
  it("refuses a coupon that takes nothing or everything", () => {
    const everything = { discount: { kind: "amount", amountCents: 299_900 }, discountMonths: null } as const;
    expect(summariseLink({ ...base, coupon: everything })).toEqual({ kind: "refused", reason: "coupon-not-chargeable" });
  });
  it("carries no kind for a basket without the website", () => {
    expect(priced({ services: ["social-media"], websiteKind: null })).toMatchObject({ deal: null, payTodayCents: 100, thenCents: 299_900, chargeInMonths: 1 });
  });
  it("gives no first-month offer on bank transfer", () => {
    expect(priced({ services: ["social-media"], websiteKind: null, provider: "manual" })).toMatchObject({ payTodayCents: 299_900 });
  });
  it("prices in dollars, a custom dollar price included", () => {
    expect(priced({ currency: "USD" })).toMatchObject({ payTodayCents: 5_900, thenCents: 5_900 });
    expect(priced({ currency: "USD", customPrices: { "managed-website": 4_900 } })).toMatchObject({ payTodayCents: 4_900 });
  });
});

describe("summariseLink, paid deal", () => {
  it("takes the advance now and the balance with the first month at go-live", () => {
    expect(priced({ build: PAID })).toMatchObject({
      deal: { netCents: 3_500_000, advanceCents: 1_000_000, balanceCents: 2_500_000 },
      payTodayCents: 1_000_000,
      secondPaymentCents: 2_500_000 + 299_900,
      thenCents: 299_900,
      chargeInMonths: 1,
    });
  });
  it("prices an ecommerce build less its discount, with Social on trial in payment 2", () => {
    const summary = priced({ services: ["managed-website", "social-media"], websiteKind: "ecommerce", build: { listCents: 6_500_000, discountCents: 1_500_000, advanceCents: 2_000_000 } });
    expect(summary).toMatchObject({ deal: { netCents: 5_000_000, balanceCents: 3_000_000 }, payTodayCents: 2_000_000, secondPaymentCents: 3_000_000 + 399_900 + 100, thenCents: 399_900 + 299_900 });
  });
  it("leaves only the services for payment 2 when the advance is the whole price", () => {
    expect(priced({ build: { ...PAID, advanceCents: 3_500_000 } })).toMatchObject({ deal: { balanceCents: 0 }, secondPaymentCents: 299_900 });
  });
  it("takes the balance and the whole year at go-live on a yearly deal", () => {
    expect(priced({ interval: "year", build: PAID })).toMatchObject({ secondPaymentCents: 2_500_000 + 3_238_900, thenCents: 3_238_900, chargeInMonths: 12 });
  });
  it("takes a monthly coupon off payment 2, never off the balance", () => {
    expect(priced({ build: PAID, coupon: COUPON })).toMatchObject({ secondPaymentCents: 2_500_000 + 299_900 - 50_000, thenCents: 249_900 });
  });
  it("refuses a coupon on a yearly paid deal", () => {
    expect(summariseLink({ ...base, interval: "year", build: PAID, coupon: COUPON })).toEqual({ kind: "refused", reason: "coupon-on-yearly-fee" });
  });
  it("uses a custom website price in payment 2 and after", () => {
    expect(priced({ build: PAID, customPrices: { "managed-website": 199_900 } })).toMatchObject({ secondPaymentCents: 2_500_000 + 199_900, thenCents: 199_900 });
  });
  it("prices a dollar deal", () => {
    expect(priced({ currency: "USD", build: { listCents: 45_000, discountCents: 0, advanceCents: 10_000 } })).toMatchObject({ payTodayCents: 10_000, secondPaymentCents: 35_000 + 5_900 });
  });
});
