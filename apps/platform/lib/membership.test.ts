import { chargedAmountCents } from "@brandbasket/billing/tax";
import { bundleLines } from "@brandbasket/shared/lib/billing/bundle";
import { describe, expect, it } from "vitest";
import { BRAND } from "./brand";
import { LISTING_BRAND } from "./testing/listing-brand";
import {
  CARE_PATH,
  MEMBERSHIP_PATH,
  UPGRADE_PATH,
  isWaitingOnPayment,
  plansMoveToUpgradePage,
  groupedBenefits,
  membershipBenefits,
  membershipPriceParts,
  orderSummary,
  membershipFailedHref,
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
    expect(membershipPriceLine({ recurringAmountCents: 6_900, currency: "USD", taxRateBasisPoints: 0 })).toBe("$69 a month");
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

describe("the two plans' pages", () => {
  it("gives each plan its own page, and sends its payment notices back to it", () => {
    expect(membershipPathFor("care")).toBe("/care");
    expect(membershipPathFor("premium")).toBe("/premium");
    expect([CARE_PATH, MEMBERSHIP_PATH]).toEqual(["/care", "/premium"]);
    expect(membershipReceivedHref("care")).toBe("/care?payment=received");
    expect(membershipFailedHref("premium")).toBe("/premium?payment=failed");
  });

  it("reads the plan a sign-up choice buys, and nothing for the free listing or an unknown choice", () => {
    expect(membershipTierForChoice("care")).toBe("care");
    expect(membershipTierForChoice("premium")).toBe("premium");
    expect(membershipTierForChoice("listing_only")).toBeNull();
    expect(membershipTierForChoice("own_website")).toBeNull();
    expect(membershipTierForChoice(null)).toBeNull();
  });

  it("reads the plan a payment callback names, and nothing else", () => {
    expect(readMembershipCallbackTier("care")).toBe("care");
    expect(readMembershipCallbackTier("premium")).toBe("premium");
    expect(readMembershipCallbackTier("gold")).toBeNull();
    expect(readMembershipCallbackTier(null)).toBeNull();
  });

  it("lists what Care includes, which is the website's four and no listing", () => {
    expect(membershipBenefits("care", LISTING_BRAND)).toEqual([
      "Next.js business website",
      "Website management",
      "OyeChats professional chatbot",
      "Server and hosting",
    ]);
  });

  it("lists everything in Care and the listing besides for Premium, with the table's notes", () => {
    const premium = membershipBenefits("premium", LISTING_BRAND);
    for (const line of membershipBenefits("care", LISTING_BRAND).filter((line) => line !== "Next.js business website")) expect(premium).toContain(line);
    expect(premium).toContain("Next.js business website: 5 pages (free)");
    expect(premium).toContain("Business listing");
    expect(premium).toContain("Appointment management system");
    expect(premium).toContain("Homepage featured placement: Hot & Growing");
  });
});

describe("groupedBenefits", () => {
  it("sorts what Premium holds into the listing, the website and social media, keeping the table's order", () => {
    const groups = groupedBenefits("premium", LISTING_BRAND);
    expect(groups.map((group) => group.name)).toEqual(["Listing", "Website", "Social media"]);
    expect(groups.find((group) => group.name === "Website")?.items).toEqual([
      "Next.js business website: 5 pages (free)",
      "Website management",
      "OyeChats professional chatbot",
      "Server and hosting",
      "Appointment management system",
    ]);
    expect(groups.find((group) => group.name === "Social media")?.items).toContain("Instagram account management");
  });

  it("leaves out a layer a plan has nothing in, and loses no line", () => {
    expect(groupedBenefits("care", LISTING_BRAND).map((group) => group.name)).toEqual(["Website"]);
    for (const tier of ["care", "premium"] as const) {
      expect(groupedBenefits(tier, LISTING_BRAND).flatMap((group) => group.items)).toHaveLength(membershipBenefits(tier, LISTING_BRAND).length);
    }
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
    const care = { recurringAmountCents: 299_900, currency: "INR", taxRateBasisPoints: 1800 } as const;
    expect(membershipPriceParts(care, 50_000)).toEqual({ amount: "₹2,499", terms: "a month + 18% GST", was: "₹2,999" });
    expect(membershipPriceParts(care, 14_995).amount).toBe("₹2,849.05");
  });
});

describe("orderSummary", () => {
  const care = { initialAmountCents: 299_900, currency: "INR", taxRateBasisPoints: 1800 } as const;

  it("works out today's payment: the price, any code, the GST and the total the provider takes", () => {
    expect(orderSummary(care, 0)).toEqual({ listCents: 299_900, discountCents: 0, planNetCents: 299_900, addOns: [], netCents: 299_900, gstCents: 53_982, totalCents: 353_882 });
    expect(orderSummary(care, 30_000)).toEqual({ listCents: 299_900, discountCents: 30_000, planNetCents: 269_900, addOns: [], netCents: 269_900, gstCents: 48_582, totalCents: 318_482 });
  });

  it("charges no tax on a plan that carries none", () => {
    expect(orderSummary({ ...care, taxRateBasisPoints: 0 }, 0)).toMatchObject({ gstCents: 0, totalCents: 299_900 });
  });

  it("adds the add-ons taken at this checkout to the one payment, with their offer and the GST on all of it", () => {
    const summary = orderSummary(care, 0, bundleLines(["social-media"], "INR"));
    expect(summary.addOns.map((line) => line.addOn)).toEqual(["social-media"]);
    expect(summary.netCents).toBe(299_900 + 189_905);
    expect(summary.totalCents).toBe(chargedAmountCents(299_900 + 189_905, 0, 1800));
    expect(summary.gstCents).toBe(summary.totalCents - summary.netCents);
    expect(summary.planNetCents).toBe(299_900);
  });

  it("prices a dollar plan with dollar add-ons and no tax: $75 and $95", () => {
    const usd = { initialAmountCents: 7_500, currency: "USD", taxRateBasisPoints: 0 } as const;
    const summary = orderSummary(usd, 0, bundleLines(["social-media"], "USD"));
    expect(summary).toMatchObject({ planNetCents: 7_500, netCents: 7_500 + 9_500, gstCents: 0, totalCents: 17_000 });
  });

  it("takes a code off the plan only, never off the add-ons", () => {
    const summary = orderSummary(care, 30_000, bundleLines(["advertising"], "INR"));
    expect(summary.netCents).toBe(299_900 - 30_000 + 569_905);
    expect(summary.planNetCents).toBe(269_900);
  });
});

describe("UPGRADE_PATH", () => {
  it("is the one page a free listing account or a Care client compares the plans on", () => {
    expect(UPGRADE_PATH).toBe("/upgrade");
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

describe("plansMoveToUpgradePage", () => {
  const quiet = { held: false, notice: null, waiting: false, paymentUnderReview: false } as const;

  it("sends a free account that just opened a plan's page to the Upgrade page", () => {
    expect(plansMoveToUpgradePage(quiet)).toBe(true);
  });

  it("keeps an owner held on the plan they chose at sign-up", () => {
    expect(plansMoveToUpgradePage({ ...quiet, held: true })).toBe(false);
  });

  it("keeps a payment's return address on the plan page that says what happened", () => {
    expect(plansMoveToUpgradePage({ ...quiet, notice: "failed" })).toBe(false);
    expect(plansMoveToUpgradePage({ ...quiet, notice: "received" })).toBe(false);
  });

  it("keeps an account whose payment is being settled where it is told so", () => {
    expect(plansMoveToUpgradePage({ ...quiet, waiting: true })).toBe(false);
    expect(plansMoveToUpgradePage({ ...quiet, paymentUnderReview: true })).toBe(false);
  });
});

describe("the plan lists under Fynix", () => {
  it("keeps the listing's lines for a brand that sells it and drops them for the product", () => {
    expect(membershipBenefits("premium", LISTING_BRAND)).toContain("Business listing");
    const fynix = membershipBenefits("premium", BRAND);
    expect(fynix).not.toContain("Business listing");
    expect(fynix.join(" ").toLowerCase()).not.toContain("listing");
    expect(fynix).toContain("10% off digital marketing services");
    for (const line of [...fynix, ...groupedBenefits("premium", BRAND).flatMap((group) => group.items)]) {
      expect(line).not.toMatch(/first\s?fold/i);
    }
  });
});
