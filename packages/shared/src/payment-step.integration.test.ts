import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { findActivePlan, type Plan } from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { websiteAloneNetCents } from "./lib/billing/bundle";
import { billingBanner, paymentStep } from "./lib/billing/payment-step";
import { describePlanTerms, firstPaymentAmount, monthlyPaymentAmount } from "./lib/billing/terms";

/**
 * The plan rows as the migrations leave them cost nothing (docs/plans/16-platform-pricing-offers.md in the BrandBasket
 * workspace): the website is a line. Every amount Check and send, the banner and Billing show must be worked out from that
 * line, because chargedAmountCents refuses a net of 0. Fixtures with a priced plan hid exactly that.
 */

let dbs: TestDatabases;
let usd: Plan;
let inr: Plan;

async function seeded(currency: "USD" | "INR"): Promise<Plan> {
  const plan = await findActivePlan(dbs.staff.db, currency, "managed");
  if (plan === null) throw new Error(`No active ${currency} services plan was seeded`);
  return plan;
}

beforeAll(() => {
  dbs = openTestDatabases();
});

afterAll(async () => {
  await dbs?.closeAll();
});

beforeEach(async () => {
  await resetTestDatabase(dbs.owner);
  await seedPlansFromMigrations(dbs.owner);
  usd = await seeded("USD");
  inr = await seeded("INR");
});

const OPEN = { hasProject: true, locked: false, missing: null, paymentUnderReview: false, discount: null } as const;

describe("the payment step on the seeded services plan", () => {
  it("costs nothing itself", () => {
    expect([usd.initialAmountCents, usd.recurringAmountCents, inr.initialAmountCents, inr.recurringAmountCents]).toEqual([0, 0, 0, 0]);
  });

  it("prices the button, the terms and the banner from the website line plus GST", () => {
    expect(paymentStep({ ...OPEN, status: "unpaid", plan: usd })).toMatchObject({ kind: "pay-and-send", amount: "$75" });
    expect(paymentStep({ ...OPEN, status: "unpaid", plan: inr })).toMatchObject({
      kind: "pay-and-send",
      amount: "₹3,538.82",
      terms: "₹2,999 a month plus 18% GST, so ₹3,538.82 in all. Your first payment covers your first month, then it renews monthly.",
    });
    const banner = billingBanner({
      status: "unpaid",
      plan: inr,
      setupComplete: true,
      locked: true,
      paymentUnderReview: false,
      nextStepHref: "/onboarding/brand",
      discount: null,
      renewalFailingUntil: null,
    });
    expect(banner).toMatchObject({ kind: "pay", price: { amount: "₹3,538.82", term: "First month" } });
  });

  it("takes a code off the website line before GST", () => {
    const code = { code: "SAVE", amountCents: 30_000, months: null, stated: { kind: "amount", amountCents: 30_000 } } as const;
    expect(paymentStep({ ...OPEN, status: "unpaid", plan: inr, discount: code })).toMatchObject({ amount: "₹3,184.82" });
  });

  it("words the plan's terms and the amounts a reactivation and a manual payment record from the same line", () => {
    const websiteCents = websiteAloneNetCents("INR");
    expect(describePlanTerms(inr, websiteCents)).toContain("₹3,538.82 in all");
    expect(firstPaymentAmount(inr, websiteCents)).toBe("₹3,538.82");
    expect(monthlyPaymentAmount(inr, websiteCents)).toBe("₹3,538.82");
    expect(monthlyPaymentAmount(usd, websiteAloneNetCents("USD"))).toBe("$75");
  });
});
