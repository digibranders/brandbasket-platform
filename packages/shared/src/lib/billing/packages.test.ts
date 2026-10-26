import { describe, expect, it } from "vitest";
import { chargedAmountCents } from "@brandbasket/billing/tax";
import type { MonthlyAddOnId } from "./add-ons";
import { adCreditCentsAtCheckout, adCreditCentsFor, packageBasisPointsFor, packageDiscountCentsFor, packageDiscountsFor, packageLines, packageLineWith, shareDiscountAcrossLines } from "./packages";

describe("package offers", () => {
  it.each([
    [["managed-website"], 0],
    [["digital-growth"], 0],
    [["managed-website", "digital-growth"], 1000],
    [["managed-website", "local-seo-aeo"], 1000],
    [["digital-growth", "local-seo-aeo"], 1000],
    [["managed-website", "digital-growth", "local-seo-aeo"], 2000],
  ] as const)("gives %o %i basis points off", (services, bp) => {
    expect(packageBasisPointsFor({ services, forfeited: false })).toBe(bp);
    expect(packageBasisPointsFor({ services, forfeited: true })).toBe(0);
  });

  it("does not care about order or duplicates", () => {
    expect(packageBasisPointsFor({ services: ["local-seo-aeo", "managed-website", "local-seo-aeo"], forfeited: false })).toBe(1000);
  });

  it("rounds a line's discount half up", () => {
    expect(packageDiscountCentsFor(333, 3000)).toBe(100);
    expect(packageDiscountCentsFor(335, 3000)).toBe(101);
  });

  // Ad money a month at the first checkout (owner, 2026-10-26): 1,500 rupees for Website + Social and for Social + SEO, 3,000
  // for all three, none for Website + SEO. The dollar amounts stay as they were until the owner gives new ones.
  it.each([
    [["managed-website"], "INR", 0],
    [["managed-website", "digital-growth"], "INR", 150000],
    [["managed-website", "local-seo-aeo"], "INR", 0],
    [["digital-growth", "local-seo-aeo"], "INR", 150000],
    [["managed-website", "digital-growth", "local-seo-aeo"], "INR", 300000],
    [["managed-website", "digital-growth"], "USD", 2500],
    [["digital-growth", "local-seo-aeo"], "USD", 2500],
    [["managed-website", "digital-growth", "local-seo-aeo"], "USD", 6000],
    [["managed-website", "local-seo-aeo"], "USD", 0],
  ] as const)("earns %o bought together ad credit in %s of %i a month", (services, currency, cents) => {
    expect(adCreditCentsFor(services, currency)).toBe(cents);
  });

  it("earns ad credit at checkout only for a business that has never paid and has not given the offer up", () => {
    const services = ["managed-website", "digital-growth", "local-seo-aeo"] as const;
    expect(adCreditCentsAtCheckout({ services, forfeited: false, hasEverPaid: false }, "INR")).toBe(300000);
    expect(adCreditCentsAtCheckout({ services, forfeited: true, hasEverPaid: false }, "INR")).toBe(0);
    expect(adCreditCentsAtCheckout({ services, forfeited: false, hasEverPaid: true }, "INR")).toBe(0);
  });

  it("prices a service joining a basket as part of the enlarged set, and at list once the offer is given up", () => {
    const website = [{ addOn: "managed-website", listCents: 299900 }] as const;
    expect(packageLineWith(website, false, "digital-growth", "INR")).toMatchObject({ addOn: "digital-growth", discountCents: 99910, netCents: 899990 });
    const dollars = [
      { addOn: "managed-website", listCents: 6500 },
      { addOn: "digital-growth", listCents: 15000 },
    ] as const;
    expect(packageLineWith(dollars, false, "local-seo-aeo", "USD")).toMatchObject({ discountCents: 7000, netCents: 28000 });
    expect(packageLineWith(dollars.slice(1), false, "local-seo-aeo", "USD")).toMatchObject({ discountCents: 3500, netCents: 31500 });
    expect(packageLineWith(website, true, "digital-growth", "INR")).toMatchObject({ discountCents: 0, netCents: 999900 });
    expect(packageLineWith([], false, "managed-website", "INR")).toMatchObject({ discountCents: 0, netCents: 299900 });
  });

  it("takes the new line's price from the enlarged set, so the leftover can land on a line already there", () => {
    const held = [
      { addOn: "managed-website", listCents: 299900 },
      { addOn: "digital-growth", listCents: 999900 },
    ] as const;
    expect(packageLineWith(held, false, "local-seo-aeo", "INR")).toMatchObject({ discountCents: 499940, netCents: 1999960 });
    expect(packageDiscountsFor([...held, { addOn: "local-seo-aeo", listCents: 2499900 }], 2000)).toEqual([59980, 199980, 499940]);
    expect(packageDiscountsFor(held, 1000)).toEqual([29990, 99910]);
  });

  it("keeps the list price a held line was sold at", () => {
    const soldEarlier = [
      { addOn: "managed-website", listCents: 300000 },
      { addOn: "digital-growth", listCents: 1000000 },
    ] as const;
    expect(packageDiscountsFor(soldEarlier, 1000)).toEqual([30000, 100000]);
  });
});

