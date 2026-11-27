import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  businesses,
  findActivePlan,
  findBundledAddOnsForSubscription,
  findPaymentByProviderId,
  findPaymentLinkByTokenHash,
  listPriceOverridesForBusiness,
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
 * A free staff deal with custom prices (plan 66) against a real database: the checkout is opened with the link's prices frozen on its
 * lines, the first payment is the custom website price and Social's ₹1 first month, no build line is invoiced, the link's custom prices
 * are kept as business_price_overrides in the same transaction as the payment, and the renewal amount is the frozen custom one.
 */

const STAFF = "staff-1";
const MONTH = 299_900;
const ECOMMERCE_MONTH = 399_900;
const YEAR = 3_238_900;
const ECOMMERCE_YEAR = 4_318_900;
const TRIAL = 100;
const CUSTOM_WEBSITE = 199_900;
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
    dealType: "free",
    websiteKind: "b2b",
    websitePriceCents: CUSTOM_WEBSITE,
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

describe("a free deal with a custom website price", () => {
  it("takes the custom price and Social's first month, invoices no build, keeps the prices, and renews at the custom amount", async () => {
    const link = await linkFor("hash-free");
    const subscription = await open([line("managed-website", CUSTOM_WEBSITE), line("social-media", MONTH, TRIAL)], {
      firstPaymentCents: CUSTOM_WEBSITE + TRIAL,
      firstChargeAt: MONTH_ON,
      websiteKind: "b2b",
      paymentLinkId: link.id,
    });
    // What the provider bills from the first full charge, and what every renewal check compares with: the custom price, not the list one.
    expect(subscription.bundledAddOnNetCents).toBe(CUSTOM_WEBSITE + MONTH);

    const activation = await pay(subscription);

    expect(await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_fee")).toMatchObject({ kind: "initial", amountCents: 200_000, status: "captured" });
    expect(await findSubscriptionById(dbs.staff.db, subscription.id)).toMatchObject({ status: "active", paidThroughAt: MONTH_ON, bundledAddOnNetCents: CUSTOM_WEBSITE + MONTH });
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.totalCents).toBe(200_000);
    expect(invoice?.lines.map((row) => row.description)).not.toContain("Website design and build (B2B website)");
    const bundled = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    expect(bundled.map((row) => [row.addOn, row.netAmountCents])).toEqual(expect.arrayContaining([["managed-website", CUSTOM_WEBSITE], ["social-media", MONTH]]));
    expect(await findPaymentLinkByTokenHash(dbs.staff.db, "hash-free")).toMatchObject({ subscriptionId: subscription.id, paidAt: PAID_AT });
    const overrides = await listPriceOverridesForBusiness(dbs.staff.db, businessId);
    expect(overrides.map((row) => [row.addOn, row.billingInterval, row.netCents, row.paymentLinkId])).toEqual([["managed-website", "month", CUSTOM_WEBSITE, link.id]]);
  });

  it("refuses a first payment that does not match the frozen lines", async () => {
    const link = await linkFor("hash-wrong");
    const subscription = await open([line("managed-website", CUSTOM_WEBSITE), line("social-media", MONTH, TRIAL)], {
      firstPaymentCents: MONTH + TRIAL,
      firstChargeAt: MONTH_ON,
      websiteKind: "b2b",
      paymentLinkId: link.id,
    });
    await expect(pay(subscription)).rejects.toThrow(/froze a first payment/);
  });

  it("keeps no override for a link with list prices", async () => {
    const link = await linkFor("hash-list", { websitePriceCents: null });
    // No trial line: the checkout is the ordinary one, with no frozen first payment.
    const ordinary = await open([line("managed-website", MONTH)], { websiteKind: "b2b", paymentLinkId: link.id });
    await pay(ordinary);
    expect(await listPriceOverridesForBusiness(dbs.staff.db, businessId)).toEqual([]);
  });
});
