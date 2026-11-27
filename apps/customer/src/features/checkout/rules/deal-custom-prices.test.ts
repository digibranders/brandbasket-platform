import { describe, expect, it } from "vitest";
import { ledgerOffer, ledgerRows, ledgerSummary } from "./ledger";
import { basketView, buildSignupBasketTable, withCustomPrices } from "./signup-basket";

/* A free staff link with custom prices (plan 66): the pay screen shows the link's prices and what is charged. */

const PRICING = { planInitialAmountCents: 0, currency: "INR", taxRateBasisPoints: 1_800, forfeited: false, hasEverPaid: false, interval: "month", kind: "b2b" } as const;
const FIRST_MONTH = { provider: "razorpay", hadService: { "social-media": false, "paid-ads": false, "managed-website": false } } as const;

describe("the ledger of a free link with custom prices", () => {
  const customPrices = { "managed-website": 199_900 };
  const summary = ledgerSummary({ ...PRICING, customPrices }, ["managed-website", "social-media"], null);

  it("prices the website at the custom price with no offer taken off", () => {
    expect(summary.lines.map((line) => [line.addOn, line.listCents, line.offerCents, line.netCents])).toEqual([
      ["managed-website", 199_900, 0, 199_900],
      ["social-media", 299_900, 0, 299_900],
    ]);
    expect(summary.totalCents).toBe(199_900 + 299_900);
  });

  it("charges the custom price and Social's first month: 1,999 + 1 = 2,000", () => {
    const offer = ledgerOffer(summary, FIRST_MONTH, "INR", "month");
    expect(offer?.firstPaymentCents).toBe(200_000);
    const rows = ledgerRows(summary, "INR", null, offer, null, customPrices);
    expect(rows.map((row) => [row.key, row.amount])).toEqual([
      ["website", "Free"],
      ["maintenance", "₹1,999"],
      ["social-media", "₹1"],
    ]);
  });

  it("shows a custom yearly price as itself, with no annual saving line", () => {
    const yearly = ledgerSummary({ ...PRICING, interval: "year", customPrices: { "managed-website": 3_000_000 } }, ["managed-website"], null);
    expect(yearly.totalCents).toBe(3_000_000);
    expect(yearly.annual?.savingCents).toBe(0);
    const rows = ledgerRows(yearly, "INR", null, null, null, { "managed-website": 3_000_000 });
    expect(rows.map((row) => row.key)).toEqual(["website", "maintenance"]);
    expect(rows[1]?.amount).toBe("₹30,000");
  });

  it("leaves a basket without custom prices exactly as it was", () => {
    const plain = ledgerSummary(PRICING, ["managed-website", "social-media"], null);
    expect(plain.totalCents).toBe(2 * 299_900);
  });
});

describe("the one-screen basket of a free link with custom prices", () => {
  const table = buildSignupBasketTable("INR", "razorpay");

  it("owes no build and charges the custom website price with Social on its first-month offer", () => {
    const locked = { ...withCustomPrices(table, { "managed-website": 199_900 }, "month"), website: { ...withCustomPrices(table, { "managed-website": 199_900 }, "month").website, feeOwed: false } };
    const view = basketView(locked, ["managed-website", "social-media"], "month", { kind: "b2b", deal: { discountCents: 0, note: null } });
    expect(view.dueCents).toBe(200_000);
    expect(view.rows.map((row) => row.key)).toEqual(["website", "maintenance", "social-media"]);
    expect(view.rows[1]?.amount).toBe("₹1,999");
  });

  it("puts a custom price on a service that is not on the offer in the first month too", () => {
    const priced = withCustomPrices(table, { "expert-monitoring": 400_000 }, "month");
    const monitoring = priced.services.find((service) => service.id === "expert-monitoring");
    expect(monitoring).toMatchObject({ monthlyCents: 400_000, firstMonthCents: 400_000 });
  });

  it("keeps the trial price of an offer service and charges its custom price from month two", () => {
    const priced = withCustomPrices(table, { "social-media": 99_900 }, "month");
    expect(priced.services.find((service) => service.id === "social-media")).toMatchObject({ monthlyCents: 99_900, firstMonthCents: 100, onOffer: true });
  });

  it("takes a custom yearly price as the year's price, with no annual saving row", () => {
    const priced = withCustomPrices(table, { "managed-website": 3_000_000 }, "year");
    const view = basketView({ ...priced, website: { ...priced.website, feeOwed: false } }, ["managed-website"], "year", { kind: "b2b", deal: { discountCents: 0, note: null } });
    expect(view.dueCents).toBe(3_000_000);
    expect(view.rows.map((row) => row.key)).not.toContain("annual");
  });

  it("charges a paid link's finalised build price, not the catalogue's", () => {
    const view = basketView(table, ["managed-website"], "month", { kind: "b2b", deal: { listCents: 4_000_000, discountCents: 500_000, note: null } });
    expect(view.dueCents).toBe(3_500_000);
  });
});
