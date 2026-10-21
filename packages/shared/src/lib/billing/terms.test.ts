import type { Plan } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import {
  changesNote,
  describeDiscount,
  describeDiscountedPlanTerms,
  describePlanTerms,
  discountedFirstPaymentAmount,
  firstPaymentAmount,
  monthlyPaymentAmount,
  initialTermLabel,
  initialTermPhrase,
  renewalCharge,
} from "./terms";

type PlanTerms = Pick<
  Plan,
  "initialAmountCents" | "initialTermMonths" | "recurringAmountCents" | "currency" | "taxRateBasisPoints"
>;

const USD: PlanTerms = {
  initialAmountCents: 6_900,
  initialTermMonths: 1,
  recurringAmountCents: 6_900,
  currency: "USD",
  taxRateBasisPoints: 0,
};
/** ₹2,999 plus 18% GST, as migration 0039 prices it. */
const INR: PlanTerms = {
  initialAmountCents: 299_900,
  initialTermMonths: 1,
  recurringAmountCents: 299_900,
  currency: "INR",
  taxRateBasisPoints: 1_800,
};
/** No live plan starts this way today, but the plans table allows it. */
const LONGER_START: PlanTerms = {
  initialAmountCents: 22500,
  initialTermMonths: 3,
  recurringAmountCents: 7500,
  currency: "USD",
  taxRateBasisPoints: 0,
};

describe("initialTermPhrase", () => {
  it("says 'your first month' for a one-month start", () => {
    expect(initialTermPhrase(1)).toBe("your first month");
  });

  it.each([
    [2, "your first 2 months"],
    [3, "your first 3 months"],
    [12, "your first 12 months"],
  ])("counts the months for a %i-month start", (months, phrase) => {
    expect(initialTermPhrase(months)).toBe(phrase);
  });

  it("speaks about the customer in staff copy", () => {
    expect(initialTermPhrase(1, "their")).toBe("their first month");
    expect(initialTermPhrase(3, "their")).toBe("their first 3 months");
  });

  it.each([0, -1, 1.5, Number.NaN])("refuses a term of %s", (months) => {
    expect(() => initialTermPhrase(months)).toThrow(RangeError);
  });
});

describe("plan wording", () => {
  it("names the monthly USD price, with no tax of ours", () => {
    expect(firstPaymentAmount(USD)).toBe("$69");
    expect(describePlanTerms(USD)).toBe(
      "$69 a month. Your first payment covers your first month, then it renews monthly.",
    );
  });

  it("charges and quotes the INR price with GST on top", () => {
    // What the Pay button shows is what is taken: ₹2,999 plus 18%.
    expect(firstPaymentAmount(INR)).toBe("₹3,538.82");
    expect(describePlanTerms(INR)).toBe(
      "₹2,999 a month plus 18% GST, so ₹3,538.82 in all. Your first payment covers your first month, then it renews monthly.",
    );
  });

  it("spells out a first payment that differs from the monthly price", () => {
    expect(firstPaymentAmount(LONGER_START)).toBe("$225");
    expect(describePlanTerms(LONGER_START)).toBe("$225 covers your first 3 months, then it’s $75 a month.");
    expect(describePlanTerms({ ...USD, initialAmountCents: 5000 })).toBe(
      "$50 covers your first month, then it’s $69 a month.",
    );
  });
});

describe("a referral discount with tax", () => {
  it("takes the discount off before GST, so the tax is on what is actually sold", () => {
    // ₹2,999 − ₹500 = ₹2,499, plus 18% = ₹2,948.82.
    expect(discountedFirstPaymentAmount(INR, { amountCents: 50_000 })).toBe("₹2,948.82");
    expect(describeDiscountedPlanTerms(INR, { amountCents: 50_000 })).toBe(
      "₹2,499 a month plus 18% GST, so ₹2,948.82 in all, instead of ₹2,999 before GST, for as long as your plan runs. Your first payment covers your first month, then it renews monthly.",
    );
  });

  it("says nothing about tax for a plan that has none", () => {
    expect(discountedFirstPaymentAmount(USD, { amountCents: 1_500 })).toBe("$54");
    expect(describeDiscountedPlanTerms(USD, { amountCents: 1_500 })).toBe(
      "$54 a month, instead of $69, for as long as your plan runs. Your first payment covers your first month, then it renews monthly.",
    );
  });

  it("prices a percentage code from the money it resolved to, before GST", () => {
    // 10% of ₹2,999 is ₹299.90: ₹2,699.10 plus 18% is ₹3,184.94.
    expect(discountedFirstPaymentAmount(INR, { amountCents: 29_990 })).toBe("₹3,184.94");
  });

  it("falls back to the plain terms when no code is applied", () => {
    expect(describeDiscountedPlanTerms(INR, null)).toBe(describePlanTerms(INR));
    expect(discountedFirstPaymentAmount(INR, null)).toBe(firstPaymentAmount(INR));
  });
});

