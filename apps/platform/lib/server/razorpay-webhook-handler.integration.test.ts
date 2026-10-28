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
  payments,
  subscriptions,
  taxInvoices,
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
vi.mock("./site-hosting", () => ({ syncSiteHostingForBusiness: vi.fn() }));
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
async function paidSubscription(
  services: readonly NewBundledAddOn[],
  options: { readonly referralCodeId?: string; readonly discountAmountCents?: number; readonly discountMonthsLeft?: number } = {},
): Promise<Subscription> {
  const db = dbs().staff.db;
  const opened = await openCheckoutSubscription(db, {
    businessId,
    planId: managed.id,
    provider: "razorpay",
    providerSubscriptionId: PROVIDER_SUBSCRIPTION,
    referralCodeId: options.referralCodeId ?? null,
    discountAmountCents: options.discountAmountCents ?? 0,
    ...(options.discountMonthsLeft === undefined ? {} : { discountMonthsLeft: options.discountMonthsLeft }),
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

/** The customer adds a service and pays its charge for the rest of the month; the provider has not been told yet. */
async function addAndPayWithoutProviderStep(addOn: Parameters<typeof startAddOn>[1]["addOn"]): Promise<string> {
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
  return started.chargeId;
}

/** The customer adds a service, pays its charge for the rest of the month, and the provider is told. */
async function addAndPay(addOn: Parameters<typeof startAddOn>[1]["addOn"]): Promise<void> {
  const chargeId = await addAndPayWithoutProviderStep(addOn);
  expect(await finishAddOnAfterPayment(deps(), { businessId, chargeId, now: FIFTH_NOV })).toEqual({ kind: "scheduled" });
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
  it("is accepted at the package price, ₹11,699, and invoiced line by line to the same total", async () => {
    const subscription = await paidSubscription(linesOf("managed-website"));
    await addAndPay("digital-growth");

    await renew(1_169_900);

    const { payment, invoice } = await renewalInvoice();
    expect(payment).toMatchObject({ amountCents: 1_169_900, attentionReason: null });
    expect(invoice.totalCents).toBe(1_169_900);
    expect(invoice.lines.map((line) => [line.description, line.unitAmountCents, line.discountAmountCents])).toEqual([
      ["Managed Website", 299_900, 29_990],
      ["Social Media and Ads", 999_900, 99_910],
    ]);
    expect(await findSubscriptionById(dbs().staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 1_169_900, pendingBundledAddOnNetCents: null, paidThroughAt: NEXT_RENEWAL });
  });

  it("promotes the services once, records one payment and issues one invoice when the same renewal is delivered twice", async () => {
    const subscription = await paidSubscription(linesOf("managed-website"));
    await addAndPay("digital-growth");

    await renew(1_169_900);
    await renew(1_169_900);

    const recorded = (await dbs().owner.db.select().from(payments)).filter((payment) => payment.providerPaymentId === "pay_renewal");
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject({ amountCents: 1_169_900, attentionReason: null });
    expect((await dbs().owner.db.select().from(taxInvoices)).filter((row) => row.paymentId === recorded[0]?.id)).toHaveLength(1);
    const { invoice } = await renewalInvoice();
    expect(invoice.totalCents).toBe(recorded[0]?.amountCents);
    expect(await findSubscriptionById(dbs().staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 1_169_900, pendingBundledAddOnNetCents: null, paidThroughAt: NEXT_RENEWAL });
    const rows = await findBundledAddOnsForSubscription(dbs().staff.db, subscription.id);
    expect(rows.map((row) => [row.addOn, row.status])).toEqual([
      ["managed-website", "active"],
      ["digital-growth", "active"],
    ]);
  });

  it("keeps an amount code through the add, and invoices its discount over both lines with the stay offer frozen beside it", async () => {
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

    // The pair costs 11,699; less the 300 the code still takes.
    const charged = 1_139_900;
    await renew(charged);

    const { invoice } = await renewalInvoice();
    expect(invoice.totalCents).toBe(charged);
    expect(await findSubscriptionById(dbs().staff.db, subscription.id)).toMatchObject({ discountAmountCents: 30_000, retentionDiscountCents: 10_000, nextDiscountAmountCents: null });
  });

  it("takes a percentage code at the discount repriced on the new basket, and makes it the subscription's own", async () => {
    await dbs().owner.db.insert(users).values({ id: "staff-code", name: "Staff", email: "staff-code@example.test", emailVerified: true });
    const code = await createReferralCode(dbs().staff.db, {
      code: "TENOFF",
      currency: "INR",
      affiliateId: null,
      discount: { kind: "percent", basisPoints: 1_000 },
      discountMonths: 5,
      expiresAt: null,
      maxRedemptions: null,
      createdByStaffId: "staff-code",
    });
    const subscription = await paidSubscription(linesOf("managed-website"), { referralCodeId: code.id, discountAmountCents: 29_990, discountMonthsLeft: 5 });
    await addAndPay("digital-growth");
    expect(await findSubscriptionById(dbs().staff.db, subscription.id)).toMatchObject({ discountAmountCents: 29_990, nextDiscountAmountCents: 116_990, discountMonthsLeft: 4 });

    // The old discounted amount would not be accepted without a flag; the new one is, and counts a month.
    // 10% of the pair's 11,699 is 1,169.90.
    const charged = 1_052_910;
    await renew(charged);

    const { payment, invoice } = await renewalInvoice();
    expect(payment).toMatchObject({ amountCents: charged, attentionReason: null });
    expect(invoice.totalCents).toBe(charged);
    expect(await findSubscriptionById(dbs().staff.db, subscription.id)).toMatchObject({ discountAmountCents: 116_990, nextDiscountAmountCents: null, discountMonthsLeft: 3 });
  });
});

describe("a renewal at the amount the provider was told, when the database never recorded the move", () => {
  // The provider is moved first and the lines are recorded after it agrees; a failure in between leaves the provider on the
  // package price while the subscription still holds the amount worked out when the service was paid for.

  it("is accepted at the package price when a service was added to a package, and the lines move with it", async () => {
    const subscription = await paidSubscription(linesOf("managed-website", "digital-growth"));
    await addAndPayWithoutProviderStep("local-seo-aeo");

    await renew(3_039_800);

    const { payment, invoice } = await renewalInvoice();
    expect(payment).toMatchObject({ amountCents: 3_039_800, attentionReason: null });
    expect(invoice.totalCents).toBe(3_039_800);
    expect(invoice.lines.map((line) => [line.description, line.discountAmountCents])).toEqual([
      ["Managed Website", 59_980],
      ["Social Media and Ads", 199_980],
      ["Local SEO + AEO", 499_940],
    ]);
    expect(await findSubscriptionById(dbs().staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 3_039_800, pendingBundledAddOnNetCents: null, paidThroughAt: NEXT_RENEWAL });
    const rows = await findBundledAddOnsForSubscription(dbs().staff.db, subscription.id);
    expect(rows.map((row) => [row.addOn, row.netAmountCents, row.pendingOfferDiscountAmountCents])).toEqual([
      ["managed-website", 239_920, null],
      ["digital-growth", 799_920, null],
      ["local-seo-aeo", 1_999_960, null],
    ]);
  });

  it("is accepted for a coded single service that took a second service, at the amount code it keeps", async () => {
    await dbs().owner.db.insert(users).values({ id: "staff-code", name: "Staff", email: "staff-code@example.test", emailVerified: true });
    const code = await createReferralCode(dbs().staff.db, {
      code: "ASHA",
      currency: "INR",
      affiliateId: null,
      discount: { kind: "amount", amountCents: 30_000 },
      expiresAt: null,
      maxRedemptions: null,
      createdByStaffId: "staff-code",
    });
    const subscription = await paidSubscription(linesOf("digital-growth"), { referralCodeId: code.id, discountAmountCents: 30_000 });
    await addAndPayWithoutProviderStep("local-seo-aeo");

    // Social + SEO at the package price cost 31,499; less the 300 the code takes.
    const charged = 3_119_900;
    await renew(charged);

    const { payment, invoice } = await renewalInvoice();
    expect(payment).toMatchObject({ amountCents: charged, attentionReason: null });
    expect(invoice.totalCents).toBe(charged);
    expect(await findSubscriptionById(dbs().staff.db, subscription.id)).toMatchObject({ discountAmountCents: 30_000, bundledAddOnNetCents: 3_149_900, pendingBundledAddOnNetCents: null });
  });

  it("is accepted for a percentage code at the discount the provider was told for the new basket, which the database never recorded", async () => {
    await dbs().owner.db.insert(users).values({ id: "staff-code", name: "Staff", email: "staff-code@example.test", emailVerified: true });
    const code = await createReferralCode(dbs().staff.db, {
      code: "TENOFF",
      currency: "INR",
      affiliateId: null,
      discount: { kind: "percent", basisPoints: 1_000 },
      expiresAt: null,
      maxRedemptions: null,
      createdByStaffId: "staff-code",
    });
    const subscription = await paidSubscription(linesOf("digital-growth"), { referralCodeId: code.id, discountAmountCents: 99_990 });
    await addAndPayWithoutProviderStep("local-seo-aeo");
    expect(await findSubscriptionById(dbs().staff.db, subscription.id)).toMatchObject({ nextDiscountAmountCents: null });

    // 10% of the 31,499 the pair costs is 3,149.90.
    const charged = 2_834_910;
    await renew(charged);

    const { payment, invoice } = await renewalInvoice();
    expect(payment).toMatchObject({ amountCents: charged, attentionReason: null });
    expect(invoice.totalCents).toBe(charged);
    expect(await findSubscriptionById(dbs().staff.db, subscription.id)).toMatchObject({ discountAmountCents: 314_990, nextDiscountAmountCents: null, pendingBundledAddOnNetCents: null });
  });

  it("still refuses an amount that is neither the pending one nor the one the provider was told", async () => {
    const subscription = await paidSubscription(linesOf("managed-website", "digital-growth"));
    await addAndPayWithoutProviderStep("local-seo-aeo");

    await renew(3_039_801);

    const payment = await findPaymentByProviderId(dbs().staff.db, "razorpay", "pay_renewal");
    expect(payment).toMatchObject({ attentionReason: "amount_mismatch" });
    expect(await findTaxInvoiceByPaymentId(dbs().staff.db, payment?.id ?? "")).toBeNull();
    expect(await findSubscriptionById(dbs().staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 1_169_900, paidThroughAt: subscription.paidThroughAt });
  });
});

describe("a renewal after a service was dropped from a package", () => {
  it("is accepted at list prices, ₹12,998, and invoiced line by line with no discount, the dropped service gone", async () => {
    const subscription = await paidSubscription(linesOf("managed-website", "digital-growth", "local-seo-aeo"));
    expect(await removeBundledAddOn(deps(), { businessId, addOn: "local-seo-aeo", now: FIFTH_NOV })).toMatchObject({ kind: "scheduled" });

    await renew(1_299_800);

    const { payment, invoice } = await renewalInvoice();
    expect(payment).toMatchObject({ amountCents: 1_299_800, attentionReason: null });
    expect(invoice.totalCents).toBe(1_299_800);
    expect(invoice.lines.map((line) => [line.description, line.unitAmountCents, line.discountAmountCents])).toEqual([
      ["Managed Website", 299_900, 0],
      ["Social Media and Ads", 999_900, 0],
    ]);
    const rows = await findBundledAddOnsForSubscription(dbs().staff.db, subscription.id);
    expect(rows.map((row) => [row.addOn, row.status, row.netAmountCents])).toEqual([
      ["managed-website", "active", 299_900],
      ["digital-growth", "active", 999_900],
      ["local-seo-aeo", "removed", 1_999_960],
    ]);
    expect(await findSubscriptionById(dbs().staff.db, subscription.id)).toMatchObject({ bundledAddOnNetCents: 1_299_800, pendingBundledAddOnNetCents: null });
  });

  it("flags the payment for staff when the provider had not moved and the old amount arrives", async () => {
    await paidSubscription(linesOf("managed-website", "digital-growth", "local-seo-aeo"));
    await removeBundledAddOn(deps(), { businessId, addOn: "local-seo-aeo", now: FIFTH_NOV });

    await renew(3_039_800);

    const { payment, invoice } = await renewalInvoice();
    expect(payment.attentionReason).toBe("add_on_provider_pending");
    expect(invoice.totalCents).toBe(3_039_800);
  });
});

describe("the affiliate's earning on a renewal after a change to the services", () => {
  /** An affiliate on 5% of what the member pays, GST included, and a code of theirs that takes ₹300 off. */
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

    await renew(3_119_900);

    // 5% of Social + SEO at the package price, ₹31,499, less the ₹300 the code still takes, so ₹31,199: not of the Social
    // line the subscription held until this payment. The first payment was ₹9,699.
    expect(await listAffiliateEarnings(dbs().staff.db, affiliateId, 10)).toMatchObject([
      { paymentKind: "renewal", basisCents: 3_119_900, amountCents: 155_995 },
      { paymentKind: "initial", basisCents: 969_900 },
    ]);
  });

  it("is worked out on the list prices the renewal charged when a service was dropped from a package", async () => {
    const { affiliateId, codeId } = await seedAffiliateCode();
    await paidSubscription(linesOf("managed-website", "digital-growth", "local-seo-aeo"), { referralCodeId: codeId, discountAmountCents: 30_000 });
    expect(await removeBundledAddOn(deps(), { businessId, addOn: "local-seo-aeo", now: FIFTH_NOV })).toMatchObject({ kind: "scheduled" });

    await renew(1_269_800);

    // 5% of Website + Social at list, ₹12,998, less the ₹300 the code still takes, so ₹12,698: not of the three services
    // the subscription held until this payment. The first payment was ₹30,098.
    expect(await listAffiliateEarnings(dbs().staff.db, affiliateId, 10)).toMatchObject([
      { paymentKind: "renewal", basisCents: 1_269_800, amountCents: 63_490 },
      { paymentKind: "initial", basisCents: 3_009_800 },
    ]);
  });
});
