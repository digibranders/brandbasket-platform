import { describe, expect, it } from "vitest";
import { buildFeeFacts, dealFacts, websiteKindLabel } from "./client-build-fee";

const columns = { websiteKind: "ecommerce", setupFeeListCents: 6_500_000, setupFeeDiscountCents: 1_500_000, setupFeeNote: "Agreed on call", paymentLinkId: "link-1" };

describe("websiteKindLabel", () => {
  it("names the kind, and reads a project from before kinds as B2B", () => {
    expect(websiteKindLabel("ecommerce")).toBe("Ecommerce store");
    expect(websiteKindLabel("b2b")).toBe("B2B website");
    expect(websiteKindLabel(null)).toBe("B2B website");
    expect(websiteKindLabel("shop")).toBe("B2B website");
  });
});

describe("buildFeeFacts", () => {
  it("shows the fee, the discount, the note and the link it came from", () => {
    expect(buildFeeFacts(columns, "INR")).toEqual([
      { label: "Website", value: "Ecommerce store" },
      { label: "Build fee", value: "₹65,000" },
      { label: "Discount", value: "₹15,000" },
      { label: "Paid for the build", value: "₹50,000" },
      { label: "Note", value: "Agreed on call" },
      { label: "Came from", value: "A staff payment link" },
    ]);
  });
  it("says a waived fee was waived, and a public checkout is not a link", () => {
    const facts = buildFeeFacts({ ...columns, websiteKind: "b2b", setupFeeListCents: 3_500_000, setupFeeDiscountCents: 3_500_000, setupFeeNote: null, paymentLinkId: null }, "INR");
    expect(facts).toContainEqual({ label: "Discount", value: "₹35,000 (fee waived)" });
    expect(facts).toContainEqual({ label: "Paid for the build", value: "₹0" });
    expect(facts).toContainEqual({ label: "Came from", value: "The public checkout" });
    expect(facts?.some((fact) => fact.label === "Note")).toBe(false);
  });
  it("says what a paid deal has paid so far: the advance while the balance is unpaid, then both", () => {
    const deal = { ...columns, websiteKind: "b2b", setupFeeListCents: 3_500_000, setupFeeDiscountCents: 500_000, setupFeeAdvanceCents: 1_000_000 };
    expect(buildFeeFacts({ ...deal, activatedAt: null }, "INR")).toContainEqual({ label: "Paid so far", value: "₹10,000 (the advance)" });
    expect(buildFeeFacts({ ...deal, activatedAt: new Date("2026-12-01T00:00:00Z") }, "INR")).toContainEqual({ label: "Paid so far", value: "₹30,000 (advance ₹10,000, balance ₹20,000)" });
    expect(buildFeeFacts({ ...deal, activatedAt: null }, "INR")?.some((fact) => fact.label === "Paid for the build")).toBe(false);
  });
  it("is absent when no fee was owed", () => {
    expect(buildFeeFacts(null, "INR")).toBeNull();
    expect(buildFeeFacts({ ...columns, setupFeeListCents: null, setupFeeDiscountCents: null, setupFeeNote: null }, "INR")).toBeNull();
  });
  it("prices in dollars", () => {
    expect(buildFeeFacts({ ...columns, websiteKind: "b2b", setupFeeListCents: 120_000, setupFeeDiscountCents: 0, setupFeeNote: null }, "USD")?.[1]).toEqual({ label: "Build fee", value: "$1,200" });
  });
});

describe("dealFacts (plan 66)", () => {
  const deal = { linkId: "l", state: "building", currency: "INR", advanceCents: 2_000_000, advancePaidAt: new Date("2026-11-17T09:00:00.000Z"), balanceCents: 4_000_000 } as const;

  it("shows where the deal stands, the advance taken with its date and the balance left", () => {
    expect(dealFacts(deal)).toEqual([
      { label: "Stage", value: "Advance paid, website being built" },
      { label: "Advance paid", value: "₹20,000 on 17 Nov" },
      { label: "Balance at go-live", value: "₹40,000" },
    ]);
    expect(dealFacts({ ...deal, state: "balance_due" })?.[0]).toEqual({ label: "Stage", value: "Balance due, website ready" });
  });

  it("shows nothing without a deal", () => {
    expect(dealFacts(null)).toBeNull();
    expect(dealFacts(undefined)).toBeNull();
  });
});
