import { describe, expect, it } from "vitest";
import type { DirectoryClaim } from "@firstfold/db";
import { verificationEligibility, verificationRefusalMessage } from "./owner-verification";

function claim(overrides: Partial<DirectoryClaim> = {}): DirectoryClaim {
  return {
    id: "c1",
    businessId: "b1",
    listingKey: "dentists/thane/naupada/smile-dental",
    placeId: "k7m2q9a",
    businessName: "Smile Dental",
    phone: "+919876543210",
    origin: "claimed",
    streetAddress: null,
    pincode: null,
    localityName: null,
    websiteUrl: null,
    status: "approved",
    decidedAt: null,
    publishedAt: null,
    tagline: null,
    taglineApproved: false,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    ...overrides,
  };
}

describe("verificationEligibility", () => {
  it("lets a claimed or added business with a number and a place verify itself", () => {
    expect(verificationEligibility(claim())).toBe("ok");
    expect(verificationEligibility(claim({ status: "pending" }))).toBe("ok");
    expect(verificationEligibility(claim({ origin: "added", status: "pending", publishedAt: new Date() }))).toBe("ok");
  });

  it("refuses a business with no listing yet", () => {
    expect(verificationEligibility(null)).toBe("no_listing");
  });

  it("refuses a rejected claim", () => {
    expect(verificationEligibility(claim({ status: "rejected" }))).toBe("rejected");
  });

  it("refuses a business that is not in the directory yet (no place)", () => {
    expect(verificationEligibility(claim({ placeId: null }))).toBe("no_place");
  });

  it("refuses a number that is not a full international number", () => {
    expect(verificationEligibility(claim({ phone: "98765 43210" }))).toBe("no_phone");
    expect(verificationEligibility(claim({ phone: "" }))).toBe("no_phone");
  });
});

describe("verificationRefusalMessage", () => {
  it("says something different for each refusal, and nothing for ok", () => {
    const refusals = ["no_listing", "rejected", "no_place", "no_phone"] as const;
    const messages = refusals.map(verificationRefusalMessage);
    expect(new Set(messages).size).toBe(refusals.length);
    for (const message of messages) expect(message.length).toBeGreaterThan(10);
  });
});
