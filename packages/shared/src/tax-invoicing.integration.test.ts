import { chargedAmountCents } from "@brandbasket/billing";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  billingProfiles,
  businesses,
  businessProfiles,
  charges,
  createAffiliate,
  createReferralCode,
  findActivePlan,
  findPaymentByProviderId,
  findTaxInvoiceByPaymentId,
  insertSubscription,
  listPaymentsWithoutTaxInvoice,
  payments,
  users,
  type Payment,
  type Plan,
  type ReferralDiscount,
  type ScopedTransaction,
} from "@brandbasket/db";
import { execSql, openTestDatabases, querySql, resetTestDatabase, seedPlansFromMigrations, type TestDatabases } from "@brandbasket/db/testing";
import { issueTaxInvoice, issueTaxInvoiceSafely, type InvoiceSource, type IssuedTaxInvoice } from "./server/tax-invoicing";

// tax-invoicing is server-only in the app; there is no browser here to keep it out of.
vi.mock("server-only", () => ({}));

/**
 * Issuing a tax invoice for a recorded payment, against a real database: the number it takes, the tax split it
 * stores, the payments that get none, and the savepoint that lets a payment commit when its invoice cannot be issued.
 */

const STAFF_USER = "staff-1";
const PAID_AT = new Date("2026-10-09T09:00:00.000Z");
const PERIOD_END = new Date("2026-11-09T09:00:00.000Z");
/**
 * A plan line at a price of its own, the way plans were sold before the services became lines (the plan row itself costs
 * nothing now, so these amounts are the source's): ₹6,999 less a 20% coupon is ₹5,599.20 taxable, CGST and SGST ₹503.93 each,
 * ₹6,607.06 charged.
 */
const NET_CENTS = 699_900;
const DISCOUNT_CENTS = 139_980;
const PLAN_CHARGED_CENTS = chargedAmountCents(NET_CENTS, DISCOUNT_CENTS, 1_800);

let dbs: TestDatabases;
let businessId = "";
let servicesPlan: Plan;

const MAHARASHTRA_DETAILS = {
  legalName: "QA Premium Business LLP",
  gstin: "27AAPFU0939F1ZV",
  addressLine1: "Shop 4, Gokul Arcade",
  addressLine2: null,
  city: "Mumbai",
  postalCode: "400080",
  stateCode: "mh",
  email: "accounts@qapremium.in",
  phone: "+919820012345",
} as const;

async function saveDetails(overrides: Partial<typeof billingProfiles.$inferInsert> = {}): Promise<void> {
  await dbs.owner.db.insert(billingProfiles).values({ businessId, ...MAHARASHTRA_DETAILS, ...overrides });
}

/** A captured INR card payment, written through `db` so a test can write it inside the transaction under test. */
async function seedPayment(
  db: TestDatabases["staff"]["db"] | ScopedTransaction,
  providerPaymentId: string,
  overrides: Partial<typeof payments.$inferInsert> = {},
): Promise<Payment> {
  await db.insert(payments).values({
    businessId,
    provider: "fake",
    providerPaymentId,
    kind: "renewal",
    amountCents: PLAN_CHARGED_CENTS,
    currency: "INR",
    status: "captured",
    paidAt: PAID_AT,
    method: "card",
    cardNetwork: "Visa",
    cardType: "credit",
    cardLast4: "4366",
    ...overrides,
  });
  const payment = await findPaymentByProviderId(db, "fake", providerPaymentId);
  if (payment === null) throw new Error(`Payment ${providerPaymentId} was not seeded`);
  return payment;
}

interface CouponRenewal {
  readonly code: string;
  readonly discount: ReferralDiscount | null;
  /** What the code takes off, frozen on the subscription. */
  readonly discountAmountCents: number;
  /** A stay offer added on top, or 0. */
  readonly retentionDiscountCents: number;
}

const GAURAV: CouponRenewal = { code: "GAURAV", discount: { kind: "percent", basisPoints: 2_000 }, discountAmountCents: DISCOUNT_CENTS, retentionDiscountCents: 0 };

/**
 * A Premium subscription on a referral code (GAURAV at 20% unless another is given), with any stay offer on it, and a
 * renewal paid on it at what that leaves. A code with no discount is an affiliate's.
 */
