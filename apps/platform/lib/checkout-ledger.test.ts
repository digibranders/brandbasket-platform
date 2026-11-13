import { chargedAmountCents, gstInsideCents } from "@brandbasket/billing/tax";
import { discountCentsFor } from "@brandbasket/billing";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { bundleLines, bundleNetCents } from "@brandbasket/shared/lib/billing/bundle";
import { describe, expect, it } from "vitest";
import { codeDiscountCents, ledgerRows, ledgerSummary, type LedgerCode, type LedgerPricing } from "./checkout-ledger";
import { orderSummary } from "./membership";

const PRICING: LedgerPricing = { planInitialAmountCents: 0, currency: "INR", taxRateBasisPoints: 1800, forfeited: false, hasEverPaid: false };

const WEBSITE: readonly MonthlyAddOnId[] = ["managed-website"];
const TWO: readonly MonthlyAddOnId[] = ["managed-website", "social-media"];
const THREE: readonly MonthlyAddOnId[] = ["managed-website", "social-media", "paid-ads"];

const PERCENT_CODE: LedgerCode = { code: "SAVE20", months: 3, stated: { kind: "percent", basisPoints: 2000 } };
const FLAT_CODE: LedgerCode = { code: "FLAT500", months: null, stated: { kind: "amount", amountCents: 50_000 } };
const AFFILIATE_CODE: LedgerCode = { code: "FRIEND", months: null, stated: null };

/** What the server charges: the package lines' nets, less the code, through the same tax function checkout uses. */
function serverTotalCents(services: readonly MonthlyAddOnId[], discountCents: number): number {
  return chargedAmountCents(bundleNetCents(bundleLines(services, "INR")), discountCents);
}

describe("ledgerSummary without a code", () => {
  it.each([
    ["one plan", WEBSITE, 299_900],
    ["two plans", TWO, 599_800],
    ["three plans", THREE, 899_700],
  ])("charges %s what the server charges", (_label, services, expected) => {
    const summary = ledgerSummary(PRICING, services, null);
    expect(summary.totalCents).toBe(expected);
    expect(summary.totalCents).toBe(serverTotalCents(services, 0));
    expect(summary.gstCents).toBe(gstInsideCents(expected, 1800));
  });

  it("keeps the existing GST rounding: 457.48 inside 2,999", () => {
    expect(ledgerSummary(PRICING, WEBSITE, null).gstCents).toBe(45_748);
  });

  it("is the order summary the page already prices with", () => {
    expect(ledgerSummary(PRICING, THREE, null)).toEqual(orderSummary({ ...PRICING, services: THREE }, 0));
  });
});

describe("codeDiscountCents", () => {
  it("is nothing without a code, and for an affiliate code that gives no discount", () => {
    expect(codeDiscountCents(null, THREE, "INR")).toBe(0);
    expect(codeDiscountCents(AFFILIATE_CODE, THREE, "INR")).toBe(0);
  });

  it("resolves a percentage against the basket's package net, as the server does", () => {
    const net = bundleNetCents(bundleLines(TWO, "INR"));
    expect(codeDiscountCents(PERCENT_CODE, TWO, "INR")).toBe(discountCentsFor({ kind: "percent", basisPoints: 2000 }, net));
  });

  it("takes a flat amount off whole", () => {
    expect(codeDiscountCents(FLAT_CODE, WEBSITE, "INR")).toBe(50_000);
  });

  it("is nothing when the code would leave nothing to charge, as the server stops applying it", () => {
    const tooBig: LedgerCode = { code: "BIG", months: null, stated: { kind: "amount", amountCents: 299_900 } };
    expect(codeDiscountCents(tooBig, WEBSITE, "INR")).toBe(0);
    expect(codeDiscountCents(tooBig, TWO, "INR")).toBe(299_900);
  });
});

