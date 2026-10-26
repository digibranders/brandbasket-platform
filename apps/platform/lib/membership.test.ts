import { discountCentsFor } from "@brandbasket/billing";
import { chargedAmountCents } from "@brandbasket/billing/tax";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { describe, expect, it } from "vitest";
import {
  MEMBERSHIP_NAMES,
  basketNetCents,
  servicesPhrase,
  MEMBERSHIP_PATH,
  isWaitingOnPayment,
  membershipPriceParts,
  orderSummary,
  renewalTerms,
  servicesAfterToggle,
  membershipFailedHref,
  membershipHrefWithServices,
  membershipPathFor,
  membershipPriceLine,
  membershipReceivedHref,
  membershipTierForChoice,
  readMembershipCallbackTier,
  readMembershipPaymentNotice,
  unsettledCheckout,
} from "./membership";

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
    expect(membershipPriceParts(inr, 30_000, 299_900)).toEqual({ amount: "₹2,699", terms: "a month, GST included", was: "₹2,999" });
  });
});

describe("readMembershipPaymentNotice", () => {
  it("reads the two notices the payment pages send back, and nothing else", () => {
    expect(readMembershipPaymentNotice({ payment: "received" })).toBe("received");
    expect(readMembershipPaymentNotice({ payment: "failed" })).toBe("failed");
    expect(readMembershipPaymentNotice({ payment: "paid" })).toBeNull();
    expect(readMembershipPaymentNotice({ payment: ["received"] })).toBeNull();
    expect(readMembershipPaymentNotice({})).toBeNull();
  });
});

describe("unsettledCheckout", () => {
  const checkout = { id: "sub-1", status: "incomplete", activatedAt: null };

  it("is the unpaid checkout the account opened", () => {
    expect(unsettledCheckout(checkout)).toBe(checkout);
  });

  it("is still unsettled when the provider said the mandate was authorised before it said the charge went through", () => {
    const authorised = { ...checkout, status: "active" };
    expect(unsettledCheckout(authorised)).toBe(authorised);
  });

  it("is nothing once a payment has been recorded, or the checkout was cancelled, or there is none", () => {
    expect(unsettledCheckout({ ...checkout, status: "active", activatedAt: new Date("2026-09-30T10:00:00.000Z") })).toBeNull();
    expect(unsettledCheckout({ ...checkout, status: "cancelled" })).toBeNull();
    expect(unsettledCheckout(null)).toBeNull();
  });
});

describe("the plan's page", () => {
  it("puts the checkout on /plan, and sends its payment notices back to it", () => {
    expect(membershipPathFor("managed")).toBe("/plan");
    expect(MEMBERSHIP_PATH).toBe("/plan");
    expect(MEMBERSHIP_NAMES.managed).toBe("Checkout");
    expect(membershipReceivedHref("managed")).toBe("/plan?payment=received");
    expect(membershipFailedHref("managed")).toBe("/plan?payment=failed");
  });

  it("reads the plan a sign-up choice buys, and nothing for the free listing, a retired plan or an unknown choice", () => {
    expect(membershipTierForChoice("managed")).toBe("managed");
    expect(membershipTierForChoice("listing_only")).toBeNull();
    expect(membershipTierForChoice("care")).toBeNull();
    expect(membershipTierForChoice("premium")).toBeNull();
    expect(membershipTierForChoice("own_website")).toBeNull();
    expect(membershipTierForChoice(null)).toBeNull();
  });

  it("reads the plan a payment callback names, and nothing else", () => {
    expect(readMembershipCallbackTier("managed")).toBe("managed");
    expect(readMembershipCallbackTier("care")).toBeNull();
    expect(readMembershipCallbackTier("premium")).toBeNull();
    expect(readMembershipCallbackTier("gold")).toBeNull();
    expect(readMembershipCallbackTier(null)).toBeNull();
  });
});

