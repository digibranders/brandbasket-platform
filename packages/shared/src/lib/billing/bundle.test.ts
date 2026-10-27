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
    expect(readBundleSelection(["local-seo-aeo", "digital-growth", "digital-growth", "managed-website"])).toEqual(["managed-website", "digital-growth", "local-seo-aeo"]);
  });

  it("drops anything that is not a service", () => {
    expect(readBundleSelection(["press-release", "local-seo", "social-media", "", "local-seo-aeo"])).toEqual(["local-seo-aeo"]);
    expect(readBundleSelection([])).toEqual([]);
  });
});

describe("bundleLines", () => {
  it("prices a package at list once the business has given the offer up", () => {
    expect(bundleLines(["managed-website", "digital-growth"], "INR", true).map((line) => [line.offerCents, line.netCents])).toEqual([
      [0, 299_900],
      [0, 999_900],
    ]);
  });

  it("prices one service at its list price", () => {
    expect(bundleLines(["digital-growth"], "INR")).toEqual([
      { addOn: "digital-growth", title: "Social Media and Ads", listCents: 999_900, offerCents: 0, netCents: 999_900 },
    ]);
  });

  it("takes 10% off two services as a whole-rupee saving, the odd paise on the dearest line", () => {
    // Worked out on their own: 10% of 3,499,800 paise is 349,980, so the saving is ₹3,499 (349,900). Each line's own 10%
    // is 99,990 and 249,990, which is 80 paise too much, taken back from the dearer line.
    expect(bundleLines(["digital-growth", "local-seo-aeo"], "INR")).toEqual([
      { addOn: "digital-growth", title: "Social Media and Ads", listCents: 999_900, offerCents: 99_990, netCents: 899_910 },
      { addOn: "local-seo-aeo", title: "Local SEO + AEO", listCents: 2_499_900, offerCents: 249_910, netCents: 2_249_990 },
    ]);
  });

  it("takes 20% off all three, again as a whole-rupee saving", () => {
    // 20% of 3,799,700 is 759,940, so the saving is ₹7,599 (759,900): 40 paise less than the lines' own 20%, off the dearest.
    expect(bundleLines(["managed-website", "digital-growth", "local-seo-aeo"], "INR").map((line) => [line.offerCents, line.netCents])).toEqual([
      [59_980, 239_920],
      [199_980, 799_920],
      [499_940, 1_999_960],
    ]);
  });

  it("prices a dollar package in cents, in the catalogue's order", () => {
    // 10% of 41,500 cents is 4,150, so the saving is $41 (4,100): 50 cents less than the lines' own 10%, off the dearer line.
    expect(bundleLines(["local-seo-aeo", "managed-website"], "USD")).toEqual([
      { addOn: "managed-website", title: "Managed Website", listCents: 6_500, offerCents: 650, netCents: 5_850 },
      { addOn: "local-seo-aeo", title: "Local SEO + AEO", listCents: 35_000, offerCents: 3_450, netCents: 31_550 },
    ]);
  });

  it("adds the nets together, and is nothing for no services", () => {
    expect(bundleNetCents(bundleLines(["managed-website", "digital-growth", "local-seo-aeo"], "INR"))).toBe(3_039_800);
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
    expect(websiteAloneNetCents("USD")).toBe(6_500);
  });
});

describe("reactivationBasketOf", () => {
  const PAID = new Date("2026-09-01T00:00:00Z");
  const LAPSED = { status: "active", activatedAt: PAID, cancelRequestedAt: null, adCreditCents: 300_000 } as const;
  const line = (addOn: string, overrides: Partial<LapsedLine> = {}): LapsedLine => ({ addOn, activatedAt: PAID, endRequestedAt: null, ...overrides });
  const ALL_THREE = [line("managed-website"), line("digital-growth"), line("local-seo-aeo")];

  it("restores a lapsed package's own services at the package price, with its ad credit kept", () => {
    const basket = reactivationBasketOf({ subscription: LAPSED, lines: ALL_THREE, forfeited: false });
    expect(basket).toEqual({
      services: ["managed-website", "digital-growth", "local-seo-aeo"],
      forfeited: false,
      adCreditCents: 300_000,
      cancelled: false,
    });
    expect(reactivationNetCents(basket, "INR")).toBe(3_039_800);
    // 56,500 cents of list, 20% off is 11,300, exactly $113.
    expect(reactivationNetCents(basket, "USD")).toBe(45_200);
  });

  it("prices the set it restores, not the percentage the lapsed lines were last billed at", () => {
    const basket = reactivationBasketOf({
      subscription: { ...LAPSED, adCreditCents: 150_000 },
      lines: [line("managed-website"), line("digital-growth")],
      forfeited: false,
    });
    expect(reactivationNetCents(basket, "INR")).toBe(1_169_900);
    expect(basket.adCreditCents).toBe(150_000);
  });

  it("restores a single service at its list price", () => {
    const basket = reactivationBasketOf({ subscription: { ...LAPSED, adCreditCents: 0 }, lines: [line("local-seo-aeo")], forfeited: false });
    expect(reactivationNetCents(basket, "INR")).toBe(2_499_900);
  });

  it("restores a business that gave the offer up at list, with no ad credit", () => {
    const basket = reactivationBasketOf({ subscription: { ...LAPSED, adCreditCents: 0 }, lines: [line("managed-website"), line("local-seo-aeo")], forfeited: true });
    expect(basket).toMatchObject({ services: ["managed-website", "local-seo-aeo"], forfeited: true, adCreditCents: 0, cancelled: false });
    expect(reactivationNetCents(basket, "INR")).toBe(2_799_800);
  });

  it("leaves out a service on its way out, one that was never paid for, and one that has stopped", () => {
    const basket = reactivationBasketOf({
      subscription: { ...LAPSED, adCreditCents: 0 },
      lines: [
        line("managed-website"),
        line("digital-growth", { endRequestedAt: new Date("2026-09-20T00:00:00Z") }),
        line("local-seo-aeo", { activatedAt: null }),
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
      services: ["managed-website", "digital-growth", "local-seo-aeo"],
      forfeited: false,
      adCreditCents: 300_000,
      cancelled: false,
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
      services: ["managed-website", "digital-growth", "local-seo-aeo"],
      forfeited: true,
      adCreditCents: 0,
      cancelled: true,
    });
    expect(reactivationNetCents(basket, "INR")).toBe(3_799_700);
  });

  it("restores a subscription the provider ended without the customer asking (a revoked mandate) as a lapse: package price and ad credit kept", () => {
    const basket = reactivationBasketOf({ subscription: { ...LAPSED, status: "cancelled" }, lines: ALL_THREE, forfeited: false });
    expect(basket).toEqual({
      services: ["managed-website", "digital-growth", "local-seo-aeo"],
      forfeited: false,
      adCreditCents: 300_000,
      cancelled: false,
    });
    expect(reactivationNetCents(basket, "INR")).toBe(3_039_800);
  });

  it("falls back to the website alone, which earns no ad credit, when no service is left to restore", () => {
    expect(reactivationBasketOf({ subscription: LAPSED, lines: [], forfeited: false })).toEqual({
      services: ["managed-website"],
      forfeited: false,
      adCreditCents: 0,
      cancelled: false,
    });
    expect(reactivationBasketOf({ subscription: null, lines: [], forfeited: false })).toEqual({
      services: ["managed-website"],
      forfeited: false,
      adCreditCents: 0,
      cancelled: false,
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