async function seedCouponRenewal(providerPaymentId = "fake_pay_renewal", coupon: CouponRenewal = GAURAV): Promise<Payment> {
  const affiliateId =
    coupon.discount === null
      ? (
          await createAffiliate(dbs.staff.db, {
            name: "Asha Nair",
            email: "asha@example.com",
            phone: null,
            reward: { kind: "amount", amountCents: 20_000 },
            rewardCurrency: "INR",
            rewardCycles: null,
            notes: null,
            createdByStaffId: STAFF_USER,
          })
        ).id
      : null;
  const code = await createReferralCode(dbs.staff.db, {
    code: coupon.code,
    currency: "INR",
    affiliateId,
    discount: coupon.discount,
    expiresAt: null,
    maxRedemptions: null,
    createdByStaffId: STAFF_USER,
  });
  const subscription = await insertSubscription(dbs.staff.db, {
    businessId,
    planId: servicesPlan.id,
    provider: "fake",
    providerSubscriptionId: `fake_sub_${"c".repeat(24)}`,
    referralCodeId: code.id,
    discountAmountCents: coupon.discountAmountCents,
  });
  if (coupon.retentionDiscountCents > 0) {
    // A stay offer taken before stay offers were removed: its worth sits on the subscription and in its discount.
    await execSql(
      dbs.owner,
      `update subscriptions set retention_discount_cents = ${coupon.retentionDiscountCents}, discount_amount_cents = discount_amount_cents + ${coupon.retentionDiscountCents} where id = '${subscription.id}'`,
    );
  }
  const discount = coupon.discountAmountCents + coupon.retentionDiscountCents;
  return seedPayment(dbs.staff.db, providerPaymentId, {
    subscriptionId: subscription.id,
    amountCents: chargedAmountCents(NET_CENTS, discount, 1_800),
  });
}

/** The month a renewal paid for, at Premium's ₹6,999 less `discountAmountCents` (the 20% coupon unless given). */
function planSource(discountAmountCents = DISCOUNT_CENTS, retentionDiscountCents = 0): Extract<InvoiceSource, { kind: "plan" }> {
  return {
    kind: "plan",
    plan: servicesPlan,
    netAmountCents: NET_CENTS,
    discountAmountCents,
    retentionDiscountCents,
    monthly: true,
    periodStart: PAID_AT,
    periodEnd: PERIOD_END,
  };
}

/** The next serial the counter would hand out for 26-27, or null when no invoice has taken one yet. */
async function nextSerial(): Promise<number | null> {
  const rows = await querySql<{ next_serial: number }>(
    dbs.owner,
    "select next_serial from tax_invoice_series where prefix = 'FY' and financial_year = '26-27'",
  );
  return rows[0]?.next_serial ?? null;
}

async function invoiceCount(): Promise<number> {
  const rows = await querySql<{ count: string }>(dbs.owner, "select count(*) as count from tax_invoices");
  return Number(rows[0]?.count ?? 0);
}

