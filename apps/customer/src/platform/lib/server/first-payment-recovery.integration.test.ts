import { createFakeBillingProvider, type BillingProvider } from "@brandbasket/billing";
import {
  businesses,
  findActivePlan,
  findBundledAddOnsForSubscription,
  findLatestPaymentMethod,
  findPaymentByProviderId,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  openCheckoutSubscription,
  payments,
  taxInvoices,
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { eq, openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { bundleLines } from "@brandbasket/shared/lib/billing/bundle";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  dbs: null as TestDatabases | null,
  provider: null as BillingProvider | null,
}));

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({
  getStaffDb: () => {
    if (state.dbs === null) throw new Error("The test database is not open");
    return state.dbs.staff.db;
  },
}));
vi.mock("./billing", () => ({
  getBillingProvider: () => {
    if (state.provider === null) throw new Error("The billing provider is not set");
    return state.provider;
  },
  getRazorpayProvider: () => {
    if (state.provider === null) throw new Error("The billing provider is not set");
    return state.provider;
  },
}));
vi.mock("./payload-tenant-sync", () => ({ syncTenantForBusiness: vi.fn() }));
vi.mock("./site-hosting", () => ({ syncSiteHostingForBusiness: vi.fn() }));
vi.mock("./charges", () => ({ recordRazorpayChargePayment: vi.fn() }));
vi.mock("./payment-emails", () => ({ sendPaymentReceipt: vi.fn(async () => undefined) }));
vi.mock("./teams", () => ({ announcePaymentToTeams: vi.fn(async () => undefined), announcePlanStatusToTeams: vi.fn(async () => undefined) }));
vi.mock("./conversions", () => ({ reportFirstPaymentToAds: vi.fn(async () => undefined) }));

import { checkFirstPayments } from "./first-payment-check";
import { handleRazorpayWebhookEvent } from "./razorpay-webhook-handler";

const OPENED_AT = new Date("2026-10-19T00:00:00.000Z");
const ELEVEN_MINUTES_LATER = new Date("2026-10-19T00:11:00.000Z");
const NEXT_MONTH = new Date("2026-11-19T00:00:00.000Z");
const PROVIDER_SUBSCRIPTION = "sub_rzp_ordinary";

function dbs(): TestDatabases {
  if (state.dbs === null) throw new Error("The test database is not open");
  return state.dbs;
}

let businessId = "";
let managed: Plan;

function linesOf(...services: Parameters<typeof bundleLines>[0]): readonly NewBundledAddOn[] {
  return bundleLines(services, managed.currency).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: managed.taxRateBasisPoints,
  }));
}

function openOrdinaryCheckout(subId = PROVIDER_SUBSCRIPTION, now = OPENED_AT): Promise<Subscription> {
  return openCheckoutSubscription(dbs().staff.db, {
    businessId,
    planId: managed.id,
    provider: "razorpay",
    providerSubscriptionId: subId,
    referralCodeId: null,
    discountAmountCents: 0,
    adCreditCents: 0,
    bundledAddOns: linesOf("managed-website"),
    replacing: null,
    now,
  });
}

const VISA_METHOD = {
  method: "card",
  cardNetwork: "Visa",
  cardLast4: "4366",
  cardType: "credit",
  cardIssuer: "HDFC",
  upiVpa: null,
} as const;

beforeAll(() => {
  state.dbs = openTestDatabases();
});

afterAll(async () => {
  await state.dbs?.closeAll();
});

