import "server-only";
import {
  BillingRangeError,
  buildTaxInvoice,
  discountCentsFor,
  FYNIX_SAC,
  financialYearOf,
  formatInvoiceNumber,
  indianDate,
  invoicePrefix,
  type InvoiceLineInput,
  type RecipientInput,
} from "@fynix/billing";
import {
  allocateInvoiceSerial,
  findAddOnSubscriptionForPayment,
  findBillingProfile,
  findChargeForBusiness,
  findInvoiceFallbackRecipient,
  findPaymentForInvoice,
  findReferralCodeForInvoice,
  findSubscriptionById,
  findTaxInvoiceByPaymentId,
  insertTaxInvoice,
  isInvoiceablePayment,
  lockPaymentForInvoice,
  type Payment,
  type Plan,
  type ReferralCodeForInvoice,
  type ScopedTransaction,
  type TaxInvoice,
  type TaxInvoicePartyRecord,
} from "@fynix/db";
import { stateCodeOfIndiaPostName } from "@fynix/db/india-states";
import { addOnById, isMonthlyAddOnId, PREMIUM_ADD_ON_DISCOUNT_PERCENT } from "../lib/billing/add-ons";
import { isPrintableOnInvoice, normaliseInvoiceText } from "../lib/billing/invoice-text";
import { paymentLabel } from "../lib/billing/payment-method";
import { planLabel } from "../lib/billing/receipt-title";
import { PRODUCT_SHORT_NAME } from "../lib/deployment-brand";
import { businessDetails } from "../lib/site-config";
import { describeError, logBillingEvent } from "./billing-log";
import { isConnectionFailure } from "./error-log-info";

/**
 * What a payment bought, as the code that recorded it knows it. The caller passes what the payment was charged for,
 * not what the subscription says today, since a stay offer or a price can change after a payment.
 */
export type InvoiceSource =
  | {
      readonly kind: "plan";
      readonly plan: Plan;
      /** The price before discount: the plan's initial or recurring amount, whichever this payment was charged at. */
      readonly netAmountCents: number;
      /** Everything taken off this payment: the referral code's share plus any stay offer. */
      readonly discountAmountCents: number;
      /** The stay offer's part of `discountAmountCents` (the subscription's retention_discount_cents), or 0. */
      readonly retentionDiscountCents: number;
      /**
       * Whether this payment bought one month: a first payment on a plan whose initial term is one month, and every
       * renewal and restart. Decided by the caller from the plan, never from the period's length, because a provider's
       * cycle is rarely an exact calendar month to the second.
       */
      readonly monthly: boolean;
      /**
       * The first instant paid for. A provider renewal passes the provider's own cycle start, so the printed period
       * matches the provider's.
       */
      readonly periodStart: Date;
      /** The first instant of the next period. The printed period ends the day before, in India. */
      readonly periodEnd: Date;
    }
  | { readonly kind: "charge"; readonly chargeId: string }
  | {
      readonly kind: "add_on";
      readonly addOnSubscriptionId: string;
      /** Razorpay's cycle start (current_start), or the payment time. */
      readonly periodStart: Date;
      /** Razorpay's cycle end (current_end), or one calendar month on. */
      readonly periodEnd: Date;
    };

/**
 * Us, as printed on every invoice: the registered company, trading under this deployment's brand. The database refuses an
 * invoice whose supplier has no lower-case state code.
 */
