import { and, asc, desc, eq, gte, inArray, isNotNull, lt, notExists, sql, type SQL } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import {
  billingProfiles,
  businessMembers,
  businessProfiles,
  businesses,
  payments,
  referralCodes,
  taxInvoiceSeries,
  taxInvoices,
  taxInvoicingStart,
  users,
  type BillingCurrency,
  type BillingProfile,
  type ReferralValueKind,
  type TaxInvoice,
} from "../schema";
import { isUnappliedReason, PAYMENT_COLUMNS, paymentWasApplied, type Payment } from "./billing";

type Runner = Database | ScopedTransaction;

/**
 * The next serial in a series, taken atomically. The upsert holds the series row until the caller's transaction ends,
 * so two invoices can never share a number and a rolled-back one gives its number back. It takes a transaction, never
 * the bare connection, because a number taken outside the issuing transaction could be lost. The series row stays
 * locked until the payment transaction commits, so callers allocate last and commit promptly. Staff connection only.
 */
export async function allocateInvoiceSerial(db: ScopedTransaction, prefix: string, financialYear: string): Promise<number> {
  const rows = await db
    .insert(taxInvoiceSeries)
    .values({ prefix, financialYear, nextSerial: 2 })
    .onConflictDoUpdate({
      target: [taxInvoiceSeries.prefix, taxInvoiceSeries.financialYear],
      set: { nextSerial: sql`${taxInvoiceSeries.nextSerial} + 1` },
    })
    .returning({ serial: sql<number>`${taxInvoiceSeries.nextSerial} - 1`.mapWith(Number) });
  const serial = rows[0]?.serial;
  if (serial === undefined) throw new Error(`No serial returned for series ${prefix} ${financialYear}`);
  return serial;
}

export type NewTaxInvoice = Omit<typeof taxInvoices.$inferInsert, "id" | "createdAt">;

/** Staff connection only. Fails on a second invoice for the same payment (tax_invoices_payment_id_idx). */
export async function insertTaxInvoice(db: Runner, invoice: NewTaxInvoice): Promise<TaxInvoice> {
  const rows = await db.insert(taxInvoices).values(invoice).returning();
  const row = rows[0];
  if (row === undefined) throw new Error(`Tax invoice ${invoice.number} was not inserted`);
  return row;
}

/**
 * Holds the payment row until the caller's transaction ends, so two issuers for one payment run one after the other
 * and the second finds the first one's invoice. Taken before the series row, always in that order. Staff connection.
 */
export async function lockPaymentForInvoice(db: ScopedTransaction, paymentId: string): Promise<void> {
  const rows = await db.select({ id: payments.id }).from(payments).where(eq(payments.id, paymentId)).for("update");
  if (rows.length === 0) throw new Error(`Payment ${paymentId} not found`);
}

/** The invoice issued for a payment, or null. Staff connection. */
export async function findTaxInvoiceByPaymentId(db: Runner, paymentId: string): Promise<TaxInvoice | null> {
  const rows = await db.select().from(taxInvoices).where(eq(taxInvoices.paymentId, paymentId)).limit(1);
  return rows[0] ?? null;
}

/** One invoice by its id, for the staff download. Staff connection. */
export async function findTaxInvoiceById(db: Runner, invoiceId: string): Promise<TaxInvoice | null> {
  const rows = await db.select().from(taxInvoices).where(eq(taxInvoices.id, invoiceId)).limit(1);
  return rows[0] ?? null;
}

/** One invoice of one business. Works through row-level security. */
export async function findTaxInvoiceForBusiness(db: Runner, businessId: string, invoiceId: string): Promise<TaxInvoice | null> {
  const rows = await db
    .select()
    .from(taxInvoices)
    .where(and(eq(taxInvoices.id, invoiceId), eq(taxInvoices.businessId, businessId)))
    .limit(1);
  return rows[0] ?? null;
}

/** Newest first. Works through row-level security. */
export async function listTaxInvoicesForBusiness(db: Runner, businessId: string): Promise<TaxInvoice[]> {
  return db
    .select()
    .from(taxInvoices)
    .where(eq(taxInvoices.businessId, businessId))
    .orderBy(desc(taxInvoices.issuedOn), desc(taxInvoices.serial));
}

/** The invoices for some of a business's payments, oldest first. Works through row-level security. */
export async function listTaxInvoicesForPayments(db: Runner, businessId: string, paymentIds: readonly string[]): Promise<TaxInvoice[]> {
  if (paymentIds.length === 0) return [];
  return db
    .select()
    .from(taxInvoices)
    .where(and(eq(taxInvoices.businessId, businessId), inArray(taxInvoices.paymentId, [...paymentIds])))
    .orderBy(asc(taxInvoices.financialYear), asc(taxInvoices.serial));
}