describe("describeDiscount", () => {
  it("names a flat code by its amount", () => {
    const discount = { code: "FLAT500", amountCents: 50_000, stated: { kind: "amount", amountCents: 50_000 } } as const;
    expect(describeDiscount(discount, "INR")).toBe("₹500 off, every month");
  });

  it("names a percentage code by its percent and the money it comes to", () => {
    const discount = { code: "TENPCT", amountCents: 29_990, stated: { kind: "percent", basisPoints: 1_000 } } as const;
    expect(describeDiscount(discount, "INR")).toBe("10% off (₹299.90), every month");
  });
});

describe("initialTermLabel", () => {
  it("labels the term for the price block", () => {
    expect(initialTermLabel(1)).toBe("First month");
    expect(initialTermLabel(3)).toBe("First 3 months");
  });

  it("refuses a term that isn't a whole number of months", () => {
    expect(() => initialTermLabel(0)).toThrow(RangeError);
    expect(() => initialTermLabel(1.5)).toThrow(RangeError);
  });
});

describe("changesNote", () => {
  const extras = { includedChangeHours: 1, includedBlogPosts: 100, blogPostBlockSize: 100 };

  it("prices extra hours and blog posts in the plan's currency", () => {
    expect(changesNote({ ...extras, currency: "USD", extraHourAmountCents: 1500, extraBlogPostsAmountCents: 500 })).toBe(
      "Your first hour of changes is free, then it’s $15 an hour. Up to 100 blog posts are included, then $5 for every 100 more.",
    );
    expect(
      changesNote({ ...extras, currency: "INR", extraHourAmountCents: 142500, extraBlogPostsAmountCents: 47500 }),
    ).toBe(
      "Your first hour of changes is free, then it’s ₹1,425 an hour. Up to 100 blog posts are included, then ₹475 for every 100 more.",
    );
  });

  it("counts more than one free hour in the plural", () => {
    expect(
      changesNote({
        ...extras,
        includedChangeHours: 3,
        currency: "USD",
        extraHourAmountCents: 1500,
        extraBlogPostsAmountCents: 500,
      }),
    ).toMatch(/^Your first 3 hours of changes are free/);
  });
});

describe("renewalCharge", () => {
  it("is the monthly price as charged, GST included", () => {
    expect(renewalCharge(USD, 0)).toBe("$69");
    expect(renewalCharge(INR, 0)).toBe("₹3,538.82");
  });

  it("takes a referral discount off before the tax", () => {
    // ₹2,999 − ₹500 = ₹2,499, plus 18% GST.
    expect(renewalCharge(INR, 50_000)).toBe("₹2,948.82");
    expect(renewalCharge(USD, 1_000)).toBe("$59");
  });

  it("uses the recurring price, not the first payment", () => {
    expect(renewalCharge(LONGER_START, 0)).toBe("$75");
  });

  it("is null when a discount would leave nothing to charge", () => {
    expect(renewalCharge(USD, 6_900)).toBeNull();
  });

  it("charges the basket's lines on the services plan, which costs nothing itself", () => {
    const SERVICES: PlanTerms = { initialAmountCents: 0, initialTermMonths: 1, recurringAmountCents: 0, currency: "INR", taxRateBasisPoints: 1_800 };
    // All three services at the package price: ₹26,600 plus 18% GST.
    expect(renewalCharge(SERVICES, 0, 2_660_000)).toBe("₹31,388");
    // The website alone less a ₹300 code: ₹2,700 plus 18% GST.
    expect(renewalCharge(SERVICES, 30_000, 300_000)).toBe("₹3,186");
    expect(renewalCharge(SERVICES, 300_000, 300_000)).toBeNull();
  });
});

describe("monthlyPaymentAmount", () => {
  it("is a month at the plan's price with its tax and no discount, whatever the first payment is", () => {
    const premium = { recurringAmountCents: 999_900, initialAmountCents: 1_999_800, currency: "INR" as const, taxRateBasisPoints: 1_800 };
    expect(monthlyPaymentAmount(premium)).toBe("₹11,798.82");
    expect(monthlyPaymentAmount({ recurringAmountCents: 6_900, currency: "USD", taxRateBasisPoints: 0 })).toBe("$69");
  });
});

describe("a plan that costs nothing, with its services as lines", () => {
  const SERVICES_PLAN: PlanTerms = { ...INR, initialAmountCents: 0, recurringAmountCents: 0 };

  it("charges the first payment and a month from the services' net, with the plan's GST", () => {
    // The website at ₹3,000 plus 18% GST.
    expect(firstPaymentAmount(SERVICES_PLAN, 300_000)).toBe("₹3,540");
    expect(monthlyPaymentAmount(SERVICES_PLAN, 300_000)).toBe("₹3,540");
  });

  it("refuses to price a plan that costs nothing and has no services", () => {
    expect(() => firstPaymentAmount(SERVICES_PLAN)).toThrow(RangeError);
    expect(() => monthlyPaymentAmount(SERVICES_PLAN)).toThrow(RangeError);
  });
});
