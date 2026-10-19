import { randomUUID } from "node:crypto";
import { chargedAmountCents, discountCentsFor } from "@brandbasket/billing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRetentionDiscount,
  billingProfiles,
  businesses,
  createReferralCode,
  findActivePlan,
  findLatestSubscriptionForBusiness,
  findPaymentByProviderId,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  insertAddOnSubscription,
  insertCharge,
  openCheckoutSubscription,
  recordAddOnPayment,
  recordUnappliedPayment,
  users,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { execSql, openTestDatabases, querySql, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { chargeAmountCents } from "./lib/billing/charges";
import { activateFirstPayment, activateReactivationPayment, activateRenewalPayment, type RenewalInvoicedPrice } from "./server/billing-activation";
import { recordChargePaymentWithInvoice } from "./server/charge-payments";
import { startUpgrade } from "./server/plan-upgrade";
import { issueTaxInvoice } from "./server/tax-invoicing";

// The activation is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/** Every payment path, against a real database: each invoiceable payment gets exactly one invoice, and nothing else does. */

const STAFF_USER = "staff-invoices";
const PAID_AT = new Date("2026-10-09T09:00:00.000Z");
const NEXT_MONTH = new Date("2026-11-09T09:00:00.000Z");
const MONTH_AFTER = new Date("2026-12-09T09:00:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let premium: Plan;

async function addBusiness(currency: "INR" | "USD", slug: string): Promise<string> {
  const rows = await dbs.owner.db.insert(businesses).values({ slug, name: "QA Premium Business", currency }).returning({ id: businesses.id });
  return rows[0]?.id ?? "";
}

async function saveMaharashtraDetails(gstin: string): Promise<void> {
  await dbs.owner.db.insert(billingProfiles).values({
    businessId,
    legalName: "QA Premium Business LLP",
    gstin,
    addressLine1: "Shop 4, Gokul Arcade",
    addressLine2: null,
    city: "Mumbai",
    postalCode: "400080",
    stateCode: "mh",
    email: null,
    phone: null,
  });
}

/** A customer in Karnataka with no GSTIN: the state on their billing address decides the place of supply. */
async function saveKarnatakaDetails(): Promise<void> {
  await dbs.owner.db.insert(billingProfiles).values({
    businessId,
    legalName: "QA Premium Business LLP",
    gstin: null,
    addressLine1: "12, Residency Road",
    addressLine2: null,
    city: "Bengaluru",
    postalCode: "560025",
    stateCode: "ka",
    email: null,
    phone: null,
  });
}

function openSubscription(forBusiness: string, plan: Plan, referral: { readonly referralCodeId: string; readonly discountAmountCents: number } | null = null): Promise<Subscription> {
  return openCheckoutSubscription(dbs.staff.db, {
    businessId: forBusiness,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"d".repeat(24)}`,
    referralCodeId: referral?.referralCodeId ?? null,
    discountAmountCents: referral?.discountAmountCents ?? 0,
    replacing: null,
    now: PAID_AT,
  });
}

/** A coupon taking `basisPoints` off, and what it takes off `netAmountCents`, as a checkout freezes it onto the subscription. */
async function percentCoupon(code: string, basisPoints: number, netAmountCents: number): Promise<{ readonly referralCodeId: string; readonly discountAmountCents: number }> {
  const discount = { kind: "percent", basisPoints } as const;
  const created = await createReferralCode(dbs.staff.db, {
    code,
    currency: "INR",
    affiliateId: null,
    discount,
    expiresAt: null,
    maxRedemptions: null,
    createdByStaffId: STAFF_USER,
  });
  return { referralCodeId: created.id, discountAmountCents: discountCentsFor(discount, netAmountCents) };
}

function payFirst(subscription: Subscription, plan: Plan, providerPaymentId = "fake_pay_first", discountAmountCents = 0) {
  return dbs.staff.db.transaction((tx) =>
    activateFirstPayment(tx, {
      businessId: subscription.businessId,
      subscriptionId: subscription.id,
      plan,
      provider: "fake",
      providerPaymentId,
      paidAt: PAID_AT,
      discountAmountCents,
    }),
  );
}

/**
 * A renewal on `subscriptionId`, invoiced at `invoicedPrice`, paid for the month starting NEXT_MONTH. The amount is what
 * the handler's check accepts for that price, so the invoice has to explain exactly the payment.
 */
function payRenewal(subscriptionId: string, invoicedPrice: RenewalInvoicedPrice, providerPaymentId = "fake_pay_renewal") {
  return dbs.staff.db.transaction(async (tx) => {
    const subscription = await findSubscriptionById(tx, subscriptionId);
    if (subscription?.commitmentEndsAt == null) throw new Error("The subscription is not open");
    return activateRenewalPayment(tx, {
      businessId,
      subscriptionId,
      commitmentEndsAt: subscription.commitmentEndsAt,
      provider: "fake",
      providerPaymentId,
      amountCents: chargedAmountCents(invoicedPrice.netAmountCents, invoicedPrice.discountAmountCents, invoicedPrice.plan.taxRateBasisPoints),
      currency: "INR",
      paidAt: NEXT_MONTH,
      paidThroughAt: MONTH_AFTER,
      periodStart: NEXT_MONTH,
      invoicedPrice,
    });
  });
}

/**
 * Buys Social media on a new add-on row and records its first payment, then invoices it in the same transaction, as the
 * add-on activation will: the invoice is the last write. The row is priced as a purchase freezes it, so a Premium member
 * has 10% of the list price taken off before GST.
 */
async function payAddOn(premiumMember: boolean, providerPaymentId: string) {
  const discountAmountCents = premiumMember ? 100_000 : 0;
  const row = await insertAddOnSubscription(dbs.staff.db, {
    id: randomUUID(),
    businessId,
    addOn: "social-media",
    listAmountCents: 1_000_000,
    discountAmountCents,
    netAmountCents: 1_000_000 - discountAmountCents,
    taxRateBasisPoints: 1_800,
    chargedAmountCents: chargedAmountCents(1_000_000, discountAmountCents, 1_800),
    currency: "INR",
    provider: "fake",
    providerSubscriptionId: `fake_sub_${randomUUID()}`,
  });
  const periodEnd = new Date("2026-11-09T09:00:00.000Z");
  return dbs.staff.db.transaction(async (tx) => {
    const recorded = await recordAddOnPayment(tx, {
      addOnSubscriptionId: row.id,
      provider: "fake",
      providerPaymentId,
      amountCents: row.chargedAmountCents,
      currency: "INR",
      paidAt: PAID_AT,
      periodStart: PAID_AT,
      periodEnd,
    });
    const issued = await issueTaxInvoice(tx, recorded.payment, { kind: "add_on", addOnSubscriptionId: row.id, periodStart: PAID_AT, periodEnd });
    return { payment: recorded.payment, issued };
  });
}

/** The next serial the counter would hand out for 26-27, or null when no invoice has taken one. */
async function nextSerial(): Promise<number | null> {
  const rows = await querySql<{ next_serial: number }>(dbs.owner, "select next_serial from tax_invoice_series where prefix = 'FY' and financial_year = '26-27'");
  return rows[0]?.next_serial ?? null;
}

async function invoiceCount(): Promise<number> {
  const rows = await querySql<{ count: string }>(dbs.owner, "select count(*) as count from tax_invoices");
  return Number(rows[0]?.count ?? 0);
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
  const plan = await findActivePlan(dbs.staff.db, "INR", "premium");
  if (plan === null) throw new Error("No active INR Premium plan was seeded");
  premium = plan;
  await dbs.owner.db.insert(users).values({ id: STAFF_USER, name: "Superadmin", email: "admin@example.test", emailVerified: true });
  businessId = await addBusiness("INR", "qa-premium");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("invoicing every payment path", () => {
  it("invoices a first payment, first in the year, with CGST and SGST that add up to the payment", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");
    const activation = await payFirst(await openSubscription(businessId, premium), premium);

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice).toMatchObject({
      number: "FY/26-27/000001",
      issuedOn: "2026-10-09",
      paidOn: "2026-10-09",
      supplyType: "intra_state",
      placeOfSupplyBasis: "gstin",
      totalCents: activation.payment.amountCents,
    });
    expect(invoice?.cgstCents).toBe(invoice?.sgstCents);
    expect(invoice?.lines[0]).toMatchObject({ quantity: 1, unitAmountCents: premium.initialAmountCents, discountAmountCents: 0 });
  });

  it("issues nothing more when the same payment is delivered again, and takes no number", async () => {
    const subscription = await openSubscription(businessId, premium);
    await payFirst(subscription, premium);
    const again = await payFirst(subscription, premium);

    expect(again.alreadyRecorded).toBe(true);
    expect(await invoiceCount()).toBe(1);
    expect(await nextSerial()).toBe(2);
  });

  it("invoices a renewal for the provider's cycle at the verified price, next in the series", async () => {
    await payFirst(await openSubscription(businessId, premium), premium);
    const subscription = await findLatestSubscriptionForBusiness(dbs.staff.db, businessId);
    const commitmentEndsAt = subscription?.commitmentEndsAt ?? null;
    if (subscription === null || commitmentEndsAt === null) throw new Error("The first payment did not open the subscription");

    const renewal = await dbs.staff.db.transaction((tx) =>
      activateRenewalPayment(tx, {
        businessId,
        subscriptionId: subscription.id,
        commitmentEndsAt,
        provider: "fake",
        providerPaymentId: "fake_pay_renewal",
        amountCents: chargedAmountCents(premium.recurringAmountCents, 0, premium.taxRateBasisPoints),
        currency: "INR",
        paidAt: NEXT_MONTH,
        paidThroughAt: MONTH_AFTER,
        periodStart: NEXT_MONTH,
        invoicedPrice: { plan: premium, netAmountCents: premium.recurringAmountCents, discountAmountCents: 0, retentionDiscountCents: 0},
      }),
    );

    expect(await findTaxInvoiceByPaymentId(dbs.staff.db, renewal.payment.id)).toMatchObject({
      number: "FY/26-27/000002",
      lines: [expect.objectContaining({ detail: "Monthly subscription, 09 Nov to 08 Dec 2026" })],
    });
  });

  it("invoices a restart at the plan's monthly price with no discount", async () => {
    const subscription = await openSubscription(businessId, premium);
    const activation = await dbs.staff.db.transaction((tx) =>
      activateReactivationPayment(tx, {
        businessId,
        subscriptionId: subscription.id,
        plan: premium,
        provider: "fake",
        providerPaymentId: "fake_pay_restart",
        paidAt: PAID_AT,
        paidThroughAt: NEXT_MONTH,
      }),
    );

    expect((await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id))?.lines[0]).toMatchObject({
      unitAmountCents: premium.recurringAmountCents,
      discountAmountCents: 0,
    });
  });

  it("invoices a paid extra by its description and quantity when staff record a bank transfer", async () => {
    const charge = await insertCharge(dbs.staff.db, {
      businessId,
      kind: "change_hours",
      description: "Extra change hours",
      quantity: 2,
      unitAmountCents: 142_500,
      taxRateBasisPoints: premium.taxRateBasisPoints,
      amountCents: chargeAmountCents(142_500, 2, premium.taxRateBasisPoints),
      currency: "INR",
      createdByStaffId: STAFF_USER,
    });

    const recorded = await dbs.staff.db.transaction((tx) =>
      recordChargePaymentWithInvoice(tx, {
        chargeId: charge.id,
        businessId,
        provider: "manual",
        providerPaymentId: "manual_charge_1",
        amountCents: charge.amountCents,
        currency: "INR",
        paidAt: PAID_AT,
        now: PAID_AT,
        manual: { recordedByStaffId: STAFF_USER, reference: "NEFT 0921", receivedOn: "2026-10-09" },
      }),
    );

    expect(await findTaxInvoiceByPaymentId(dbs.staff.db, recorded.payment.id)).toMatchObject({
      paymentLabel: "Bank transfer, reference NEFT 0921",
      lines: [expect.objectContaining({ description: "Extra change hours", quantity: 2, unitAmountCents: 142_500 })],
    });
  });

  it("invoices a Care customer's paid move up to Premium at once, with the dot of its description printed as a comma", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");
    const care = await findActivePlan(dbs.staff.db, "INR", "care");
    if (care === null) throw new Error("No active INR Care plan was seeded");
    await payFirst(await openSubscription(businessId, care), care);
    // Five days into the paid month, through the code the Upgrade button runs.
    const now = new Date(PAID_AT.getTime() + 5 * 86_400_000);
    const started = await startUpgrade(dbs.staff.db, { businessId, source: "customer", staffId: null, providerName: "fake", now });
    if (started.kind !== "pay") throw new Error(`Expected a charge to pay, got ${started.kind}`);
    const stored = await querySql<{ description: string; amount_cents: number }>(dbs.owner, `select description, amount_cents from charges where id = '${started.chargeId}'`);
    const charge = stored[0];
    if (charge === undefined) throw new Error("The upgrade's charge was not stored");
    // The app keeps showing the dot; only the invoice changes it.
    expect(charge.description).toMatch(/^Upgrade to Premium \u00B7 \d+ days left$/);

    const recorded = await dbs.staff.db.transaction((tx) =>
      recordChargePaymentWithInvoice(tx, {
        chargeId: started.chargeId,
        businessId,
        provider: "fake",
        providerPaymentId: "fake_pay_upgrade",
        amountCents: charge.amount_cents,
        currency: "INR",
        paidAt: now,
        now,
      }),
    );

    expect(recorded.outcome).toBe("paid");
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, recorded.payment.id);
    expect(invoice).toMatchObject({ number: "FY/26-27/000002", totalCents: recorded.payment.amountCents });
    expect(invoice?.lines[0]?.description).toMatch(/^Upgrade to Premium, \d+ days left$/);
    expect(invoice?.lines[0]?.description).toBe(charge.description.replace(" \u00B7 ", ", "));
    expect(vi.mocked(console.error)).not.toHaveBeenCalled();
  });

  it("issues nothing for a dollar payment", async () => {
    const usd = await findActivePlan(dbs.staff.db, "USD", "premium");
    if (usd === null) throw new Error("No active USD Premium plan was seeded");
    const dollarBusiness = await addBusiness("USD", "qa-dollar");

    await payFirst(await openSubscription(dollarBusiness, usd), usd, "fake_pay_usd");

    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();
  });

  it("records and activates a payment whose invoice cannot be issued, logs it, and spends no number", async () => {
    // Right shape, wrong check character: the database takes it, the invoice builder refuses it.
    await saveMaharashtraDetails("27AAPFU0939F1ZA");

    const activation = await payFirst(await openSubscription(businessId, premium), premium);

    expect(await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_first")).not.toBeNull();
    expect((await findLatestSubscriptionForBusiness(dbs.staff.db, businessId))?.activatedAt).not.toBeNull();
    expect(await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id)).toBeNull();
    expect(await nextSerial()).toBeNull();
    expect(String(vi.mocked(console.error).mock.calls[0]?.[0])).toMatch(/tax-invoice-failed .*InvalidGstinError/);
  });
});

/**
 * What an invoice says, per payment path, against real rows. The mapping from a payment to the plan, discount and note
 * it describes is the part a mock cannot check: each case asserts the invoice's first line and that it adds up to the
 * payment.
 */
describe("what the invoice describes", () => {
  it("describes a first payment on a 20% referral code with the coupon note and the discount off the net price", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");
    const coupon = await percentCoupon("GAURAV", 2_000, premium.initialAmountCents);
    const subscription = await openSubscription(businessId, premium, coupon);

    const activation = await payFirst(subscription, premium, "fake_pay_first", coupon.discountAmountCents);

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(coupon.discountAmountCents).toBe(Math.round(premium.initialAmountCents * 0.2));
    expect(invoice?.lines[0]).toMatchObject({
      detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
      note: "Coupon GAURAV applied, 20% off",
      unitAmountCents: premium.initialAmountCents,
      discountAmountCents: coupon.discountAmountCents,
    });
    expect(invoice?.taxableCents).toBe(premium.initialAmountCents - coupon.discountAmountCents);
    expect(invoice?.totalCents).toBe(activation.payment.amountCents);
  });

  it("describes a renewal with a coupon and a stay offer by both, with the whole discount in one column", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");
    const coupon = await percentCoupon("GAURAV", 2_000, premium.recurringAmountCents);
    await payFirst(await openSubscription(businessId, premium, coupon), premium, "fake_pay_first", coupon.discountAmountCents);
    const opened = await findLatestSubscriptionForBusiness(dbs.staff.db, businessId);
    if (opened === null) throw new Error("The first payment did not open the subscription");
    const stayOffer = discountCentsFor({ kind: "percent", basisPoints: 1_000 }, premium.recurringAmountCents);
    expect(await applyRetentionDiscount(dbs.staff.db, { subscriptionId: opened.id, businessId, retentionDiscountCents: stayOffer })).toBe(true);
    // The same read the webhook handler does: what the subscription froze, never recomputed.
    const subscription = await findSubscriptionById(dbs.staff.db, opened.id);
    if (subscription === null) throw new Error("The subscription vanished");

    const renewal = await payRenewal(subscription.id, {
      plan: premium,
      netAmountCents: premium.recurringAmountCents,
      discountAmountCents: subscription.discountAmountCents,
      retentionDiscountCents: subscription.retentionDiscountCents,
    });

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, renewal.payment.id);
    expect(invoice?.lines[0]).toMatchObject({
      detail: "Monthly subscription, 09 Nov to 08 Dec 2026",
      note: "Coupon GAURAV applied, 20% off. Stay offer applied",
      unitAmountCents: premium.recurringAmountCents,
      discountAmountCents: coupon.discountAmountCents + stayOffer,
    });
    expect(invoice?.taxableCents).toBe(premium.recurringAmountCents - coupon.discountAmountCents - stayOffer);
    expect(invoice?.totalCents).toBe(renewal.payment.amountCents);
  });

  it("describes the renewal that completes a paid move up at the new plan's price and its pending discount", async () => {
    // Driven through activateRenewalPayment with the invoicedPrice the webhook handler builds for this case (the handler
    // lives in the platform app, which this package cannot import); the handler's own branch is covered by its unit tests.
    await saveMaharashtraDetails("27AAPFU0939F1ZV");
    const care = await findActivePlan(dbs.staff.db, "INR", "care");
    if (care === null) throw new Error("No active INR Care plan was seeded");
    expect(care.recurringAmountCents).not.toBe(premium.recurringAmountCents);
    const coupon = await percentCoupon("GAURAV", 2_000, care.initialAmountCents);
    const opened = await openSubscription(businessId, care, coupon);
    await payFirst(opened, care, "fake_pay_first", coupon.discountAmountCents);
    const pendingDiscountCents = discountCentsFor({ kind: "percent", basisPoints: 2_000 }, premium.recurringAmountCents);
    await execSql(
      dbs.owner,
      `update subscriptions set pending_plan_id = '${premium.id}', pending_discount_amount_cents = ${pendingDiscountCents} where id = '${opened.id}'`,
    );
    const subscription = await findSubscriptionById(dbs.staff.db, opened.id);
    if (subscription === null || subscription.pendingPlanId !== premium.id) throw new Error("The move up was not recorded");

    const renewal = await payRenewal(subscription.id, {
      plan: premium,
      netAmountCents: premium.recurringAmountCents,
      discountAmountCents: subscription.pendingDiscountAmountCents,
      retentionDiscountCents: 0,
    });

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, renewal.payment.id);
    expect(invoice?.lines[0]).toMatchObject({
      description: "Brandbasket Premium plan",
      unitAmountCents: premium.recurringAmountCents,
      discountAmountCents: pendingDiscountCents,
      note: "Coupon GAURAV applied, 20% off",
    });
    expect(invoice?.taxableCents).toBe(premium.recurringAmountCents - pendingDiscountCents);
    expect(invoice?.totalCents).toBe(renewal.payment.amountCents);
  });

  it("describes a Premium member's Social media payment by the add-on, the month and the discount, adding up to the payment", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");

    const { payment, issued } = await payAddOn(true, "fake_pay_add_on_premium");

    expect(issued?.issued).toBe(true);
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, payment.id);
    expect(invoice?.lines).toHaveLength(1);
    expect(invoice?.lines[0]).toMatchObject({
      description: "Social media",
      detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
      note: "Premium member, 10% off",
      quantity: 1,
      unitAmountCents: 1_000_000,
      discountAmountCents: 100_000,
      taxRateBasisPoints: 1_800,
    });
    expect(invoice).toMatchObject({ taxableCents: 900_000, totalCents: 1_062_000 });
    expect(invoice?.cgstCents).toBe(81_000);
    expect(invoice?.sgstCents).toBe(81_000);
    expect(invoice?.totalCents).toBe(payment.amountCents);
  });

  it("describes a Social media payment with no discount without a note, at the full price", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");

    const { payment } = await payAddOn(false, "fake_pay_add_on_list");

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, payment.id);
    expect(invoice?.lines[0]).toMatchObject({ description: "Social media", note: null, unitAmountCents: 1_000_000, discountAmountCents: 0 });
    expect(invoice).toMatchObject({ taxableCents: 1_000_000, totalCents: 1_180_000 });
    expect(invoice?.totalCents).toBe(payment.amountCents);
  });

  it("calls a first payment that covers three months a subscription, not a monthly one", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");
    await execSql(dbs.owner, `update plans set initial_term_months = 3 where id = '${premium.id}'`);
    const threeMonths = await findActivePlan(dbs.staff.db, "INR", "premium");
    if (threeMonths === null || threeMonths.initialTermMonths !== 3) throw new Error("The plan did not take a three month term");

    const activation = await payFirst(await openSubscription(businessId, threeMonths), threeMonths);

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.lines[0]?.detail).toBe("Subscription, 09 Oct 2026 to 08 Jan 2027");
    expect(invoice?.totalCents).toBe(activation.payment.amountCents);
  });

  it("charges a Karnataka customer IGST alone, never CGST or SGST", async () => {
    await saveKarnatakaDetails();

    const activation = await payFirst(await openSubscription(businessId, premium), premium);

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice).toMatchObject({ supplyType: "inter_state", placeOfSupplyStateCode: "ka", placeOfSupplyBasis: "billing_address", cgstCents: 0, sgstCents: 0 });
    expect(invoice?.igstCents).toBeGreaterThan(0);
    expect(invoice?.lines[0]).toMatchObject({ cgstCents: 0, sgstCents: 0, igstCents: invoice?.igstCents });
    expect(invoice?.totalCents).toBe(activation.payment.amountCents);
  });

  it("gives a payment that bought nothing no invoice and takes no number", async () => {
    const subscription = await openSubscription(businessId, premium);

    const recorded = await recordUnappliedPayment(dbs.staff.db, {
      businessId,
      subscriptionId: subscription.id,
      provider: "fake",
      providerPaymentId: "fake_pay_unapplied",
      kind: "initial",
      amountCents: 12_345,
      currency: "INR",
      paidAt: PAID_AT,
      reason: "amount_mismatch",
      now: PAID_AT,
    });

    expect(await findTaxInvoiceByPaymentId(dbs.staff.db, recorded.payment.id)).toBeNull();
    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();
  });

  it("issues exactly one invoice when the same charge payment is delivered twice", async () => {
    const charge = await insertCharge(dbs.staff.db, {
      businessId,
      kind: "change_hours",
      description: "Extra change hours",
      quantity: 1,
      unitAmountCents: 142_500,
      taxRateBasisPoints: premium.taxRateBasisPoints,
      amountCents: chargeAmountCents(142_500, 1, premium.taxRateBasisPoints),
      currency: "INR",
      createdByStaffId: STAFF_USER,
    });
    const deliver = () =>
      dbs.staff.db.transaction((tx) =>
        recordChargePaymentWithInvoice(tx, {
          chargeId: charge.id,
          businessId,
          provider: "fake",
          providerPaymentId: "fake_pay_charge",
          amountCents: charge.amountCents,
          currency: "INR",
          paidAt: PAID_AT,
          now: PAID_AT,
        }),
      );

    const first = await deliver();
    const again = await deliver();

    expect(first.outcome).toBe("paid");
    expect(again.alreadyRecorded).toBe(true);
    expect(again.payment.id).toBe(first.payment.id);
    expect(await invoiceCount()).toBe(1);
    expect(await nextSerial()).toBe(2);
  });
});