/**
 * Whether a payment bought something, and so gets a tax invoice (D1): a captured INR payment with a date, unless it
 * is one of the UNAPPLIED_PAYMENT_REASONS (the money arrived but bought nothing). A reason raised after the payment
 * applied (a failed submission, a provider still to be told) does not stop its invoice. This is the TypeScript twin of
 * the SQL built from `paymentWasApplied` in queries/billing.ts; change them together.
 */
export function isInvoiceablePayment(payment: Pick<Payment, "currency" | "status" | "attentionReason" | "paidAt">): boolean {
  return payment.currency === "INR" && payment.status === "captured" && payment.paidAt !== null && !isUnappliedReason(payment.attentionReason);
}

/**
 * The SQL twin of "invoiceable and has no invoice yet" (isInvoiceablePayment, D1), for payments recorded since invoicing
 * started (D17). A database with no start row leaves nothing out.
 */
function missingTaxInvoice(db: Runner): SQL {
  return and(
    eq(payments.currency, "INR"),
    eq(payments.status, "captured"),
    isNotNull(payments.paidAt),
    paymentWasApplied(),
    sql`${payments.createdAt} >= coalesce((select ${taxInvoicingStart.startedAt} from ${taxInvoicingStart} limit 1), '-infinity'::timestamptz)`,
    notExists(db.select({ one: sql`1` }).from(taxInvoices).where(eq(taxInvoices.paymentId, payments.id))),
  ) as SQL;
}

/** Invoiceable payments of one business with no invoice: what staff see as "Invoice missing". Staff connection. */
export async function listPaymentsWithoutTaxInvoice(db: Runner, businessId: string): Promise<Payment[]> {
  return db
    .select(PAYMENT_COLUMNS)
    .from(payments)
    .where(and(eq(payments.businessId, businessId), missingTaxInvoice(db)))
    .orderBy(asc(payments.paidAt));
}

/**
 * Every invoice issued from `fromDate` up to but not including `toDate` (YYYY-MM-DD, Indian dates, as `issued_on` is
 * stored), in number order. This is a month's register for the CA's GST returns. Staff connection.
 */
export async function listTaxInvoicesIssuedBetween(db: Runner, fromDate: string, toDate: string): Promise<TaxInvoice[]> {
  return db
    .select()
    .from(taxInvoices)
    .where(and(gte(taxInvoices.issuedOn, fromDate), lt(taxInvoices.issuedOn, toDate)))
    .orderBy(asc(taxInvoices.financialYear), asc(taxInvoices.serial));
}

/** A payment still missing its invoice, with the client it belongs to. */
export interface MissingTaxInvoice {
  readonly payment: Payment;
  readonly businessName: string;
}

/**
 * Every client's invoiceable payments with no invoice, oldest first (see missingTaxInvoice), so a failed invoice shows
 * up in one place instead of only in a log (D15). Staff connection.
 */
export async function listMissingTaxInvoices(db: Runner, limit: number): Promise<MissingTaxInvoice[]> {
  return db
    .select({ payment: PAYMENT_COLUMNS, businessName: businesses.name })
    .from(payments)
    .innerJoin(businesses, eq(businesses.id, payments.businessId))
    .where(missingTaxInvoice(db))
    .orderBy(asc(payments.paidAt), asc(payments.id))
    .limit(limit);
}

/** A business's billing details, or null. Works through row-level security. */
export async function findBillingProfile(db: Runner, businessId: string): Promise<BillingProfile | null> {
  const rows = await db.select().from(billingProfiles).where(eq(billingProfiles.businessId, businessId)).limit(1);
  return rows[0] ?? null;
}

/** Every column, optional ones as null: a save replaces the whole row, so nothing from an earlier save can survive it. */
export type BillingProfileInput = Omit<BillingProfile, "updatedAt">;

/** Inserts or replaces the business's billing details. Works through row-level security. */
export async function saveBillingProfile(db: Runner, input: BillingProfileInput): Promise<BillingProfile> {
  const { businessId, ...details } = input;
  const rows = await db
    .insert(billingProfiles)
    .values(input)
    .onConflictDoUpdate({ target: billingProfiles.businessId, set: { ...details, updatedAt: new Date() } })
    .returning();
  const row = rows[0];
  if (row === undefined) throw new Error(`Billing details for ${businessId} were not saved`);
  return row;
}

