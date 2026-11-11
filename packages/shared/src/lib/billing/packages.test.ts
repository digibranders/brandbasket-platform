import { describe, expect, it } from "vitest";
import { chargedAmountCents } from "@brandbasket/billing/tax";
import type { MonthlyAddOnId } from "./add-ons";
import { adCreditCentsAtCheckout, adCreditCentsFor, PACKAGE_OFFERS, packageBasisPointsFor, packageDiscountCentsFor, packageDiscountsFor, packageLines, packageLineWith, shareDiscountAcrossLines } from "./packages";

describe("package offers", () => {
  it("has no offers: every basket is at list with no discount percentage and no ad credit", () => {
    expect(PACKAGE_OFFERS).toEqual([]);
    const baskets: readonly Basket[] = [
      ["managed-website"],
      ["managed-website", "social-media"],
      ["social-media", "paid-ads"],
      ["managed-website", "social-media", "paid-ads"],
    ];
    for (const services of baskets) {
      for (const forfeited of [false, true]) expect(packageBasisPointsFor({ services, forfeited })).toBe(0);
      for (const currency of ["INR", "USD"] as const) {
        expect(adCreditCentsFor(services, currency)).toBe(0);
        expect(adCreditCentsAtCheckout({ services, forfeited: false, hasEverPaid: false }, currency)).toBe(0);
      }
    }
  });

  it("rounds a line's discount half up", () => {
    expect(packageDiscountCentsFor(333, 3000)).toBe(100);
    expect(packageDiscountCentsFor(335, 3000)).toBe(101);
  });

  it("prices a service joining a basket at its list price, whatever it joins", () => {
    const website = [{ addOn: "managed-website", listCents: 299900 }] as const;
    expect(packageLineWith(website, false, "social-media", "INR")).toMatchObject({ addOn: "social-media", discountCents: 0, netCents: 299900 });
    expect(packageLineWith([...website, { addOn: "social-media", listCents: 299900 }], false, "paid-ads", "INR")).toMatchObject({ discountCents: 0, netCents: 299900 });
    expect(packageLineWith([{ addOn: "social-media", listCents: 15000 }], false, "paid-ads", "USD")).toMatchObject({ discountCents: 0, netCents: 5900 });
    expect(packageLineWith([], false, "managed-website", "INR")).toMatchObject({ discountCents: 0, netCents: 299900 });
  });

  it("splits a package only when given explicit basis points, the leftover landing on the first line", () => {
    const held = [
      { addOn: "managed-website", listCents: 299900 },
      { addOn: "social-media", listCents: 299900 },
    ] as const;
    // 20% of 899,700 is 179,940, so the saving is 179,900 and the 40 paise of leftover lands on the first line (the website).
    expect(packageDiscountsFor([...held, { addOn: "paid-ads", listCents: 299900 }], 2000)).toEqual([59940, 59980, 59980]);
    expect(packageDiscountsFor(held, 1000)).toEqual([29910, 29990]);
  });

  it("keeps the list price a held line was sold at", () => {
    const soldEarlier = [
      { addOn: "managed-website", listCents: 300000 },
      { addOn: "social-media", listCents: 1000000 },
    ] as const;
    expect(packageDiscountsFor(soldEarlier, 1000)).toEqual([30000, 100000]);
  });
});

type Basket = readonly MonthlyAddOnId[];

describe("package prices", () => {
  it.each([
    [["managed-website"], "INR", [299900]],
    [["managed-website", "social-media"], "INR", [299900, 299900]],
    [["managed-website", "social-media", "paid-ads"], "INR", [299900, 299900, 299900]],
    [["managed-website", "social-media", "paid-ads"], "USD", [5900, 5900, 5900]],
  ] as const)("leaves %o at list in %s, with the GST inside it", (services, currency, nets) => {
    for (const forfeited of [false, true]) {
      const lines = packageLines({ services, forfeited }, currency);
      expect(lines.map((line) => line.netCents)).toEqual(nets);
      for (const line of lines) expect(line).toMatchObject({ discountCents: 0, netCents: line.listCents });
    }
    if (currency === "INR") {
      const total = nets.reduce((sum, net) => sum + net, 0);
      expect(chargedAmountCents(total, 0)).toBe(total);
    }
  });

  it("gives a tie to the line first in the catalogue's order, whatever order the lines are given in", () => {
    const equal = [
      { addOn: "paid-ads", listCents: 100_050 },
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
