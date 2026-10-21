import { createFakeBillingProvider, type BillingProvider } from "@brandbasket/billing";
import {
  businesses,
  createAffiliate,
  createReferralCode,
  findActivePlan,
  findBundledAddOnsForSubscription,
  findPaymentByProviderId,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  listAffiliateEarnings,
  openCheckoutSubscription,
  subscriptions,
  users,
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { openTestDatabases, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { bundleLines } from "@brandbasket/shared/lib/billing/bundle";
import { activateFirstPayment } from "@brandbasket/shared/server/billing-activation";
import { finishAddOnAfterPayment, removeBundledAddOn, startAddOn, type BasketDeps } from "@brandbasket/shared/server/basket-change";
import { recordChargePaymentWithInvoice } from "@brandbasket/shared/server/charge-payments";
import { ensureDiscountPlanFor } from "@brandbasket/shared/server/discount-plans";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A renewal after a change to the services, through the real webhook handler and a real database: the amount it accepts,
 * and the invoice it issues, which must add up to what Razorpay took, line by line.
 */

const state = vi.hoisted(() => ({ dbs: null as TestDatabases | null }));
vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({
  getStaffDb: () => {
    if (state.dbs === null) throw new Error("The test database is not open");
    return state.dbs.staff.db;
  },
}));
vi.mock("./billing", () => ({ getRazorpayProvider: () => ({ name: "razorpay", fetchSubscriptionStatus: vi.fn() }) }));
vi.mock("./payload-tenant-sync", () => ({ syncTenantForBusiness: vi.fn() }));
vi.mock("./charges", () => ({ recordRazorpayChargePayment: vi.fn() }));

import { handleRazorpayWebhookEvent } from "./razorpay-webhook-handler";

const PAID_AT = new Date("2026-10-19T00:00:00.000Z");
const FIFTH_NOV = new Date("2026-11-05T06:00:00.000Z");
const RENEWS_AT = new Date("2026-11-19T00:00:00.000Z");
const NEXT_RENEWAL = new Date("2026-12-19T00:00:00.000Z");
const PROVIDER_SUBSCRIPTION = "sub_rzp_services";

function dbs(): TestDatabases {
  if (state.dbs === null) throw new Error("The test database is not open");
  return state.dbs;
}

let businessId = "";
let managed: Plan;

/** The provider the shared basket code talks to: Razorpay by name, since the subscription is Razorpay's. */
function razorpay(): BillingProvider {
  const real = createFakeBillingProvider({ secret: "a-test-secret-that-is-long-enough-000", now: () => FIFTH_NOV });
  return {
    ...real,
    name: "razorpay",
    // Razorpay always has a plan of its own to move to; the fake one has none.
    createPlan: async (input) => ({ providerPlanId: `plan_${input.code}` }),
    changeSubscriptionPlanAtPeriodEnd: async () => undefined,
  };
}

function deps(): BasketDeps {
  return { staffDb: dbs().staff.db, provider: razorpay(), ensureDiscountPlan: (p, plan, discount, net) => ensureDiscountPlanFor(dbs().staff.db, p, plan, discount, net) };
}

function linesOf(...services: Parameters<typeof bundleLines>[0]): readonly NewBundledAddOn[] {
  return bundleLines(services, managed.currency).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: managed.taxRateBasisPoints,
  }));
}

/** A Razorpay subscription paid on 19 Oct for the given services. */
async function paidSubscription(services: readonly NewBundledAddOn[], options: { readonly referralCodeId?: string; readonly discountAmountCents?: number } = {}): Promise<Subscription> {
  const db = dbs().staff.db;
  const opened = await openCheckoutSubscription(db, {
    businessId,
    planId: managed.id,
    provider: "razorpay",
    providerSubscriptionId: PROVIDER_SUBSCRIPTION,
    referralCodeId: options.referralCodeId ?? null,
    discountAmountCents: options.discountAmountCents ?? 0,
    adCreditCents: 0,
    bundledAddOns: services,
    replacing: null,
    now: PAID_AT,
  });
  await db.transaction((tx) =>
    activateFirstPayment(tx, {
      businessId,
      subscriptionId: opened.id,
      plan: managed,
      provider: "razorpay",
      providerPaymentId: "pay_first",
      paidAt: PAID_AT,
      discountAmountCents: options.discountAmountCents ?? 0,
    }),
  );
  const paid = await findSubscriptionById(db, opened.id);
  if (paid === null) throw new Error("The first payment left no subscription");
  return paid;
}

