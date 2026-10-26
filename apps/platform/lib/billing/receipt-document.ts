import { gstInsideCents } from "@brandbasket/billing/tax";
import { isUnappliedReason, type PaymentInvoiceBasis, type Receipt } from "@brandbasket/db";
import { addOnById, isMonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { packageBasisPointsFor, packageOfferNote } from "@brandbasket/shared/lib/billing/packages";
import { planLabel, receiptDescription, receiptNumber } from "@brandbasket/shared/lib/billing/receipt-title";
import type { MoneyCurrency } from "@brandbasket/shared/lib/money";
import { businessDetails, siteConfig } from "@brandbasket/shared/lib/site-config";
import { BRAND, type Brand } from "@/lib/brand";

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

/** The row that says how much of the total is GST: the prices include it, so it explains the total and is not added to it. */
function taxRateLabel(taxRateBasisPoints: number): string {
  return `Includes GST ${taxRateBasisPoints / MINOR_UNITS_PER_MAJOR}%`;
}

/**
 * The rows of a payment billed as services (PaymentInvoiceBasis), worked out the way the tax invoice is: each service at its
 * price (GST included), the package offer and any code as minus rows, which add up to what was taken to the paisa, then the
 * GST inside that, worked out from the amount taken as the invoice does (gstInsideCents). The code's name comes from the basis, which
 * the payment path wrote with it (a customer's connection cannot read referral codes); a payment from before it was kept reads
 * "Code discount". Null when the basis does not describe the
 * payment, which then prints as a single line.
 */
function serviceLines(receipt: Receipt, basis: PaymentInvoiceBasis): ReceiptLine[] | null {
  const [first] = basis.lines;
  if (first === undefined || basis.netAmountCents !== 0) return null;
  const rate = first.taxRateBasisPoints;
  if (basis.lines.some((line) => line.taxRateBasisPoints !== rate)) return null;
  const services = basis.lines.flatMap((line) => (isMonthlyAddOnId(line.addOn) ? [{ id: line.addOn, listCents: line.listAmountCents }] : []));
  if (services.length !== basis.lines.length) return null;

  const listCents = basis.lines.reduce((sum, line) => sum + line.listAmountCents, 0);
  const offerCents = basis.lines.reduce((sum, line) => sum + line.offerDiscountAmountCents, 0);
  const codeCents = basis.discountAmountCents - basis.retentionDiscountCents;
  const paidCents = listCents - offerCents - basis.discountAmountCents;
  const taxCents = gstInsideCents(receipt.amountCents, rate);
  const packageBasisPoints = packageBasisPointsFor({ services: services.map((service) => service.id), forfeited: false });
  if (codeCents < 0 || basis.retentionDiscountCents < 0 || paidCents <= 0 || paidCents !== receipt.amountCents) return null;
  if (offerCents > 0 && packageBasisPoints === 0) return null;

  const money = (cents: number): string => receiptMoney(cents, receipt.currency);
  const minus = (label: string, cents: number): ReceiptLine[] => (cents > 0 ? [{ label, amount: `-${money(cents)}` }] : []);
  return [
    ...services.map((service) => ({ label: addOnById(service.id).title, amount: money(service.listCents) })),
    ...minus(packageOfferNote(packageBasisPoints), offerCents),
    ...minus(basis.code === undefined ? "Code discount" : `Code ${basis.code}`, codeCents),
    ...minus("Stay offer", basis.retentionDiscountCents),
    ...(taxCents > 0 ? [{ label: taxRateLabel(rate), amount: money(taxCents) }] : []),
  ];
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
  const taxCents = gstInsideCents(receipt.amountCents, taxRate);
  const total = receiptMoney(receipt.amountCents, receipt.currency);

  const single: ReceiptLine[] =
    taxCents === 0
      ? [{ label, amount: total }]
      : [
          { label, amount: total },
          { label: taxRateLabel(taxRate), amount: receiptMoney(taxCents, receipt.currency) },
        ];
  const lines = (receipt.invoiceBasis === null ? null : serviceLines(receipt, receipt.invoiceBasis)) ?? single;

  return {
    fileName: `brandbasket-receipt-${number.slice(1)}.pdf`,
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
