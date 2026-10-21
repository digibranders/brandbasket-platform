import { chargedAmountCents } from "@brandbasket/billing/tax";
import { describe, expect, it } from "vitest";
import { BRAND } from "./brand";
import { LISTING_BRAND } from "./testing/listing-brand";
import {
  MEMBERSHIP_NAMES,
  MEMBERSHIP_PATH,
  isWaitingOnPayment,
  groupedBenefits,
  membershipBenefits,
  membershipPriceParts,
  orderSummary,
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
  it("names the monthly price before tax, and the tax", () => {
    expect(membershipPriceLine({ recurringAmountCents: 299_900, currency: "INR", taxRateBasisPoints: 1800 })).toBe("₹2,999 a month + 18% GST");
  });

  it("says nothing about tax for a plan with none", () => {
    expect(membershipPriceLine({ recurringAmountCents: 7_500, currency: "USD", taxRateBasisPoints: 0 })).toBe("$75 a month");
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
  it("puts Managed Website on /plan, and sends its payment notices back to it", () => {
    expect(membershipPathFor("managed")).toBe("/plan");
    expect(MEMBERSHIP_PATH).toBe("/plan");
    expect(MEMBERSHIP_NAMES.managed).toBe("Managed Website");
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

  it("lists what Managed Website includes, starting with the free website", () => {
    const benefits = membershipBenefits(["managed-website"], LISTING_BRAND);
    expect(benefits[0]).toBe("Your business website, built free");
    expect(benefits).toContain("Hosting and SSL certificate");
    expect(benefits).toContain("2 small content edits a month, up to 30 minutes each");
    expect(benefits).toContain("OyeChats professional chatbot");
  });
});

describe("groupedBenefits", () => {
  it("puts everything the plan holds under one Website heading, in order, losing no line", () => {
    const groups = groupedBenefits(["managed-website"], LISTING_BRAND);
    expect(groups.map((group) => group.name)).toEqual(["Website"]);
    expect(groups[0]?.items).toEqual(membershipBenefits(["managed-website"], LISTING_BRAND));
  });

  it("holds nothing when the managed-website line is not in the basket", () => {
    expect(groupedBenefits(["digital-growth", "local-seo-aeo"], LISTING_BRAND)).toEqual([]);
  });
});

describe("membershipPriceParts", () => {
  it("splits the price into the figure and what follows it, and the line is the two together", () => {
    const plan = { recurringAmountCents: 999_900, currency: "INR", taxRateBasisPoints: 1800 } as const;
    expect(membershipPriceParts(plan)).toEqual({ amount: "₹9,999", terms: "a month + 18% GST", was: null });
    expect(membershipPriceLine(plan)).toBe("₹9,999 a month + 18% GST");
    expect(membershipPriceParts({ ...plan, taxRateBasisPoints: 0 }).terms).toBe("a month");
  });

  it("shows the discounted figure once a code or the lifetime offer is on, with the list price as was", () => {
    const managed = { recurringAmountCents: 299_900, currency: "INR", taxRateBasisPoints: 1800 } as const;
    expect(membershipPriceParts(managed, 50_000)).toEqual({ amount: "₹2,499", terms: "a month + 18% GST", was: "₹2,999" });
    expect(membershipPriceParts(managed, 14_995).amount).toBe("₹2,849.05");
  });
});

describe("orderSummary", () => {
  const inr = { currency: "INR", taxRateBasisPoints: 1800, forfeited: false, hasEverPaid: false } as const;
  const usd = { currency: "USD", taxRateBasisPoints: 0, forfeited: false, hasEverPaid: false } as const;

  it("is one line at list for the website alone: no offer, no ad credit, GST on top", () => {
    const summary = orderSummary({ ...inr, services: ["managed-website"] }, 0);
    expect(summary.lines).toEqual([{ addOn: "managed-website", title: "Managed Website", listCents: 300_000, offerCents: 0, netCents: 300_000 }]);
    expect(summary).toMatchObject({ offer: null, adCredit: null, discountCents: 0, netCents: 300_000, gstCents: 54_000, totalCents: 354_000 });
  });

  it("lists a line for each service with its list price, then the package offer and the net", () => {
    const summary = orderSummary({ ...inr, services: ["managed-website", "digital-growth"] }, 0);
    expect(summary.lines.map((line) => [line.addOn, line.title, line.listCents, line.netCents])).toEqual([
      ["managed-website", "Managed Website", 300_000, 240_000],
      ["digital-growth", "Social Media and Ads", 1_000_000, 800_000],
    ]);
    expect(summary.offer).toEqual({ label: "Package offer, 20% off", discountCents: 260_000 });
    expect(summary).toMatchObject({ netCents: 1_040_000, gstCents: 187_200, totalCents: 1_227_200 });
  });

  it("names 30% off for three services, and the total is the sum of the lines' nets with GST", () => {
    const summary = orderSummary({ ...inr, services: ["local-seo-aeo", "managed-website", "digital-growth"] }, 0);
    expect(summary.lines.map((line) => line.addOn)).toEqual(["managed-website", "digital-growth", "local-seo-aeo"]);
    expect(summary.offer?.label).toBe("Package offer, 30% off");
    expect(summary.totalCents).toBe(chargedAmountCents(summary.lines.reduce((sum, line) => sum + line.netCents, 0), 0, 1800));
    expect(summary.totalCents).toBe(3_138_800);
  });

  it("shows the ad credit only when the basket earns one and the checkout would freeze it", () => {
    const all = ["managed-website", "digital-growth", "local-seo-aeo"] as const;
    expect(orderSummary({ ...inr, services: all }, 0).adCredit).toEqual({ cents: 500_000, label: "We add ₹5,000 a month to your ads" });
    expect(orderSummary({ ...inr, services: ["managed-website", "digital-growth"] }, 0).adCredit?.label).toBe("We add ₹2,000 a month to your ads");
    expect(orderSummary({ ...inr, services: ["managed-website", "local-seo-aeo"] }, 0).adCredit).toBeNull();
    expect(orderSummary({ ...inr, services: ["digital-growth"] }, 0).adCredit).toBeNull();
    expect(orderSummary({ ...inr, services: all, hasEverPaid: true }, 0).adCredit).toBeNull();
    expect(orderSummary({ ...inr, services: all, forfeited: true }, 0).adCredit).toBeNull();
  });

  it("charges list prices and names no offer once the business has given the package offer up", () => {
    const summary = orderSummary({ ...inr, services: ["managed-website", "digital-growth"], forfeited: true }, 0);
    expect(summary.offer).toBeNull();
    expect(summary.lines.map((line) => line.netCents)).toEqual([300_000, 1_000_000]);
    expect(summary.totalCents).toBe(chargedAmountCents(1_300_000, 0, 1800));
  });

  it("prices dollars the same way, with no GST: $350 for all three", () => {
    const summary = orderSummary({ ...usd, services: ["managed-website", "digital-growth", "local-seo-aeo"] }, 0);
    expect(summary.offer).toEqual({ label: "Package offer, 30% off", discountCents: 15_000 });
    expect(summary).toMatchObject({ netCents: 35_000, gstCents: 0, totalCents: 35_000 });
    expect(summary.adCredit?.label).toBe("We add $60 a month to your ads");
  });

  it("takes a code off the one service before GST", () => {
    const summary = orderSummary({ ...inr, services: ["managed-website"] }, 30_000);
    expect(summary).toMatchObject({ discountCents: 30_000, netCents: 270_000, totalCents: chargedAmountCents(300_000, 30_000, 1800) });
  });

  it("refuses a code on a package, and a basket of no service", () => {
    expect(() => orderSummary({ ...inr, services: ["managed-website", "digital-growth"] }, 30_000)).toThrow(RangeError);
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

describe("the plan list under Brandbasket", () => {
  it("is the same list for the product as for a brand that sells the listing, since none of it is about the listing", () => {
    const brandbasket = membershipBenefits(["managed-website"], BRAND);
    expect(brandbasket).toEqual(membershipBenefits(["managed-website"], LISTING_BRAND));
    expect(brandbasket.join(" ").toLowerCase()).not.toContain("listing");
    for (const line of [...brandbasket, ...groupedBenefits(["managed-website"], BRAND).flatMap((group) => group.items)]) {
      expect(line).not.toMatch(/first\s?fold/i);
    }
  });
});

describe("membershipHrefWithServices", () => {
  it("is the plan's page, carrying the services chosen on the website when there are any", () => {
    expect(membershipHrefWithServices("managed", [])).toBe("/plan");
    expect(membershipHrefWithServices("managed", ["digital-growth", "local-seo-aeo"])).toBe("/plan?services=digital-growth,local-seo-aeo");
  });
});
