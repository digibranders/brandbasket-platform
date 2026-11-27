import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  businesses,
  findActivePlan,
  findBundledAddOnsForSubscription,
  findPaymentByProviderId,
  findPaymentLinkByTokenHash,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  insertPaymentLink,
  openCheckoutSubscription,
  projects,
  users,
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { eq, openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { activateFirstPayment } from "./server/billing-activation";

// The activation is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/**
 * The website build fee (plan 65) against a real database: a checkout opened with a fee frozen on it is recorded as one payment of the
 * fee and the other services' first month (a monthly deal) or of the fee and every service's year (a yearly one); the website's own
 * first month is not charged on a monthly deal; the invoice carries a build line whose total is what was taken; and the staff payment
 * link the checkout came from is marked paid in the same transaction.
 */

const STAFF = "staff-1";
const MONTH = 299_900;
const ECOMMERCE_MONTH = 399_900;
const YEAR = 3_238_900;
const ECOMMERCE_YEAR = 4_318_900;
const TRIAL = 100;
const PAID_AT = new Date("2026-11-13T07:00:00.000Z");
const MONTH_ON = new Date("2026-12-13T07:00:00.000Z");
const THIRTEEN_MONTHS_ON = new Date("2027-12-13T07:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let plan: Plan;

function line(addOn: string, netCents: number, trialPriceCents: number | null = null): NewBundledAddOn {
  return { addOn, listAmountCents: netCents, offerDiscountAmountCents: 0, netAmountCents: netCents, taxRateBasisPoints: plan.taxRateBasisPoints, trialPriceCents };
}

async function linkFor(tokenHash: string, overrides: Partial<Parameters<typeof insertPaymentLink>[1]> = {}) {
  return insertPaymentLink(dbs.staff.db, {
    tokenHash,
    businessId,
    countryCode: "IN",
    currency: "INR",
    services: ["managed-website", "social-media"],
    billingInterval: "month",
    dealType: "paid",
    advanceCents: 2_500_000,
    websiteKind: "b2b",
    setupFeeListCents: 3_500_000,
    setupFeeDiscountCents: 1_000_000,
    setupFeeNote: "As agreed on call",
    expiresAt: new Date(PAID_AT.getTime() + 7 * 86_400_000),
    createdByStaffId: STAFF,
    ...overrides,
  });
}

function open(
  bundledAddOns: readonly NewBundledAddOn[],
  extra: Partial<Parameters<typeof openCheckoutSubscription>[1]> = {},
): Promise<Subscription> {
  return openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"e".repeat(24)}`,
    referralCodeId: null,
    discountAmountCents: 0,
    bundledAddOns,
    adCreditCents: 0,
    replacing: null,
    now: PAID_AT,
    ...extra,
  });
}

function pay(subscription: Subscription, providerPaymentId = "fake_pay_fee") {
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
  await dbs.staff.db.insert(users).values({ id: STAFF, name: "Staff", email: "staff@example.com" });
  const rows = await dbs.owner.db.insert(businesses).values({ slug: "harbour-bakery", name: "Harbour Bakery", currency: "INR", kind: "listing" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a monthly build-fee deal", () => {
  it("takes the discounted fee and Social's first month, leaves the website's month to the first monthly charge, and invoices the fee", async () => {
    const link = await linkFor("hash-monthly");
    const subscription = await open([line("managed-website", MONTH), line("social-media", MONTH)], {
      firstPaymentCents: 2_500_000 + MONTH,
      firstChargeAt: MONTH_ON,
      websiteKind: "b2b",
      setupFeeListCents: 3_500_000,
      setupFeeDiscountCents: 1_000_000,
      setupFeeNote: "As agreed on call",
      paymentLinkId: link.id,
    });
    // The subscription bills the whole monthly basket, the website included, from the first full charge.
    expect(subscription.bundledAddOnNetCents).toBe(2 * MONTH);

    const activation = await pay(subscription);

    const paid = await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_fee");
    expect(paid).toMatchObject({ kind: "initial", amountCents: 2_500_000 + MONTH, status: "captured" });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ status: "active", paidThroughAt: MONTH_ON, bundledAddOnNetCents: 2 * MONTH });
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.totalCents).toBe(2_500_000 + MONTH);
    expect(invoice?.lines.map((row) => [row.description, row.unitAmountCents, row.discountAmountCents, row.note ?? null])).toEqual([
      ["Website design and build (B2B website)", 3_500_000, 1_000_000, "As agreed on call"],
      ["Social Media Management", MONTH, 0, null],
    ]);
    expect(await findPaymentLinkByTokenHash(dbs.staff.db, "hash-monthly")).toMatchObject({ subscriptionId: subscription.id, paidAt: PAID_AT });
  });

  it("opens the project with the kind of website that was bought", async () => {
    const subscription = await open([line("managed-website", ECOMMERCE_MONTH)], {
      firstPaymentCents: 6_500_000,
      firstChargeAt: MONTH_ON,
      websiteKind: "ecommerce",
      setupFeeListCents: 6_500_000,
      setupFeeDiscountCents: 0,
    });

    await pay(subscription);

    const [project] = await dbs.staff.db.select({ websiteKind: projects.websiteKind }).from(projects).where(eq(projects.businessId, businessId));
    expect(project?.websiteKind).toBe("ecommerce");
  });

  it("charges only the fee for the website alone, invoices only the build line, and still bills the website from the first monthly charge", async () => {
    const subscription = await open([line("managed-website", MONTH)], {
      firstPaymentCents: 3_500_000,
      firstChargeAt: MONTH_ON,
      websiteKind: "b2b",
      setupFeeListCents: 3_500_000,
      setupFeeDiscountCents: 0,
    });

    const activation = await pay(subscription);

    expect((await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_fee"))?.amountCents).toBe(3_500_000);
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.lines.map((row) => [row.description, row.unitAmountCents, row.discountAmountCents])).toEqual([["Website design and build (B2B website)", 3_500_000, 0]]);
    const [website] = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(website).toMatchObject({ addOn: "managed-website", status: "active", netAmountCents: MONTH });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ paidThroughAt: MONTH_ON, bundledAddOnNetCents: MONTH });
  });

  it("takes ₹1 for a Social line on its first-month offer beside the fee", async () => {
    const subscription = await open([line("managed-website", MONTH), line("social-media", MONTH, TRIAL)], {
      firstPaymentCents: 3_500_000 + TRIAL,
      firstChargeAt: MONTH_ON,
      websiteKind: "b2b",
      setupFeeListCents: 3_500_000,
      setupFeeDiscountCents: 0,
    });

    const activation = await pay(subscription);

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.totalCents).toBe(3_500_000 + TRIAL);
    expect(invoice?.lines.map((row) => [row.description, row.unitAmountCents, row.discountAmountCents])).toEqual([
      ["Website design and build (B2B website)", 3_500_000, 0],
      ["Social Media Management", TRIAL, 0],
    ]);
  });
});

describe("a yearly build-fee deal", () => {
  it("takes the fee and every service's year, pays the basket through 13 months on, and prints a year on the service lines", async () => {
    const subscription = await open([line("managed-website", ECOMMERCE_YEAR), line("social-media", YEAR)], {
      billingInterval: "year",
      firstPaymentCents: 5_000_000 + ECOMMERCE_YEAR + YEAR,
      firstChargeAt: THIRTEEN_MONTHS_ON,
      websiteKind: "ecommerce",
      setupFeeListCents: 6_500_000,
      setupFeeDiscountCents: 1_500_000,
      setupFeeNote: "Annual deal",
    });

    const activation = await pay(subscription);

    expect((await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_fee"))?.amountCents).toBe(5_000_000 + ECOMMERCE_YEAR + YEAR);
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ status: "active", paidThroughAt: THIRTEEN_MONTHS_ON });
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.totalCents).toBe(5_000_000 + ECOMMERCE_YEAR + YEAR);
    expect(invoice?.lines.map((row) => row.description)).toEqual(["Website design and build (Ecommerce store)", "Website Management", "Social Media Management"]);
  });
});

describe("a fee waived in full", () => {
  it("is the ordinary checkout: the monthly price, no free month, and an invoice that says the fee was waived", async () => {
    const subscription = await open([line("managed-website", MONTH)], {
      websiteKind: "b2b",
      setupFeeListCents: 3_500_000,
      setupFeeDiscountCents: 3_500_000,
      setupFeeNote: "Launch customer",
    });
    expect(subscription.firstPaymentCents).toBeNull();

    const activation = await pay(subscription);

    expect((await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_fee"))?.amountCents).toBe(MONTH);
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.lines).toHaveLength(1);
    expect(invoice?.lines[0]).toMatchObject({ description: "Website Management", unitAmountCents: MONTH });
    expect(invoice?.lines[0]?.note).toBe("Website build fee waived. Launch customer");
  });
});

describe("what the activation refuses", () => {
  it("refuses a first payment that does not agree with the lines and the fee, and records nothing", async () => {
    const subscription = await open([line("managed-website", MONTH)], {
      firstPaymentCents: 3_400_000,
      firstChargeAt: MONTH_ON,
      websiteKind: "b2b",
      setupFeeListCents: 3_500_000,
      setupFeeDiscountCents: 0,
    });

    await expect(pay(subscription)).rejects.toThrow("froze a first payment of 3400000");
    expect(await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_fee")).toBeNull();
  });

  it("is recorded once however many times the payment is reported, and the link stays paid by the same subscription", async () => {
    const link = await linkFor("hash-twice");
    const subscription = await open([line("managed-website", MONTH)], {
      firstPaymentCents: 2_500_000,
      firstChargeAt: MONTH_ON,
      websiteKind: "b2b",
      setupFeeListCents: 3_500_000,
      setupFeeDiscountCents: 1_000_000,
      paymentLinkId: link.id,
    });

    await pay(subscription);
    expect((await pay(subscription)).alreadyRecorded).toBe(true);
    expect(await findPaymentLinkByTokenHash(dbs.staff.db, "hash-twice")).toMatchObject({ subscriptionId: subscription.id });
  });
});
