import { chargedAmountCents, gstInsideCents } from "@brandbasket/billing/tax";
import { discountCentsFor } from "@brandbasket/billing";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { bundleLines, bundleNetCents } from "@brandbasket/shared/lib/billing/bundle";
import { describe, expect, it } from "vitest";
import { codeDiscountCents, ledgerOffer, ledgerRows, ledgerSummary, type LedgerCode, type LedgerFirstMonth, type LedgerPricing } from "./ledger";
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

  it("has no offer row for three plans, and every line is at list", () => {
    const summary = ledgerSummary(PRICING, THREE, null);
    expect(ledgerRows(summary, "INR", null).find((row) => row.key === "offer")).toBeUndefined();
    expect(summary.lines.every((line) => line.netCents === line.listCents)).toBe(true);
  });

  it("adds the code's line after the package saving", () => {
    expect(rows(WEBSITE, PERCENT_CODE).at(-1)).toEqual({ key: "code", label: "Code SAVE20", amount: "-₹599.80", tone: "save" });
  });

  it("leaves out a code that takes nothing off", () => {
    expect(rows(WEBSITE, AFFILIATE_CODE).map((row) => row.key)).toEqual(["website", "maintenance"]);
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

  it("takes a percentage code off the year's payment, and an amount code once for each month it runs", () => {
    expect(codeDiscountCents(PERCENT_CODE, WEBSITE, "INR", "year")).toBe(647_780);
    expect(codeDiscountCents(FLAT_CODE, WEBSITE, "INR", "year")).toBe(600_000);
    const rows = ledgerRows(ledgerSummary(YEARLY, WEBSITE, PERCENT_CODE), "INR", PERCENT_CODE);
    expect(rows.at(-1)).toEqual({ key: "code", label: "Code SAVE20, first year", amount: "-₹6,477.80", tone: "save" });
  });

  it("leaves a monthly basket as it was", () => {
    expect(ledgerSummary(PRICING, WEBSITE, null).annual).toBeNull();
    expect(codeDiscountCents(PERCENT_CODE, WEBSITE, "INR")).toBe(59_980);
  });
});

describe("the first-month offer (plan 63)", () => {
  const NEVER_HAD: LedgerFirstMonth = { provider: "razorpay", hadService: { "managed-website": false, "social-media": false, "paid-ads": false } };

  it("charges ₹1 for each offer plan today and the rest at their price, as the checkout does: ₹3,000 for the website and Social Media", () => {
    const summary = ledgerSummary(PRICING, TWO, null);
    const offer = ledgerOffer(summary, NEVER_HAD, "INR", "month");
    expect(offer).toEqual({ firstPaymentCents: 300_000, trialPriceByAddOn: { "social-media": 100 } });
    expect(ledgerRows(summary, "INR", null, offer)).toEqual([
      { key: "website", label: "Website", amount: "Free", tone: "free" },
      { key: "maintenance", label: "Maintenance", amount: "₹2,999", tone: "plain" },
      { key: "social-media", label: "Social Media Management, first month", amount: "₹1", tone: "plain" },
    ]);
  });

  it("puts both Social Media and Paid Ads on the offer: ₹3,001 for all three", () => {
    expect(ledgerOffer(ledgerSummary(PRICING, THREE, null), NEVER_HAD, "INR", "month")?.firstPaymentCents).toBe(300_100);
  });

  it("takes a code off the plans at full price only, so the rows still add up to what is due", () => {
    const summary = ledgerSummary(PRICING, TWO, FLAT_CODE);
    const offer = ledgerOffer(summary, NEVER_HAD, "INR", "month");
    expect(offer?.firstPaymentCents).toBe(300_000 - 50_000);
    expect(ledgerRows(summary, "INR", FLAT_CODE, offer).at(-1)).toEqual({ key: "code", label: "Code FLAT500", amount: "-₹500", tone: "save" });
  });

  it("is not offered for a plan the business has had, on a yearly payment, by bank transfer, or with nothing to tell", () => {
    const summary = ledgerSummary(PRICING, TWO, null);
    expect(ledgerOffer(summary, { ...NEVER_HAD, hadService: { "social-media": true } }, "INR", "month")).toBeNull();
    expect(ledgerOffer(summary, { ...NEVER_HAD, hadService: {} }, "INR", "month")).toBeNull();
    expect(ledgerOffer(ledgerSummary({ ...PRICING, interval: "year" }, TWO, null), NEVER_HAD, "INR", "year")).toBeNull();
    expect(ledgerOffer(summary, { ...NEVER_HAD, provider: "manual" }, "INR", "month")).toBeNull();
    expect(ledgerOffer(summary, null, "INR", "month")).toBeNull();
  });

  it("leaves the website alone on the offer: it is not one of the offer's plans", () => {
    expect(ledgerOffer(ledgerSummary(PRICING, WEBSITE, null), NEVER_HAD, "INR", "month")).toBeNull();
  });
});