type Basket = readonly MonthlyAddOnId[];

/**
 * Every set of two or three services at the new package percentages (10% for two, 20% for all three), worked out on their own:
 * each line takes its percentage of its list, half a minor unit up, and the whole package saving is then rounded DOWN to a whole
 * rupee or dollar, the difference landing on the dearest line. The customer pays the list price less that saving.
 */
const PACKAGES: readonly {
  readonly services: Basket;
  readonly netCents: Record<"INR" | "USD", number>;
  readonly savingsCents: Record<"INR" | "USD", number>;
  readonly lines: Record<"INR" | "USD", readonly number[]>;
}[] = [
  { services: ["managed-website", "digital-growth"], netCents: { INR: 1169900, USD: 19400 }, savingsCents: { INR: 129900, USD: 2100 }, lines: { INR: [269910, 899990], USD: [5850, 13550] } },
  { services: ["managed-website", "local-seo-aeo"], netCents: { INR: 2519900, USD: 37400 }, savingsCents: { INR: 279900, USD: 4100 }, lines: { INR: [269910, 2249990], USD: [5850, 31550] } },
  { services: ["digital-growth", "local-seo-aeo"], netCents: { INR: 3149900, USD: 45000 }, savingsCents: { INR: 349900, USD: 5000 }, lines: { INR: [899910, 2249990], USD: [13500, 31500] } },
  { services: ["managed-website", "digital-growth", "local-seo-aeo"], netCents: { INR: 3039800, USD: 45200 }, savingsCents: { INR: 759900, USD: 11300 }, lines: { INR: [239920, 799920, 1999960], USD: [5200, 12000, 28000] } },
];