describe("membershipPriceParts", () => {
  it("splits the price into the figure and what follows it, and the line is the two together", () => {
    const plan = { recurringAmountCents: 999_900, currency: "INR", taxRateBasisPoints: 1800 } as const;
    expect(membershipPriceParts(plan)).toEqual({ amount: "₹9,999", terms: "a month, GST included", was: null });
    expect(membershipPriceLine(plan)).toBe("₹9,999 a month, GST included");
    expect(membershipPriceParts({ ...plan, taxRateBasisPoints: 0 }).terms).toBe("a month");
  });

  it("shows the discounted figure once a code or the package offer is on, with the list price as was", () => {
    const managed = { recurringAmountCents: 299_900, currency: "INR", taxRateBasisPoints: 1800 } as const;
    expect(membershipPriceParts(managed, 50_000)).toEqual({ amount: "₹2,499", terms: "a month, GST included", was: "₹2,999" });
    expect(membershipPriceParts(managed, 14_995).amount).toBe("₹2,849.05");
  });
});

describe("orderSummary", () => {
  const inr = { planInitialAmountCents: 0, currency: "INR", taxRateBasisPoints: 1800, forfeited: false, hasEverPaid: false } as const;
  const usd = { planInitialAmountCents: 0, currency: "USD", taxRateBasisPoints: 0, forfeited: false, hasEverPaid: false } as const;

  // Every basket the page can sell, in both currencies: what Razorpay is asked for, the ad credit frozen and the offer named.
  const BASKETS: readonly (readonly [string, readonly MonthlyAddOnId[], number, number, number, number, string | null])[] = [
    ["Managed Website", ["managed-website"], 299_900, 0, 6_500, 0, null],
    ["Social Media and Ads", ["digital-growth"], 999_900, 0, 15_000, 0, null],
    ["Local SEO + AEO", ["local-seo-aeo"], 2_499_900, 0, 35_000, 0, null],
    ["website and social", ["managed-website", "digital-growth"], 1_169_900, 150_000, 19_400, 3_000, "Package offer, 10% off"],
    ["website and SEO", ["managed-website", "local-seo-aeo"], 2_519_900, 0, 37_400, 0, "Package offer, 10% off"],
    ["social and SEO", ["digital-growth", "local-seo-aeo"], 3_149_900, 150_000, 45_000, 3_000, "Package offer, 10% off"],
    ["all three", ["managed-website", "digital-growth", "local-seo-aeo"], 3_039_800, 300_000, 45_200, 6_000, "Package offer, 20% off"],
  ];

  it.each(BASKETS)("charges %s what the checkout charges, with its ad credit and offer", (_name, services, inrTotal, inrCredit, usdTotal, usdCredit, offerLabel) => {
    const rupees = orderSummary({ ...inr, services }, 0);
    const dollars = orderSummary({ ...usd, services }, 0);
    expect([rupees.totalCents, rupees.adCredit?.cents ?? 0, rupees.offer?.label ?? null]).toEqual([inrTotal, inrCredit, offerLabel]);
    expect([dollars.totalCents, dollars.adCredit?.cents ?? 0, dollars.offer?.label ?? null]).toEqual([usdTotal, usdCredit, offerLabel]);
  });

  it("adds the plan's own price to the lines, as checkout charges it, and changes nothing on the plan that costs nothing", () => {
    const priced = orderSummary({ ...inr, planInitialAmountCents: 100_000, services: ["managed-website"] }, 0);
    expect(priced).toMatchObject({ netCents: 399_900, gstCents: 61_002, totalCents: 399_900 });
    expect(priced.totalCents).toBe(chargedAmountCents(399_900, 0));
    expect(orderSummary({ ...inr, planInitialAmountCents: 100_000, services: ["managed-website"] }, 30_000).totalCents).toBe(369_900);
    expect(orderSummary({ ...inr, services: ["managed-website"] }, 0).totalCents).toBe(299_900);
  });

  it("is one line at list for the website alone: no offer, no ad credit, GST inside the price", () => {
    const summary = orderSummary({ ...inr, services: ["managed-website"] }, 0);
    expect(summary.lines).toEqual([{ addOn: "managed-website", title: "Managed Website", listCents: 299_900, offerCents: 0, netCents: 299_900 }]);
    expect(summary).toMatchObject({ offer: null, adCredit: null, discountCents: 0, netCents: 299_900, gstCents: 45_748, totalCents: 299_900 });
  });

  it("lists a line for each service with its list price, then the package offer and the net", () => {
    const summary = orderSummary({ ...inr, services: ["managed-website", "digital-growth"] }, 0);
    expect(summary.lines.map((line) => [line.addOn, line.title, line.listCents, line.netCents])).toEqual([
      ["managed-website", "Managed Website", 299_900, 269_910],
      ["digital-growth", "Social Media and Ads", 999_900, 899_990],
    ]);
    expect(summary.offer).toEqual({ label: "Package offer, 10% off", discountCents: 129_900 });
    expect(summary).toMatchObject({ netCents: 1_169_900, gstCents: 178_460, totalCents: 1_169_900 });
  });

  it("names 20% off for three services, and the total is the sum of the lines' nets", () => {
    const summary = orderSummary({ ...inr, services: ["local-seo-aeo", "managed-website", "digital-growth"] }, 0);
    expect(summary.lines.map((line) => line.addOn)).toEqual(["managed-website", "digital-growth", "local-seo-aeo"]);
    expect(summary.offer?.label).toBe("Package offer, 20% off");
    expect(summary.totalCents).toBe(chargedAmountCents(summary.lines.reduce((sum, line) => sum + line.netCents, 0), 0));
    expect(summary.totalCents).toBe(3_039_800);
    expect(summary.lines.map((line) => line.netCents)).toEqual([239_920, 799_920, 1_999_960]);
  });

  it("shows the ad credit only when the basket earns one and the checkout would freeze it", () => {
    const all = ["managed-website", "digital-growth", "local-seo-aeo"] as const;
    expect(orderSummary({ ...inr, services: all }, 0).adCredit).toEqual({ cents: 300_000, label: "We add ₹3,000 a month to your ads" });
    expect(orderSummary({ ...inr, services: ["managed-website", "digital-growth"] }, 0).adCredit?.label).toBe("We add ₹1,500 a month to your ads");
    expect(orderSummary({ ...inr, services: ["managed-website", "local-seo-aeo"] }, 0).adCredit).toBeNull();
    expect(orderSummary({ ...inr, services: ["digital-growth"] }, 0).adCredit).toBeNull();
    expect(orderSummary({ ...inr, services: all, hasEverPaid: true }, 0).adCredit).toBeNull();
    expect(orderSummary({ ...inr, services: all, forfeited: true }, 0).adCredit).toBeNull();
  });

  it("charges list prices and names no offer once the business has given the package offer up", () => {
    const summary = orderSummary({ ...inr, services: ["managed-website", "digital-growth"], forfeited: true }, 0);
    expect(summary.offer).toBeNull();
    expect(summary.lines.map((line) => line.netCents)).toEqual([299_900, 999_900]);
    expect(summary.totalCents).toBe(chargedAmountCents(1_299_800, 0));
  });

  it("prices dollars the same way, with no GST: $452 for all three", () => {
    const summary = orderSummary({ ...usd, services: ["managed-website", "digital-growth", "local-seo-aeo"] }, 0);
    expect(summary.offer).toEqual({ label: "Package offer, 20% off", discountCents: 11_300 });
    expect(summary).toMatchObject({ netCents: 45_200, gstCents: 0, totalCents: 45_200 });
    expect(summary.adCredit?.label).toBe("We add $60 a month to your ads");
  });

  it("takes a code off the one service, GST included in what is left", () => {
    const summary = orderSummary({ ...inr, services: ["managed-website"] }, 30_000);
    expect(summary).toMatchObject({ discountCents: 30_000, netCents: 299_900, gstCents: 41_172, totalCents: 269_900 });
  });

  it("takes a code off a package once, after the package offer, with GST inside what is left", () => {
    // 10% of the ₹11,699 the website and Social Media and Ads come to at 10% off.
    const codeCents = discountCentsFor({ kind: "percent", basisPoints: 1_000 }, 1_169_900);
    const summary = orderSummary({ ...inr, services: ["managed-website", "digital-growth"] }, codeCents);
    expect(summary.offer).toEqual({ label: "Package offer, 10% off", discountCents: 129_900 });
    expect(summary).toMatchObject({ discountCents: 116_990, netCents: 1_169_900, totalCents: chargedAmountCents(1_169_900, 116_990) });
    expect(summary.totalCents).toBe(1_052_910);
    expect(summary.gstCents).toBe(160_614);
    expect(summary.adCredit?.cents).toBe(150_000);
  });

  it("takes a flat code off any basket, three services included", () => {
    const summary = orderSummary({ ...inr, services: ["managed-website", "digital-growth", "local-seo-aeo"] }, 50_000);
    expect(summary).toMatchObject({ discountCents: 50_000, netCents: 3_039_800, gstCents: 456_072, totalCents: 2_989_800 });
  });

  it("refuses a basket of no service", () => {
    expect(() => orderSummary({ ...inr, services: [] }, 0)).toThrow(RangeError);
  });
});