describe("ledgerSummary with a code", () => {
  it.each([
    ["a percentage code on one plan", WEBSITE, PERCENT_CODE],
    ["a percentage code on three plans", THREE, PERCENT_CODE],
    ["a flat code on two plans", TWO, FLAT_CODE],
  ])("charges %s what the server charges", (_label, services, code) => {
    const summary = ledgerSummary(PRICING, services, code);
    const discount = codeDiscountCents(code, services, "INR");
    expect(summary.discountCents).toBe(discount);
    expect(summary.totalCents).toBe(serverTotalCents(services, discount));
  });
});

describe("ledgerRows", () => {
  const rows = (services: readonly MonthlyAddOnId[], code: LedgerCode | null = null) => ledgerRows(ledgerSummary(PRICING, services, code), "INR", code);

  it("splits the website into a free build and its monthly maintenance", () => {
    expect(rows(WEBSITE)).toEqual([
      { key: "website", label: "Website", amount: "Free", tone: "free" },
      { key: "maintenance", label: "Maintenance", amount: "₹2,999", tone: "plain" },
    ]);
  });

  it("lists each other plan at its list price, with no saving line", () => {
    expect(rows(TWO)).toEqual([
      { key: "website", label: "Website", amount: "Free", tone: "free" },
      { key: "maintenance", label: "Maintenance", amount: "₹2,999", tone: "plain" },
      { key: "social-media", label: "Social Media Management", amount: "₹2,999", tone: "plain" },
    ]);
  });

  it("has no offer line for three plans, and every line is at list", () => {
    const summary = ledgerSummary(PRICING, THREE, null);
    expect(ledgerRows(summary, "INR", null).some((row) => row.key === "offer")).toBe(false);
    expect(summary.offer).toBeNull();
    expect(summary.lines.every((line) => line.netCents === line.listCents)).toBe(true);
  });

  it("adds the code's line after the package saving", () => {
    expect(rows(WEBSITE, PERCENT_CODE).at(-1)).toEqual({ key: "code", label: "Code SAVE20", amount: "-₹599.80", tone: "save" });
  });

  it("leaves out a code that takes nothing off", () => {
    expect(rows(WEBSITE, AFFILIATE_CODE).map((row) => row.key)).toEqual(["website", "maintenance"]);
  });
});

describe("the first-month offer (plan 63)", () => {
  const OFFER: LedgerPricing = { ...PRICING, neverHad: ["social-media", "paid-ads"] };

  it("shows each offer service as its first month at ₹1 and the website at its price, due today being the frozen first payment", () => {
    const summary = ledgerSummary(OFFER, TWO, null);
    const rows = ledgerRows(summary, "INR", null);

    expect(rows.find((row) => row.key === "social-media")).toMatchObject({ label: "Social Media Management, first month", amount: "₹1" });
    expect(rows.find((row) => row.key === "maintenance")).toMatchObject({ label: "Maintenance", amount: "₹2,999" });
    expect(summary.dueTodayCents).toBe(299_900 + 100);
    // The full monthly amount, charged from a month on, is unchanged.
    expect(summary.totalCents).toBe(599_800);
    expect(summary.gstCents).toBe(gstInsideCents(300_000, 1800));
  });

  it("takes each of two offer services at ₹1", () => {
    expect(ledgerSummary(OFFER, ["social-media", "paid-ads"], null).dueTodayCents).toBe(200);
  });

  it("takes dollars as $1", () => {
    const summary = ledgerSummary({ ...OFFER, currency: "USD", taxRateBasisPoints: 0 }, ["social-media"], null);
    expect(summary.dueTodayCents).toBe(100);
    expect(ledgerRows(summary, "USD", null)[0]?.amount).toBe("$1");
  });

  it("takes a code off the services that pay full price, and quotes no offer when the code would leave nothing to take it from", () => {
    expect(ledgerSummary(OFFER, TWO, FLAT_CODE).dueTodayCents).toBe(299_900 + 100 - 50_000);
    const refused = ledgerSummary(OFFER, ["social-media"], FLAT_CODE);
    expect(refused.codeRefused).toBe(true);
  });

  it("does not apply a code the server would refuse: no code row, no discounted total, the offer as without the code", () => {
    for (const services of [["social-media"], ["social-media", "paid-ads"]] as const) {
      const refused = ledgerSummary(OFFER, services, FLAT_CODE);
      const without = ledgerSummary(OFFER, services, null);
      expect(refused.codeRefused).toBe(true);
      expect(refused.discountCents).toBe(0);
      expect(refused.totalCents).toBe(without.totalCents);
      expect(refused.dueTodayCents).toBe(without.dueTodayCents);
      expect(refused.gstCents).toBe(without.gstCents);
      expect(ledgerRows(refused, "INR", FLAT_CODE).some((row) => row.key === "code")).toBe(false);
    }
    expect(ledgerSummary(OFFER, TWO, FLAT_CODE).codeRefused).toBe(false);
    expect(ledgerSummary(OFFER, ["social-media"], null).codeRefused).toBe(false);
  });

  it("is the ordinary price for a service already had, a reactivation (nobody never-had) and the website", () => {
    for (const pricing of [{ ...PRICING, neverHad: [] }, PRICING, { ...PRICING, neverHad: ["managed-website" as const] }]) {
      const summary = ledgerSummary(pricing, TWO, null);
      expect(summary.dueTodayCents).toBe(summary.totalCents);
      expect(ledgerRows(summary, "INR", null).some((row) => row.label.includes("first month"))).toBe(false);
    }
  });
});

