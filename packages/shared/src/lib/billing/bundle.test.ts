import { describe, expect, it } from "vitest";
import {
  bundledLinePrice,
  bundleLines,
  bundleNetCents,
  nextBundledNetCents,
  reactivationBasketOf,
  reactivationNetCents,
  readBundleSelection,
  websiteAloneNetCents,
  type LapsedLine,
} from "./bundle";

describe("readBundleSelection", () => {
  it("keeps catalogue ids once each, in the catalogue's order", () => {
    expect(readBundleSelection(["paid-ads", "social-media", "social-media", "managed-website"])).toEqual(["managed-website", "social-media", "paid-ads"]);
  });

  it("drops anything that is not a service", () => {
    expect(readBundleSelection(["press-release", "local-seo", "social", "", "paid-ads"])).toEqual(["paid-ads"]);
    expect(readBundleSelection([])).toEqual([]);
  });

  it("drops monitoring beside all three plans, which include it, and when there is no plan for it to watch", () => {
    expect(readBundleSelection(["managed-website", "social-media", "paid-ads", "expert-monitoring"])).toEqual(["managed-website", "social-media", "paid-ads"]);
    expect(readBundleSelection(["expert-monitoring"])).toEqual([]);
    expect(readBundleSelection(["social-media", "expert-monitoring"])).toEqual(["social-media", "expert-monitoring"]);
  });
});


describe("bundleLines", () => {
  it("prices a package at list once the business has given the offer up", () => {
    expect(bundleLines(["managed-website", "social-media"], "INR", true).map((line) => [line.offerCents, line.netCents])).toEqual([
      [0, 299_900],
      [0, 299_900],
    ]);
  });

  it("prices one service at its list price", () => {
    expect(bundleLines(["social-media"], "INR")).toEqual([
      { addOn: "social-media", title: "Social Media Management", listCents: 299_900, offerCents: 0, netCents: 299_900 },
    ]);
  });

  it("prices two services at list, with no offer on either line", () => {
    expect(bundleLines(["social-media", "paid-ads"], "INR")).toEqual([
      { addOn: "social-media", title: "Social Media Management", listCents: 299_900, offerCents: 0, netCents: 299_900 },
      { addOn: "paid-ads", title: "Paid Ads Management", listCents: 299_900, offerCents: 0, netCents: 299_900 },
    ]);
  });

  it("prices all three at list, in the catalogue's order, in both currencies", () => {
    expect(bundleLines(["paid-ads", "social-media", "managed-website"], "INR").map((line) => [line.addOn, line.offerCents, line.netCents])).toEqual([
      ["managed-website", 0, 299_900],
      ["social-media", 0, 299_900],
      ["paid-ads", 0, 299_900],
    ]);
    expect(bundleLines(["managed-website", "paid-ads"], "USD").map((line) => [line.offerCents, line.netCents])).toEqual([
      [0, 5_900],
      [0, 5_900],
    ]);
  });

  it("adds the nets together, and is nothing for no services", () => {
    expect(bundleNetCents(bundleLines(["managed-website", "social-media", "paid-ads"], "INR"))).toBe(899_700);
    expect(bundleNetCents(bundleLines([], "INR"))).toBe(0);
  });
});

describe("nextBundledNetCents", () => {
  it("is the amount after a waiting removal, else the current one", () => {
    expect(nextBundledNetCents({ bundledAddOnNetCents: 759_810, pendingBundledAddOnNetCents: 569_905 })).toBe(569_905);
    expect(nextBundledNetCents({ bundledAddOnNetCents: 759_810, pendingBundledAddOnNetCents: null })).toBe(759_810);
    expect(nextBundledNetCents({ bundledAddOnNetCents: 189_905, pendingBundledAddOnNetCents: 0 })).toBe(0);
  });
});

describe("websiteAloneNetCents", () => {
  it("is the website's list price in each currency", () => {
    expect(websiteAloneNetCents("INR")).toBe(299_900);
    expect(websiteAloneNetCents("USD")).toBe(5_900);
  });
});