function issueSafely(payment: Payment, source: InvoiceSource) {
  return dbs.staff.db.transaction((tx) => issueTaxInvoiceSafely(tx, payment, source));
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
  servicesPlan = plan;
  await dbs.owner.db.insert(users).values({ id: STAFF_USER, name: "Superadmin", email: "admin@example.test", emailVerified: true });
  const rows = await dbs.owner.db
    .insert(businesses)
    .values({ slug: "qa-premium", name: "QA Premium Business", currency: "INR" })
    .returning({ id: businesses.id });
  businessId = rows[0]?.id ?? "";
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("issueTaxInvoice", () => {
  it("invoices a discounted plan payment to a Maharashtra customer with CGST and SGST that add up to what was charged", async () => {
    await saveDetails();
    const payment = await seedCouponRenewal();

    const invoice = await issueSafely(payment, planSource());

    expect(invoice).toMatchObject({
      businessId,
      paymentId: payment.id,
      number: "FY/26-27/000001",
      financialYear: "26-27",
      serial: 1,
      issuedOn: "2026-10-09",
      paidOn: "2026-10-09",
      placeOfSupplyStateCode: "mh",
      placeOfSupplyBasis: "gstin",
      supplyType: "intra_state",
      taxableCents: 559_920,
      cgstCents: 50_393,
      sgstCents: 50_393,
      igstCents: 0,
      roundOffCents: 0,
      totalCents: payment.amountCents,
      paymentLabel: "Visa credit card ending 4366",
      paymentReference: "fake_pay_renewal",
    });
    expect(invoice?.lines).toEqual([
      {
        description: "Brandbasket services plan",
        detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
        note: "Coupon GAURAV applied, 20% off",
        sac: "998361",
        quantity: 1,
        unitAmountCents: NET_CENTS,
        grossAmountCents: NET_CENTS,
        discountAmountCents: DISCOUNT_CENTS,
        taxableCents: 559_920,
        taxRateBasisPoints: 1_800,
        cgstCents: 50_393,
        sgstCents: 50_393,
        igstCents: 0,
        taxCents: 100_786,
      },
    ]);
    expect(invoice?.recipient).toEqual({
      legalName: "QA Premium Business LLP",
      tradeName: null,
      gstin: "27AAPFU0939F1ZV",
      cin: null,
      addressLines: ["Shop 4, Gokul Arcade", "Mumbai 400080"],
      stateCode: "mh",
      email: null,
      phone: null,
    });
    expect(invoice?.supplier).toMatchObject({
      legalName: "Digibranders Private Limited",
      tradeName: "Brandbasket",
      gstin: "27AAICD9268J1Z0",
      stateCode: "mh",
    });
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('"invoiceNumber":"FY/26-27/000001"'));
  });

  it("invoices a package at the odd prices to the paisa, with the GST on the total shared over the lines and the lines kept beside the payment", async () => {
    await saveDetails();
    // ₹2,999 and ₹9,999 at 20% off, the total floored to the whole rupee: the dearest line carries 40 paise more of discount.
    const bundledAddOns = [
      { addOn: "managed-website", listAmountCents: 299_900, offerDiscountAmountCents: 59_980, taxRateBasisPoints: 1_800 },
      { addOn: "digital-growth", listAmountCents: 999_900, offerDiscountAmountCents: 199_980 + 40, taxRateBasisPoints: 1_800 },
    ];
    const payment = await seedPayment(dbs.staff.db, "fake_pay_odd", { kind: "initial", amountCents: 1_226_964 });

    const invoice = await issueSafely(payment, { ...planSource(0), netAmountCents: 0, bundledAddOns });

    expect(invoice).toMatchObject({ taxableCents: 1_039_800, cgstCents: 93_582, sgstCents: 93_582, roundOffCents: 0, totalCents: 1_226_964 });
    expect(invoice?.lines.map((line) => [line.taxableCents, line.cgstCents, line.sgstCents, line.taxCents])).toEqual([
      [239_920, 21_593, 21_593, 43_186],
      [799_880, 71_989, 71_989, 143_978],
    ]);
    const kept = await querySql<{ invoice_basis: unknown }>(dbs.owner, `select invoice_basis from payments where id = '${payment.id}'`);
    expect(kept[0]?.invoice_basis).toEqual({ netAmountCents: 0, discountAmountCents: 0, retentionDiscountCents: 0, lines: bundledAddOns });
  });

  it("prints the one paisa that equal CGST and SGST cannot share as a round-off when the GST on the total is odd", async () => {
    await saveDetails();
    // ₹2,399.20 and ₹7,999.20: the GST on their total, 187,171.2, rounds to 187,171, and the two halves can only be even.
    const bundledAddOns = [
      { addOn: "managed-website", listAmountCents: 299_900, offerDiscountAmountCents: 59_980, taxRateBasisPoints: 1_800 },
      { addOn: "digital-growth", listAmountCents: 999_900, offerDiscountAmountCents: 199_980, taxRateBasisPoints: 1_800 },
    ];
    const payment = await seedPayment(dbs.staff.db, "fake_pay_odd_gst", { kind: "initial", amountCents: 1_227_011 });

    const invoice = await issueSafely(payment, { ...planSource(0), netAmountCents: 0, bundledAddOns });

    expect(invoice).toMatchObject({ taxableCents: 1_039_840, cgstCents: 93_586, sgstCents: 93_586, roundOffCents: -1, totalCents: 1_227_011 });
  });

  it("issues the invoice in the FY series, trading as Brandbasket", async () => {
    await saveDetails();
    const invoice = await issueSafely(await seedCouponRenewal("fake_pay_brandbasket"), planSource());

    expect(invoice).toMatchObject({ number: "FY/26-27/000001", prefix: "FY", serial: 1 });
    expect(invoice?.supplier).toMatchObject({ legalName: "Digibranders Private Limited", tradeName: "Brandbasket", email: "support@brandbasket.in", gstin: "27AAICD9268J1Z0" });
    expect(invoice?.lines[0]?.description).toBe("Brandbasket services plan");
  });

  it("returns the invoice already issued when asked again, takes no new number and logs the issue once", async () => {
    await saveDetails();
    const payment = await seedCouponRenewal();
    const first = await issueSafely(payment, planSource());

    const second = await dbs.staff.db.transaction((tx) => issueTaxInvoice(tx, payment, planSource()));
    const third = await issueSafely(payment, planSource());

    expect(second).toEqual({ invoice: first, issued: false });
    expect(third?.id).toBe(first?.id);
    expect(await invoiceCount()).toBe(1);
    expect(await nextSerial()).toBe(2);
    expect(vi.mocked(console.info).mock.calls.filter(([line]) => String(line).includes("tax-invoice-issued"))).toHaveLength(1);
  });

  it("makes a second issuer for the same payment wait, then hands it the first one's invoice", async () => {
    await saveDetails();
    const payment = await seedCouponRenewal();
    let second: Promise<IssuedTaxInvoice | null> = Promise.resolve(null);
    let secondSettled = false;

    const first = await dbs.staff.db.transaction(async (tx) => {
      const issued = await issueTaxInvoice(tx, payment, planSource());
      second = dbs.staff.db.transaction((other) => issueTaxInvoice(other, payment, planSource()));
      const settle = (): void => {
        secondSettled = true;
      };
      second.then(settle, settle);
      // The second call waits on the payment row's lock; give it time to show it has not slipped past.
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(secondSettled).toBe(false);
      return issued;
    });

    expect(first?.issued).toBe(true);
    expect(await second).toEqual({ invoice: first?.invoice, issued: false });
    expect(await invoiceCount()).toBe(1);
    expect(await nextSerial()).toBe(2);
  });

  it("dates a later issue on the day it is issued, in that day's financial year, never the payment's", async () => {
    await saveDetails();
    const paidAt = new Date("2027-03-31T09:00:00.000Z");
    const payment = await seedCouponRenewal("fake_pay_march", { ...GAURAV });
    await execSql(dbs.owner, `update payments set paid_at = '${paidAt.toISOString()}' where id = '${payment.id}'`);
    const paidInMarch = { ...payment, paidAt };

    const result = await dbs.staff.db.transaction((tx) =>
      issueTaxInvoice(tx, paidInMarch, planSource(), { issuedAt: new Date("2027-04-02T09:00:00.000Z") }),
    );

    expect(result?.invoice).toMatchObject({
      issuedOn: "2027-04-02",
      paidOn: "2027-03-31",
      financialYear: "27-28",
      number: "FY/27-28/000001",
    });
  });

  it("refuses to backdate an invoice to before the payment", async () => {
    await saveDetails();
    const payment = await seedCouponRenewal();

    await expect(
      dbs.staff.db.transaction((tx) => issueTaxInvoice(tx, payment, planSource(), { issuedAt: new Date("2026-10-08T09:00:00.000Z") })),
    ).rejects.toThrow(RangeError);
  });

  it("refuses a charge that this payment did not pay", async () => {
    const payment = await seedPayment(dbs.staff.db, "fake_pay_other", { kind: "charge", amountCents: chargedAmountCents(49_900, 0, 1_800) });
    const open = await dbs.owner.db
      .insert(charges)
      .values({
        businessId,
        kind: "custom",
        description: "Extra team seats",
        quantity: 1,
        unitAmountCents: 49_900,
        taxRateBasisPoints: 1_800,
        amountCents: chargedAmountCents(49_900, 0, 1_800),
        currency: "INR",
        status: "open",
        createdByStaffId: STAFF_USER,
      })
      .returning({ id: charges.id });

    await expect(
      dbs.staff.db.transaction((tx) => issueTaxInvoice(tx, payment, { kind: "charge", chargeId: open[0]?.id ?? "" })),
    ).rejects.toThrow(/was not paid by payment/);
    expect(await invoiceCount()).toBe(0);
  });

  it("names an amount coupon without a share", async () => {
    await saveDetails();
    const payment = await seedCouponRenewal("fake_pay_flat", {
      ...GAURAV,
      code: "FLAT",
      discount: { kind: "amount", amountCents: DISCOUNT_CENTS },
    });

    const invoice = await issueSafely(payment, planSource());

    expect(invoice?.lines[0]).toMatchObject({ note: "Coupon FLAT applied", discountAmountCents: DISCOUNT_CENTS });
    expect(invoice?.totalCents).toBe(PLAN_CHARGED_CENTS);
  });

  it("names a stay offer beside the coupon, and the coupon by its own share of the discount", async () => {
    await saveDetails();
    const payment = await seedCouponRenewal("fake_pay_stay", { ...GAURAV, retentionDiscountCents: 70_000 });

    const invoice = await issueSafely(payment, planSource(DISCOUNT_CENTS + 70_000, 70_000));

    expect(invoice?.lines[0]).toMatchObject({
      note: "Coupon GAURAV applied, 20% off. Stay offer applied",
      discountAmountCents: DISCOUNT_CENTS + 70_000,
      taxableCents: NET_CENTS - DISCOUNT_CENTS - 70_000,
    });
    expect(invoice?.roundOffCents).toBe(0);
    expect(invoice?.totalCents).toBe(payment.amountCents);
  });

  it("says nothing about an affiliate's code that gives no discount", async () => {
    await saveDetails();
    const payment = await seedCouponRenewal("fake_pay_affiliate", { code: "ASHA", discount: null, discountAmountCents: 0, retentionDiscountCents: 0 });

    const invoice = await issueSafely(payment, planSource(0));

    expect(invoice?.lines[0]).toMatchObject({ note: null, discountAmountCents: 0, taxableCents: NET_CENTS });
  });

  it("issues nothing for a dollar payment, or for money that bought nothing", async () => {
    const dollars = await seedPayment(dbs.staff.db, "fake_pay_usd", { currency: "USD", amountCents: 6_900 });
    const mismatched = await seedPayment(dbs.staff.db, "fake_pay_mismatch", {
      attentionReason: "amount_mismatch",
      attentionRaisedAt: PAID_AT,
    });

    expect(await issueSafely(dollars, planSource())).toBeNull();
    expect(await issueSafely(mismatched, planSource())).toBeNull();
    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();
  });

  it("invoices a paid extra by its description, quantity and rate, to the onboarding address when there are no billing details", async () => {
    await dbs.owner.db.insert(businessProfiles).values({
      businessId,
      displayName: "QA Premium Business",
      addressLine1: "12 Brigade Road",
      city: "Bengaluru",
      region: "Karnataka",
      postalCode: "560001",
    });
    const amountCents = chargedAmountCents(2 * 49_900, 0, 1_800);
    const payment = await seedPayment(dbs.staff.db, "fake_pay_charge", { kind: "charge", amountCents });
    const rows = await dbs.owner.db
      .insert(charges)
      .values({
        businessId,
        kind: "custom",
        description: "Extra team seats",
        quantity: 2,
        unitAmountCents: 49_900,
        taxRateBasisPoints: 1_800,
        amountCents,
        currency: "INR",
        status: "paid",
        createdByStaffId: STAFF_USER,
        paymentId: payment.id,
        paidAt: PAID_AT,
      })
      .returning({ id: charges.id });
    const chargeId = rows[0]?.id ?? "";

    const invoice = await issueSafely(payment, { kind: "charge", chargeId });

    expect(invoice).toMatchObject({
      number: "FY/26-27/000001",
      placeOfSupplyStateCode: "ka",
      placeOfSupplyBasis: "billing_address",
      supplyType: "inter_state",
      taxableCents: 99_800,
      cgstCents: 0,
      sgstCents: 0,
      igstCents: 17_964,
      roundOffCents: 0,
      totalCents: amountCents,
    });
    expect(invoice?.lines).toEqual([
      expect.objectContaining({ description: "Extra team seats", detail: null, note: null, quantity: 2, unitAmountCents: 49_900, taxRateBasisPoints: 1_800 }),
    ]);
    expect(invoice?.recipient).toMatchObject({
      legalName: "QA Premium Business",
      addressLines: ["12 Brigade Road", "Bengaluru 560001"],
      stateCode: "ka",
      gstin: null,
    });
  });

  it("falls back to our own state when nothing says where the customer is", async () => {
    const payment = await seedPayment(dbs.staff.db, "fake_pay_nowhere", { amountCents: chargedAmountCents(NET_CENTS, 0, 1_800) });

    const invoice = await issueSafely(payment, planSource(0));

    expect(invoice).toMatchObject({ placeOfSupplyStateCode: "mh", placeOfSupplyBasis: "supplier_location", supplyType: "intra_state" });
    expect(invoice?.recipient).toMatchObject({ legalName: "QA Premium Business", addressLines: [], stateCode: null });
    expect(invoice?.lines[0]?.note).toBeNull();
  });
});