describe("paying yearly", () => {
  const YEARLY: LedgerPricing = { ...PRICING, interval: "year" };

  it("charges a year of each plan at 10% off twelve months, rounded down to a whole rupee", () => {
    expect(ledgerSummary(YEARLY, WEBSITE, null).totalCents).toBe(3_238_900);
    expect(ledgerSummary(YEARLY, THREE, null).totalCents).toBe(9_716_700);
  });

  it("shows twelve months of each plan, then the yearly saving, adding up to the total", () => {
    const summary = ledgerSummary(YEARLY, WEBSITE, null);
    expect(ledgerRows(summary, "INR", null).map((row) => [row.label, row.amount])).toEqual([
      ["Website", "Free"],
      ["Maintenance, 12 months", "₹35,988"],
      ["Paid yearly, 10% off", "-₹3,599"],
    ]);
  });

  it("has no first-month offer, even for services never had: the year is due today in full", () => {
    const summary = ledgerSummary({ ...YEARLY, neverHad: ["social-media", "paid-ads"] }, THREE, null);
    expect(summary.firstMonthCents).toEqual({});
    expect(summary.dueTodayCents).toBe(summary.totalCents);
    expect(ledgerRows(summary, "INR", null).some((row) => row.label.includes("first month"))).toBe(false);
  });

  it("takes a percentage code off the year's payment, and an amount code once for each month it runs", () => {
    expect(codeDiscountCents(PERCENT_CODE, WEBSITE, "INR", "year")).toBe(647_780);
    expect(codeDiscountCents(FLAT_CODE, WEBSITE, "INR", "year")).toBe(600_000);
    const rows = ledgerRows(ledgerSummary(YEARLY, WEBSITE, PERCENT_CODE), "INR", PERCENT_CODE);
    expect(rows.at(-1)).toEqual({ key: "code", label: "Code SAVE20, first year", amount: "-₹6,477.80", tone: "save" });
  });

  it("counts a yearly amount code's own months, not the one payment it is frozen for", () => {
    const threeMonths: LedgerCode = { code: "FLAT3", months: 1, codeMonths: 3, stated: { kind: "amount", amountCents: 50_000 } };
    expect(codeDiscountCents(threeMonths, WEBSITE, "INR", "year")).toBe(150_000);
  });

  it("leaves a monthly basket as it was", () => {
    expect(ledgerSummary(PRICING, WEBSITE, null).annual).toBeNull();
    expect(ledgerSummary(PRICING, WEBSITE, null).totalCents).toBe(299_900);
    expect(codeDiscountCents(PERCENT_CODE, WEBSITE, "INR")).toBe(59_980);
  });
});
