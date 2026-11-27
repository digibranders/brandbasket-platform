import { gstInsideCents } from "@brandbasket/billing/tax";
import type { BillingInterval } from "@brandbasket/db";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { setupFeeFor } from "@brandbasket/shared/lib/billing/setup-fee";
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
  // A first purchase of the website owes the build fee at its list price (plan 65): the page and the checkout must quote it the same.
  const deal = services.includes("managed-website") ? { kind: "b2b" as const, fee: setupFeeFor("b2b", currency, 0), note: null } : null;
  const offer = ledgerOffer(summary, { provider: "razorpay", hadService: NEVER_HAD }, currency, interval, deal);
  return { dueCents: offer?.firstPaymentCents ?? summary.totalCents, rows: ledgerRows(summary, currency, null, offer, deal), taxRateBasisPoints };
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
    // The build fee and ₹1 for Social's first month; the website's own month starts with the first monthly charge (plan 65).
    expect(view.due).toBe("₹35,001");
    expect(view.gstLine).toBe("Includes ₹5,339.14 of GST at 18%");
    expect(view.renewal).toBe("Your payment covers the build. From one month after you pay, ₹5,998 (GST included) is taken each month for your services.");
  });

  it("words a yearly payment with its saving and no first-month row", () => {
    const view = basketView(buildSignupBasketTable("INR", "razorpay"), ["managed-website", "social-media"], "year");
    expect(view.rows.map((row) => row.label)).toEqual(["B2B website build", "Maintenance, 12 months", "Social Media Management, 12 months", "Paid yearly, 10% off"]);
    expect(view.due).toBe("₹99,778");
    expect(view.renewal).toBe("Your payment covers the build and 12 months of your services. They renew each year, starting 13 months after you pay, at ₹64,778 (GST included).");
  });

  it("names dollars with no GST for a visitor outside India", () => {
    const view = basketView(buildSignupBasketTable("USD", "razorpay"), ["managed-website", "social-media"], "month");
    // The $1,200 build fee and $1 for Social's first month.
    expect(view.due).toBe("$1,201");
    expect(view.gstLine).toBeNull();
    expect(view.renewal).toBe("Your payment covers the build. From one month after you pay, $118 is taken each month for your services.");
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
    expect(payLabel(view)).toBe("Pay ₹35,000");
  });

  it("labels Pay with the maintenance price when no build fee is owed", () => {
    const view = basketView(buildSignupBasketTable("INR", "razorpay", { "managed-website": true }), ["managed-website"], "month");
    expect(payLabel(view)).toBe("Pay ₹2,999");
    expect(view.rows.map((row) => row.label)).toEqual(["Website", "Maintenance"]);
  });

  it("prices an ecommerce store at its fee and its monthly price, and takes a link's discount off the fee", () => {
    const table = buildSignupBasketTable("INR", "razorpay");
    const view = basketView(table, ["managed-website"], "month", { kind: "ecommerce", deal: { discountCents: 1_500_000, note: "As agreed on call" } });
    expect(view.dueCents).toBe(5_000_000);
    expect(view.rows.map((row) => [row.label, row.amount])).toEqual([
      ["Ecommerce store build", "₹65,000"],
      ["As agreed on call", "-₹15,000"],
      ["Maintenance", "Not charged today"],
    ]);
    expect(view.rows.at(-1)?.note).toBe("₹3,999 a month, from one month after you pay");
  });

  it("charges the website's first month today once its build fee is waived in full", () => {
    const view = basketView(buildSignupBasketTable("INR", "razorpay"), ["managed-website"], "month", { deal: { discountCents: 3_500_000, note: null } });
    expect(view.dueCents).toBe(299_900);
  });

  it("badges the build fee and the offer month while paying monthly only", () => {
    const table = buildSignupBasketTable("INR", "razorpay");
    const [website, social, monitoring] = table.services;
    expect(cardBadge(website!, table, "month")).toBe("One-time build fee");
    expect(cardBadge(website!, buildSignupBasketTable("INR", "razorpay", { "managed-website": true }), "month")).toBeNull();
    expect(cardBadge(social!, table, "month")).toBe("First month ₹1");
    expect(cardBadge(social!, table, "year")).toBeNull();
    expect(cardBadge(monitoring!, table, "month")).toBeNull();
  });
});

