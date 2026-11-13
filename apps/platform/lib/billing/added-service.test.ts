import { describe, expect, it } from "vitest";
import { ADDED_SERVICE_PAY_PATH, combinedSummary, planChangesFirst, quoteSummary, servicesGlance } from "./added-service";

const PAID_THROUGH = new Date("2026-11-12T09:00:00.000Z");
const NEW_DATE = new Date("2026-11-22T09:00:00.000Z");
const COMBINED = { upfrontCents: 96_842, serviceCents: 100, extensionCents: 96_742, paidThroughAt: PAID_THROUGH, newBillingDate: NEW_DATE, monthlyCents: 599_800, offer: true };

describe("combinedSummary", () => {
  it("lists the service on the offer, the plan's extra days, what is due today and what follows", () => {
    expect(combinedSummary(COMBINED, "Social Media Management", "INR")).toEqual({
      title: "Add Social Media Management",
      rows: [
        { key: "service", label: "Social Media Management, first month", amount: "₹1", tone: "plain" },
        { key: "plan", label: "Your plan, 12 November 2026 to 22 November 2026", amount: "₹967.42", tone: "plain" },
      ],
      totalLabel: "Due today",
      total: "₹968.42",
      notes: ["From 22 November 2026, you pay ₹5,998 a month for all your services.", "All prices include GST."],
    });
  });

  it("names the date the service runs to when it is not on the offer", () => {
    const summary = combinedSummary({ ...COMBINED, offer: false, serviceCents: 250_000 }, "Paid Ads Management", "INR");
    expect(summary.rows[0]).toMatchObject({ label: "Paid Ads Management, until 22 November 2026", amount: "₹2,500" });
  });

  it("leaves out the plan line when the date does not move, and says nothing of GST in dollars", () => {
    const summary = combinedSummary({ ...COMBINED, extensionCents: 0, upfrontCents: 100 }, "Paid Ads Management", "USD");
    expect(summary.rows.map((row) => row.key)).toEqual(["service"]);
    expect(summary.notes).toEqual(["From 22 November 2026, you pay $5,998 a month for all your services."]);
  });
});

describe("quoteSummary", () => {
  it("shows the days left this month, what is due and the payment that follows", () => {
    expect(quoteSummary({ chargeCents: 373_032, daysLeft: 14, nextRenewalCents: 1_179_882, renewsOn: PAID_THROUGH }, "Paid Ads Management", "INR")).toEqual({
      title: "Add Paid Ads Management",
      rows: [{ key: "rest", label: "Paid Ads Management, 14 days left this month", amount: "₹3,730.32", tone: "plain" }],
      totalLabel: "Due today",
      total: "₹3,730.32",
      notes: ["Then ₹11,798.82 a month from 12 November 2026.", "All prices include GST."],
    });
  });

  it("says one day in the singular", () => {
    expect(quoteSummary({ chargeCents: 100, daysLeft: 1, nextRenewalCents: 200, renewsOn: PAID_THROUGH }, "X", "INR").rows[0]?.label).toBe("X, 1 day left this month");
  });
});

describe("planChangesFirst and the pay path", () => {
  it("says when the plan changes", () => {
    expect(planChangesFirst(PAID_THROUGH)).toBe("Your plan changes on 12 November 2026. You can add a new service after that.");
  });
  it("points at the Razorpay approval page", () => {
    expect(ADDED_SERVICE_PAY_PATH).toBe("/billing/services/pay");
  });
});

describe("servicesGlance", () => {
  const subscription = {
    provider: "razorpay",
    cancelRequestedAt: null,
    commitmentEndsAt: null,
    paidThroughAt: PAID_THROUGH,
    bundledAddOnNetCents: 300_000,
    pendingBundledAddOnNetCents: null,
    discountAmountCents: 0,
    nextDiscountAmountCents: null,
  } as const;
  const plan = { recurringAmountCents: 100_000, currency: "INR" } as const;
  const entries = [
    { kind: "included", addOn: "managed-website" },
    { kind: "available", addOn: "social-media" },
    { kind: "included", addOn: "expert-monitoring" },
  ] as const;
  const now = new Date("2026-11-01T00:00:00.000Z");

  it("gives the next payment with its date and counts only the three plans held", () => {
    expect(servicesGlance({ subscription, plan, entries, now })).toEqual({ next: { amount: "₹4,000", on: "12 November 2026" }, plansHeld: 1, plansTotal: 3 });
  });

  it("prices the next payment on the basket waiting for the renewal", () => {
    const glance = servicesGlance({ subscription: { ...subscription, pendingBundledAddOnNetCents: 500_000 }, plan, entries, now });
    expect(glance?.next?.amount).toBe("₹6,000");
  });

  it("gives no next payment once the account is closing or when the team arranges it", () => {
    expect(servicesGlance({ subscription: { ...subscription, cancelRequestedAt: now }, plan, entries, now })?.next).toBeNull();
    expect(servicesGlance({ subscription: { ...subscription, provider: "manual" }, plan, entries, now })?.next).toBeNull();
  });

  it("is absent without a subscription", () => {
    expect(servicesGlance({ subscription: null, plan, entries, now })).toBeNull();
    expect(servicesGlance({ subscription, plan: null, entries, now })).toBeNull();
  });
});