/** The customer adds a service, pays its charge for the rest of the month, and the provider is told. */
async function addAndPay(addOn: Parameters<typeof startAddOn>[1]["addOn"]): Promise<void> {
  const started = await startAddOn(deps(), { businessId, addOn, staffId: null, now: FIFTH_NOV });
  if (started.kind !== "pay") throw new Error(`Expected a charge, got ${started.kind}`);
  const charge = await dbs().staff.db.query.charges.findFirst({ where: (table, { eq }) => eq(table.id, started.chargeId) });
  if (charge === undefined) throw new Error("The charge was not written");
  await dbs().staff.db.transaction((tx) =>
    recordChargePaymentWithInvoice(tx, {
      chargeId: charge.id,
      businessId,
      provider: "fake",
      providerPaymentId: `fake_pay_${addOn}`,
      amountCents: charge.amountCents,
      currency: charge.currency,
      paidAt: FIFTH_NOV,
      now: FIFTH_NOV,
    }),
  );
  expect(await finishAddOnAfterPayment(deps(), { businessId, chargeId: started.chargeId, now: FIFTH_NOV })).toEqual({ kind: "scheduled" });
}

/** Razorpay takes the monthly charge on the cycle date. */
async function renew(amountCents: number): Promise<void> {
  await handleRazorpayWebhookEvent({
    kind: "charged",
    subscriptionId: PROVIDER_SUBSCRIPTION,
    paymentId: "pay_renewal",
    amountCents,
    currency: "INR",
    paidAt: RENEWS_AT,
    currentStart: RENEWS_AT,
    currentEnd: NEXT_RENEWAL,
    method: null,
  });
}

async function renewalInvoice() {
  const payment = await findPaymentByProviderId(dbs().staff.db, "razorpay", "pay_renewal");
  if (payment === null) throw new Error("The renewal was not recorded");
  const invoice = await findTaxInvoiceByPaymentId(dbs().staff.db, payment.id);
  if (invoice === null) throw new Error("The renewal was recorded without a tax invoice");
  return { payment, invoice };
}

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
  const rows = await owner.db.insert(businesses).values({ slug: "qa-renewal", name: "QA Renewal", currency: "INR" }).returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("a renewal after a service was added", () => {
  it("is accepted at the package price, ₹12,269.64, and invoiced line by line to the same total", async () => {
    const subscription = await paidSubscription(linesOf("managed-website"));
    await addAndPay("digital-growth");

    await renew(1_226_964);

    const { payment, invoice } = await renewalInvoice();
    expect(payment).toMatchObject({ amountCents: 1_226_964, attentionReason: null });
    expect(invoice.totalCents).toBe(1_226_964);
    expect(invoice.lines.map((line) => [line.description, line.unitAmountCents, line.discountAmountCents])).toEqual([
      ["Managed Website", 299_900, 59_980],
      ["Social Media and Ads", 999_900, 200_020],
    ]);
    expect(await findSubscriptionById(dbs().staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 1_039_800, pendingBundledAddOnNetCents: null, paidThroughAt: NEXT_RENEWAL });
  });

  it("issues its invoice for a service that took over from a referral code and a stay offer, which had been frozen on the subscription", async () => {
    await dbs().owner.db.insert(users).values({ id: "staff-code", name: "Staff", email: "staff-code@example.test", emailVerified: true });
    const code = await createReferralCode(dbs().staff.db, {
      code: "GAURAV",
      currency: "INR",
      affiliateId: null,
      discount: { kind: "amount", amountCents: 30_000 },
      expiresAt: null,
      maxRedemptions: null,
      createdByStaffId: "staff-code",
    });
    const subscription = await paidSubscription(linesOf("managed-website"), { referralCodeId: code.id, discountAmountCents: 30_000 });
    await dbs().owner.db.update(subscriptions).set({ retentionDiscountCents: 10_000 });
    await addAndPay("digital-growth");

    await renew(1_226_964);

    const { invoice } = await renewalInvoice();
    expect(invoice.totalCents).toBe(1_226_964);
    expect(await findSubscriptionById(dbs().staff.db, subscription.id)).toMatchObject({ discountAmountCents: 0, retentionDiscountCents: 0 });
  });
});

