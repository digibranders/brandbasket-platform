import { describe, expect, it } from "vitest";
import { buildFeeFacts, websiteKindLabel } from "./client-build-fee";

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
  it("is absent when no fee was owed", () => {
    expect(buildFeeFacts(null, "INR")).toBeNull();
    expect(buildFeeFacts({ ...columns, setupFeeListCents: null, setupFeeDiscountCents: null, setupFeeNote: null }, "INR")).toBeNull();
  });
  it("prices in dollars", () => {
    expect(buildFeeFacts({ ...columns, websiteKind: "b2b", setupFeeListCents: 120_000, setupFeeDiscountCents: 0, setupFeeNote: null }, "USD")?.[1]).toEqual({ label: "Build fee", value: "$1,200" });
  });
});
