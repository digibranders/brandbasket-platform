import type { PaymentLink } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { paymentLinkServices, toPaymentLinkRow } from "./payment-link-rows";

const NOW = new Date("2026-11-27T10:00:00.000Z");
const LINK = {
  id: "link-1",
  businessName: "Rao Dental",
  contactName: "Asha Rao",
  email: "asha@example.com",
  currency: "INR",
  services: ["managed-website", "social-media"],
  billingInterval: "month",
  websiteKind: "ecommerce",
  setupFeeDiscountCents: 1_500_000,
  expiresAt: new Date("2026-12-04T10:00:00.000Z"),
  createdAt: NOW,
  createdByStaffId: "s1",
  paidAt: null,
  revokedAt: null,
} as unknown as PaymentLink;
const context = { now: NOW, provider: "razorpay", coupon: null, createdBy: "Gaurav" } as const;

describe("toPaymentLinkRow", () => {
  it("names the customer, the services with the kind, and what is paid today", () => {
    expect(toPaymentLinkRow(LINK, context)).toMatchObject({
      customer: "Rao Dental",
      services: "Website Management (Ecommerce store), Social Media Management",
      payToday: "₹50,001",
      state: "open",
      createdBy: "Gaurav",
      canChange: true,
    });
  });
  it("falls back to the contact or the email when there is no business name", () => {
    expect(toPaymentLinkRow({ ...LINK, businessName: null }, context).customer).toBe("Asha Rao");
    expect(toPaymentLinkRow({ ...LINK, businessName: null, contactName: null }, context).customer).toBe("asha@example.com");
    expect(toPaymentLinkRow({ ...LINK, businessName: null, contactName: null, email: null }, context).customer).toBe("Details not filled in");
  });
  it("offers cancel and extend only while the link is open or expired", () => {
    expect(toPaymentLinkRow({ ...LINK, expiresAt: new Date("2026-11-20T00:00:00Z") }, context)).toMatchObject({ state: "expired", canChange: true });
    expect(toPaymentLinkRow({ ...LINK, revokedAt: NOW }, context)).toMatchObject({ state: "revoked", canChange: false });
    expect(toPaymentLinkRow({ ...LINK, paidAt: NOW }, context)).toMatchObject({ state: "paid", canChange: false });
  });
  it("prices a dollar yearly link with no website", () => {
    const row = toPaymentLinkRow({ ...LINK, currency: "USD", services: ["social-media"], websiteKind: null, billingInterval: "year", setupFeeDiscountCents: null }, context);
    expect(row.payToday).toBe("$637");
  });
});

describe("paymentLinkServices", () => {
  it("puts the kind on the website only", () => {
    expect(paymentLinkServices(["social-media", "managed-website"], "b2b")).toBe("Social Media Management, Website Management (B2B website)");
    expect(paymentLinkServices(["social-media"], null)).toBe("Social Media Management");
  });
});
