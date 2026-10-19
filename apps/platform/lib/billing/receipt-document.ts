import { isUnappliedReason, type Receipt } from "@brandbasket/db";
import { planLabel, receiptDescription, receiptNumber } from "@brandbasket/shared/lib/billing/receipt-title";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { businessDetails, siteConfig } from "@brandbasket/shared/lib/site-config";
import { BRAND, type Brand } from "@/lib/brand";

const BASIS_POINTS = 10_000;
const MINOR_UNITS_PER_MAJOR = 100;

/** One priced line on a receipt. */
export interface ReceiptLine {
  readonly label: string;
  readonly amount: string;
}

/**
 * Everything a receipt says, worked out before any PDF is drawn, so the words and the arithmetic can be tested on
 * their own. The renderer only lays this out.
 */
export interface ReceiptDocument {
  readonly fileName: string;
  readonly title: string;
  readonly issuedOn: string;
  readonly status: string;
  /** The provider's payment id, for matching the receipt to a bank or card statement. */
  readonly reference: string;
  readonly from: readonly string[];
  readonly billedTo: readonly string[];
  readonly lines: readonly ReceiptLine[];
  readonly total: ReceiptLine;
  readonly note: string;
}

/** Who the receipt is for: the business, and the address the account signs in with. */
export interface ReceiptCustomer {
  readonly businessName: string;
  readonly email: string;
}

/** A receipt exists for money that was taken, even if it was later refunded. A failed attempt took nothing. */
export function isDownloadableReceipt(receipt: Pick<Receipt, "status">): boolean {
  return receipt.status !== "failed";
}

/**
 * Takes the tax back out of what was charged: the net price is the gross divided by (1 + rate), rounded half up the
 * way chargedAmountCents rounds the tax it adds, and the tax is whatever is left, so the two always add up to the
 * amount actually taken. For ₹3,538.82 at 18% that is ₹2,999 plus ₹539.82.
 */
export function splitTax(grossCents: number, taxRateBasisPoints: number): { netCents: number; taxCents: number } {
  if (!Number.isSafeInteger(grossCents) || grossCents < 0) {
    throw new RangeError(`An amount charged must be a whole, non-negative number of minor units, received ${grossCents}`);
  }
  if (!Number.isSafeInteger(taxRateBasisPoints) || taxRateBasisPoints < 0) {
    throw new RangeError(`A tax rate must be a whole, non-negative number of basis points, received ${taxRateBasisPoints}`);
  }
  if (taxRateBasisPoints === 0) return { netCents: grossCents, taxCents: 0 };
  const divisor = BASIS_POINTS + taxRateBasisPoints;
  const netCents = Math.floor((grossCents * BASIS_POINTS * 2 + divisor) / (divisor * 2));
  return { netCents, taxCents: grossCents - netCents };
}

const LOCALES: Readonly<Record<MoneyCurrency, string>> = { USD: "en-US", INR: "en-IN" };

/**
 * "INR 3,538.82" or "USD 69.00". The currency is spelled out rather than drawn as a symbol because the PDF's
 * built-in font has no rupee sign, and a receipt should read the same for both currencies.
 */
function receiptMoney(minorUnits: number, currency: MoneyCurrency): string {
  const amount = new Intl.NumberFormat(LOCALES[currency], {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(minorUnits / MINOR_UNITS_PER_MAJOR);
  return `${currency} ${amount}`;
}

const dateParts = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** "12 Sep 2026", in UTC like the receipt's title. */
function receiptDate(date: Date): string {
  const parts = Object.fromEntries(dateParts.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.day ?? ""} ${parts.month ?? ""} ${parts.year ?? ""}`;
}

function receiptStatus(receipt: Receipt): string {
  if (receipt.status === "refunded") return "Refunded";
  if (isUnappliedReason(receipt.attentionReason)) return "Received";
  return "Paid";
}

function taxRateLabel(taxRateBasisPoints: number): string {
  return `GST ${taxRateBasisPoints / MINOR_UNITS_PER_MAJOR}%`;
}

/** The receipt for one payment. Throws for a failed payment, which has nothing to receipt. */
export function receiptDocument(receipt: Receipt, customer: ReceiptCustomer, brand: Brand = BRAND): ReceiptDocument {
  if (!isDownloadableReceipt(receipt)) {
    throw new Error(`Payment ${receipt.id} failed, so there is no receipt for it.`);
  }
  const number = receiptNumber(receipt.sequence);
  const description = receiptDescription(receipt);
  // A paid extra names itself; a plan payment names the plan it paid for.
  const label =
    receipt.kind === "charge" || receipt.planName === null ? description : `${planLabel(receipt.planName)} · ${description}`;
  const taxRate = receipt.taxRateBasisPoints ?? 0;
  const { netCents, taxCents } = splitTax(receipt.amountCents, taxRate);
  const total = receiptMoney(receipt.amountCents, receipt.currency);

  const lines: ReceiptLine[] =
    taxCents === 0
      ? [{ label, amount: total }]
      : [
          { label, amount: receiptMoney(netCents, receipt.currency) },
          { label: taxRateLabel(taxRate), amount: receiptMoney(taxCents, receipt.currency) },
        ];

  return {
    fileName: `fynix-receipt-${number.slice(1)}.pdf`,
    title: `Receipt ${number}`,
    issuedOn: receiptDate(receipt.paidAt ?? receipt.createdAt),
    status: receiptStatus(receipt),
    reference: receipt.providerPaymentId,
    from: [
      siteConfig.name,
      businessDetails.legalName,
      ...businessDetails.address,
      `GSTIN ${businessDetails.gstNumber}`,
      `CIN ${businessDetails.cin}`,
      brand.contactEmail ?? businessDetails.email,
    ],
    billedTo: [customer.businessName, customer.email],
    lines,
    total: { label: "Total paid", amount: total },
    note: `This is a receipt for a payment already made. Questions about it? Write to ${brand.contactEmail ?? businessDetails.email}.`,
  };
}