describe("reactivationBasketOf", () => {
  const PAID = new Date("2026-09-01T00:00:00Z");
  const LAPSED = { status: "active", activatedAt: PAID, cancelRequestedAt: null, adCreditCents: 300_000 } as const;
  const line = (addOn: string, overrides: Partial<LapsedLine> = {}): LapsedLine => ({ addOn, activatedAt: PAID, endRequestedAt: null, ...overrides });
  const ALL_THREE = [line("managed-website"), line("social-media"), line("paid-ads")];

  it("restores a lapsed package's own services at list, keeping the ad credit stored on the subscription", () => {
    const basket = reactivationBasketOf({ subscription: LAPSED, lines: ALL_THREE, forfeited: false });
    expect(basket).toEqual({
      services: ["managed-website", "social-media", "paid-ads"],
      forfeited: false,
      adCreditCents: 300_000,
      cancelled: false,
      billingInterval: "month",
    });
    expect(reactivationNetCents(basket, "INR")).toBe(899_700);
    expect(reactivationNetCents(basket, "USD")).toBe(17_700);
  });

  it("restores a yearly plan that lapsed on a yearly basket, and a cancelled one monthly, as the reactivation card offers", () => {
    const yearly = reactivationBasketOf({ subscription: { ...LAPSED, billingInterval: "year" }, lines: [line("managed-website")], forfeited: false });
    expect(yearly.billingInterval).toBe("year");
    expect(reactivationNetCents(yearly, "INR")).toBe(3_238_900);
    const cancelled = reactivationBasketOf({ subscription: { ...LAPSED, billingInterval: "year", cancelRequestedAt: PAID }, lines: [line("managed-website")], forfeited: false });
    expect(cancelled.billingInterval).toBe("month");
  });

  it("prices the set it restores at list, whatever the lapsed lines were last billed at", () => {
    const basket = reactivationBasketOf({
      subscription: { ...LAPSED, adCreditCents: 150_000 },
      lines: [line("managed-website"), line("social-media")],
      forfeited: false,
    });
    expect(reactivationNetCents(basket, "INR")).toBe(599_800);
    expect(basket.adCreditCents).toBe(150_000);
  });

  it("restores a single service at its list price", () => {
    const basket = reactivationBasketOf({ subscription: { ...LAPSED, adCreditCents: 0 }, lines: [line("paid-ads")], forfeited: false });
    expect(reactivationNetCents(basket, "INR")).toBe(299_900);
  });

  it("restores a business that gave the offer up at list, with no ad credit", () => {
    const basket = reactivationBasketOf({ subscription: { ...LAPSED, adCreditCents: 0 }, lines: [line("managed-website"), line("paid-ads")], forfeited: true });
    expect(basket).toMatchObject({ services: ["managed-website", "paid-ads"], forfeited: true, adCreditCents: 0, cancelled: false });
    expect(reactivationNetCents(basket, "INR")).toBe(599_800);
  });

  it("leaves out a service on its way out, one that was never paid for, and one that has stopped", () => {
    const basket = reactivationBasketOf({
      subscription: { ...LAPSED, adCreditCents: 0 },
      lines: [
        line("managed-website"),
        line("social-media", { endRequestedAt: new Date("2026-09-20T00:00:00Z") }),
        line("paid-ads", { activatedAt: null }),
      ],
      forfeited: true,
    });
    expect(basket.services).toEqual(["managed-website"]);
  });

  it("takes the services the lapsed subscription billed, and its credit from the unpaid checkout that replaced it", () => {
    const basket = reactivationBasketOf({
      subscription: { status: "incomplete", activatedAt: null, cancelRequestedAt: null, adCreditCents: 300_000 },
      lines: ALL_THREE,
      forfeited: false,
    });
    expect(basket).toEqual({
      services: ["managed-website", "social-media", "paid-ads"],
      forfeited: false,
      adCreditCents: 300_000,
      cancelled: false,
      billingInterval: "month",
    });
  });

  it("does not take an unpaid checkout that was cancelled for a cancelled subscription", () => {
    const basket = reactivationBasketOf({
      subscription: { status: "cancelled", activatedAt: null, cancelRequestedAt: null, adCreditCents: 300_000 },
      lines: ALL_THREE,
      forfeited: false,
    });
    expect(basket).toMatchObject({ forfeited: false, adCreditCents: 300_000, cancelled: false });
    expect(basket.services).toHaveLength(3);
  });

  it("starts a subscription the customer asked to end at list with no ad credit, whatever it was stored with", () => {
    const basket = reactivationBasketOf({
      subscription: { ...LAPSED, cancelRequestedAt: new Date("2026-09-25T00:00:00Z") },
      lines: ALL_THREE,
      forfeited: false,
    });
    expect(basket).toEqual({
      services: ["managed-website", "social-media", "paid-ads"],
      forfeited: true,
      adCreditCents: 0,
      cancelled: true,
      billingInterval: "month",
    });
    expect(reactivationNetCents(basket, "INR")).toBe(899_700);
  });

  it("restores a subscription the provider ended without the customer asking (a revoked mandate) as a lapse: list prices and the stored ad credit kept", () => {
    const basket = reactivationBasketOf({ subscription: { ...LAPSED, status: "cancelled" }, lines: ALL_THREE, forfeited: false });
    expect(basket).toEqual({
      services: ["managed-website", "social-media", "paid-ads"],
      forfeited: false,
      adCreditCents: 300_000,
      cancelled: false,
      billingInterval: "month",
    });
    expect(reactivationNetCents(basket, "INR")).toBe(899_700);
  });

  it("falls back to the website alone, which earns no ad credit, when no service is left to restore", () => {
    expect(reactivationBasketOf({ subscription: LAPSED, lines: [], forfeited: false })).toEqual({
      services: ["managed-website"],
      forfeited: false,
      adCreditCents: 0,
      cancelled: false,
      billingInterval: "month",
    });
    expect(reactivationBasketOf({ subscription: null, lines: [], forfeited: false })).toEqual({
      services: ["managed-website"],
      forfeited: false,
      adCreditCents: 0,
      cancelled: false,
      billingInterval: "month",
    });
  });
});