describe("servicesAfterToggle", () => {
  it("adds a service that is not in the basket and takes out one that is, in the catalogue's order", () => {
    expect(servicesAfterToggle(["digital-growth"], "managed-website")).toEqual(["managed-website", "digital-growth"]);
    expect(servicesAfterToggle(["managed-website", "digital-growth"], "managed-website")).toEqual(["digital-growth"]);
  });

  it("never empties the basket: the last service stays", () => {
    expect(servicesAfterToggle(["local-seo-aeo"], "local-seo-aeo")).toEqual(["local-seo-aeo"]);
  });
});

describe("isWaitingOnPayment", () => {
  const unsettled = { id: "sub", status: "incomplete", activatedAt: null };

  it("is false with no checkout open, whatever the address says", () => {
    expect(isWaitingOnPayment(null, "received")).toBe(false);
  });

  it("waits when sent back from the provider with a checkout that has not settled", () => {
    expect(isWaitingOnPayment(unsettled, "received")).toBe(true);
  });

  it("waits on a checkout the provider has already authorised, with no notice at all", () => {
    expect(isWaitingOnPayment({ ...unsettled, status: "active" }, null)).toBe(true);
  });

  it("does not wait on an incomplete checkout nobody was sent back from", () => {
    expect(isWaitingOnPayment(unsettled, null)).toBe(false);
  });

  it("does not wait once the first payment is recorded", () => {
    expect(isWaitingOnPayment({ ...unsettled, status: "active", activatedAt: new Date() }, "received")).toBe(false);
  });
});

