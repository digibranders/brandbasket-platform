import { randomUUID } from "node:crypto";
import { chargedAmountCents, discountCentsFor } from "@brandbasket/billing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  billingProfiles,
  businesses,
  createReferralCode,
  findActivePlan,
  findBundledAddOnsForSubscription,
  findTaxInvoiceByPaymentId,
  insertAddOnSubscription,
  insertCharge,
  listPaymentsWithoutTaxInvoice,
  lockBusinessForBilling,
  openCheckoutSubscription,
  payments,
  recordAddOnPayment,
  recordChargePayment,
  savePaymentInvoiceBasis,
  taxInvoicingStart,
  users,
  type NewBundledAddOn,
  type Payment,
  type PaymentInvoiceBasis,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { execSql, openTestDatabases, querySql, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import type { MonthlyAddOnId } from "./lib/billing/add-ons";
import { chargeAmountCents } from "./lib/billing/charges";
import { packageLines } from "./lib/billing/packages";
import { activateFirstPayment, activateReactivationPayment, activateRenewalPayment } from "./server/billing-activation";
import {
  InvoiceSourceMismatchError,
  issueMissingTaxInvoice,
  NoMissingInvoiceError,
  UnsupportedPaymentKindError,
} from "./server/tax-invoice-reissue";
import { InvoiceDatedBeforePaymentError, UnprintableInvoiceTextError } from "./server/tax-invoicing";

// The issuer is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/**
 * The staff path that issues an invoice a payment is missing, against a real database. A payment is invoiced from the
 * lines it was billed at, which the payment path keeps beside it, so these payments are either recorded through that path
 * with an invoice that could not be printed, or seeded straight into the books with the lines they were billed at.
 */

const STAFF_USER = "staff-reissue";
const PAID_AT = new Date("2026-10-09T09:00:00.000Z");
const NEXT_MONTH = new Date("2026-11-09T09:00:00.000Z");
const MONTH_AFTER = new Date("2026-12-09T09:00:00.000Z");
const ISSUED_AT = new Date("2026-11-15T05:30:00.000Z");
const DEVANAGARI_NAME = "अरविंद डेंटल";

let dbs: TestDatabases;
let businessId = "";
let services: Plan;

async function addBusiness(currency: "INR" | "USD", slug: string, name = "QA Services Business"): Promise<string> {
  const rows = await dbs.owner.db.insert(businesses).values({ slug, name, currency }).returning({ id: businesses.id });
  return rows[0]?.id ?? "";
}

async function saveMaharashtraDetails(): Promise<void> {
  await dbs.owner.db.insert(billingProfiles).values({
    businessId,
    legalName: "QA Services Business LLP",
    gstin: "27AAPFU0939F1ZV",
    addressLine1: "Shop 4, Gokul Arcade",
    addressLine2: null,
    city: "Mumbai",
    postalCode: "400080",
    stateCode: "mh",
    email: null,
    phone: null,
  });
}

/** The services as a checkout freezes them: each with the package discount the set earns. */
function linesOf(...ids: MonthlyAddOnId[]): readonly NewBundledAddOn[] {
  return packageLines({ services: ids, forfeited: false }, "INR").map((line) => ({
    addOn: line.addOn,
    listAmountCents: line.listCents,
    offerDiscountAmountCents: line.offerCents,
    netAmountCents: line.netCents,
    taxRateBasisPoints: services.taxRateBasisPoints,
  }));
}

function openSubscription(
  lines: readonly NewBundledAddOn[],
  referral: { readonly referralCodeId: string; readonly discountAmountCents: number } | null = null,
  forPlan: Plan = services,
): Promise<Subscription> {
  return openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: forPlan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"d".repeat(24)}`,
    referralCodeId: referral?.referralCodeId ?? null,
    discountAmountCents: referral?.discountAmountCents ?? 0,
    bundledAddOns: lines,
    replacing: null,
    now: PAID_AT,
  });
}

/** What a payment of these lines is billed as, kept beside the payment. */
function basisOf(lines: readonly NewBundledAddOn[], discountAmountCents = 0): PaymentInvoiceBasis {
  return {
    netAmountCents: 0,
    discountAmountCents,
    retentionDiscountCents: 0,
    lines: lines.map(({ addOn, listAmountCents, offerDiscountAmountCents, taxRateBasisPoints }) => ({ addOn, listAmountCents, offerDiscountAmountCents, taxRateBasisPoints })),
  };
}

function chargedFor(lines: readonly NewBundledAddOn[], discountAmountCents = 0): number {
  return chargedAmountCents(
    lines.reduce((total, line) => total + line.netAmountCents, 0),
    discountAmountCents,
    services.taxRateBasisPoints,
  );
}

/** A payment recorded without an invoice, as an old path or a failed invoice leaves it. */
async function seedPayment(overrides: Partial<typeof payments.$inferInsert> & { readonly providerPaymentId: string }): Promise<Payment> {
  const rows = await dbs.owner.db
    .insert(payments)
    .values({ businessId, provider: "fake", kind: "initial", amountCents: 1, currency: "INR", status: "captured", paidAt: PAID_AT, ...overrides })
    .returning();
  const row = rows[0];
  if (row === undefined) throw new Error(`Payment ${overrides.providerPaymentId} was not seeded`);
  return row;
}

/**
 * A first payment recorded by the real activation path whose invoice cannot be printed (the business name is in Hindi and no
 * billing details are saved), which is how a payment ends up with no invoice. English billing details are saved after, as
 * staff ask the customer to.
 */
async function payFirstWithoutPrintableInvoice(subscription: Subscription, discountAmountCents = 0): Promise<Payment> {
  await dbs.owner.db.delete(billingProfiles);
  await execSql(dbs.owner, `update businesses set name = '${DEVANAGARI_NAME}' where id = '${businessId}'`);
  const activation = await dbs.staff.db.transaction((tx) =>
    activateFirstPayment(tx, {
      businessId,
      subscriptionId: subscription.id,
      plan: services,
      provider: "fake",
      providerPaymentId: "pay_first_unprinted",
      paidAt: PAID_AT,
      discountAmountCents,
    }),
  );
  expect(await invoiceCount()).toBe(0);
  await execSql(dbs.owner, `update businesses set name = 'QA Services Business' where id = '${businessId}'`);
  await saveMaharashtraDetails();
  return activation.payment;
}

/**
 * An add-on payment recorded without an invoice, through the same recorder the webhook uses: Social Media and Ads at the
 * list price, with a discount when one is given. Returns the payment and the add-on row it paid for.
 */
async function seedAddOnPayment(discountAmountCents: number, providerPaymentId: string): Promise<{ readonly payment: Payment; readonly addOnSubscriptionId: string }> {
  const row = await insertAddOnSubscription(dbs.staff.db, {
    id: randomUUID(),
    businessId,
    addOn: "digital-growth",
    listAmountCents: 999_900,
    discountAmountCents,
    offerDiscountAmountCents: discountAmountCents,
    netAmountCents: 999_900 - discountAmountCents,
    taxRateBasisPoints: 1_800,
    chargedAmountCents: chargedAmountCents(999_900, discountAmountCents, 1_800),
    currency: "INR",
    provider: "fake",
    providerSubscriptionId: `fake_sub_${randomUUID()}`,
  });
  const recorded = await dbs.staff.db.transaction((tx) =>
    recordAddOnPayment(tx, {
      addOnSubscriptionId: row.id,
      provider: "fake",
      providerPaymentId,
      amountCents: row.chargedAmountCents,
      currency: "INR",
      paidAt: PAID_AT,
      periodStart: PAID_AT,
      periodEnd: NEXT_MONTH,
    }),
  );
  return { payment: recorded.payment, addOnSubscriptionId: row.id };
}

/** Issues the payment's missing invoice the way the staff action does: one staff transaction under the billing lock. */
function issue(paymentId: string, issuedAt: Date = ISSUED_AT) {
  return dbs.staff.db.transaction(async (tx) => {
    await lockBusinessForBilling(tx, businessId);
    return issueMissingTaxInvoice(tx, businessId, paymentId, issuedAt);
  });
}

async function invoiceCount(): Promise<number> {
  const rows = await querySql<{ count: string }>(dbs.owner, "select count(*) as count from tax_invoices");
  return Number(rows[0]?.count ?? 0);
}

/** The next serial the counter would hand out for 26-27, or null when no invoice has taken one. */
async function nextSerial(): Promise<number | null> {
  const rows = await querySql<{ next_serial: number }>(dbs.owner, "select next_serial from tax_invoice_series where prefix = 'FY' and financial_year = '26-27'");
  return rows[0]?.next_serial ?? null;
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
  businessId = await addBusiness("INR", "qa-services");
  await saveMaharashtraDetails();
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("issueMissingTaxInvoice", () => {
  it("invoices a first payment of all three services with a line and a package note for each, on the day staff issue it", async () => {
    const lines = linesOf("managed-website", "digital-growth", "local-seo-aeo");
    const subscription = await openSubscription(lines);
    const payment = await payFirstWithoutPrintableInvoice(subscription);

    const invoice = await issue(payment.id);

    expect(payment.amountCents).toBe(3_138_446);
    expect(invoice).toMatchObject({
      number: "FY/26-27/000001",
      issuedOn: "2026-11-15",
      paidOn: "2026-10-09",
      paymentId: payment.id,
      taxableCents: 2_659_700,
      totalCents: 3_138_446,
    });
    expect(invoice.lines.map((line) => [line.description, line.unitAmountCents, line.discountAmountCents, line.note, line.detail])).toEqual([
      ["Managed Website", 299_900, 89_970, "Package offer, 30% off", "Monthly subscription, 09 Oct to 08 Nov 2026"],
      ["Social Media and Ads", 999_900, 299_970, "Package offer, 30% off", "Monthly subscription, 09 Oct to 08 Nov 2026"],
      ["Local SEO + AEO", 2_499_900, 750_060, "Package offer, 30% off", "Monthly subscription, 09 Oct to 08 Nov 2026"],
    ]);
  });

  it("invoices a payment as it was billed, though the package was dropped and the offer forfeited since", async () => {
    const subscription = await openSubscription(linesOf("managed-website", "digital-growth", "local-seo-aeo"));
    const payment = await payFirstWithoutPrintableInvoice(subscription);
    // The customer drops Local SEO + AEO: the offer ends for good, the services that stay go to list and the rows move on.
    await execSql(
      dbs.owner,
      `update bundled_add_ons set status = 'removed', removed_at = now() where subscription_id = '${subscription.id}' and add_on = 'local-seo-aeo'`,
    );
    await execSql(
      dbs.owner,
      `update bundled_add_ons set offer_discount_amount_cents = 0, net_amount_cents = list_amount_cents where subscription_id = '${subscription.id}' and add_on <> 'local-seo-aeo'`,
    );
    await execSql(dbs.owner, `update businesses set package_offer_forfeited_at = now() where id = '${businessId}'`);

    const invoice = await issue(payment.id);

    expect(invoice.totalCents).toBe(3_138_446);
    expect(invoice.lines.map((line) => [line.description, line.discountAmountCents, line.note])).toEqual([
      ["Managed Website", 89_970, "Package offer, 30% off"],
      ["Social Media and Ads", 299_970, "Package offer, 30% off"],
      ["Local SEO + AEO", 750_060, "Package offer, 30% off"],
    ]);
  });

  it("invoices a single service at its list price with no discount and no note", async () => {
    const lines = linesOf("digital-growth");
    const subscription = await openSubscription(lines);
    const payment = await payFirstWithoutPrintableInvoice(subscription);

    const invoice = await issue(payment.id);

    expect(invoice.totalCents).toBe(1_179_882);
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.lines[0]).toMatchObject({ description: "Social Media and Ads", discountAmountCents: 0, note: null });
  });

  it("names the coupon on a single service, though the code's discount ended when a second service was added", async () => {
    const discount = { kind: "percent", basisPoints: 2_000 } as const;
    const created = await createReferralCode(dbs.staff.db, {
      code: "GAURAV",
      currency: "INR",
      affiliateId: null,
      discount,
      expiresAt: null,
      maxRedemptions: null,
      createdByStaffId: STAFF_USER,
    });
    const discountAmountCents = discountCentsFor(discount, 299_900);
    const subscription = await openSubscription(linesOf("managed-website"), { referralCodeId: created.id, discountAmountCents });
    const payment = await payFirstWithoutPrintableInvoice(subscription, discountAmountCents);
    await execSql(dbs.owner, `update subscriptions set discount_amount_cents = 0 where id = '${subscription.id}'`);

    const invoice = await issue(payment.id);

    expect(payment.amountCents).toBe(chargedAmountCents(299_900, discountAmountCents, 1_800));
    expect(invoice.lines).toHaveLength(1);
    expect(invoice.lines[0]).toMatchObject({ description: "Managed Website", discountAmountCents, note: "Coupon GAURAV applied, 20% off" });
    expect(invoice.totalCents).toBe(payment.amountCents);
  });

  it("invoices a renewal from the lines it was billed at, a month from the cycle it paid for", async () => {
    const lines = linesOf("managed-website", "digital-growth");
    const subscription = await openSubscription(lines);
    await dbs.staff.db.transaction((tx) =>
      activateFirstPayment(tx, { businessId, subscriptionId: subscription.id, plan: services, provider: "fake", providerPaymentId: "pay_first", paidAt: PAID_AT, discountAmountCents: 0 }),
    );
    const active = await findBundledAddOnsForSubscription(dbs.staff.db, subscription.id);
    await dbs.owner.db.delete(billingProfiles);
    await execSql(dbs.owner, `update businesses set name = '${DEVANAGARI_NAME}' where id = '${businessId}'`);
    const renewal = await dbs.staff.db.transaction((tx) =>
      activateRenewalPayment(tx, {
        businessId,
        subscriptionId: subscription.id,
        commitmentEndsAt: NEXT_MONTH,
        provider: "fake",
        providerPaymentId: "pay_renewal",
        amountCents: chargedFor(lines),
        currency: "INR",
        paidAt: NEXT_MONTH,
        paidThroughAt: MONTH_AFTER,
        periodStart: NEXT_MONTH,
        invoicedPrice: { plan: services, bundledAddOns: active, netAmountCents: 0, discountAmountCents: 0, retentionDiscountCents: 0 },
      }),
    );
    await execSql(dbs.owner, `update businesses set name = 'QA Services Business' where id = '${businessId}'`);
    await saveMaharashtraDetails();

    const renewed = await issue(renewal.payment.id);

    expect(renewed.lines.map((line) => [line.description, line.discountAmountCents, line.note, line.detail])).toEqual([
      ["Managed Website", 59_980, "Package offer, 20% off", "Monthly subscription, 09 Nov to 08 Dec 2026"],
      ["Social Media and Ads", 200_020, "Package offer, 20% off", "Monthly subscription, 09 Nov to 08 Dec 2026"],
    ]);
    expect(renewed.totalCents).toBe(renewal.payment.amountCents);
  });

  it("invoices a restart from the lines its checkout was opened with, a month from the day paid", async () => {
    const subscription = await openSubscription(linesOf("digital-growth", "local-seo-aeo"));
    await dbs.owner.db.delete(billingProfiles);
    await execSql(dbs.owner, `update businesses set name = '${DEVANAGARI_NAME}' where id = '${businessId}'`);
    const restart = await dbs.staff.db.transaction((tx) =>
      activateReactivationPayment(tx, { businessId, subscriptionId: subscription.id, plan: services, provider: "fake", providerPaymentId: "pay_restart", paidAt: MONTH_AFTER, paidThroughAt: new Date("2027-01-09T09:00:00.000Z") }),
    );
    await execSql(dbs.owner, `update businesses set name = 'QA Services Business' where id = '${businessId}'`);
    await saveMaharashtraDetails();

    const restarted = await issue(restart.payment.id, new Date("2026-12-15T05:30:00.000Z"));

    expect(restart.payment.amountCents).toBe(3_303_764);
    expect(restarted.lines.map((line) => [line.description, line.discountAmountCents, line.note])).toEqual([
      ["Social Media and Ads", 199_980, "Package offer, 20% off"],
      ["Local SEO + AEO", 500_020, "Package offer, 20% off"],
    ]);
    expect(restarted.lines[0]?.detail).toBe("Monthly subscription, 09 Dec 2026 to 08 Jan 2027");
    expect(restarted.totalCents).toBe(restart.payment.amountCents);
  });

  it("invoices a charge payment by the charge's description and quantity", async () => {
    const unitAmountCents = 142_500;
    const charge = await insertCharge(dbs.staff.db, {
      businessId,
      kind: "change_hours",
      description: "Extra change hours",
      quantity: 2,
      unitAmountCents,
      taxRateBasisPoints: services.taxRateBasisPoints,
      amountCents: chargeAmountCents(unitAmountCents, 2, services.taxRateBasisPoints),
      currency: "INR",
      createdByStaffId: STAFF_USER,
    });
    // Recorded without an invoice: the plain query, not the payment path that issues one.
    const recorded = await recordChargePayment(dbs.staff.db, {
      chargeId: charge.id,
      businessId,
      provider: "fake",
      providerPaymentId: "pay_charge",
      amountCents: charge.amountCents,
      currency: "INR",
      paidAt: PAID_AT,
      now: PAID_AT,
    });

    const invoice = await issue(recorded.payment.id);

    expect(invoice.lines[0]).toMatchObject({ description: "Extra change hours", quantity: 2, unitAmountCents });
    expect(invoice.totalCents).toBe(charge.amountCents);
    expect(invoice.issuedOn).toBe("2026-11-15");
  });

  it("refuses a plan payment recorded before the lines it was billed at were kept, leaving no invoice and spending no number", async () => {
    const subscription = await openSubscription(linesOf("managed-website"));
    const payment = await seedPayment({ providerPaymentId: "pay_no_basis", subscriptionId: subscription.id, amountCents: 353_882 });

    await expect(issue(payment.id)).rejects.toBeInstanceOf(InvoiceSourceMismatchError);

    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();
  });

  it("refuses a payment whose kept basis is not the shape that was written, leaving no invoice and spending no number", async () => {
    const lines = linesOf("managed-website");
    const subscription = await openSubscription(lines);
    const payment = await seedPayment({
      providerPaymentId: "pay_bad_basis",
      subscriptionId: subscription.id,
      amountCents: chargedFor(lines),
      invoiceBasis: { ...basisOf(lines), lines: [{ addOn: "managed-website", listAmountCents: "299900" }] } as never,
    });

    await expect(issue(payment.id)).rejects.toBeInstanceOf(InvoiceSourceMismatchError);

    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();
  });

  it("keeps the basis a payment was first recorded with when another is saved for it", async () => {
    const first = linesOf("managed-website");
    const subscription = await openSubscription(first);
    const payment = await seedPayment({ providerPaymentId: "pay_basis_once", subscriptionId: subscription.id, amountCents: chargedFor(first) });

    await dbs.staff.db.transaction(async (tx) => {
      await savePaymentInvoiceBasis(tx, payment.id, basisOf(first));
      await savePaymentInvoiceBasis(tx, payment.id, basisOf(linesOf("managed-website", "digital-growth")));
    });

    const kept = await querySql<{ invoice_basis: PaymentInvoiceBasis }>(dbs.owner, `select invoice_basis from payments where id = '${payment.id}'`);
    expect(kept[0]?.invoice_basis).toEqual(basisOf(first));
  });

  it("refuses a payment whose kept lines do not come to what it took, leaving no invoice and spending no number", async () => {
    const lines = linesOf("managed-website", "digital-growth");
    const subscription = await openSubscription(lines);
    const payment = await seedPayment({
      providerPaymentId: "pay_odd",
      subscriptionId: subscription.id,
      amountCents: chargedFor(lines) + 100,
      invoiceBasis: basisOf(lines),
    });

    await expect(issue(payment.id)).rejects.toBeInstanceOf(InvoiceSourceMismatchError);

    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();
  });

  it("refuses a plan payment that has no subscription to rebuild from", async () => {
    const orphan = await seedPayment({ providerPaymentId: "pay_orphan", kind: "renewal", subscriptionId: null, amountCents: 100 });
    await expect(issue(orphan.id)).rejects.toBeInstanceOf(InvoiceSourceMismatchError);
    expect(await invoiceCount()).toBe(0);
  });

  it("refuses a charge payment that no charge points at", async () => {
    const payment = await seedPayment({ providerPaymentId: "pay_no_charge", kind: "charge", amountCents: 336_300 });
    await expect(issue(payment.id)).rejects.toBeInstanceOf(InvoiceSourceMismatchError);
    expect(await invoiceCount()).toBe(0);
  });

  it("refuses a business name or address the invoice cannot print, until English billing details are saved", async () => {
    const subscription = await openSubscription(linesOf("managed-website"));
    const payment = await payFirstWithoutPrintableInvoice(subscription);
    await dbs.owner.db.delete(billingProfiles);
    await execSql(dbs.owner, `update businesses set name = '${DEVANAGARI_NAME}' where id = '${businessId}'`);

    await expect(issue(payment.id)).rejects.toBeInstanceOf(UnprintableInvoiceTextError);
    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();

    await saveMaharashtraDetails();
    expect((await issue(payment.id)).recipient.legalName).toBe("QA Services Business LLP");
  });

  it("will not issue a second invoice for a payment, or one for a dollar payment", async () => {
    const subscription = await openSubscription(linesOf("managed-website"));
    const payment = await payFirstWithoutPrintableInvoice(subscription);
    await issue(payment.id);
    await expect(issue(payment.id)).rejects.toBeInstanceOf(NoMissingInvoiceError);

    const dollars = await seedPayment({ providerPaymentId: "pay_usd", currency: "USD", amountCents: 7_500 });
    await expect(issue(dollars.id)).rejects.toBeInstanceOf(NoMissingInvoiceError);

    expect(await invoiceCount()).toBe(1);
    expect(await nextSerial()).toBe(2);
  });

  it("will not invoice a payment recorded before invoicing started, an unknown payment, or another business's", async () => {
    // A reset empties the start row, which leaves nothing out; give it one the way the migration does.
    await dbs.owner.db.insert(taxInvoicingStart).values({ startedAt: new Date("2026-06-01T00:00:00.000Z") });
    const before = await seedPayment({ providerPaymentId: "pay_before", createdAt: new Date("2026-05-01T00:00:00.000Z") });
    await expect(issue(before.id)).rejects.toBeInstanceOf(NoMissingInvoiceError);
    await expect(issue("0192f3c4-0000-7000-8000-00000000dead")).rejects.toBeInstanceOf(NoMissingInvoiceError);

    const other = await addBusiness("INR", "other-business", "Other Business");
    const foreign = await seedPayment({ providerPaymentId: "pay_foreign", businessId: other });
    await expect(issue(foreign.id)).rejects.toBeInstanceOf(NoMissingInvoiceError);

    expect(await invoiceCount()).toBe(0);
  });

  it("will not date an invoice before its payment", async () => {
    const subscription = await openSubscription(linesOf("managed-website"));
    const payment = await payFirstWithoutPrintableInvoice(subscription);
    await expect(issue(payment.id, new Date("2026-10-01T00:00:00.000Z"))).rejects.toBeInstanceOf(InvoiceDatedBeforePaymentError);
    expect(await invoiceCount()).toBe(0);
  });

  it("invoices a first payment that covers a three month term as a subscription, not a monthly one", async () => {
    await execSql(dbs.owner, `update plans set initial_term_months = 3 where id = '${services.id}'`);
    const lines = linesOf("managed-website");
    const subscription = await openSubscription(lines, null, { ...services, initialTermMonths: 3 });
    const payment = await seedPayment({
      providerPaymentId: "pay_three_months",
      subscriptionId: subscription.id,
      amountCents: chargedFor(lines),
      invoiceBasis: basisOf(lines),
    });

    const invoice = await issue(payment.id);

    expect(invoice.lines[0]?.detail).toBe("Subscription, 09 Oct 2026 to 08 Jan 2027");
    expect(invoice.lines[0]?.detail).not.toContain("Monthly");
  });

  it("still invoices a payment on a plan that has since been retired", async () => {
    const lines = linesOf("managed-website");
    const subscription = await openSubscription(lines);
    const payment = await seedPayment({
      providerPaymentId: "pay_retired_plan",
      subscriptionId: subscription.id,
      amountCents: chargedFor(lines),
      invoiceBasis: basisOf(lines),
    });
    await execSql(dbs.owner, `update plans set active = false where id = '${services.id}'`);

    const invoice = await issue(payment.id);

    expect(invoice.lines[0]).toMatchObject({ description: "Managed Website", unitAmountCents: 299_900 });
    expect(await invoiceCount()).toBe(1);
  });

  it("rebuilds an add-on payment from its add-on, the month from the day paid, with the discount it was bought at", async () => {
    const { payment } = await seedAddOnPayment(50_000, "pay_add_on_discount");

    const invoice = await issue(payment.id);

    expect(invoice).toMatchObject({ issuedOn: "2026-11-15", paidOn: "2026-10-09", paymentId: payment.id, totalCents: 1_120_882 });
    expect(invoice.lines[0]).toMatchObject({
      description: "Social Media and Ads",
      detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
      note: null,
      unitAmountCents: 999_900,
      discountAmountCents: 50_000,
    });
  });

  it("rebuilds an add-on payment with no discount without a note", async () => {
    const { payment } = await seedAddOnPayment(0, "pay_add_on_list");

    const invoice = await issue(payment.id);

    expect(invoice.totalCents).toBe(1_179_882);
    expect(invoice.lines[0]).toMatchObject({ description: "Social Media and Ads", note: null, discountAmountCents: 0 });
  });

  it("says no price explains an add-on payment that is not linked to an add-on, and takes no number", async () => {
    const payment = await seedPayment({ providerPaymentId: "pay_add_on_unlinked", kind: "add_on", amountCents: 1_179_882 });

    await expect(issue(payment.id)).rejects.toBeInstanceOf(InvoiceSourceMismatchError);

    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();
  });

  it("says a payment of a kind nothing records today cannot be rebuilt, rather than that its figures do not match", async () => {
    const subscription = await openSubscription(linesOf("managed-website"));
    const payment = await seedPayment({
      providerPaymentId: "pay_extra_publish",
      kind: "extra_publish",
      subscriptionId: subscription.id,
      amountCents: 353_882,
    });

    const error = await issue(payment.id).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnsupportedPaymentKindError);
    expect(error).not.toBeInstanceOf(InvoiceSourceMismatchError);
    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();
  });

  it("lists a payment recorded with its invoice lines kept as missing, and keeps them when the invoice fails", async () => {
    const lines = linesOf("managed-website", "local-seo-aeo");
    const subscription = await openSubscription(lines);
    const payment = await payFirstWithoutPrintableInvoice(subscription);

    expect((await listPaymentsWithoutTaxInvoice(dbs.staff.db, businessId)).map((row) => row.id)).toEqual([payment.id]);
    const kept = await querySql<{ invoice_basis: PaymentInvoiceBasis }>(dbs.owner, `select invoice_basis from payments where id = '${payment.id}'`);
    expect(kept[0]?.invoice_basis).toEqual(basisOf(lines));
    expect(await findTaxInvoiceByPaymentId(dbs.staff.db, payment.id)).toBeNull();
  });

  describe("when two staff issue the same payment's invoice at once", () => {
    async function twoAtOnce(issueOne: () => Promise<unknown>): Promise<PromiseSettledResult<unknown>[]> {
      return Promise.allSettled([issueOne(), issueOne()]);
    }

    async function seedIssuable(): Promise<Payment> {
      const lines = linesOf("managed-website");
      const subscription = await openSubscription(lines);
      return seedPayment({
        providerPaymentId: "pay_race",
        subscriptionId: subscription.id,
        amountCents: chargedFor(lines),
        invoiceBasis: basisOf(lines),
      });
    }

    function expectOneWinner(results: PromiseSettledResult<unknown>[]): void {
      const fulfilled = results.filter((result) => result.status === "fulfilled");
      const rejected = results.filter((result): result is PromiseRejectedResult => result.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0]?.reason).toBeInstanceOf(NoMissingInvoiceError);
    }

    it("under the business's billing lock, as the staff action runs, the second finds the payment no longer missing", async () => {
      const payment = await seedIssuable();

      expectOneWinner(await twoAtOnce(() => issue(payment.id)));

      expect(await invoiceCount()).toBe(1);
      expect(await nextSerial()).toBe(2);
    });

    it("even without that lock, the payment's own row lock lets only one issue and the other finds it issued", async () => {
      const payment = await seedIssuable();
      const withoutBusinessLock = (): Promise<unknown> =>
        dbs.staff.db.transaction((tx) => issueMissingTaxInvoice(tx, businessId, payment.id, ISSUED_AT));

      expectOneWinner(await twoAtOnce(withoutBusinessLock));

      expect(await invoiceCount()).toBe(1);
      expect(await nextSerial()).toBe(2);
    });
  });
});