describe("package prices", () => {
  it.each(PACKAGES.flatMap((p) => (["INR", "USD"] as const).map((currency) => [p.services, currency, p] as const)))(
    "prices %o in %s with the saving rounded down to the whole rupee or dollar, the difference on the dearest line",
    (services, currency, expected) => {
      const lines = packageLines({ services, forfeited: false }, currency);
      const net = lines.reduce((sum, line) => sum + line.netCents, 0);
      expect(net).toBe(expected.netCents[currency]);
      expect(net % 100).toBe(0);
      expect(lines.map((line) => line.netCents)).toEqual(expected.lines[currency]);
      const saving = lines.reduce((sum, line) => sum + line.listCents, 0) - net;
      expect(saving).toBe(expected.savingsCents[currency]);
      expect(saving % 100).toBe(0);
      for (const line of lines) {
        expect(line.netCents).toBe(line.listCents - line.discountCents);
        expect(line.discountCents).toBeGreaterThan(0);
        expect(line.discountCents).toBeLessThan(line.listCents);
      }
      // Each line takes its own percentage; only the dearest moves, by less than a whole rupee or dollar, to make the saving whole.
      const basisPoints = packageBasisPointsFor({ services, forfeited: false });
      const dearest = lines.reduce((best, line) => (line.listCents > best.listCents ? line : best));
      for (const line of lines) {
        const own = packageDiscountCentsFor(line.listCents, basisPoints);
        if (line === dearest) {
          expect(line.discountCents - own).toBeGreaterThanOrEqual(-101);
          expect(line.discountCents - own).toBeLessThanOrEqual(1);
        } else {
          expect(line.discountCents).toBe(own);
        }
      }
    },
  );

  it("never charges a package a paisa more than its list price less the exact discount rounded down", () => {
    for (const p of PACKAGES) {
      const lines = packageLines({ services: p.services, forfeited: false }, "INR");
      const list = lines.reduce((sum, line) => sum + line.listCents, 0);
      const basisPoints = packageBasisPointsFor({ services: p.services, forfeited: false });
      expect(list - lines.reduce((sum, line) => sum + line.netCents, 0)).toBe(Math.floor((list * basisPoints) / 1_000_000) * 100);
    }
  });

  it.each(PACKAGES)("charges %# at the package price as it stands, the GST inside it", (p) => {
    expect(chargedAmountCents(p.netCents.INR, 0)).toBe(p.netCents.INR);
  });

  it.each([
    ["managed-website", 299900, 299900],
    ["digital-growth", 999900, 999900],
    ["local-seo-aeo", 2499900, 2499900],
  ] as const)("keeps %s at list, with no rounding, when it is bought alone or the offer is given up", (service, list, charged) => {
    const [alone] = packageLines({ services: [service], forfeited: false }, "INR");
    expect(alone).toMatchObject({ listCents: list, discountCents: 0, netCents: list, chargedCents: charged });
    for (const p of PACKAGES) {
      const lines = packageLines({ services: p.services, forfeited: true }, "INR");
      expect(lines.map((line) => line.discountCents)).toEqual(p.services.map(() => 0));
      expect(lines.map((line) => line.netCents)).toEqual(lines.map((line) => line.listCents));
    }
  });

  it("covers all seven baskets, in both currencies, and leaves the ad credit as the owner set it", () => {
    const baskets: readonly Basket[] = [
      ["managed-website"],
      ["digital-growth"],
      ["local-seo-aeo"],
      ["managed-website", "digital-growth"],
      ["managed-website", "local-seo-aeo"],
      ["digital-growth", "local-seo-aeo"],
      ["managed-website", "digital-growth", "local-seo-aeo"],
    ];
    expect(baskets).toHaveLength(7);
    for (const services of baskets) {
      for (const currency of ["INR", "USD"] as const) {
        const lines = packageLines({ services, forfeited: false }, currency);
        const net = lines.reduce((sum, line) => sum + line.netCents, 0);
        if (services.length > 1) expect(net % 100).toBe(0);
        for (const line of lines) expect(line.discountCents).toBeGreaterThanOrEqual(0);
        for (const line of lines) expect(line.discountCents).toBeLessThanOrEqual(line.listCents);
      }
    }
    expect(adCreditCentsFor(["managed-website", "digital-growth", "local-seo-aeo"], "INR")).toBe(300000);
    expect(adCreditCentsFor(["digital-growth", "local-seo-aeo"], "USD")).toBe(2500);
  });

  it("gives a tie to the line first in the catalogue's order, whatever order the lines are given in", () => {
    const equal = [
      { addOn: "local-seo-aeo", listCents: 100_050 },
      { addOn: "managed-website", listCents: 100_050 },
    ] as const;
    // 20% of 100050 is 20010 each, 40020 together; the saving rounds down to 40000, so 20 comes off the website, first in the catalogue.
    expect(packageDiscountsFor(equal, 2000)).toEqual([20010, 19990]);
  });
});

describe("shareDiscountAcrossLines", () => {
  it("shares in proportion to the nets, the leftover on the largest line, to the minor unit", () => {
    // ₹1,500 over ₹2,399.20 and ₹7,998.80.
    expect(shareDiscountAcrossLines([239_920, 799_880], 150_000)).toEqual([34_610, 115_390]);
    // ₹1,000 over the three services at 30% off.
    expect(shareDiscountAcrossLines([209_930, 699_930, 1_749_840], 100_000)).toEqual([7_892, 26_316, 65_792]);
  });

  it("always adds up to the whole discount", () => {
    for (const total of [1, 2, 3, 99, 12_345, 2_659_699]) {
      expect(shareDiscountAcrossLines([209_930, 699_930, 1_749_840], total).reduce((sum, share) => sum + share, 0)).toBe(total);
    }
  });

  it("gives the first of equal lines the leftover", () => {
    expect(shareDiscountAcrossLines([100, 100, 100], 100)).toEqual([34, 33, 33]);
  });

  it("gives a single line the whole discount, and nothing to share when there is no discount or no net", () => {
    expect(shareDiscountAcrossLines([299_900], 50_000)).toEqual([50_000]);
    expect(shareDiscountAcrossLines([100, 200], 0)).toEqual([0, 0]);
    expect(shareDiscountAcrossLines([0, 0], 5)).toEqual([0, 0]);
  });

  it("refuses a discount that is not whole minor units", () => {
    expect(() => shareDiscountAcrossLines([100], 1.5)).toThrow(RangeError);
    expect(() => shareDiscountAcrossLines([100], -1)).toThrow(RangeError);
  });
});
