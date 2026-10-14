import { isUnappliedReason, type Receipt } from "@fynix/db";
import { BRAND, type Brand } from "@/lib/brand";
import { addOnPaymentTitle, planLabel, receiptDescription, receiptTitle } from "@fynix/shared/lib/billing/receipt-title";
import { formatMoney } from "@fynix/shared/lib/money";
import { isDownloadableReceipt } from "./receipt-document";

/** How a status pill is coloured: money in, money waiting on us, money given back, or nothing taken. */
export type ReceiptTone = "paid" | "review" | "refunded" | "failed";

/** One row of the receipts table, already worded, so the client component only has to lay it out. */
export interface ReceiptRow {
  readonly id: string;
  readonly title: string;
  /** What the payment bought: "Monthly payment". */
  readonly description: string;
  /** When it was paid, for the reader's own time zone to format; null when it was not recorded. */
  readonly paidAtIso: string | null;
  readonly status: string;
  /** A longer explanation of the status, for the pill's tooltip and screen readers. Null when the label is enough. */
  readonly statusDetail: string | null;
  readonly tone: ReceiptTone;
  readonly amount: string;
  readonly plan: string;
  readonly downloadable: boolean;
}

function statusOf(receipt: Receipt): Pick<ReceiptRow, "status" | "statusDetail" | "tone"> {
  if (receipt.status === "failed") return { status: "Failed", statusDetail: "Nothing was taken.", tone: "failed" };
  if (receipt.status === "refunded") return { status: "Refunded", statusDetail: null, tone: "refunded" };
  if (isUnappliedReason(receipt.attentionReason)) {
    return receipt.attentionResolvedAt === null
      ? { status: "Received", statusDetail: "Received. Our team will be in touch.", tone: "review" }
      : { status: "Received", statusDetail: "Received, but not applied to your plan.", tone: "review" };
  }
  return { status: "Paid", statusDetail: null, tone: "paid" };
}

/**
 * The Plan column: the plan a payment was for, "Extra" for a paid extra, which sits beside the plan, or the add-on's
 * name for an add-on payment, which has no plan of its own.
 */
function planColumn(receipt: Receipt, brand: Brand): string {
  if (receipt.kind === "charge") return "Extra";
  if (receipt.kind === "add_on") return addOnPaymentTitle(receipt) ?? "Add-on";
  return receipt.planName === null ? brand.shortName : planLabel(receipt.planName);
}

/** The receipts table's rows, in the order given (the billing page passes newest first). */
export function receiptRows(receipts: readonly Receipt[], brand: Brand = BRAND): ReceiptRow[] {
  return receipts.map((receipt) => ({
    id: receipt.id,
    title: receipt.taxInvoiceNumber === null ? receiptTitle(receipt.sequence, receipt.paidAt) : `Tax invoice ${receipt.taxInvoiceNumber}`,
    description: receiptDescription(receipt),
    paidAtIso: receipt.paidAt === null ? null : receipt.paidAt.toISOString(),
    ...statusOf(receipt),
    amount: formatMoney(receipt.amountCents, receipt.currency),
    plan: planColumn(receipt, brand),
    downloadable: isDownloadableReceipt(receipt),
  }));
}
