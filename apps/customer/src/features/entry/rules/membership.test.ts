import { describe, expect, it } from "vitest";
import { basketNetCents, membershipPriceLine, membershipTierForChoice, servicesPhrase } from "./membership";

describe("membershipTierForChoice", () => {
  it("names Managed Website and nothing else", () => {
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
    expect(membershipPriceLine({ recurringAmountCents: 6_500, currency: "USD", taxRateBasisPoints: 0 })).toBe("$65 a month");
  });
});

describe("membershipPriceLine on the plan row that costs nothing", () => {
  it("names the website line's price, GST included for an Indian plan", () => {
    const inr = { recurringAmountCents: 0, currency: "INR", taxRateBasisPoints: 1800 } as const;
    const usd = { recurringAmountCents: 0, currency: "USD", taxRateBasisPoints: 0 } as const;
    expect(membershipPriceLine(inr, 299_900)).toBe("₹2,999 a month, GST included");
    expect(membershipPriceLine(usd, 6_500)).toBe("$65 a month");
  });
});
describe("servicesPhrase", () => {
  it.each([
    [["managed-website"], "Managed Website"],
    [["digital-growth"], "Social Media and Ads"],
    [["managed-website", "local-seo-aeo"], "Managed Website and Local SEO + AEO"],
    [["local-seo-aeo", "managed-website", "digital-growth"], "Managed Website, Social Media and Ads and Local SEO + AEO"],
  ] as const)("names %o as %s, in catalogue order", (services, phrase) => {
    expect(servicesPhrase(services)).toBe(phrase);
  });
});

describe("basketNetCents", () => {
  it.each([
    [["managed-website"], "INR", 299_900],
    [["digital-growth"], "INR", 999_900],
    [["managed-website", "digital-growth"], "INR", 1_169_900],
    [["digital-growth", "local-seo-aeo"], "INR", 3_149_900],
    [["managed-website", "digital-growth", "local-seo-aeo"], "INR", 3_039_800],
    [["managed-website", "digital-growth", "local-seo-aeo"], "USD", 45_200],
  ] as const)("prices %o in %s at %i with GST included, the package price a new sign-up pays", (services, currency, net) => {
    expect(basketNetCents(services, currency)).toBe(net);
  });
});