describe("issueTaxInvoiceSafely", () => {
  it("logs a refused invoice and returns null, and the payment recorded beside it still commits", async () => {
    // The database takes any two lower-case letters as a state; the builder knows "xx" is not one.
    await saveDetails({ gstin: null, stateCode: "xx" });

    const invoice = await dbs.staff.db.transaction(async (tx) => {
      const payment = await seedPayment(tx, "fake_pay_refused");
      return issueTaxInvoiceSafely(tx, payment, planSource(0));
    });

    expect(invoice).toBeNull();
    expect(await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_refused")).not.toBeNull();
    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("tax-invoice-failed"));
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('"errorName":"UnknownStateError"'));
  });

  it("gives back a number taken before the insert failed, so the series keeps no gap", async () => {
    await saveDetails();
    const first = await seedCouponRenewal();
    expect((await issueSafely(first, planSource()))?.number).toBe("FY/26-27/000001");

    // A blank provider reference fails the invoice's own payment check, after the serial was taken.
    const invoice = await dbs.staff.db.transaction(async (tx) => {
      const payment = await seedPayment(tx, "   ", { subscriptionId: first.subscriptionId });
      return issueTaxInvoiceSafely(tx, payment, planSource());
    });

    expect(invoice).toBeNull();
    expect(await findPaymentByProviderId(dbs.staff.db, "fake", "   ")).not.toBeNull();
    expect(await nextSerial()).toBe(2);
    // The failed insert's own message lists every param, the customer's name and GSTIN among them; the log keeps none.
    const failure = vi.mocked(console.error).mock.calls.map(([line]) => String(line)).find((line) => line.includes("tax-invoice-failed"));
    expect(failure).toContain('"constraint":"tax_invoices_payment_check"');
    expect(failure).not.toContain("QA Premium Business LLP");
    expect(failure).not.toContain("27AAPFU0939F1ZV");
    const next = await seedPayment(dbs.staff.db, "fake_pay_next", { subscriptionId: first.subscriptionId });
    expect((await issueSafely(next, planSource()))?.number).toBe("FY/26-27/000002");
  });
});