/**
 * The currency the business is billed in, or null when it cannot be read. A free listing account has no plan, so its
 * currency is only here; it decides whether what it pays for (ad spots, promotions) gets a tax invoice (D1). Works
 * through row-level security.
 */
export async function findBusinessCurrency(db: Runner, businessId: string): Promise<BillingCurrency | null> {
  const rows = await db.select({ currency: businesses.currency }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  return rows[0]?.currency ?? null;
}

export interface InvoiceFallbackRecipient {
  readonly name: string;
  readonly addressLines: string[];
  readonly region: string | null;
  readonly postalCode: string | null;
}

/** What an invoice falls back on without billing details: the business name and its onboarding address. */
export async function findInvoiceFallbackRecipient(db: Runner, businessId: string): Promise<InvoiceFallbackRecipient> {
  const rows = await db
    .select({
      name: businesses.name,
      line1: businessProfiles.addressLine1,
      line2: businessProfiles.addressLine2,
      city: businessProfiles.city,
      region: businessProfiles.region,
      postalCode: businessProfiles.postalCode,
    })
    .from(businesses)
    .leftJoin(businessProfiles, eq(businessProfiles.businessId, businesses.id))
    .where(eq(businesses.id, businessId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) throw new Error(`Business ${businessId} not found`);
  const kept = (part: string | null): string | null => {
    const text = part?.trim() ?? "";
    return text === "" ? null : text;
  };
  const cityLine = [kept(row.city), kept(row.postalCode)].filter((part): part is string => part !== null).join(" ");
  const addressLines = [kept(row.line1), kept(row.line2), kept(cityLine)].filter((part): part is string => part !== null);
  return { name: row.name, addressLines, region: kept(row.region), postalCode: kept(row.postalCode) };
}

/**
 * The mobile number of the business's owner (the earliest one, who redeemed the setup link), or null when there is none.
 * It is not stored on an invoice (an invoice's recipient carries no phone); the PDF reads it at render time for a
 * customer who gave no billing details. Staff connection or the owner's own scope.
 */
export async function findBusinessOwnerPhone(db: Runner, businessId: string): Promise<string | null> {
  const rows = await db
    .select({ phone: users.phoneNumber })
    .from(businessMembers)
    .innerJoin(users, eq(users.id, businessMembers.userId))
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.role, "owner")))
    .orderBy(asc(businessMembers.createdAt), asc(businessMembers.userId))
    .limit(1);
  return rows[0]?.phone ?? null;
}

/** What the invoice line's note says about a coupon: its text, and its share when it takes a percentage off. */
export interface ReferralCodeForInvoice {
  readonly code: string;
  /** Null for an affiliate code that gives no discount. */
  readonly discountKind: ReferralValueKind | null;
  /** Set when `discountKind` is "percent": 2000 is 20%. */
  readonly discountPercentBasisPoints: number | null;
}

/** A coupon or affiliate code as the invoice line's note names it, or null. Staff connection. */
export async function findReferralCodeForInvoice(db: Runner, referralCodeId: string): Promise<ReferralCodeForInvoice | null> {
  const rows = await db
    .select({
      code: referralCodes.code,
      discountKind: referralCodes.discountKind,
      discountPercentBasisPoints: referralCodes.discountPercentBasisPoints,
    })
    .from(referralCodes)
    .where(eq(referralCodes.id, referralCodeId))
    .limit(1);
  return rows[0] ?? null;
}

/** How a payment was made, as the invoice's Payment block needs it. */
export interface PaymentForInvoice {
  readonly provider: Payment["provider"];
  readonly providerPaymentId: string;
  readonly method: string | null;
  readonly cardNetwork: string | null;
  readonly cardType: string | null;
  readonly cardLast4: string | null;
  readonly upiVpa: string | null;
  readonly manualReference: string | null;
}

/** How a payment was made, for the invoice's Payment block. Staff connection. */
export async function findPaymentForInvoice(db: Runner, paymentId: string): Promise<PaymentForInvoice> {
  const rows = await db
    .select({
      provider: payments.provider,
      providerPaymentId: payments.providerPaymentId,
      method: payments.method,
      cardNetwork: payments.cardNetwork,
      cardType: payments.cardType,
      cardLast4: payments.cardLast4,
      upiVpa: payments.upiVpa,
      manualReference: payments.manualReference,
    })
    .from(payments)
    .where(eq(payments.id, paymentId))
    .limit(1);
  const row = rows[0];
  if (row === undefined) throw new Error(`Payment ${paymentId} not found`);
  return row;
}
