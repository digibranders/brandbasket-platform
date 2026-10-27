import { chargedAmountCents, gstInsideCents } from "@brandbasket/billing/tax";
import { discountCentsFor } from "@brandbasket/billing";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { bundleLines, bundleNetCents } from "@brandbasket/shared/lib/billing/bundle";
import { describe, expect, it } from "vitest";
import { codeDiscountCents, ledgerRows, ledgerSummary, type LedgerCode, type LedgerPricing } from "./checkout-ledger";
import { orderSummary } from "./membership";

const PRICING: LedgerPricing = { planInitialAmountCents: 0, currency: "INR", taxRateBasisPoints: 1800, forfeited: false, hasEverPaid: false };

const WEBSITE: readonly MonthlyAddOnId[] = ["managed-website"];
const TWO: readonly MonthlyAddOnId[] = ["managed-website", "digital-growth"];
const THREE: readonly MonthlyAddOnId[] = ["managed-website", "digital-growth", "local-seo-aeo"];

const PERCENT_CODE: LedgerCode = { code: "SAVE20", months: 3, stated: { kind: "percentage", basisPoints: 2000 } };
const FLAT_CODE: LedgerCode = { code: "FLAT500", months: null, stated: { kind: "amount", amountCents: 50_000 } };
const AFFILIATE_CODE: LedgerCode = { code: "FRIEND", months: null, stated: null };

/** What the server charges: the package lines' nets, less the code, through the same tax function checkout uses. */
function serverTotalCents(services: readonly MonthlyAddOnId[], discountCents: number): number {
  return chargedAmountCents(bundleNetCents(bundleLines(services, "INR")), discountCents);
}

describe("ledgerSummary without a code", () => {
  it.each([
    ["one plan", WEBSITE, 299_900],
    ["two plans", TWO, 1_169_900],
    ["three plans", THREE, 3_039_800],
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
    expect(codeDiscountCents(PERCENT_CODE, TWO, "INR")).toBe(discountCentsFor({ kind: "percentage", basisPoints: 2000 }, net));
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

  it("lists each other plan at its list price and the package saving as one line", () => {
    expect(rows(TWO)).toEqual([
      { key: "website", label: "Website", amount: "Free", tone: "free" },
      { key: "maintenance", label: "Maintenance", amount: "₹2,999", tone: "plain" },
      { key: "digital-growth", label: "Social Media and Ads", amount: "₹9,999", tone: "plain" },
      { key: "offer", label: "10% off", amount: "-₹1,299", tone: "save" },
    ]);
  });

  it("names 20% for three plans, and the saving is what the lines lose", () => {
    const summary = ledgerSummary(PRICING, THREE, null);
    const offer = ledgerRows(summary, "INR", null).find((row) => row.key === "offer");
    expect(offer?.label).toBe("20% off");
    expect(summary.offer?.discountCents).toBe(summary.lines.reduce((total, line) => total + line.listCents - line.netCents, 0));
  });

  it("adds the code's line after the package saving", () => {
    expect(rows(WEBSITE, PERCENT_CODE).at(-1)).toEqual({ key: "code", label: "Code SAVE20", amount: "-₹599.80", tone: "save" });
  });

  it("leaves out a code that takes nothing off", () => {
    expect(rows(WEBSITE, AFFILIATE_CODE).map((row) => row.key)).toEqual(["website", "maintenance"]);
  });
});
