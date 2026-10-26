import { randomUUID } from "node:crypto";
import { chargedAmountCents, discountCentsFor } from "@brandbasket/billing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  billingProfiles,
  businesses,
  createReferralCode,
  findActivePlan,
  findBundledAddOnsForSubscription,
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
  type NewBundledAddOn,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { execSql, openTestDatabases, querySql, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import type { MonthlyAddOnId } from "./lib/billing/add-ons";
import { chargeAmountCents } from "./lib/billing/charges";
import { packageLines } from "./lib/billing/packages";
import { activateFirstPayment, activateReactivationPayment, activateRenewalPayment, type RenewalInvoicedPrice } from "./server/billing-activation";
import { recordChargePaymentWithInvoice } from "./server/charge-payments";
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
/** The services plan: the subscription's terms at a price of 0, so what a payment takes is the sum of its service lines. */
let services: Plan;

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

/** The services as a checkout freezes them: each with the package discount the set earns. */
function linesOf(plan: Plan, ...ids: MonthlyAddOnId[]): readonly NewBundledAddOn[] {
  return packageLines({ services: ids, forfeited: false }, plan.currency).map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: plan.taxRateBasisPoints,
  }));
}

/** A checkout on the services plan; the website alone unless other services are given. */
function openSubscription(
  forBusiness: string,
  plan: Plan,
  referral: { readonly referralCodeId: string; readonly discountAmountCents: number } | null = null,
  bundledAddOns: readonly NewBundledAddOn[] = linesOf(plan, "managed-website"),
): Promise<Subscription> {
  return openCheckoutSubscription(dbs.staff.db, {
    businessId: forBusiness,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"d".repeat(24)}`,
    referralCodeId: referral?.referralCodeId ?? null,
    discountAmountCents: referral?.discountAmountCents ?? 0,
    bundledAddOns,
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
      amountCents: chargedAmountCents(
        invoicedPrice.netAmountCents + (invoicedPrice.bundledAddOns ?? []).reduce((total, line) => total + line.listAmountCents - line.offerDiscountAmountCents, 0),
        invoicedPrice.discountAmountCents,
      ),
      currency: "INR",
      paidAt: NEXT_MONTH,
      paidThroughAt: MONTH_AFTER,
      periodStart: NEXT_MONTH,
      invoicedPrice,
    });
  });
}

/**
 * Buys Social Media and Ads on a new add-on row and records its first payment, then invoices it in the same transaction, as the
 * add-on activation will: the invoice is the last write. The row is priced as a purchase freezes it: its list price of
 * 9,999 rupees, less a discount of 50,000 paise when `discounted`.
 */
async function payAddOn(discounted: boolean, providerPaymentId: string) {
  const discountAmountCents = discounted ? 50_000 : 0;
  const row = await insertAddOnSubscription(dbs.staff.db, {
    id: randomUUID(),
    businessId,
    addOn: "digital-growth",
    listAmountCents: 999_900,
    discountAmountCents,
    offerDiscountAmountCents: discountAmountCents,
    netAmountCents: 999_900 - discountAmountCents,
    taxRateBasisPoints: 1_800,
    chargedAmountCents: chargedAmountCents(999_900, discountAmountCents),
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
  const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (plan === null) throw new Error("No active INR services plan was seeded");
  services = plan;
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
    const activation = await payFirst(await openSubscription(businessId, services), services);

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
    expect(invoice?.lines).toHaveLength(1);
    expect(invoice?.lines[0]).toMatchObject({ description: "Managed Website", quantity: 1, unitAmountCents: 299_900, discountAmountCents: 0, note: null });
  });

  it("issues nothing more when the same payment is delivered again, and takes no number", async () => {
    const subscription = await openSubscription(businessId, services);
    await payFirst(subscription, services);
    const again = await payFirst(subscription, services);

    expect(again.alreadyRecorded).toBe(true);
    expect(await invoiceCount()).toBe(1);
    expect(await nextSerial()).toBe(2);
  });

  it("invoices a renewal for the provider's cycle at the verified price, next in the series", async () => {
    await payFirst(await openSubscription(businessId, services), services);
    const subscription = await findLatestSubscriptionForBusiness(dbs.staff.db, businessId);
    const commitmentEndsAt = subscription?.commitmentEndsAt ?? null;
    if (subscription === null || commitmentEndsAt === null) throw new Error("The first payment did not open the subscription");
    const active = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);

    const renewal = await dbs.staff.db.transaction((tx) =>
      activateRenewalPayment(tx, {
        businessId,
        subscriptionId: subscription.id,
        commitmentEndsAt,
        provider: "fake",
        providerPaymentId: "fake_pay_renewal",
        amountCents: chargedAmountCents(299_900, 0),
        currency: "INR",
        paidAt: NEXT_MONTH,
        paidThroughAt: MONTH_AFTER,
        periodStart: NEXT_MONTH,
        invoicedPrice: { plan: services, bundledAddOns: active, netAmountCents: 0, discountAmountCents: 0, retentionDiscountCents: 0 },
      }),
    );

    expect(await findTaxInvoiceByPaymentId(dbs.staff.db, renewal.payment.id)).toMatchObject({
      number: "FY/26-27/000002",
      lines: [expect.objectContaining({ detail: "Monthly subscription, 09 Nov to 08 Dec 2026" })],
    });
  });

  it("invoices a restart at the services it was opened with, with no coupon", async () => {
    const subscription = await openSubscription(businessId, services);
    const activation = await dbs.staff.db.transaction((tx) =>
      activateReactivationPayment(tx, {
        businessId,
        subscriptionId: subscription.id,
        plan: services,
        provider: "fake",
        providerPaymentId: "fake_pay_restart",
        paidAt: PAID_AT,
        paidThroughAt: NEXT_MONTH,
      }),
    );

    expect((await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id))?.lines[0]).toMatchObject({
      description: "Managed Website",
      unitAmountCents: 299_900,
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
      taxRateBasisPoints: services.taxRateBasisPoints,
      amountCents: chargeAmountCents(142_500, 2),
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

  it("issues nothing for a dollar payment", async () => {
    const usd = await findActivePlan(dbs.staff.db, "USD", "managed");
    if (usd === null) throw new Error("No active USD services plan was seeded");
    const dollarBusiness = await addBusiness("USD", "qa-dollar");

    await payFirst(await openSubscription(dollarBusiness, usd), usd, "fake_pay_usd");

    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();
  });

  it("records and activates a payment whose invoice cannot be issued, logs it, and spends no number", async () => {
    // Right shape, wrong check character: the database takes it, the invoice builder refuses it.
    await saveMaharashtraDetails("27AAPFU0939F1ZA");

    const activation = await payFirst(await openSubscription(businessId, services), services);

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
  it("describes a first payment of one service on a 20% referral code with the coupon note and the discount off the service price", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");
    const coupon = await percentCoupon("GAURAV", 2_000, 299_900);
    const subscription = await openSubscription(businessId, services, coupon);

    const activation = await payFirst(subscription, services, "fake_pay_first", coupon.discountAmountCents);

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(coupon.discountAmountCents).toBe(59_980);
    expect(invoice?.lines).toHaveLength(1);
    expect(invoice?.lines[0]).toMatchObject({
      description: "Managed Website",
      detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
      note: "Coupon GAURAV applied, 20% off",
      unitAmountCents: 299_900,
      discountAmountCents: coupon.discountAmountCents,
    });
    // The member pays ₹2,399.20, which holds ₹365.98 of GST.
    expect(invoice?.taxableCents).toBe(203_322);
    expect(invoice?.totalCents).toBe(activation.payment.amountCents);
  });

  it("describes a renewal with a coupon and a stay offer by both, with the whole discount in one column", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");
    const coupon = await percentCoupon("GAURAV", 2_000, 299_900);
    await payFirst(await openSubscription(businessId, services, coupon), services, "fake_pay_first", coupon.discountAmountCents);
    const opened = await findLatestSubscriptionForBusiness(dbs.staff.db, businessId);
    if (opened === null) throw new Error("The first payment did not open the subscription");
    const stayOffer = discountCentsFor({ kind: "percent", basisPoints: 1_000 }, 299_900);
    // A stay offer taken before stay offers were removed: its worth sits on the subscription and in its discount.
    await execSql(
      dbs.owner,
      `update subscriptions set retention_discount_cents = ${stayOffer}, discount_amount_cents = discount_amount_cents + ${stayOffer} where id = '${opened.id}'`,
    );
    // The same read the webhook handler does: what the subscription froze, never recomputed.
    const subscription = await findSubscriptionById(dbs.staff.db, opened.id);
    if (subscription === null) throw new Error("The subscription vanished");

    const renewal = await payRenewal(subscription.id, {
      plan: services,
      bundledAddOns: await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id),
      netAmountCents: 0,
      discountAmountCents: subscription.discountAmountCents,
      retentionDiscountCents: subscription.retentionDiscountCents,
    });

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, renewal.payment.id);
    expect(invoice?.lines).toHaveLength(1);
    expect(invoice?.lines[0]).toMatchObject({
      description: "Managed Website",
      detail: "Monthly subscription, 09 Nov to 08 Dec 2026",
      note: "Coupon GAURAV applied, 20% off. Stay offer applied",
      unitAmountCents: 299_900,
      discountAmountCents: coupon.discountAmountCents + stayOffer,
    });
    // The member pays ₹2,099.30, which holds ₹320.24 of GST.
    expect(invoice?.taxableCents).toBe(177_906);
    expect(invoice?.totalCents).toBe(renewal.payment.amountCents);
  });

  it("describes a Social Media and Ads payment with a discount by the add-on, the month and the discount, adding up to the payment", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");

    const { payment, issued } = await payAddOn(true, "fake_pay_add_on_offer");

    expect(issued?.issued).toBe(true);
    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, payment.id);
    expect(invoice?.lines).toHaveLength(1);
    expect(invoice?.lines[0]).toMatchObject({
      description: "Social Media and Ads",
      detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
      note: null,
      quantity: 1,
      unitAmountCents: 999_900,
      discountAmountCents: 50_000,
      taxRateBasisPoints: 1_800,
    });
    // The member pays ₹9,499, which holds ₹1,449 of GST: ₹724.50 each of CGST and SGST.
    expect(invoice).toMatchObject({ taxableCents: 805_000, totalCents: 949_900 });
    expect(invoice?.cgstCents).toBe(72_450);
    expect(invoice?.sgstCents).toBe(72_450);
    expect(invoice?.totalCents).toBe(payment.amountCents);
  });

  it("describes a Social Media and Ads payment with no discount without a note, at the full price", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");

    const { payment } = await payAddOn(false, "fake_pay_add_on_list");

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, payment.id);
    expect(invoice?.lines[0]).toMatchObject({ description: "Social Media and Ads", note: null, unitAmountCents: 999_900, discountAmountCents: 0 });
    // ₹9,999 holds ₹1,525.28 of GST.
    expect(invoice).toMatchObject({ taxableCents: 847_372, totalCents: 999_900 });
    expect(invoice?.totalCents).toBe(payment.amountCents);
  });

  it("describes a first payment of all three services by a line each at its list price less 20%, with no line for the plan row and nothing about ad credit", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");
    const lines = linesOf(services, "managed-website", "digital-growth", "local-seo-aeo");

    const activation = await payFirst(await openSubscription(businessId, services, null, lines), services);

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.lines.map((line) => [line.description, line.unitAmountCents, line.discountAmountCents, line.note])).toEqual([
      ["Managed Website", 299_900, 59_980, "Package offer, 20% off"],
      ["Social Media and Ads", 999_900, 199_980, "Package offer, 20% off"],
      ["Local SEO + AEO", 2_499_900, 499_940, "Package offer, 20% off"],
    ]);
    // ₹30,398 holds ₹4,636.98 of GST: ₹2,318.49 each of CGST and SGST.
    expect(invoice).toMatchObject({ taxableCents: 2_576_102, cgstCents: 231_849, sgstCents: 231_849, roundOffCents: 0, totalCents: 3_039_800 });
    expect(activation.payment.amountCents).toBe(3_039_800);
    expect(JSON.stringify(invoice?.lines)).not.toMatch(/credit/i);
  });

  it("describes a first payment of Website and Social at 10% by a line each", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");

    const activation = await payFirst(await openSubscription(businessId, services, null, linesOf(services, "managed-website", "digital-growth")), services);

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.lines.map((line) => [line.description, line.discountAmountCents, line.note])).toEqual([
      ["Managed Website", 29_990, "Package offer, 10% off"],
      ["Social Media and Ads", 99_910, "Package offer, 10% off"],
    ]);
    expect(invoice?.totalCents).toBe(1_169_900);
  });

  it("describes a first payment of one service with no discount and no note", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");

    const activation = await payFirst(await openSubscription(businessId, services, null, linesOf(services, "local-seo-aeo")), services);

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.lines).toHaveLength(1);
    expect(invoice?.lines[0]).toMatchObject({ description: "Local SEO + AEO", discountAmountCents: 0, note: null });
    expect(invoice?.totalCents).toBe(2_499_900);
  });

  it("calls a first payment that covers three months a subscription, not a monthly one", async () => {
    await saveMaharashtraDetails("27AAPFU0939F1ZV");
    await execSql(dbs.owner, `update plans set initial_term_months = 3 where id = '${services.id}'`);
    const threeMonths = await findActivePlan(dbs.staff.db, "INR", "managed");
    if (threeMonths === null || threeMonths.initialTermMonths !== 3) throw new Error("The plan did not take a three month term");

    const activation = await payFirst(await openSubscription(businessId, threeMonths), threeMonths);

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice?.lines[0]?.detail).toBe("Subscription, 09 Oct 2026 to 08 Jan 2027");
    expect(invoice?.totalCents).toBe(activation.payment.amountCents);
  });

  it("charges a Karnataka customer IGST alone, never CGST or SGST", async () => {
    await saveKarnatakaDetails();

    const activation = await payFirst(await openSubscription(businessId, services), services);

    const invoice = await findTaxInvoiceByPaymentId(dbs.staff.db, activation.payment.id);
    expect(invoice).toMatchObject({ supplyType: "inter_state", placeOfSupplyStateCode: "ka", placeOfSupplyBasis: "billing_address", cgstCents: 0, sgstCents: 0 });
    expect(invoice?.igstCents).toBeGreaterThan(0);
    expect(invoice?.lines[0]).toMatchObject({ cgstCents: 0, sgstCents: 0, igstCents: invoice?.igstCents });
    expect(invoice?.totalCents).toBe(activation.payment.amountCents);
  });

  it("gives a payment that bought nothing no invoice and takes no number", async () => {
    const subscription = await openSubscription(businessId, services);

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
      taxRateBasisPoints: services.taxRateBasisPoints,
      amountCents: chargeAmountCents(142_500, 1),
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
