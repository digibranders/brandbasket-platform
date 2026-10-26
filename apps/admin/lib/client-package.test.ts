import type { BundledAddOn, Subscription } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { clientPackageFacts } from "./client-package";

const SUBSCRIPTION = {
  id: "sub-1",
  status: "active",
  activatedAt: new Date("2026-10-21T10:00:00.000Z"),
  cancelRequestedAt: null,
  adCreditCents: 150_000,
} as Subscription;

const line = (addOn: string, overrides: Partial<BundledAddOn> = {}): BundledAddOn =>
  ({ subscriptionId: "sub-1", addOn, status: "active", endRequestedAt: null, ...overrides }) as BundledAddOn;

const WEBSITE_AND_SOCIAL = [line("managed-website"), line("digital-growth")];

describe("clientPackageFacts", () => {
  it("names the services and the percentage off each, the credit a month, and no forfeit date", () => {
    expect(clientPackageFacts({ lines: WEBSITE_AND_SOCIAL, subscription: SUBSCRIPTION, currency: "INR", forfeitedAt: null })).toEqual({
      package: "Website + Social, 10% off each service",
      adCredit: "₹1,500 a month",
      forfeitedOn: null,
    });
  });

  it("is no package for a single service", () => {
    expect(clientPackageFacts({ lines: [line("local-seo-aeo")], subscription: { ...SUBSCRIPTION, adCreditCents: 0 }, currency: "INR", forfeitedAt: null })).toEqual({
      package: "No package",
      adCredit: "None",
      forfeitedOn: null,
    });
  });

  it("is no package once the offer was given up, and says the day in India time", () => {
    expect(
      clientPackageFacts({
        lines: WEBSITE_AND_SOCIAL,
        subscription: { ...SUBSCRIPTION, adCreditCents: 0 },
        currency: "INR",
        forfeitedAt: new Date("2026-11-05T20:00:00.000Z"),
      }),
    ).toEqual({ package: "No package", adCredit: "None", forfeitedOn: "6 November 2026" });
  });

  it("counts only the services that stay: not one asked to end, removed, still waiting, or on another subscription", () => {
    const lines = [
      line("managed-website"),
      line("digital-growth", { endRequestedAt: new Date("2026-11-01T00:00:00.000Z") }),
      line("local-seo-aeo", { status: "removed" }),
      line("local-seo-aeo", { status: "pending" }),
      line("local-seo-aeo", { subscriptionId: "sub-0" }),
    ];
    expect(clientPackageFacts({ lines, subscription: SUBSCRIPTION, currency: "INR", forfeitedAt: null }).package).toBe("No package");
  });

  it("shows credit only while the subscription is live and paid", () => {
    const facts = (subscription: Partial<Subscription>) =>
      clientPackageFacts({ lines: WEBSITE_AND_SOCIAL, subscription: { ...SUBSCRIPTION, ...subscription }, currency: "INR", forfeitedAt: null }).adCredit;
    expect(facts({ status: "cancelled", activatedAt: null })).toBe("None");
    expect(facts({ activatedAt: null })).toBe("None");
    // A client who asked to close keeps the credit to the end of the month they paid for; the provider's cancel then ends it.
    expect(facts({ cancelRequestedAt: new Date("2026-11-01T00:00:00.000Z") })).toBe("₹1,500 a month");
    expect(facts({ cancelRequestedAt: new Date("2026-11-01T00:00:00.000Z"), status: "cancelled" })).toBe("None");
    expect(facts({ status: "inactive" })).toBe("None");
    expect(facts({ status: "past_due" })).toBe("₹1,500 a month");
  });

  it("is no package and no credit for a business with no subscription", () => {
    expect(clientPackageFacts({ lines: [], subscription: null, currency: "USD", forfeitedAt: null })).toEqual({ package: "No package", adCredit: "None", forfeitedOn: null });
  });

  it("writes a dollar credit in dollars", () => {
    expect(clientPackageFacts({ lines: WEBSITE_AND_SOCIAL, subscription: { ...SUBSCRIPTION, adCreditCents: 2_500 }, currency: "USD", forfeitedAt: null }).adCredit).toBe("$25 a month");
  });
});