describe("membershipHrefWithServices", () => {
  it("is the plan's page, carrying the services chosen on the website when there are any", () => {
    expect(membershipHrefWithServices("managed", [])).toBe("/plan");
    expect(membershipHrefWithServices("managed", ["digital-growth", "local-seo-aeo"])).toBe("/plan?services=digital-growth,local-seo-aeo");
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

describe("renewalTerms", () => {
  const inr = { planInitialAmountCents: 0, currency: "INR", taxRateBasisPoints: 1800, forfeited: false, hasEverPaid: false } as const;
  const plan = { currency: "INR", taxRateBasisPoints: 1800, initialTermMonths: 1 } as const;
  const websiteAndSocial = ["managed-website", "digital-growth"] as const;
  // 10% of the ₹11,699 package: ₹1,169.90 off, so ₹10,529.10 a month, and ₹11,699 once the code ends.
  const coded = orderSummary({ ...inr, services: websiteAndSocial }, 116_990);

  it("names the months a code has left after the first payment, and the price after it ends", () => {
    expect(renewalTerms(coded, plan, 3)).toBe(
      "Your first payment covers your first month, then ₹10,529.10 (GST included) is taken each month for 2 more months, and ₹11,699 a month after that.",
    );
    expect(renewalTerms(coded, plan, 2)).toContain("for 1 more month, and ₹11,699 a month after that.");
  });

  it("goes straight to the price without the code when the first payment uses the code's only month", () => {
    expect(renewalTerms(coded, plan, 1)).toBe("Your first payment covers your first month, then ₹11,699 (GST included) is taken each month for your services.");
  });

  it("keeps the discounted amount each month for a code with no limit, and the plain amount with no code", () => {
    expect(renewalTerms(coded, plan, null)).toBe("Your first payment covers your first month, then ₹10,529.10 (GST included) is taken each month for your services.");
    const plain = orderSummary({ ...inr, services: ["managed-website"] }, 0);
    expect(renewalTerms(plain, plan, 3)).toBe("Your first payment covers your first month, then ₹2,999 (GST included) is taken each month for your service.");
  });
});
