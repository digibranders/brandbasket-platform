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
    expect(membershipPriceLine({ recurringAmountCents: 5_900, currency: "USD", taxRateBasisPoints: 0 })).toBe("$59 a month");
  });
});

describe("membershipPriceLine on the plan row that costs nothing", () => {
  it("names the website line's price, GST included for an Indian plan", () => {
    const inr = { recurringAmountCents: 0, currency: "INR", taxRateBasisPoints: 1800 } as const;
    const usd = { recurringAmountCents: 0, currency: "USD", taxRateBasisPoints: 0 } as const;
    expect(membershipPriceLine(inr, 299_900)).toBe("₹2,999 a month, GST included");
    expect(membershipPriceLine(usd, 5_900)).toBe("$59 a month");
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
  it("puts the checkout on /checkout, and sends its payment notices back to it", () => {
    expect(membershipPathFor("managed")).toBe("/checkout");
    expect(MEMBERSHIP_PATH).toBe("/checkout");
    expect(MEMBERSHIP_NAMES.managed).toBe("Checkout");
    expect(membershipReceivedHref("managed")).toBe("/checkout?payment=received");
    expect(membershipFailedHref("managed")).toBe("/checkout?payment=failed");
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
    const plan = { recurringAmountCents: 299_900, currency: "INR", taxRateBasisPoints: 1800 } as const;
    expect(membershipPriceParts(plan)).toEqual({ amount: "₹2,999", terms: "a month, GST included", was: null });
    expect(membershipPriceLine(plan)).toBe("₹2,999 a month, GST included");
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
    ["Website Management", ["managed-website"], 299_900, 0, 5_900, 0, null],
    ["Social Media Management", ["social-media"], 299_900, 0, 5_900, 0, null],
    ["Paid Ads Management", ["paid-ads"], 299_900, 0, 5_900, 0, null],
    ["website and social", ["managed-website", "social-media"], 599_800, 0, 11_800, 0, null],
    ["website and SEO", ["managed-website", "paid-ads"], 599_800, 0, 11_800, 0, null],
    ["social and SEO", ["social-media", "paid-ads"], 599_800, 0, 11_800, 0, null],
    ["all three", ["managed-website", "social-media", "paid-ads"], 899_700, 0, 17_700, 0, null],
  ];

  it.each(BASKETS)("charges %s at list, with no ad credit and no offer", (_name, services, inrTotal, inrCredit, usdTotal, usdCredit, offerLabel) => {
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
    expect(summary.lines).toEqual([{ addOn: "managed-website", title: "Website Management", listCents: 299_900, offerCents: 0, netCents: 299_900 }]);
    expect(summary).toMatchObject({ offer: null, adCredit: null, discountCents: 0, netCents: 299_900, gstCents: 45_748, totalCents: 299_900 });
  });

  it("lists a line for each service at its list price, with no offer, and the net", () => {
    const summary = orderSummary({ ...inr, services: ["managed-website", "social-media"] }, 0);
    expect(summary.lines.map((line) => [line.addOn, line.title, line.listCents, line.netCents])).toEqual([
      ["managed-website", "Website Management", 299_900, 299_900],
      ["social-media", "Social Media Management", 299_900, 299_900],
    ]);
    expect(summary.offer).toBeNull();
    expect(summary).toMatchObject({ netCents: 599_800, gstCents: 91_494, totalCents: 599_800 });
  });

  it("names no offer for three services, and the total is the sum of the lines' nets", () => {
    const summary = orderSummary({ ...inr, services: ["paid-ads", "managed-website", "social-media"] }, 0);
    expect(summary.lines.map((line) => line.addOn)).toEqual(["managed-website", "social-media", "paid-ads"]);
    expect(summary.offer).toBeNull();
    expect(summary.totalCents).toBe(chargedAmountCents(summary.lines.reduce((sum, line) => sum + line.netCents, 0), 0));
    expect(summary.totalCents).toBe(899_700);
    expect(summary.lines.map((line) => line.netCents)).toEqual([299_900, 299_900, 299_900]);
  });

  it("shows no ad credit on any basket", () => {
    const all = ["managed-website", "social-media", "paid-ads"] as const;
    expect(orderSummary({ ...inr, services: all }, 0).adCredit).toBeNull();
    expect(orderSummary({ ...inr, services: ["managed-website", "social-media"] }, 0).adCredit).toBeNull();
    expect(orderSummary({ ...inr, services: ["managed-website", "paid-ads"] }, 0).adCredit).toBeNull();
    expect(orderSummary({ ...inr, services: ["social-media"] }, 0).adCredit).toBeNull();
    expect(orderSummary({ ...inr, services: all, hasEverPaid: true }, 0).adCredit).toBeNull();
    expect(orderSummary({ ...inr, services: all, forfeited: true }, 0).adCredit).toBeNull();
  });

  it("charges list prices and names no offer once the business has given the package offer up", () => {
    const summary = orderSummary({ ...inr, services: ["managed-website", "social-media"], forfeited: true }, 0);
    expect(summary.offer).toBeNull();
    expect(summary.lines.map((line) => line.netCents)).toEqual([299_900, 299_900]);
    expect(summary.totalCents).toBe(chargedAmountCents(599_800, 0));
  });

  it("prices dollars the same way, with no GST: $177 for all three", () => {
    const summary = orderSummary({ ...usd, services: ["managed-website", "social-media", "paid-ads"] }, 0);
    expect(summary.offer).toBeNull();
    expect(summary).toMatchObject({ netCents: 17_700, gstCents: 0, totalCents: 17_700 });
    expect(summary.adCredit).toBeNull();
  });

  it("takes a code off the one service, GST included in what is left", () => {
    const summary = orderSummary({ ...inr, services: ["managed-website"] }, 30_000);
    expect(summary).toMatchObject({ discountCents: 30_000, netCents: 299_900, gstCents: 41_172, totalCents: 269_900 });
  });

  it("takes a code off a package once, with GST inside what is left", () => {
    // 10% of the ₹5,998 the website and Social Media Management come to at list.
    const codeCents = discountCentsFor({ kind: "percent", basisPoints: 1_000 }, 599_800);
    const summary = orderSummary({ ...inr, services: ["managed-website", "social-media"] }, codeCents);
    expect(summary.offer).toBeNull();
    expect(summary).toMatchObject({ discountCents: 59_980, netCents: 599_800, totalCents: chargedAmountCents(599_800, 59_980) });
    expect(summary.totalCents).toBe(539_820);
    expect(summary.gstCents).toBe(82_346);
    expect(summary.adCredit).toBeNull();
  });

  it("takes a flat code off any basket, three services included", () => {
    const summary = orderSummary({ ...inr, services: ["managed-website", "social-media", "paid-ads"] }, 50_000);
    expect(summary).toMatchObject({ discountCents: 50_000, netCents: 899_700, gstCents: 129_616, totalCents: 849_700 });
  });

  it("refuses a basket of no service", () => {
    expect(() => orderSummary({ ...inr, services: [] }, 0)).toThrow(RangeError);
  });
});

describe("servicesAfterToggle", () => {
  it("adds a service that is not in the basket and takes out one that is, in the catalogue's order", () => {
    expect(servicesAfterToggle(["social-media"], "managed-website")).toEqual(["managed-website", "social-media"]);
    expect(servicesAfterToggle(["managed-website", "social-media"], "managed-website")).toEqual(["social-media"]);
  });

  it("never empties the basket: the last service stays", () => {
    expect(servicesAfterToggle(["paid-ads"], "paid-ads")).toEqual(["paid-ads"]);
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
    expect(membershipHrefWithServices("managed", [])).toBe("/checkout");
    expect(membershipHrefWithServices("managed", ["social-media", "paid-ads"])).toBe("/checkout?services=social-media,paid-ads");
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

describe("renewalTerms", () => {
  const inr = { planInitialAmountCents: 0, currency: "INR", taxRateBasisPoints: 1800, forfeited: false, hasEverPaid: false } as const;
  const plan = { currency: "INR", taxRateBasisPoints: 1800, initialTermMonths: 1 } as const;
  const websiteAndSocial = ["managed-website", "social-media"] as const;
  // ₹539.90 off the ₹5,998 for the two: ₹5,458.10 a month, and ₹5,998 once the code ends.
  const coded = orderSummary({ ...inr, services: websiteAndSocial }, 53_990);

  it("names the months a code has left after the first payment, and the price after it ends", () => {
    expect(renewalTerms(coded, plan, 3)).toBe(
      "Your first payment covers your first month, then ₹5,458.10 (GST included) is taken each month for 2 more months, and ₹5,998 a month after that.",
    );
    expect(renewalTerms(coded, plan, 2)).toContain("for 1 more month, and ₹5,998 a month after that.");
  });

  it("goes straight to the price without the code when the first payment uses the code's only month", () => {
    expect(renewalTerms(coded, plan, 1)).toBe("Your first payment covers your first month, then ₹5,998 (GST included) is taken each month for your services.");
  });

  it("keeps the discounted amount each month for a code with no limit, and the plain amount with no code", () => {
    expect(renewalTerms(coded, plan, null)).toBe("Your first payment covers your first month, then ₹5,458.10 (GST included) is taken each month for your services.");
    const plain = orderSummary({ ...inr, services: ["managed-website"] }, 0);
    expect(renewalTerms(plain, plan, 3)).toBe("Your first payment covers your first month, then ₹2,999 (GST included) is taken each month for your service.");
  });
});
