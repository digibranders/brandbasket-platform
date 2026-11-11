import { describe, expect, it } from "vitest";
import { onboardingReviewDestination, withQuery } from "./old-paths";

describe("withQuery", () => {
  it("carries the old address's query to the new one", () => {
    expect(withQuery("/checkout", { services: "managed-website,social-media", payment: "received" })).toBe("/checkout?services=managed-website,social-media&payment=received");
    expect(withQuery("/start", { services: "paid-ads", q: "summary" })).toBe("/start?services=paid-ads&q=summary");
  });

  it("keeps a bare address bare, and repeated parameters repeated", () => {
    expect(withQuery("/checkout/pay", {})).toBe("/checkout/pay");
    expect(withQuery("/checkout", { service: ["a", "b"], gone: undefined })).toBe("/checkout?service=a&service=b");
  });
});

describe("onboardingReviewDestination", () => {
  it("sends Razorpay's return for a website client's first payment to the checkout", () => {
    expect(onboardingReviewDestination({ payment: "received" })).toBe("/checkout?payment=received");
    expect(onboardingReviewDestination({ payment: "failed" })).toBe("/checkout?payment=failed");
  });

  it("sends everything else to the checklist, and ignores an unknown payment value", () => {
    expect(onboardingReviewDestination({})).toBe("/checklist");
    expect(onboardingReviewDestination({ payment: "https://evil.example" })).toBe("/checklist");
  });
});