describe("the website build fee in the summary (plan 65)", () => {
  const FEE = { kind: "b2b", fee: { listCents: 3_500_000, discountCents: 1_000_000, netCents: 2_500_000 }, note: "As agreed on call" } as const;
  const summary = (services: readonly MonthlyAddOnId[], pricing: LedgerPricing = PRICING, code: LedgerCode | null = null) => ledgerSummary(pricing, services, code);

  it("charges the fee and Social's first month today, and leaves the website's own month to the first monthly charge", () => {
    const two = summary(TWO);
    const offer = ledgerOffer(two, { provider: "razorpay", hadService: { "social-media": true } }, "INR", "month", FEE);
    expect(offer?.firstPaymentCents).toBe(2_500_000 + 299_900);
    expect(ledgerRows(two, "INR", null, offer, FEE).map((row) => [row.label, row.amount])).toEqual([
      ["B2B website build", "₹35,000"],
      ["As agreed on call", "-₹10,000"],
      ["Maintenance", "Not charged today"],
      ["Social Media Management", "₹2,999"],
    ]);
  });

  it("charges the fee alone for the website alone", () => {
    expect(ledgerOffer(summary(WEBSITE), { provider: "razorpay", hadService: {} }, "INR", "month", FEE)?.firstPaymentCents).toBe(2_500_000);
  });

  it("prices an ecommerce store at its own monthly price in the rows", () => {
    const ecommerce = { kind: "ecommerce", fee: { listCents: 6_500_000, discountCents: 0, netCents: 6_500_000 }, note: null } as const;
    const rows = ledgerRows(summary(WEBSITE, { ...PRICING, kind: "ecommerce" }), "INR", null, null, { ...ecommerce, fee: { ...ecommerce.fee, discountCents: 6_500_000, netCents: 0 } });
    expect(rows.map((row) => [row.label, row.amount])).toEqual([
      ["Ecommerce store build", "₹65,000"],
      ["Build discount", "-₹65,000"],
      ["Maintenance", "₹3,999"],
    ]);
  });

  it("takes the whole year with the fee when paid yearly, the website included", () => {
    const yearly: LedgerPricing = { ...PRICING, interval: "year" };
    const offer = ledgerOffer(summary(WEBSITE, yearly), { provider: "razorpay", hadService: {} }, "INR", "year", FEE);
    expect(offer?.firstPaymentCents).toBe(2_500_000 + 3_238_900);
    expect(ledgerRows(summary(WEBSITE, yearly), "INR", null, offer, FEE).find((row) => row.key === "maintenance")?.amount).toBe("₹35,988");
  });

  it("says a code starts with the first monthly payment on a monthly deal", () => {
    const code = FLAT_CODE;
    const rows = ledgerRows(summary(TWO, PRICING, code), "INR", code, null, FEE);
    expect(rows.find((row) => row.key === "code")).toEqual({ key: "code", label: "Code FLAT500", amount: "From your first monthly payment", tone: "save" });
  });

  it("is unchanged with no fee: the website is free and maintenance is charged", () => {
    expect(ledgerRows(summary(WEBSITE), "INR", null, null, null).map((row) => [row.label, row.amount])).toEqual([
      ["Website", "Free"],
      ["Maintenance", "₹2,999"],
    ]);
  });
});