export function supplierFor(): TaxInvoicePartyRecord {
  const details = businessDetails;
  return {
    legalName: details.legalName,
    tradeName: details.tradeName,
    gstin: details.gstNumber,
    cin: details.cin,
    addressLines: [...details.address],
    stateCode: details.stateCode,
    email: details.email,
    phone: details.phone,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
// en-US parts, put together by hand: en-GB writes September as "Sept", and every other date on the invoice says "Sep".
const IST_DATE_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function istDay(instant: Date): { readonly dayMonth: string; readonly year: string } {
  const parts = Object.fromEntries(IST_DATE_PARTS.formatToParts(instant).map((part) => [part.type, part.value]));
  return { dayMonth: `${parts.day ?? ""} ${parts.month ?? ""}`, year: parts.year ?? "" };
}

/**
 * Some of the invoice's text still has characters it cannot draw once typographic punctuation is made plain (D12): a name
 * or address in another script, say. The message carries no input: a customer's name must not reach a log.
 */
export class UnprintableInvoiceTextError extends BillingRangeError {
  constructor() {
    super("Some text on an invoice has characters the invoice cannot print");
    this.name = "UnprintableInvoiceTextError";
  }
}

/** An invoice is dated when it is issued, never before its payment. Dates only, so it is safe to log. */
export class InvoiceDatedBeforePaymentError extends BillingRangeError {
  constructor(issuedAt: Date, paidAt: Date) {
    super(`An invoice cannot be dated ${issuedAt.toISOString()}, before its payment at ${paidAt.toISOString()}`);
    this.name = "InvoiceDatedBeforePaymentError";
  }
}

/** A service period that does not end after it starts. Dates only, so it is safe to log. */
export class InvalidServicePeriodError extends BillingRangeError {
  constructor(start: Date, endExclusive: Date) {
    super(`A service period must end after it starts, received ${start.toISOString()} to ${endExclusive.toISOString()}`);
    this.name = "InvalidServicePeriodError";
  }
}

/** "09 Oct to 08 Nov 2026": from the day paid to the day before the next period starts, in India. */
export function servicePeriod(start: Date, endExclusive: Date): string {
  if (!(endExclusive.getTime() > start.getTime())) throw new InvalidServicePeriodError(start, endExclusive);
  const first = istDay(start);
  const last = istDay(new Date(endExclusive.getTime() - DAY_MS));
  const from = first.year === last.year ? first.dayMonth : `${first.dayMonth} ${first.year}`;
  return `${from} to ${last.dayMonth} ${last.year}`;
}

/**
 * "Fynix Premium plan", whether the plan row is named "Fynix Premium" or plain "Premium".
 */
export function planLineDescription(planName: string): string {
  const label = planLabel(planName).replace(/^fynix\s+/i, "");
  return `${PRODUCT_SHORT_NAME} ${label}`;
}

/**
 * "Monthly subscription, 09 Oct to 08 Nov 2026" for a monthly payment (the approved template's words), and
 * "Subscription, ..." for any other, such as a first payment that covers three months. The same for a first payment,
 * a renewal and a restart: the period says what was paid for.
 */
export function planLineDetail(monthly: boolean, periodStart: Date, periodEnd: Date): string {
  return `${monthly ? "Monthly subscription" : "Subscription"}, ${servicePeriod(periodStart, periodEnd)}`;
}

/** 2000 basis points as "20", 1250 as "12.5", in whole numbers so no float is ever printed. */
function percentOf(basisPoints: number): string {
  const whole = Math.floor(basisPoints / 100);
  const hundredths = basisPoints % 100;
  if (hundredths === 0) return String(whole);
  return `${whole}.${String(hundredths).padStart(2, "0").replace(/0$/, "")}`;
}

/** What a plan line's note is worked out from. */
export interface PlanLineNoteInput {
  /** The subscription's referral code, or null when it has none. */
  readonly coupon: ReferralCodeForInvoice | null;
  readonly netAmountCents: number;
  readonly discountAmountCents: number;
  readonly retentionDiscountCents: number;
}

/**
 * What the discount on a plan line was, in words, or null for none: "Coupon GAURAV applied, 20% off. Stay offer
 * applied". The coupon is named only for the part of the discount that is its own (the whole less any stay offer),
 * and its share is printed only when it is exactly what that share of this price comes to, so the note never
 * contradicts the discount column. An amount coupon is named without a figure: the discount column shows it.
 */
export function planLineNote(input: PlanLineNoteInput): string | null {
  if (input.retentionDiscountCents < 0 || input.retentionDiscountCents > input.discountAmountCents) {
    throw new BillingRangeError(`A stay offer of ${input.retentionDiscountCents} cannot be part of a discount of ${input.discountAmountCents}`);
  }
  const couponCents = input.discountAmountCents - input.retentionDiscountCents;
  const notes: string[] = [];
  const coupon = input.coupon;
  if (coupon !== null && coupon.discountKind !== null && couponCents > 0) {
    const basisPoints = coupon.discountPercentBasisPoints;
    const share =
      coupon.discountKind === "percent" &&
      basisPoints !== null &&
      discountCentsFor({ kind: "percent", basisPoints }, input.netAmountCents) === couponCents
        ? `, ${percentOf(basisPoints)}% off`
        : "";
    notes.push(`Coupon ${coupon.code} applied${share}`);
  }
  if (input.retentionDiscountCents > 0) notes.push("Stay offer applied");
  return notes.length === 0 ? null : notes.join(". ");
}

/** The text as the invoice prints it (normaliseInvoiceText), or null when nothing is left of it. */
function nonBlank(text: string | null): string | null {
  const printed = normaliseInvoiceText(text ?? "");
  return printed === "" ? null : printed;
}

/**
 * Who the invoice is to: the billing details when the customer gave them, else the business name and its onboarding
 * address. Contact details stay out (see RecipientInput). An onboarding region we cannot place leaves the state unknown,
 * and the place of supply falls back to our own location (D5).
 */
async function recipientFor(tx: ScopedTransaction, businessId: string): Promise<RecipientInput> {
  const profile = await findBillingProfile(tx, businessId);
  if (profile !== null) {
    const cityLine = `${profile.city.trim()} ${profile.postalCode.trim()}`;
    return {
      legalName: normaliseInvoiceText(profile.legalName),
      gstin: profile.gstin,
      addressLines: [profile.addressLine1, profile.addressLine2, cityLine]
        .map(nonBlank)
        .filter((line): line is string => line !== null),
      stateCode: profile.stateCode,
    };
  }
  const fallback = await findInvoiceFallbackRecipient(tx, businessId);
  return {
    legalName: normaliseInvoiceText(fallback.name),
    gstin: null,
    addressLines: fallback.addressLines.map(nonBlank).filter((line): line is string => line !== null),
    stateCode: fallback.region === null ? null : stateCodeOfIndiaPostName(fallback.region),
  };
}

/**
 * Every piece of text the invoice will print, so one that cannot be drawn (a Hindi business name from onboarding, say)
 * holds the invoice instead of printing question marks (D12). Staff issue it once English billing details are saved.
 */
function printedText(draft: Pick<ReturnType<typeof buildTaxInvoice>, "recipient" | "lines">): string[] {
  return [
    draft.recipient.legalName,
    ...draft.recipient.addressLines,
    ...draft.lines.flatMap((line) => [line.description, line.detail ?? "", line.note ?? ""]),
  ];
}

/**
 * A line as the invoice prints it: typographic punctuation turned into plain characters (normaliseInvoiceText), so a
 * charge described "Upgrade to Premium", a middle dot and "31 days left" is invoiced with a comma where the dot was.
 * The stored charge keeps its wording; the invoice's snapshot holds the printed text.
 */
function printedLine(line: InvoiceLineInput): InvoiceLineInput {
  return {
    ...line,
    description: normaliseInvoiceText(line.description),
    detail: line.detail === null ? null : nonBlank(line.detail),
    note: line.note === null ? null : nonBlank(line.note),
  };
}

async function linesFor(tx: ScopedTransaction, payment: Payment, source: InvoiceSource): Promise<InvoiceLineInput[]> {
  if (source.kind === "charge") {
    const charge = await findChargeForBusiness(tx, payment.businessId, source.chargeId);
    if (charge === null) throw new Error(`Charge ${source.chargeId} not found for payment ${payment.id}`);
    // The payment path marks the charge paid in the same transaction, before the invoice; anything else is a mix-up.
    if (charge.status !== "paid" || charge.paymentId !== payment.id || charge.currency !== "INR") {
      throw new Error(`Charge ${charge.id} was not paid by payment ${payment.id} in rupees`);
    }
    // The description as staff wrote it: the invoice has its own quantity and rate columns.
    return [
      {
        description: charge.description,
        detail: null,
        note: null,
        sac: FYNIX_SAC,
        quantity: charge.quantity,
        unitAmountCents: charge.unitAmountCents,
        discountAmountCents: 0,
        taxRateBasisPoints: charge.taxRateBasisPoints,
      },
    ];
  }
  if (source.kind === "add_on") {
    // The row is read through the payment's own link, so a source naming someone else's add-on cannot borrow its price.
    const row = await findAddOnSubscriptionForPayment(tx, payment.id);
    if (row === null) throw new Error(`Payment ${payment.id} is not linked to an add-on subscription`);
    if (row.id !== source.addOnSubscriptionId) {
      throw new Error(`Payment ${payment.id} paid add-on subscription ${row.id}, not add-on subscription ${source.addOnSubscriptionId}`);
    }
    if (row.currency !== "INR") throw new Error(`Add-on subscription ${row.id} is not in rupees`);
    if (!isMonthlyAddOnId(row.addOn)) throw new Error(`Add-on subscription ${row.id} is not a monthly add-on`);
    return [
      {
        description: addOnById(row.addOn).title,
        detail: planLineDetail(true, source.periodStart, source.periodEnd),
        note: row.discountAmountCents > 0 ? `Premium member, ${PREMIUM_ADD_ON_DISCOUNT_PERCENT}% off` : null,
        sac: FYNIX_SAC,
        quantity: 1,
        unitAmountCents: row.listAmountCents,
        discountAmountCents: row.discountAmountCents,
        taxRateBasisPoints: row.taxRateBasisPoints,
      },
    ];
  }
  const subscription = payment.subscriptionId === null ? null : await findSubscriptionById(tx, payment.subscriptionId);
  const referralCodeId = subscription?.referralCodeId ?? null;
  const couponCents = source.discountAmountCents - source.retentionDiscountCents;
  const coupon = couponCents > 0 && referralCodeId !== null ? await findReferralCodeForInvoice(tx, referralCodeId) : null;
  return [
    {
      description: planLineDescription(source.plan.name),
      detail: planLineDetail(source.monthly, source.periodStart, source.periodEnd),
      note: planLineNote({
        coupon,
        netAmountCents: source.netAmountCents,
        discountAmountCents: source.discountAmountCents,
        retentionDiscountCents: source.retentionDiscountCents,
      }),
      sac: FYNIX_SAC,
      quantity: 1,
      unitAmountCents: source.netAmountCents,
      discountAmountCents: source.discountAmountCents,
      taxRateBasisPoints: source.plan.taxRateBasisPoints,
    },
  ];
}

/** An invoice for a payment, and whether this call issued it (false when it had been issued before). */
export interface IssuedTaxInvoice {
  readonly invoice: TaxInvoice;
  readonly issued: boolean;
}

export interface IssueOptions {
  /**
   * When the invoice is issued, which dates it and decides its financial year. Payment paths pass nothing: the invoice
   * is issued the moment the payment is recorded, so it defaults to the payment's own time. A missing invoice issued
   * later by staff passes the actual time of issue, because an invoice is dated when it is issued, never backdated.
   */
  readonly issuedAt?: Date;
}

/**
 * Issues the tax invoice for a payment just recorded, in the caller's transaction. Idempotent per payment: a second
 * call returns the invoice already issued, with `issued` false, and takes no number. Returns null for a payment that
 * gets no invoice (isInvoiceablePayment, D1). Throws on anything it cannot explain, such as lines that do not add up
 * to what was charged; payment paths call issueTaxInvoiceSafely instead.
 *
 * Locks are taken in one order, the payment row and then the series row, so a second issuer for the same payment
 * waits and then finds the first one's invoice. The serial is taken last, because it holds the series row locked
 * until the caller commits.
 */
export async function issueTaxInvoice(
  tx: ScopedTransaction,
  payment: Payment,
  source: InvoiceSource,
  options: IssueOptions = {},
): Promise<IssuedTaxInvoice | null> {
  const paidAt = payment.paidAt;
  if (!isInvoiceablePayment(payment) || paidAt === null) return null;
  const issuedAt = options.issuedAt ?? paidAt;
  if (issuedAt.getTime() < paidAt.getTime()) throw new InvoiceDatedBeforePaymentError(issuedAt, paidAt);
  await lockPaymentForInvoice(tx, payment.id);
  const existing = await findTaxInvoiceByPaymentId(tx, payment.id);
  if (existing !== null) return { invoice: existing, issued: false };

  const draft = buildTaxInvoice({
    supplierStateCode: businessDetails.stateCode,
    recipient: await recipientFor(tx, payment.businessId),
    lines: (await linesFor(tx, payment, source)).map(printedLine),
    amountChargedCents: payment.amountCents,
  });
  if (!printedText(draft).every(isPrintableOnInvoice)) throw new UnprintableInvoiceTextError();
  const method = await findPaymentForInvoice(tx, payment.id);
  const financialYear = financialYearOf(issuedAt);
  const prefix = invoicePrefix();
  const serial = await allocateInvoiceSerial(tx, prefix, financialYear);
  const invoice = await insertTaxInvoice(tx, {
    businessId: payment.businessId,
    paymentId: payment.id,
    prefix,
    financialYear,
    serial,
    number: formatInvoiceNumber(prefix, financialYear, serial),
    issuedOn: indianDate(issuedAt),
    paidOn: indianDate(paidAt),
    supplier: supplierFor(),
    recipient: draft.recipient,
    placeOfSupplyStateCode: draft.placeOfSupplyStateCode,
    placeOfSupplyBasis: draft.placeOfSupplyBasis,
    supplyType: draft.supplyType,
    lines: draft.lines,
    taxableCents: draft.taxableCents,
    cgstCents: draft.cgstCents,
    sgstCents: draft.sgstCents,
    igstCents: draft.igstCents,
    roundOffCents: draft.roundOffCents,
    totalCents: draft.totalCents,
    paymentLabel: normaliseInvoiceText(paymentLabel(method)),
    paymentReference: method.providerPaymentId,
  });
  return { invoice, issued: true };
}

/**
 * issueTaxInvoice in a savepoint (D7): a failure rolls back the invoice and its serial only, is logged as
 * `tax-invoice-failed`, and returns null, so the payment the caller recorded still commits. Staff issue the missing
 * invoice from the client page. Returns the payment's invoice whether issued now or before; only a new one is logged
 * as `tax-invoice-issued`. A lost database connection is not an invoicing fault: the payment's own transaction cannot
 * commit either, so it is rethrown for the payment path to handle as it handles any other.
 */
export async function issueTaxInvoiceSafely(
  tx: ScopedTransaction,
  payment: Payment,
  source: InvoiceSource,
  options: IssueOptions = {},
): Promise<TaxInvoice | null> {
  const fields = {
    businessId: payment.businessId,
    paymentId: payment.id,
    subscriptionId: payment.subscriptionId,
    provider: payment.provider,
    providerPaymentId: payment.providerPaymentId,
  };
  try {
    const result = await tx.transaction((savepoint) => issueTaxInvoice(savepoint, payment, source, options));
    if (result === null) return null;
    if (result.issued) logBillingEvent("info", "tax-invoice-issued", { ...fields, invoiceNumber: result.invoice.number });
    return result.invoice;
  } catch (error) {
    if (isConnectionFailure(error)) throw error;
    logBillingEvent("error", "tax-invoice-failed", { ...fields, ...describeError(error) });
    return null;
  }
}
