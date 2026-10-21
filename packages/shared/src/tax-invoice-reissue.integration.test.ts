import { randomUUID } from "node:crypto";
import { chargedAmountCents, discountCentsFor } from "@brandbasket/billing";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRetentionDiscount,
  billingProfiles,
  businesses,
  charges,
  createReferralCode,
  findActivePlan,
  insertAddOnSubscription,
  insertCharge,
  lockBusinessForBilling,
  openCheckoutSubscription,
  payments,
  recordAddOnPayment,
  recordChargePayment,
  taxInvoicingStart,
  users,
  type Payment,
  type Plan,
  type Subscription,
} from "@brandbasket/db";
import { execSql, openTestDatabases, querySql, resetTestDatabase, seedManagedWebsitePlans, type TestDatabases } from "@brandbasket/db/testing";
import { chargeAmountCents } from "./lib/billing/charges";
import {
  InvoiceSourceMismatchError,
  issueMissingTaxInvoice,
  NoMissingInvoiceError,
  UnsupportedPaymentKindError,
} from "./server/tax-invoice-reissue";
import { InvoiceDatedBeforePaymentError, LIFETIME_OFFER_INVOICE_NOTE, UnprintableInvoiceTextError } from "./server/tax-invoicing";

// The issuer is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/**
 * The staff path that issues an invoice a payment is missing, against a real database. Payments are seeded straight
 * into the books, so none of them was invoiced when it was recorded, which is exactly the state staff find them in.
 */

const STAFF_USER = "staff-reissue";
const PAID_AT = new Date("2026-10-09T09:00:00.000Z");
const ISSUED_AT = new Date("2026-11-15T05:30:00.000Z");

let dbs: TestDatabases;
let businessId = "";
let premium: Plan;

async function addBusiness(currency: "INR" | "USD", slug: string, name = "QA Premium Business"): Promise<string> {
  const rows = await dbs.owner.db.insert(businesses).values({ slug, name, currency }).returning({ id: businesses.id });
  return rows[0]?.id ?? "";
}

