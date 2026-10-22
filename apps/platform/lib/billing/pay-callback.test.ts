import { describe, expect, it } from "vitest";
import { payCallbackDestination, RETURN_PARAM, RETURN_TO_BILLING } from "./pay-callback";

describe("payCallbackDestination", () => {
  it("returns a website client's first payment to Check and send", () => {
    expect(payCallbackDestination({ failed: false, membership: null, returnTo: null })).toBe("/onboarding/review?payment=received");
    expect(payCallbackDestination({ failed: true, membership: null, returnTo: null })).toBe("/onboarding/review?payment=failed");
  });

  it("returns a free listing account to the plan page it paid on", () => {
    expect(payCallbackDestination({ failed: false, membership: "managed", returnTo: null })).toBe("/plan?payment=received");
    expect(payCallbackDestination({ failed: true, membership: "managed", returnTo: null })).toBe("/plan?payment=failed");
  });

  it("returns a reactivation to Billing", () => {
    expect(payCallbackDestination({ failed: false, membership: null, returnTo: RETURN_TO_BILLING })).toBe("/billing?payment=received");
    expect(payCallbackDestination({ failed: true, membership: null, returnTo: RETURN_TO_BILLING })).toBe("/billing?payment=failed");
  });

  it("ignores any other return value", () => {
    expect(payCallbackDestination({ failed: false, membership: null, returnTo: "https://evil.example" })).toBe(
      "/onboarding/review?payment=received",
    );
    expect(RETURN_PARAM).toBe("return");
  });
});