describe("an invoice that cannot be printed", () => {
  const DEVANAGARI_NAME = "\u0936\u0930\u094d\u092e\u093e \u090f\u0902\u0921 \u0938\u0902\u0938";

  async function renameBusiness(name: string): Promise<void> {
    await execSql(dbs.owner, `update businesses set name = '${name}' where id = '${businessId}'`);
  }

  it("holds a payment whose business name is not in English and the customer gave no billing details", async () => {
    await renameBusiness(DEVANAGARI_NAME);

    const payment = await dbs.staff.db.transaction(async (tx) => {
      const recorded = await seedPayment(tx, "fake_pay_hindi", { amountCents: chargedAmountCents(NET_CENTS, 0, 1_800) });
      expect(await issueTaxInvoiceSafely(tx, recorded, planSource(0))).toBeNull();
      return recorded;
    });

    expect(await findPaymentByProviderId(dbs.staff.db, "fake", "fake_pay_hindi")).not.toBeNull();
    expect(await invoiceCount()).toBe(0);
    expect(await nextSerial()).toBeNull();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("tax-invoice-failed"));
    const failure = vi.mocked(console.error).mock.calls.map(([line]) => String(line)).find((line) => line.includes("tax-invoice-failed"));
    expect(failure).toContain('"errorName":"UnprintableInvoiceTextError"');
    expect(failure).not.toContain(DEVANAGARI_NAME);
    expect((await listPaymentsWithoutTaxInvoice(dbs.staff.db, businessId)).map((row) => row.id)).toEqual([payment.id]);
  });

  it("prints a business name with a curly apostrophe, and an address with a no-break space, as plain characters", async () => {
    await renameBusiness("Dr. Rao\u2019s Dental");
    await dbs.owner.db.insert(businessProfiles).values({
      businessId,
      displayName: "Dr. Rao\u2019s Dental",
      addressLine1: "Shop\u00A04, Gokul Arcade",
      city: "Mumbai",
      region: "Maharashtra",
      postalCode: "400080",
    });

    const payment = await seedPayment(dbs.staff.db, "fake_pay_curly", { amountCents: chargedAmountCents(NET_CENTS, 0, 1_800) });
    const invoice = await issueSafely(payment, planSource(0));

    expect(invoice?.recipient.legalName).toBe("Dr. Rao's Dental");
    expect(invoice?.recipient.addressLines).toEqual(["Shop 4, Gokul Arcade", "Mumbai 400080"]);
  });

  it("prints billing details with a curly apostrophe as plain characters too", async () => {
    await dbs.owner.db.insert(billingProfiles).values({
      businessId,
      legalName: "Rao\u2019s Dental\u00A0Clinic",
      gstin: null,
      addressLine1: "12, Residency Road \u2013 Ground floor",
      addressLine2: null,
      city: "Bengaluru",
      postalCode: "560025",
      stateCode: "ka",
      email: null,
      phone: null,
    });

    const payment = await seedPayment(dbs.staff.db, "fake_pay_curly_details", { amountCents: chargedAmountCents(NET_CENTS, 0, 1_800) });
    const invoice = await issueSafely(payment, planSource(0));

    expect(invoice?.recipient.legalName).toBe("Rao's Dental Clinic");
    expect(invoice?.recipient.addressLines[0]).toBe("12, Residency Road - Ground floor");
  });

  it("issues it later, with the payment's own date, once English billing details are saved", async () => {
    await renameBusiness(DEVANAGARI_NAME);
    const payment = await seedPayment(dbs.staff.db, "fake_pay_hindi_later", { amountCents: chargedAmountCents(NET_CENTS, 0, 1_800) });
    expect(await issueSafely(payment, planSource(0))).toBeNull();

    await saveDetails();
    const result = await dbs.staff.db.transaction((tx) =>
      issueTaxInvoice(tx, payment, planSource(0), { issuedAt: new Date("2026-10-12T09:00:00.000Z") }),
    );

    expect(result?.invoice).toMatchObject({ number: "FY/26-27/000001", issuedOn: "2026-10-12", paidOn: "2026-10-09" });
    expect(await listPaymentsWithoutTaxInvoice(dbs.staff.db, businessId)).toEqual([]);
  });

  it("refuses a line description the invoice cannot print, and takes no number for it", async () => {
    await saveDetails();
    const payment = await seedPayment(dbs.staff.db, "fake_pay_charge_hindi", { amountCents: 11_800, kind: "charge" });
    const rows = await dbs.owner.db
      .insert(charges)
      .values({
        businessId,
        kind: "custom",
        description: "\u0905\u0924\u093f\u0930\u093f\u0915\u094d\u0924 \u0938\u0940\u091f",
        quantity: 1,
        unitAmountCents: 10_000,
        taxRateBasisPoints: 1_800,
        amountCents: 11_800,
        currency: "INR",
        status: "paid",
        createdByStaffId: STAFF_USER,
        paymentId: payment.id,
        paidAt: PAID_AT,
      })
      .returning({ id: charges.id });

    expect(await issueSafely(payment, { kind: "charge", chargeId: rows[0]?.id ?? "" })).toBeNull();
    expect(await nextSerial()).toBeNull();
  });
});
