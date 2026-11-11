import { describe, expect, it } from "vitest";
import { basketNetCents, membershipPriceLine, membershipTierForChoice, servicesPhrase } from "./membership";

describe("membershipTierForChoice", () => {
  it("names Website Management and nothing else", () => {
    expect(membershipTierForChoice("managed")).toBe("managed");
    expect(membershipTierForChoice("listing_only")).toBeNull();
    expect(membershipTierForChoice(null)).toBeNull();
  });
});

describe("membershipPriceLine", () => {
  it("names the monthly price with the GST included", () => {
    expect(membershipPriceLine({ recurringAmountCents: 299_900, currency: "INR", taxRateBasisPoints: 1800 })).toBe("₹2,999 a month, GST included");
  });

  it("says nothing about tax for a plan with none", () => {
    expect(membershipPriceLine({ recurringAmountCents: 5_900, currency: "USD", taxRateBasisPoints: 0 })).toBe("$59 a month");
  });
});

describe("membershipPriceLine on the plan row that costs nothing", () => {
  it("names the website line's price, GST included for an Indian plan", () => {
    const inr = { recurringAmountCents: 0, currency: "INR", taxRateBasisPoints: 1800 } as const;
    const usd = { recurringAmountCents: 0, currency: "USD", taxRateBasisPoints: 0 } as const;
    expect(membershipPriceLine(inr, 299_900)).toBe("₹2,999 a month, GST included");
    expect(membershipPriceLine(usd, 5_900)).toBe("$59 a month");
  });
});
describe("servicesPhrase", () => {
  it.each([
    [["managed-website"], "Website Management"],
    [["social-media"], "Social Media Management"],
    [["managed-website", "paid-ads"], "Website Management and Paid Ads Management"],
    [["paid-ads", "managed-website", "social-media"], "Website Management, Social Media Management and Paid Ads Management"],
  ] as const)("names %o as %s, in catalogue order", (services, phrase) => {
    expect(servicesPhrase(services)).toBe(phrase);
  });
});

describe("basketNetCents", () => {
  it.each([
    [["managed-website"], "INR", 299_900],
    [["social-media"], "INR", 299_900],
    [["managed-website", "social-media"], "INR", 599_800],
    [["social-media", "paid-ads"], "INR", 599_800],
    [["managed-website", "social-media", "paid-ads"], "INR", 899_700],
    [["managed-website", "social-media", "paid-ads"], "USD", 17_700],
  ] as const)("prices %o in %s at %i with GST included, every service at list", (services, currency, net) => {
    expect(basketNetCents(services, currency)).toBe(net);
  });
});