describe("a renewal after a service was dropped from a package", () => {
  it("is accepted at list prices, ₹15,337.64, and invoiced line by line with no discount, the dropped service gone", async () => {
    const subscription = await paidSubscription(linesOf("managed-website", "digital-growth", "local-seo-aeo"));
    expect(await removeBundledAddOn(deps(), { businessId, addOn: "local-seo-aeo", now: FIFTH_NOV })).toMatchObject({ kind: "scheduled" });

    await renew(1_533_764);

    const { payment, invoice } = await renewalInvoice();
    expect(payment).toMatchObject({ amountCents: 1_533_764, attentionReason: null });
    expect(invoice.totalCents).toBe(1_533_764);
    expect(invoice.lines.map((line) => [line.description, line.unitAmountCents, line.discountAmountCents])).toEqual([
      ["Managed Website", 299_900, 0],
      ["Social Media and Ads", 999_900, 0],
    ]);
    const rows = await findBundledAddOnsForSubscription(dbs().staff.db, subscription.id);
    expect(rows.map((row) => [row.addOn, row.status, row.netAmountCents])).toEqual([
      ["managed-website", "active", 299_900],
      ["digital-growth", "active", 999_900],
      ["local-seo-aeo", "removed", 1_749_840],
    ]);
    expect(await findSubscriptionById(dbs().staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 1_299_800, pendingBundledAddOnNetCents: null });
  });

  it("flags the payment for staff when the provider had not moved and the old amount arrives", async () => {
    await paidSubscription(linesOf("managed-website", "digital-growth", "local-seo-aeo"));
    await removeBundledAddOn(deps(), { businessId, addOn: "local-seo-aeo", now: FIFTH_NOV });

    await renew(3_138_446);

    const { payment, invoice } = await renewalInvoice();
    expect(payment.attentionReason).toBe("add_on_provider_pending");
    expect(invoice.totalCents).toBe(3_138_446);
  });
});

describe("the affiliate's earning on a renewal after a change to the services", () => {
  /** An affiliate on 5% of what the member pays before GST, and a code of theirs that takes ₹300 off. */
  async function seedAffiliateCode(): Promise<{ readonly affiliateId: string; readonly codeId: string }> {
    await dbs().owner.db.insert(users).values({ id: "staff-code", name: "Staff", email: "staff-code@example.test", emailVerified: true });
    const affiliate = await createAffiliate(dbs().staff.db, {
      name: "Asha Nair",
      email: "asha@example.com",
      phone: null,
      reward: { kind: "percent", basisPoints: 500 },
      rewardCurrency: null,
      rewardCycles: null,
      notes: null,
      createdByStaffId: "staff-code",
    });
    const code = await createReferralCode(dbs().staff.db, {
      code: "ASHA",
      currency: "INR",
      affiliateId: affiliate.id,
      discount: { kind: "amount", amountCents: 30_000 },
      expiresAt: null,
      maxRedemptions: null,
      createdByStaffId: "staff-code",
    });
    return { affiliateId: affiliate.id, codeId: code.id };
  }

  it("is worked out on the package price the renewal charged when a service was added", async () => {
    const { affiliateId, codeId } = await seedAffiliateCode();
    await paidSubscription(linesOf("digital-growth"), { referralCodeId: codeId, discountAmountCents: 30_000 });
    await addAndPay("local-seo-aeo");

    await renew(2_890_764);

    // 5% of Social + SEO at the package price, ₹24,498, not of the Social line the subscription held until this payment.
    expect(await listAffiliateEarnings(dbs().staff.db, affiliateId, 10)).toMatchObject([
      { paymentKind: "renewal", basisCents: 2_449_800, amountCents: 122_490 },
      { paymentKind: "initial", basisCents: 969_900 },
    ]);
  });

  it("is worked out on the list prices the renewal charged when a service was dropped from a package", async () => {
    const { affiliateId, codeId } = await seedAffiliateCode();
    await paidSubscription(linesOf("managed-website", "digital-growth", "local-seo-aeo"), { referralCodeId: codeId });
    expect(await removeBundledAddOn(deps(), { businessId, addOn: "local-seo-aeo", now: FIFTH_NOV })).toMatchObject({ kind: "scheduled" });

    await renew(1_533_764);

    // 5% of Website + Social at list, ₹12,998, not of the three services the subscription held until this payment.
    expect(await listAffiliateEarnings(dbs().staff.db, affiliateId, 10)).toMatchObject([
      { paymentKind: "renewal", basisCents: 1_299_800, amountCents: 64_990 },
      { paymentKind: "initial", basisCents: 2_659_700 },
    ]);
  });
});