async function saveMaharashtraDetails(): Promise<void> {
  await dbs.owner.db.insert(billingProfiles).values({
    businessId,
    legalName: "QA Premium Business LLP",
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

function openSubscription(plan: Plan, referral: { readonly referralCodeId: string; readonly discountAmountCents: number } | null = null): Promise<Subscription> {
  return openCheckoutSubscription(dbs.staff.db, {
    businessId,
    planId: plan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"d".repeat(24)}`,
    referralCodeId: referral?.referralCodeId ?? null,
    discountAmountCents: referral?.discountAmountCents ?? 0,
    replacing: null,
    now: PAID_AT,
  });
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
 * An add-on payment recorded without an invoice, through the same recorder the webhook uses: Social Media and Ads at the list price,
 * with the Premium 10% off when `premiumMember`. Returns the payment and the add-on row it paid for.
 */
async function seedAddOnPayment(signupOffer: boolean, providerPaymentId: string): Promise<{ readonly payment: Payment; readonly addOnSubscriptionId: string }> {
  // Social Media and Ads at ₹7,000, with the 5% sign-up offer (₹350) when it was chosen with the first checkout.
  const discountAmountCents = signupOffer ? 35_000 : 0;
  const row = await insertAddOnSubscription(dbs.staff.db, {
    id: randomUUID(),
    businessId,
    addOn: "digital-growth",
    listAmountCents: 700_000,
    discountAmountCents,
    offerDiscountAmountCents: discountAmountCents,
    netAmountCents: 700_000 - discountAmountCents,
    taxRateBasisPoints: 1_800,
    chargedAmountCents: chargedAmountCents(700_000, discountAmountCents, 1_800),
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
      periodEnd: new Date("2026-11-09T09:00:00.000Z"),
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
  await seedManagedWebsitePlans(dbs.owner);
  const plan = await findActivePlan(dbs.staff.db, "INR", "managed");
  if (plan === null) throw new Error("No active INR Premium plan was seeded");
  premium = plan;
  await dbs.owner.db.insert(users).values({ id: STAFF_USER, name: "Superadmin", email: "admin@example.test", emailVerified: true });
  businessId = await addBusiness("INR", "qa-premium");
  await saveMaharashtraDetails();
});

describe("issueMissingTaxInvoice", () => {
  it("invoices a first payment on the day staff issue it, listing the day the payment was made and a period from then", async () => {
    const subscription = await openSubscription(premium);
    const payment = await seedPayment({
      providerPaymentId: "pay_initial",
      subscriptionId: subscription.id,
      amountCents: chargedAmountCents(premium.initialAmountCents, 0, premium.taxRateBasisPoints),
    });

    const invoice = await issue(payment.id);

    expect(invoice).toMatchObject({
      number: "FY/26-27/000001",
      issuedOn: "2026-11-15",
      paidOn: "2026-10-09",
      paymentId: payment.id,
      totalCents: payment.amountCents,
    });
    expect(invoice.lines[0]).toMatchObject({
      description: "Brandbasket Managed Website plan",
      detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
      unitAmountCents: premium.initialAmountCents,
      discountAmountCents: 0,
    });
  });

  it("matches a first payment charged with the subscription's coupon, and names the coupon", async () => {
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
    const discountAmountCents = discountCentsFor(discount, premium.initialAmountCents);
    const subscription = await openSubscription(premium, { referralCodeId: created.id, discountAmountCents });
    const payment = await seedPayment({
      providerPaymentId: "pay_coupon",
      subscriptionId: subscription.id,
      amountCents: chargedAmountCents(premium.initialAmountCents, discountAmountCents, premium.taxRateBasisPoints),
    });

    const invoice = await issue(payment.id);

    expect(invoice.lines[0]).toMatchObject({ discountAmountCents, note: "Coupon GAURAV applied, 20% off" });
    expect(invoice.totalCents).toBe(payment.amountCents);
  });

  it("matches a renewal charged at the price with the stay offer, and one charged before the offer existed to the price without it", async () => {
    const opened = await openSubscription(premium);
    const stayOffer = discountCentsFor({ kind: "percent", basisPoints: 1_000 }, premium.recurringAmountCents);
    expect(await applyRetentionDiscount(dbs.staff.db, { subscriptionId: opened.id, businessId, retentionDiscountCents: stayOffer })).toBe(true);
    const withOffer = await seedPayment({
      providerPaymentId: "pay_renewal_with_offer",
      kind: "renewal",
      subscriptionId: opened.id,
      amountCents: chargedAmountCents(premium.recurringAmountCents, stayOffer, premium.taxRateBasisPoints),
    });
    const beforeOffer = await seedPayment({
      providerPaymentId: "pay_renewal_before_offer",
      kind: "renewal",
      subscriptionId: opened.id,
      paidAt: new Date("2026-09-09T09:00:00.000Z"),
      amountCents: chargedAmountCents(premium.recurringAmountCents, 0, premium.taxRateBasisPoints),
    });

    const earlier = await issue(beforeOffer.id);
    const later = await issue(withOffer.id);

    expect(earlier.lines[0]).toMatchObject({ discountAmountCents: 0, note: null, detail: "Monthly subscription, 09 Sep to 08 Oct 2026" });
    expect(earlier.paidOn).toBe("2026-09-09");
    expect(later.lines[0]).toMatchObject({ discountAmountCents: stayOffer, note: "Stay offer applied" });
    expect(later.totalCents).toBe(withOffer.amountCents);
  });

  it("invoices a charge payment by the charge's description and quantity", async () => {
    const unitAmountCents = 142_500;
    const charge = await insertCharge(dbs.staff.db, {
      businessId,
      kind: "change_hours",
      description: "Extra change hours",
      quantity: 2,
      unitAmountCents,
      taxRateBasisPoints: premium.taxRateBasisPoints,
      amountCents: chargeAmountCents(unitAmountCents, 2, premium.taxRateBasisPoints),
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

  it("refuses a payment whose amount no known price explains, leaving no invoice and spending no number", async () => {
    const subscription = await openSubscription(premium);
    const payment = await seedPayment({ providerPaymentId: "pay_odd", subscriptionId: subscription.id, amountCents: 123_457 });

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
    await dbs.owner.db.delete(billingProfiles);
    await dbs.owner.db.update(businesses).set({ name: "अरविंद डेंटल" });
    const subscription = await openSubscription(premium);
    const payment = await seedPayment({
      providerPaymentId: "pay_hindi",
      subscriptionId: subscription.id,
      amountCents: chargedAmountCents(premium.initialAmountCents, 0, premium.taxRateBasisPoints),
    });

    await expect(issue(payment.id)).rejects.toBeInstanceOf(UnprintableInvoiceTextError);
    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();

    await saveMaharashtraDetails();
    expect((await issue(payment.id)).recipient.legalName).toBe("QA Premium Business LLP");
  });

  it("will not issue a second invoice for a payment, or one for a dollar payment", async () => {
    const subscription = await openSubscription(premium);
    const payment = await seedPayment({
      providerPaymentId: "pay_once",
      subscriptionId: subscription.id,
      amountCents: chargedAmountCents(premium.initialAmountCents, 0, premium.taxRateBasisPoints),
    });
    await issue(payment.id);
    await expect(issue(payment.id)).rejects.toBeInstanceOf(NoMissingInvoiceError);

    const dollars = await seedPayment({ providerPaymentId: "pay_usd", currency: "USD", amountCents: 6_900 });
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
    const subscription = await openSubscription(premium);
    const payment = await seedPayment({
      providerPaymentId: "pay_early",
      subscriptionId: subscription.id,
      amountCents: chargedAmountCents(premium.initialAmountCents, 0, premium.taxRateBasisPoints),
    });
    await expect(issue(payment.id, new Date("2026-10-01T00:00:00.000Z"))).rejects.toBeInstanceOf(InvoiceDatedBeforePaymentError);
    expect(await invoiceCount()).toBe(0);
  });
  it("invoices a reactivation at the plan's recurring price, for one month from the day it was paid", async () => {
    const subscription = await openSubscription(premium);
    const payment = await seedPayment({
      providerPaymentId: "pay_reactivation",
      kind: "reactivation",
      subscriptionId: subscription.id,
      amountCents: chargedAmountCents(premium.recurringAmountCents, 0, premium.taxRateBasisPoints),
    });

    const invoice = await issue(payment.id);

    expect(invoice.lines[0]).toMatchObject({
      description: "Brandbasket Managed Website plan",
      detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
      unitAmountCents: premium.recurringAmountCents,
      discountAmountCents: 0,
    });
    expect(invoice.totalCents).toBe(payment.amountCents);
  });

  it("invoices a first payment that covers a three month term as a subscription, not a monthly one", async () => {
    await execSql(dbs.owner, `update plans set initial_term_months = 3 where id = '${premium.id}'`);
    const subscription = await openSubscription({ ...premium, initialTermMonths: 3 });
    const payment = await seedPayment({
      providerPaymentId: "pay_three_months",
      subscriptionId: subscription.id,
      amountCents: chargedAmountCents(premium.initialAmountCents, 0, premium.taxRateBasisPoints),
    });

    const invoice = await issue(payment.id);

    expect(invoice.lines[0]?.detail).toBe("Subscription, 09 Oct 2026 to 08 Jan 2027");
    expect(invoice.lines[0]?.detail).not.toContain("Monthly");
  });

  it("refuses a payment whose plan has changed price since, writing nothing and taking no number", async () => {
    const subscription = await openSubscription(premium);
    const payment = await seedPayment({
      providerPaymentId: "pay_before_price_change",
      kind: "renewal",
      subscriptionId: subscription.id,
      amountCents: chargedAmountCents(premium.recurringAmountCents, 0, premium.taxRateBasisPoints),
    });
    await execSql(dbs.owner, `update plans set recurring_amount_cents = ${premium.recurringAmountCents + 10_000} where id = '${premium.id}'`);

    await expect(issue(payment.id)).rejects.toBeInstanceOf(InvoiceSourceMismatchError);

    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();
  });

  it("still invoices a payment on a plan that has since been retired", async () => {
    const subscription = await openSubscription(premium);
    const payment = await seedPayment({
      providerPaymentId: "pay_retired_plan",
      subscriptionId: subscription.id,
      amountCents: chargedAmountCents(premium.initialAmountCents, 0, premium.taxRateBasisPoints),
    });
    await execSql(dbs.owner, `update plans set active = false where id = '${premium.id}'`);

    const invoice = await issue(payment.id);

    expect(invoice.lines[0]).toMatchObject({ description: "Brandbasket Managed Website plan", unitAmountCents: premium.initialAmountCents });
    expect(await invoiceCount()).toBe(1);
  });

  it("rebuilds an add-on payment from its add-on, the month from the day paid, with the sign-up offer and its note", async () => {
    const { payment } = await seedAddOnPayment(true, "pay_add_on_offer");

    const invoice = await issue(payment.id);

    expect(invoice).toMatchObject({ issuedOn: "2026-11-15", paidOn: "2026-10-09", paymentId: payment.id, totalCents: 784_700 });
    expect(invoice.lines[0]).toMatchObject({
      description: "Social Media and Ads",
      detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
      note: LIFETIME_OFFER_INVOICE_NOTE,
      unitAmountCents: 700_000,
      discountAmountCents: 35_000,
    });
  });

  it("rebuilds an add-on payment with no discount without a note", async () => {
    const { payment } = await seedAddOnPayment(false, "pay_add_on_list");

    const invoice = await issue(payment.id);

    expect(invoice.totalCents).toBe(826_000);
    expect(invoice.lines[0]).toMatchObject({ description: "Social Media and Ads", note: null, discountAmountCents: 0 });
  });

  it("says no price explains an add-on payment that is not linked to an add-on, and takes no number", async () => {
    const payment = await seedPayment({ providerPaymentId: "pay_add_on_unlinked", kind: "add_on", amountCents: 1_180_000 });

    await expect(issue(payment.id)).rejects.toBeInstanceOf(InvoiceSourceMismatchError);

    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();
  });

  it("says a payment of a kind nothing records today cannot be rebuilt, rather than that its figures do not match", async () => {
    const subscription = await openSubscription(premium);
    const payment = await seedPayment({
      providerPaymentId: "pay_extra_publish",
      kind: "extra_publish",
      subscriptionId: subscription.id,
      amountCents: chargedAmountCents(premium.recurringAmountCents, 0, premium.taxRateBasisPoints),
    });

    const error = await issue(payment.id).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(UnsupportedPaymentKindError);
    expect(error).not.toBeInstanceOf(InvoiceSourceMismatchError);
    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();
  });

  describe("when two staff issue the same payment's invoice at once", () => {
    async function twoAtOnce(issueOne: () => Promise<unknown>): Promise<PromiseSettledResult<unknown>[]> {
      return Promise.allSettled([issueOne(), issueOne()]);
    }

    async function seedIssuable(): Promise<Payment> {
      const subscription = await openSubscription(premium);
      return seedPayment({
        providerPaymentId: "pay_race",
        subscriptionId: subscription.id,
        amountCents: chargedAmountCents(premium.initialAmountCents, 0, premium.taxRateBasisPoints),
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
