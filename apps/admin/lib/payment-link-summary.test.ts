import { describe, expect, it } from "vitest";
import { type LinkDealInput, readBuildDiscount, summariseLink } from "./payment-link-summary";

const base: LinkDealInput = { services: ["managed-website"], interval: "month", currency: "INR", websiteKind: "b2b", buildDiscountCents: 0, coupon: null, provider: "razorpay" };
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

describe("summariseLink", () => {
  it("charges the build fee alone for a website on its own, and the monthly price from a month on", () => {
    expect(priced({})).toMatchObject({ payTodayCents: 3_500_000, thenCents: 299_900, chargeInMonths: 1, fee: { listCents: 3_500_000, netCents: 3_500_000 } });
  });
  it("adds the other services' first month, on the first-month offer for a new customer", () => {
    expect(priced({ services: ["managed-website", "social-media"] })).toMatchObject({ payTodayCents: 3_500_100, thenCents: 599_800 });
  });
  it("prices an ecommerce store with a deal discount by kind", () => {
    const summary = priced({ services: ["managed-website", "social-media"], websiteKind: "ecommerce", buildDiscountCents: 1_500_000 });
    expect(summary).toMatchObject({ payTodayCents: 5_000_100, thenCents: 699_800, fee: { listCents: 6_500_000, discountCents: 1_500_000, netCents: 5_000_000 } });
  });
  it("charges the fee and the whole year for a yearly deal, and starts 13 months on", () => {
    expect(priced({ interval: "year" })).toMatchObject({ payTodayCents: 3_500_000 + 3_238_900, thenCents: 3_238_900, chargeInMonths: 13 });
  });
  it("starts a monthly coupon with the first monthly charge, taking nothing off today", () => {
    const coupon = { discount: { kind: "amount", amountCents: 50_000 }, discountMonths: null } as const;
    expect(priced({ coupon })).toMatchObject({ payTodayCents: 3_500_000, thenCents: 249_900, couponCents: 50_000 });
  });
  it("refuses a coupon on a yearly link that has a build fee, and allows it once the fee is waived", () => {
    const coupon = { discount: { kind: "amount", amountCents: 50_000 }, discountMonths: null } as const;
    expect(summariseLink({ ...base, interval: "year", coupon })).toEqual({ kind: "refused", reason: "coupon-on-yearly-fee" });
    expect(priced({ interval: "year", coupon, buildDiscountCents: 3_500_000 })).toMatchObject({ fee: { netCents: 0 }, payTodayCents: 3_238_900 - 600_000 });
  });
  it("refuses a coupon that takes nothing or everything", () => {
    const everything = { discount: { kind: "amount", amountCents: 299_900 }, discountMonths: null } as const;
    expect(summariseLink({ ...base, coupon: everything })).toEqual({ kind: "refused", reason: "coupon-not-chargeable" });
  });
  it("carries no fee and no kind for a basket without the website", () => {
    expect(priced({ services: ["social-media"], websiteKind: null })).toMatchObject({ fee: null, payTodayCents: 100, thenCents: 299_900, chargeInMonths: 1 });
  });
  it("gives no first-month offer on bank transfer", () => {
    expect(priced({ services: ["social-media"], websiteKind: null, provider: "manual" })).toMatchObject({ payTodayCents: 299_900 });
  });
  it("prices in dollars", () => {
    expect(priced({ currency: "USD" })).toMatchObject({ payTodayCents: 120_000, thenCents: 5_900 });
  });
});
