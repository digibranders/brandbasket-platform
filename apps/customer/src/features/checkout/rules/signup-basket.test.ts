import { gstInsideCents } from "@brandbasket/billing/tax";
import type { BillingInterval } from "@brandbasket/db";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/format";
import { ledgerOffer, ledgerRows, ledgerSummary } from "./ledger";
import { basketView, buildSignupBasketTable, canTick, cardBadge, payLabel, purchasableServices, SIGNUP_BASKET_IDS } from "./signup-basket";

const BASKETS: readonly (readonly MonthlyAddOnId[])[] = [
  ["managed-website"],
  ["social-media"],
  ["expert-monitoring", "managed-website"],
  ["managed-website", "social-media"],
  ["expert-monitoring", "social-media"],
  ["expert-monitoring", "managed-website", "social-media"],
];
const NEVER_HAD: Readonly<Partial<Record<MonthlyAddOnId, boolean>>> = { "social-media": false, "paid-ads": false };

/** What the checkout page itself shows for the same basket: the existing ledger, priced for a business that has had nothing. */
function checkoutFigures(services: readonly MonthlyAddOnId[], currency: MoneyCurrency, interval: BillingInterval) {
  const taxRateBasisPoints = currency === "INR" ? 1800 : 0;
  const pricing = { planInitialAmountCents: 0, currency, taxRateBasisPoints, forfeited: false, hasEverPaid: false, interval };
  const summary = ledgerSummary(pricing, services, null);
  const offer = ledgerOffer(summary, { provider: "razorpay", hadService: NEVER_HAD }, currency, interval);
  return { dueCents: offer?.firstPaymentCents ?? summary.totalCents, rows: ledgerRows(summary, currency, null, offer), taxRateBasisPoints };
}

describe("the one-screen checkout's basket", () => {
  describe.each<[MoneyCurrency, BillingInterval]>([
    ["INR", "month"],
    ["INR", "year"],
    ["USD", "month"],
    ["USD", "year"],
  ])("in %s paid by the %s", (currency, interval) => {
    const table = buildSignupBasketTable(currency, "razorpay");

    it.each(BASKETS)("adds up to what checkout charges for %s", (...services) => {
      const view = basketView(table, services, interval);
      const checkout = checkoutFigures(view.services, currency, interval);
      expect(view.dueCents).toBe(checkout.dueCents);
      expect(view.rows.map((row) => [row.label, row.amount, row.tone])).toEqual(checkout.rows.map((row) => [row.label, row.amount, row.tone]));
      expect(view.gstLine).toBe(checkout.taxRateBasisPoints === 0 ? null : `Includes ${formatMoney(gstInsideCents(checkout.dueCents, checkout.taxRateBasisPoints), currency)} of GST at 18%`);
    });
  });

  it("sells the plans on sale and monitoring, never Paid Ads", () => {
    expect(SIGNUP_BASKET_IDS).toEqual(["managed-website", "social-media", "expert-monitoring"]);
    expect(buildSignupBasketTable("INR", "razorpay").services.map((service) => service.id)).toEqual(SIGNUP_BASKET_IDS);
  });

  it("gives the first month of Social Media for 1 and nothing else, in both currencies, as plan 63 says", () => {
    for (const [currency, monthly, yearly] of [["INR", 299_900, 3_238_900], ["USD", 5_900, 63_700]] as const) {
      const [website, social, monitoring] = buildSignupBasketTable(currency, "razorpay").services;
      expect(social).toMatchObject({ onOffer: true, firstMonthCents: 100, monthlyCents: monthly, yearlyCents: yearly });
      expect(website).toMatchObject({ onOffer: false, firstMonthCents: monthly });
      expect(monitoring).toMatchObject({ onOffer: false, monthlyCents: currency === "INR" ? 600_000 : 9_900 });
    }
  });

  it("gives no first-month offer for a payment by hand", () => {
    const table = buildSignupBasketTable("INR", "manual");
    expect(table.services.every((service) => !service.onOffer)).toBe(true);
    expect(basketView(table, ["social-media"], "month").dueCents).toBe(299_900);
  });

  it("shows the second line under the first-month row, from the ongoing price", () => {
    const view = basketView(buildSignupBasketTable("INR", "razorpay"), ["managed-website", "social-media"], "month");
    expect(view.rows).toContainEqual({ key: "social-media", label: "Social Media Management, first month", note: "₹2,999 a month from next month", amount: "₹1", tone: "plain" });
    expect(view.due).toBe("₹3,000");
    expect(view.gstLine).toBe("Includes ₹457.62 of GST at 18%");
    expect(view.renewal).toBe("Your first payment covers your first month, then ₹5,998 (GST included) is taken each month for your services.");
  });

  it("words a yearly payment with its saving and no first-month row", () => {
    const view = basketView(buildSignupBasketTable("INR", "razorpay"), ["managed-website", "social-media"], "year");
    expect(view.rows.map((row) => row.label)).toEqual(["Website", "Maintenance, 12 months", "Social Media Management, 12 months", "Paid yearly, 10% off"]);
    expect(view.due).toBe("₹64,778");
    expect(view.renewal).toBe("Your payment covers 12 months. Then ₹64,778 (GST included) is taken each year for your services.");
  });

  it("names dollars with no GST for a visitor outside India", () => {
    const view = basketView(buildSignupBasketTable("USD", "razorpay"), ["managed-website", "social-media"], "month");
    expect(view.due).toBe("$60");
    expect(view.gstLine).toBeNull();
    expect(view.renewal).toBe("Your first payment covers your first month, then $118 is taken each month for your services.");
  });

  it("buys nothing from an empty basket", () => {
    const view = basketView(buildSignupBasketTable("INR", "razorpay"), [], "month");
    expect(view).toMatchObject({ services: [], rows: [], dueCents: 0, gstLine: null, renewal: null });
    expect(payLabel(view)).toBe("Pay");
  });

  it("never buys monitoring alone, nor a service that is not on sale", () => {
    const table = buildSignupBasketTable("INR", "razorpay");
    expect(purchasableServices(table, ["expert-monitoring"])).toEqual([]);
    expect(purchasableServices(table, ["paid-ads", "social-media", "nonsense"])).toEqual(["social-media"]);
    expect(canTick("expert-monitoring", [])).toBe(false);
    expect(canTick("expert-monitoring", ["social-media"])).toBe(true);
    expect(canTick("managed-website", [])).toBe(true);
  });

  it("labels Pay with the amount due", () => {
    const view = basketView(buildSignupBasketTable("INR", "razorpay"), ["managed-website"], "month");
    expect(payLabel(view)).toBe("Pay ₹2,999");
  });

  it("badges the website free and the offer month while paying monthly only", () => {
    const table = buildSignupBasketTable("INR", "razorpay");
    const [website, social, monitoring] = table.services;
    expect(cardBadge(website!, table, "month")).toBe("Website free");
    expect(cardBadge(social!, table, "month")).toBe("First month ₹1");
    expect(cardBadge(social!, table, "year")).toBeNull();
    expect(cardBadge(monitoring!, table, "month")).toBeNull();
  });
});