describe("basketView for a paid deal (plan 66)", () => {
  const table = buildSignupBasketTable("INR", "razorpay", NEVER_HAD);
  const deal = { listCents: 6_500_000, discountCents: 500_000, note: "As agreed on call", advanceCents: 2_000_000 };

  it("shows the agreed build price, the discount, the balance and the advance as the one amount to pay", () => {
    const view = basketView(table, ["managed-website", "social-media"], "month", { kind: "ecommerce", deal });
    expect(view.rows.map((row) => [row.label, row.amount])).toEqual([
      ["Ecommerce store build", "₹65,000"],
      ["As agreed on call", "-₹5,000"],
      ["Balance at go-live", "₹40,000"],
    ]);
    expect(view).toMatchObject({ dueCents: 2_000_000, due: "₹20,000", dueLabel: "Advance to pay now" });
    expect(payLabel(view)).toBe("Pay ₹20,000");
    expect(view.gstLine).toBe("Includes ₹3,050.84 of GST at 18%");
  });

  it("says in two plain sentences that the advance is not refunded and what comes with the balance", () => {
    const view = basketView(table, ["managed-website"], "year", { kind: "ecommerce", deal });
    expect(view.advanceNote).toBe("The advance is non-refundable.");
    expect(view.renewal).toBe("Maintenance and your other services are charged with the balance when your website is ready.");
  });

  it("leaves out the discount line when there is none, and shows no balance owed when the advance is the whole price", () => {
    const view = basketView(table, ["managed-website"], "month", { deal: { listCents: 3_500_000, discountCents: 0, note: null, advanceCents: 3_500_000 } });
    expect(view.rows.map((row) => [row.label, row.amount])).toEqual([
      ["B2B website build", "₹35,000"],
      ["Balance at go-live", "₹0"],
    ]);
  });

  it("changes nothing for a free link or a self sign-up", () => {
    for (const options of [{}, { deal: { discountCents: 0, note: null } }]) {
      const view = basketView(table, ["managed-website"], "month", options);
      expect(view).toMatchObject({ dueLabel: "Due today", advanceNote: null });
    }
  });
});

describe("basketView for a paid deal's balance (plan 66)", () => {
  const table = buildSignupBasketTable("INR", "razorpay", NEVER_HAD);
  const balance = { cents: 500_000, codeLabel: null, codeCents: 0, nextCharge: "Sun 27 Dec" };
  const deal = { listCents: 1_000_000, discountCents: 0, note: null, advanceCents: 500_000, balance };

  it("adds the balance to the website's first month: 5,000 and 2,999 make 7,999", () => {
    const view = basketView(table, ["managed-website"], "month", { deal });
    expect(view.rows.map((row) => [row.label, row.amount])).toEqual([
      ["Balance for your website build", "₹5,000"],
      ["Maintenance", "₹2,999"],
    ]);
    expect(view).toMatchObject({ dueCents: 799_900, dueLabel: "Total to pay now", advanceNote: null, renewal: "Your monthly plan starts today. Next charge on Sun 27 Dec." });
  });

  it("takes Social Media at its first-month price of 1: 8,000 in all", () => {
    const view = basketView(table, ["managed-website", "social-media"], "month", { deal });
    expect(view.dueCents).toBe(800_000);
    expect(view.rows.at(-1)).toMatchObject({ label: "Social Media Management, first month", amount: "₹1" });
  });

  it("takes the year's price paid yearly, and says the plan is yearly", () => {
    const view = basketView(table, ["managed-website", "social-media"], "year", { deal });
    expect(view.dueCents).toBe(500_000 + table.website.kinds.b2b.yearlyCents + table.services[1]!.yearlyCents);
    expect(view.renewal).toBe("Your yearly plan starts today. Next charge on Sun 27 Dec.");
  });

  it("shows no balance row when the advance paid the whole build, and takes a code off the total", () => {
    const none = basketView(table, ["managed-website"], "month", { deal: { ...deal, balance: { ...balance, cents: 0 } } });
    expect(none.rows.map((row) => row.key)).toEqual(["maintenance"]);
    expect(none.dueCents).toBe(299_900);
    const coded = basketView(table, ["managed-website"], "month", { deal: { ...deal, balance: { ...balance, codeLabel: "Code WELCOME", codeCents: 10_000 } } });
    expect(coded.rows.at(-1)).toMatchObject({ label: "Code WELCOME", amount: "-₹100", tone: "save" });
    expect(coded.dueCents).toBe(789_900);
  });
});
