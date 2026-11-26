import { describe, expect, it } from "vitest";
import { billsInRupees, needsBillingDetails } from "./billing-details-view";

describe("billsInRupees", () => {
  it("follows the plan's currency when there is a plan", () => {
    expect(billsInRupees("INR", null)).toBe(true);
    expect(billsInRupees("USD", "INR")).toBe(false);
  });

  it("falls back on the business's own currency for a listing account with no plan", () => {
    expect(billsInRupees(null, "INR")).toBe(true);
    expect(billsInRupees(null, "USD")).toBe(false);
  });

  it("is no when neither currency is known", () => {
    expect(billsInRupees(null, null)).toBe(false);
  });
});

describe("needsBillingDetails", () => {
  const signUp = { rupees: true, hasProfile: false, kind: "listing", signupChoice: "managed", stateCode: "mh", fallbackPrintable: true } as const;

  it("lets a sign-up that gave its state pay with no billing profile, so its invoice carries the business name and state", () => {
    expect(needsBillingDetails(signUp)).toBe(false);
  });

  it("asks a sign-up with no state for the details", () => {
    expect(needsBillingDetails({ ...signUp, stateCode: null })).toBe(true);
    // An old-flow sign-up with a name or address an invoice cannot print is asked for English details, or its invoice would be held unissued.
    expect(needsBillingDetails({ ...signUp, fallbackPrintable: false })).toBe(true);
  });

  it("keeps asking a website client invited by staff, even when its state is known", () => {
    expect(needsBillingDetails({ ...signUp, kind: "website", signupChoice: null })).toBe(true);
  });

  it("keeps asking a free listing account, whose sign-up choice is not a paid plan", () => {
    expect(needsBillingDetails({ ...signUp, signupChoice: "listing_only" })).toBe(true);
    expect(needsBillingDetails({ ...signUp, signupChoice: null })).toBe(true);
  });

  it("never asks a business that already has details saved", () => {
    expect(needsBillingDetails({ ...signUp, hasProfile: true, stateCode: null, kind: "website" })).toBe(false);
  });

  it("never asks a business billed in dollars, which gets no tax invoice", () => {
    expect(needsBillingDetails({ ...signUp, rupees: false, stateCode: null })).toBe(false);
  });
});
