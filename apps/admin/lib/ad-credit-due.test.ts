import type { AdCreditDue } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { adCreditDueRows } from "./ad-credit-due";

const base: AdCreditDue = {
  subscriptionId: "sub-1",
  businessId: "biz-1",
  businessName: "Asha Cafe",
  currency: "INR",
  adCreditCents: 200_000,
  paidThroughAt: new Date("2026-11-21T10:00:00.000Z"),
  services: ["managed-website", "digital-growth"],
};

describe("adCreditDueRows", () => {
  it("shows the business, its services, the credit a month and the date it is paid through in India time", () => {
    expect(adCreditDueRows([base])).toEqual([
      { id: "sub-1", businessId: "biz-1", businessName: "Asha Cafe", package: "Website + Social", amount: "₹2,000 a month", paidThrough: "Paid through 21 November 2026" },
    ]);
  });

  it("writes a dollar subscription's credit in dollars", () => {
    expect(adCreditDueRows([{ ...base, currency: "USD", adCreditCents: 6_000, services: ["managed-website", "digital-growth", "local-seo-aeo"] }])[0]).toMatchObject({
      package: "Website + Social + SEO",
      amount: "$60 a month",
    });
  });

  it("says so when no paid-through date is known", () => {
    expect(adCreditDueRows([{ ...base, paidThroughAt: null }])[0]?.paidThrough).toBe("No paid-through date");
  });
});
