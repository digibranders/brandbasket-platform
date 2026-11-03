import { describe, expect, it } from "vitest";
import { payCallbackDestination, RETURN_PARAM, RETURN_TO_BILLING } from "./pay-callback";

describe("payCallbackDestination", () => {
  it("returns a website client's first payment to the checkout (Check and send in the old app)", () => {
    expect(payCallbackDestination({ failed: false, membership: null, returnTo: null })).toBe("/checkout?payment=received");
    expect(payCallbackDestination({ failed: true, membership: null, returnTo: null })).toBe("/checkout?payment=failed");
  });

  it("returns a sign-up account to the checkout it paid on", () => {
    expect(payCallbackDestination({ failed: false, membership: "managed", returnTo: null })).toBe("/checkout?payment=received");
    expect(payCallbackDestination({ failed: true, membership: "managed", returnTo: null })).toBe("/checkout?payment=failed");
  });

  it("returns a reactivation to Plan & billing, whatever else the address says", () => {
    expect(RETURN_PARAM).toBe("return");
    expect(payCallbackDestination({ failed: false, membership: "managed", returnTo: RETURN_TO_BILLING })).toBe("/billing?payment=received");
    expect(payCallbackDestination({ failed: true, membership: null, returnTo: RETURN_TO_BILLING })).toBe("/billing?payment=failed");
  });

  it("ignores any other return mark, so the callback cannot be an open redirect", () => {
    expect(payCallbackDestination({ failed: false, membership: null, returnTo: "https://evil.example" })).toBe("/checkout?payment=received");
    expect(payCallbackDestination({ failed: false, membership: null, returnTo: "//evil.example" })).toBe("/checkout?payment=received");
  });
});