beforeEach(async () => {
  const { owner, staff } = dbs();
  await resetTestDatabase(owner);
  await seedPlansFromMigrations(owner);
  const plan = await findActivePlan(staff.db, "INR", "managed");
  if (plan === null) throw new Error("No active INR services plan was seeded");
  managed = plan;
  const rows = await owner.db.insert(businesses).values({ slug: "qa-first-recovery", name: "QA First Recovery", currency: "INR" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ordinary first payment recovery", () => {
  it("recovers a lost webhook for an ordinary checkout once, recording payment method and issuing invoice", async () => {
    const checkout = await openOrdinaryCheckout();
    expect(checkout.status).toBe("incomplete");
    expect(checkout.activatedAt).toBeNull();
    const checkTime = new Date(checkout.createdAt.getTime() + 11 * 60_000);

    state.provider = {
      ...createFakeBillingProvider({ secret: "test-secret-long-enough-32-chars-00" }),
      name: "razorpay",
      findSubscriptionCharge: async (id) => {
        if (id !== PROVIDER_SUBSCRIPTION) return null;
        return {
          providerPaymentId: "pay_recovered_1",
          amountCents: 299_900,
          currency: "INR",
          paidAt: checkTime,
          currentStart: checkTime,
          currentEnd: NEXT_MONTH,
          method: VISA_METHOD,
        };
      },
    };

    const report = await checkFirstPayments(checkTime);
    expect(report).toEqual({ checked: 1, found: 1, failed: 0 });

    const updated = await findSubscriptionById(dbs().staff.db, checkout.id);
    expect(updated).toMatchObject({
      status: "active",
      activatedAt: checkTime,
    });

    const payment = await findPaymentByProviderId(dbs().staff.db, "razorpay", "pay_recovered_1");
    expect(payment).not.toBeNull();
    expect(payment).toMatchObject({
      amountCents: 299_900,
      currency: "INR",
      attentionReason: null,
    });

    const paymentRows = await dbs().owner.db.select().from(payments).where(eq(payments.providerPaymentId, "pay_recovered_1"));
    expect(paymentRows[0]).toMatchObject({
      amountCents: 299_900,
      currency: "INR",
      method: "card",
      cardNetwork: "Visa",
      cardLast4: "4366",
      cardType: "credit",
      cardIssuer: "HDFC",
      upiVpa: null,
      attentionReason: null,
    });

    const latestMethod = await findLatestPaymentMethod(dbs().staff.db, businessId);
    expect(latestMethod).toEqual(VISA_METHOD);

    const invoice = await findTaxInvoiceByPaymentId(dbs().staff.db, payment?.id ?? "");
    expect(invoice).not.toBeNull();
    expect(invoice?.totalCents).toBe(299_900);

    const lines = await findBundledAddOnsForSubscription(dbs().staff.db, checkout.id);
    expect(lines.map((l) => [l.addOn, l.status])).toEqual([["managed-website", "active"]]);
  });

  it("records one payment and one invoice when running twice", async () => {
    const checkout = await openOrdinaryCheckout();
    const checkTime = new Date(checkout.createdAt.getTime() + 11 * 60_000);

    state.provider = {
      ...createFakeBillingProvider({ secret: "test-secret-long-enough-32-chars-00" }),
      name: "razorpay",
      findSubscriptionCharge: async () => ({
        providerPaymentId: "pay_twice",
        amountCents: 299_900,
        currency: "INR",
        paidAt: checkTime,
        currentStart: checkTime,
        currentEnd: NEXT_MONTH,
        method: VISA_METHOD,
      }),
    };

    const report1 = await checkFirstPayments(checkTime);
    expect(report1).toEqual({ checked: 1, found: 1, failed: 0 });

    const report2 = await checkFirstPayments(new Date(checkTime.getTime() + 60_000));
    expect(report2).toEqual({ checked: 0, found: 0, failed: 0 });

    const paymentRows = await dbs().owner.db.select().from(payments).where(eq(payments.providerPaymentId, "pay_twice"));
    expect(paymentRows).toHaveLength(1);

    const invoiceRows = await dbs().owner.db.select().from(taxInvoices).where(eq(taxInvoices.paymentId, paymentRows[0]?.id ?? ""));
    expect(invoiceRows).toHaveLength(1);
  });

  it("does not activate a subscription when there is a flagged amount mismatch", async () => {
    const checkout = await openOrdinaryCheckout();
    const checkTime = new Date(checkout.createdAt.getTime() + 11 * 60_000);

    state.provider = {
      ...createFakeBillingProvider({ secret: "test-secret-long-enough-32-chars-00" }),
      name: "razorpay",
      findSubscriptionCharge: async () => ({
        providerPaymentId: "pay_mismatch",
        amountCents: 100_000,
        currency: "INR",
        paidAt: checkTime,
        currentStart: checkTime,
        currentEnd: NEXT_MONTH,
        method: VISA_METHOD,
      }),
    };

    const report = await checkFirstPayments(checkTime);
    expect(report).toEqual({ checked: 1, found: 1, failed: 0 });

    const afterCheck = await findSubscriptionById(dbs().staff.db, checkout.id);
    expect(afterCheck?.status).toBe("incomplete");
    expect(afterCheck?.activatedAt).toBeNull();

    const payment = await findPaymentByProviderId(dbs().staff.db, "razorpay", "pay_mismatch");
    expect(payment).not.toBeNull();
    expect(payment?.attentionReason).toBe("amount_mismatch");

    const invoice = await findTaxInvoiceByPaymentId(dbs().staff.db, payment?.id ?? "");
    expect(invoice).toBeNull();
  });

  it("records one payment during concurrent delivery (webhook and job at once)", async () => {
    const checkout = await openOrdinaryCheckout();

    state.provider = {
      ...createFakeBillingProvider({ secret: "test-secret-long-enough-32-chars-00" }),
      name: "razorpay",
      findSubscriptionCharge: async () => ({
        providerPaymentId: "pay_concurrent",
        amountCents: 299_900,
        currency: "INR",
        paidAt: ELEVEN_MINUTES_LATER,
        currentStart: ELEVEN_MINUTES_LATER,
        currentEnd: NEXT_MONTH,
        method: VISA_METHOD,
      }),
    };

    const webhookEvent = {
      kind: "charged" as const,
      subscriptionId: PROVIDER_SUBSCRIPTION,
      paymentId: "pay_concurrent",
      amountCents: 299_900,
      currency: "INR" as const,
      paidAt: ELEVEN_MINUTES_LATER,
      currentStart: ELEVEN_MINUTES_LATER,
      currentEnd: NEXT_MONTH,
      method: VISA_METHOD,
    };

    await Promise.all([
      handleRazorpayWebhookEvent(webhookEvent),
      checkFirstPayments(ELEVEN_MINUTES_LATER),
    ]);

    const paymentRows = await dbs().owner.db.select().from(payments).where(eq(payments.providerPaymentId, "pay_concurrent"));
    expect(paymentRows).toHaveLength(1);

    const invoiceRows = await dbs().owner.db.select().from(taxInvoices).where(eq(taxInvoices.paymentId, paymentRows[0]?.id ?? ""));
    expect(invoiceRows).toHaveLength(1);

    const subscription = await findSubscriptionById(dbs().staff.db, checkout.id);
    expect(subscription?.status).toBe("active");
    expect(subscription?.activatedAt).not.toBeNull();
  });
});
