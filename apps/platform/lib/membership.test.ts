import { chargedAmountCents } from "@brandbasket/billing/tax";
import { bundleLines } from "@brandbasket/shared/lib/billing/bundle";
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
  membershipFailedHref,
  membershipHrefWithAddOns,
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
    const benefits = membershipBenefits("managed", LISTING_BRAND);
    expect(benefits[0]).toBe("Your business website, built free");
    expect(benefits).toContain("Hosting and SSL certificate");
    expect(benefits).toContain("2 small content edits a month, up to 30 minutes each");
    expect(benefits).toContain("OyeChats professional chatbot");
  });
});

describe("groupedBenefits", () => {
  it("puts everything the plan holds under one Website heading, in order, losing no line", () => {
    const groups = groupedBenefits("managed", LISTING_BRAND);
    expect(groups.map((group) => group.name)).toEqual(["Website"]);
    expect(groups[0]?.items).toEqual(membershipBenefits("managed", LISTING_BRAND));
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
  const managed = { initialAmountCents: 299_900, currency: "INR", taxRateBasisPoints: 1800 } as const;

  it("works out today's payment: the price, any code, the GST and the total the provider takes", () => {
    expect(orderSummary(managed, 0)).toEqual({ listCents: 299_900, discountCents: 0, planNetCents: 299_900, addOns: [], netCents: 299_900, gstCents: 53_982, totalCents: 353_882 });
    expect(orderSummary(managed, 30_000)).toEqual({ listCents: 299_900, discountCents: 30_000, planNetCents: 269_900, addOns: [], netCents: 269_900, gstCents: 48_582, totalCents: 318_482 });
  });

  it("charges no tax on a plan that carries none", () => {
    expect(orderSummary({ ...managed, taxRateBasisPoints: 0 }, 0)).toMatchObject({ gstCents: 0, totalCents: 299_900 });
  });

  it("adds the add-ons taken at this checkout to the one payment, with their offer and the GST on all of it", () => {
    const summary = orderSummary(managed, 0, bundleLines(["digital-growth"], "INR"));
    expect(summary.addOns.map((line) => line.addOn)).toEqual(["digital-growth"]);
    expect(summary.addOns[0]).toMatchObject({ listCents: 700_000, offerCents: 35_000, netCents: 665_000 });
    expect(summary.netCents).toBe(299_900 + 665_000);
    expect(summary.totalCents).toBe(chargedAmountCents(299_900 + 665_000, 0, 1800));
    expect(summary.gstCents).toBe(summary.totalCents - summary.netCents);
    expect(summary.planNetCents).toBe(299_900);
  });

  it("prices a dollar plan with dollar add-ons and no tax: $75 and $75 less the 5% offer", () => {
    const usd = { initialAmountCents: 7_500, currency: "USD", taxRateBasisPoints: 0 } as const;
    const summary = orderSummary(usd, 0, bundleLines(["digital-growth"], "USD"));
    expect(summary).toMatchObject({ planNetCents: 7_500, netCents: 7_500 + 7_125, gstCents: 0, totalCents: 14_625 });
  });

  it("takes a code off the plan only, never off the add-ons", () => {
    const summary = orderSummary(managed, 30_000, bundleLines(["local-seo-aeo"], "INR"));
    expect(summary.netCents).toBe(299_900 - 30_000 + 2_375_000);
    expect(summary.planNetCents).toBe(269_900);
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
    const brandbasket = membershipBenefits("managed", BRAND);
    expect(brandbasket).toEqual(membershipBenefits("managed", LISTING_BRAND));
    expect(brandbasket.join(" ").toLowerCase()).not.toContain("listing");
    for (const line of [...brandbasket, ...groupedBenefits("managed", BRAND).flatMap((group) => group.items)]) {
      expect(line).not.toMatch(/first\s?fold/i);
    }
  });
});

describe("membershipHrefWithAddOns", () => {
  it("is the plan's page, carrying the add-ons chosen on the website when there are any", () => {
    expect(membershipHrefWithAddOns("managed", [])).toBe("/plan");
    expect(membershipHrefWithAddOns("managed", ["digital-growth", "local-seo-aeo"])).toBe("/plan?addons=digital-growth,local-seo-aeo");
  });
});
