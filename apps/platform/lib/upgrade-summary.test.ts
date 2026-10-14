import { describe, expect, it } from "vitest";
import type { UpgradeQuote } from "@fynix/shared/lib/billing/upgrade";
import { planPaymentSummary, upgradePaymentSummary } from "./upgrade-summary";

const INR_PLAN = { initialAmountCents: 299_900, currency: "INR", taxRateBasisPoints: 1800 } as const;

describe("planPaymentSummary", () => {
  it("shows the price, the GST on it and the total taken today", () => {
    expect(planPaymentSummary(INR_PLAN)).toEqual({
      price: "₹2,999",
      discount: null,
      tax: { label: "GST 18%", amount: "₹539.82" },
      total: "₹3,538.82",
    });
  });

  it("takes a code's discount off before the GST is worked out", () => {
    // ₹2,999 less ₹500 is ₹2,499; GST on that is ₹449.82, so ₹2,948.82 is taken.
    expect(planPaymentSummary(INR_PLAN, 50_000)).toEqual({
      price: "₹2,999",
      discount: "₹500",
      tax: { label: "GST 18%", amount: "₹449.82" },
      total: "₹2,948.82",
    });
  });

  it("leaves the tax line out for a plan with no tax", () => {
    expect(planPaymentSummary({ initialAmountCents: 6_900, currency: "USD", taxRateBasisPoints: 0 })).toEqual({
      price: "$69",
      discount: null,
      tax: null,
      total: "$69",
    });
  });
});

describe("upgradePaymentSummary", () => {
  const quote: UpgradeQuote = {
    kind: "quote",
    netDifferenceCents: 466_667,
    chargeCents: 550_667,
    free: false,
    nextRenewalCents: 1_179_882,
    periodEnd: new Date("2026-11-01T00:00:00Z"),
    daysLeft: 20,
    periodDays: 30,
  };

  it("shows the difference for the days left, its GST and the total taken today", () => {
    expect(upgradePaymentSummary(quote, { currency: "INR", taxRateBasisPoints: 1800 })).toEqual({
      price: "₹4,666.67",
      discount: null,
      tax: { label: "GST 18%", amount: "₹840" },
      total: "₹5,506.67",
    });
  });

  it("says nothing is taken today when the move is too small to charge", () => {
    expect(upgradePaymentSummary({ ...quote, netDifferenceCents: 40, chargeCents: 0, free: true }, { currency: "INR", taxRateBasisPoints: 1800 })).toEqual({
      price: "₹0.40",
      discount: null,
      tax: null,
      total: "Nothing",
    });
  });
});
