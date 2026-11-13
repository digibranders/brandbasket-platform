import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  businesses,
  findActivePlan,
  findBundledAddOnsForSubscription,
  findPaymentByProviderId,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  openCheckoutSubscription,
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { activateFirstPayment } from "./server/billing-activation";

// The activation is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/**
 * The first-month offer (plan 63) against a real database: a checkout opened with a first payment frozen on it and a trial price on
 * its Social Media line is recorded as that payment, not as the monthly amount; the first term ends on the day the first full charge
 * falls; the trial starts then; and the invoice lines add up to what was taken.
 */

const PRICE = 299_900;
const TRIAL = 100;
const PAID_AT = new Date("2026-11-13T07:00:00.000Z");
const FIRST_CHARGE_AT = new Date("2026-12-13T07:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let plan: Plan;

function line(addOn: string, trialPriceCents: number | null = null): NewBundledAddOn {
  return { addOn, listAmountCents: PRICE, offerDiscountAmountCents: 0, netAmountCents: PRICE, taxRateBasisPoints: plan.taxRateBasisPoints, trialPriceCents };
}

function open(bundledAddOns: readonly NewBundledAddOn[], extra: { firstPaymentCents?: number | null; firstChargeAt?: Date | null } = {}): Promise<Subscription> {
  return openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"c".repeat(24)}`,
    referralCodeId: null,
    discountAmountCents: 0,
    bundledAddOns,
    adCreditCents: 0,
    replacing: null,
    now: PAID_AT,
    ...extra,
  });
}

function pay(subscription: Subscription, providerPaymentId = "fake_pay_offer") {
  return dbs.staff.db.transaction((tx) =>
    activateFirstPayment(tx, { businessId, subscriptionId: subscription.id, plan, provider: "fake", providerPaymentId, paidAt: PAID_AT, discountAmountCents: 0 }),
  );
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
  const found = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (found === null) throw new Error("No active INR plan was seeded");
  plan = found;
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "harbour-bakery", name: "Harbour Bakery", currency: "INR" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Social Media alone on the offer (the plan's case 1)", () => {
  it("takes ₹1, ends the first term on the first charge day and starts the trial then", async () => {
    const subscription = await open([line("social-media", TRIAL)], { firstPaymentCents: TRIAL, firstChargeAt: FIRST_CHARGE_AT });
    expect(subscription).toMatchObject({ firstPaymentCents: TRIAL, firstChargeAt: FIRST_CHARGE_AT, bundledAddOnNetCents: PRICE });

    const activation = await pay(subscription);

    expect(activation.alreadyRecorded).toBe(false);
    const paid = await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_offer");
    expect(paid).toMatchObject({ kind: "initial", amountCents: TRIAL, status: "captured" });
    const active = await findSubscriptionById(dbs.staff.db, subscription.id);
    expect(active).toMatchObject({ status: "active", paidThroughAt: FIRST_CHARGE_AT, commitmentEndsAt: FIRST_CHARGE_AT, bundledAddOnNetCents: PRICE });
    const [social] = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(social).toMatchObject({ addOn: "social-media", status: "active", trialPriceCents: TRIAL, trialEndsAt: FIRST_CHARGE_AT, netAmountCents: PRICE });
  });

  it("invoices the line at what it cost, so the invoice adds up to the payment", async () => {
    const subscription = await open([line("social-media", TRIAL)], { firstPaymentCents: TRIAL, firstChargeAt: FIRST_CHARGE_AT });
    const activation = await pay(subscription);
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.totalCents).toBe(TRIAL);
    expect(invoice?.lines.map((row) => [row.description, row.unitAmountCents, row.discountAmountCents])).toEqual([["Social Media Management", TRIAL, 0]]);
  });

  it("is recorded once however many times the payment is reported", async () => {
    const subscription = await open([line("social-media", TRIAL)], { firstPaymentCents: TRIAL, firstChargeAt: FIRST_CHARGE_AT });
    await pay(subscription);
    expect((await pay(subscription)).alreadyRecorded).toBe(true);
  });
});

describe("the Website with Social Media on the offer (the plan's case 3)", () => {
  it("takes the Website in full and ₹1 for Social, and the invoice shows both", async () => {
    const subscription = await open([line("managed-website"), line("social-media", TRIAL)], { firstPaymentCents: PRICE + TRIAL, firstChargeAt: FIRST_CHARGE_AT });
    expect(subscription.bundledAddOnNetCents).toBe(2 * PRICE);

    const activation = await pay(subscription);

    expect((await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_offer"))?.amountCents).toBe(PRICE + TRIAL);
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.totalCents).toBe(PRICE + TRIAL);
    const lines = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(lines.map((row) => [row.addOn, row.trialEndsAt])).toEqual([["managed-website", null], ["social-media", FIRST_CHARGE_AT]]);
  });

  it("takes ₹1 each for Social Media and Paid Ads (case 4)", async () => {
    const subscription = await open([line("social-media", TRIAL), line("paid-ads", TRIAL)], { firstPaymentCents: 2 * TRIAL, firstChargeAt: FIRST_CHARGE_AT });
    await pay(subscription);
    expect((await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_offer"))?.amountCents).toBe(2 * TRIAL);
  });
});

describe("what the database and the activation refuse", () => {
  it("refuses a first payment that does not agree with the lines, instead of recording a wrong amount", async () => {
    const subscription = await open([line("social-media", TRIAL)], { firstPaymentCents: 555, firstChargeAt: FIRST_CHARGE_AT });
    await expect(pay(subscription)).rejects.toThrow("froze a first payment of 555");
  });

  it("refuses a first payment without its first charge day, and one on a yearly plan", async () => {
    await expect(open([line("social-media", TRIAL)], { firstPaymentCents: TRIAL, firstChargeAt: null })).rejects.toThrow();
    await expect(
      openCheckoutSubscription(dbs.staff.db, {
        businessId,
        planId: plan.id,
        provider: "fake",
        providerSubscriptionId: `fake_sub_${"d".repeat(24)}`,
        billingInterval: "year",
        referralCodeId: null,
        discountAmountCents: 0,
        bundledAddOns: [line("social-media", TRIAL)],
        adCreditCents: 0,
        replacing: null,
        now: PAID_AT,
        firstPaymentCents: TRIAL,
        firstChargeAt: FIRST_CHARGE_AT,
      }),
    ).rejects.toThrow();
  });

  it("leaves an ordinary checkout alone: the monthly amount, one month, no trial", async () => {
    const subscription = await open([line("social-media")]);
    expect(subscription).toMatchObject({ firstPaymentCents: null, firstChargeAt: null });
    await pay(subscription);
    expect((await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_offer"))?.amountCents).toBe(PRICE);
    const [social] = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(social).toMatchObject({ trialPriceCents: null, trialEndsAt: null });
  });
});