describe("bundledLinePrice", () => {
  const social = { listAmountCents: 999_900, offerDiscountAmountCents: 99_910, taxRateBasisPoints: 1_800 };

  it("is the price the line is billed at now when no move is waiting", () => {
    expect(bundledLinePrice({ ...social, pendingOfferDiscountAmountCents: null }, "INR")).toEqual({
      currency: "INR",
      listCents: 999_900,
      discountCents: 99_910,
      offerCents: 99_910,
      netCents: 899_990,
      taxRateBasisPoints: 1_800,
      chargedCents: 899_990,
    });
  });

  it("is the price from the next bill when a move to another package is waiting, which is what the customer will pay each month", () => {
    // Website + Social moved to all three: Social goes from 10% to 20% off at the next renewal.
    expect(bundledLinePrice({ ...social, pendingOfferDiscountAmountCents: 199_980 }, "INR")).toMatchObject({
      discountCents: 199_980,
      offerCents: 199_980,
      netCents: 799_920,
      chargedCents: 799_920,
    });
  });

  it("is list when the move is to no package, and 0 pending is not mistaken for none", () => {
    expect(bundledLinePrice({ ...social, pendingOfferDiscountAmountCents: 0 }, "INR")).toMatchObject({ discountCents: 0, netCents: 999_900 });
  });

  it("adds up, for the whole basket, to the amount the next renewal takes", () => {
    const lines = [
      { listAmountCents: 299_900, offerDiscountAmountCents: 0, pendingOfferDiscountAmountCents: 59_980, taxRateBasisPoints: 1_800 },
      { ...social, pendingOfferDiscountAmountCents: 199_980 },
      { listAmountCents: 2_499_900, offerDiscountAmountCents: 499_940, pendingOfferDiscountAmountCents: null, taxRateBasisPoints: 1_800 },
    ];
    expect(bundleNetCents(lines.map((line) => bundledLinePrice(line, "INR")))).toBe(3_039_800);
  });
});
