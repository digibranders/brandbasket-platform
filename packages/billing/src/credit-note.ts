import type { TaxInvoice, TaxInvoiceLineRecord, TaxInvoicePartyRecord, TaxInvoiceSupplyType } from "@brandbasket/db";
import { BillingRangeError } from "./billing-range-error";
import { splitGstInside, type SupplyType } from "./gst";

export const CREDIT_NOTE_PREFIX = "CN";

export interface BuildCreditNoteInput {
  readonly invoice: TaxInvoice;
  readonly refundedAmountCents: number;
  readonly reason: string;
}

export interface CreditNoteDraft {
  readonly recipient: TaxInvoicePartyRecord;
  readonly supplier: TaxInvoicePartyRecord;
  readonly placeOfSupplyStateCode: string;
  readonly supplyType: TaxInvoiceSupplyType;
  readonly lines: readonly TaxInvoiceLineRecord[];
  readonly taxableCents: number;
  readonly cgstCents: number;
  readonly sgstCents: number;
  readonly igstCents: number;
  readonly roundOffCents: number;
  readonly totalCents: number;
  readonly refundedAmountCents: number;
  readonly reason: string;
}

/**
 * Shares `totalCents` out over the lines in proportion to `weights`, by the largest-remainder method.
 */
function shareOut(totalCents: number, weights: readonly number[]): number[] {
  const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal === 0) return weights.map(() => 0);
  const exact = weights.map((weight) => totalCents * weight);
  const parts = exact.map((share) => Math.floor(share / weightTotal));
  let spare = totalCents - parts.reduce((sum, part) => sum + part, 0);
  const byLargestFraction = exact
    .map((share, index) => ({ index, fraction: share % weightTotal }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of byLargestFraction) {
    if (spare <= 0) break;
    parts[index] = (parts[index] ?? 0) + 1;
    spare -= 1;
  }
  if (spare !== 0) throw new BillingRangeError(`${totalCents} paise cannot be shared over weights that come to ${weightTotal}`);
  return parts;
}

/**
 * Builds a GST-compliant credit note draft reversing the tax and taxable value of an invoice.
 * For full refunds, the invoice's tax breakdown is preserved exactly.
 * For partial refunds, tax is reversed proportionally per line using splitGstInside so that
 * taxableCents + cgstCents + sgstCents + igstCents + roundOffCents equals refundedAmountCents to the paisa.
 */
export function buildCreditNoteDraft(input: BuildCreditNoteInput): CreditNoteDraft {
  const { invoice, refundedAmountCents } = input;
  const reason = input.reason.trim();

  if (!Number.isSafeInteger(refundedAmountCents) || refundedAmountCents < 1) {
    throw new BillingRangeError(`A refunded amount must be a positive whole number of paise, received ${refundedAmountCents}`);
  }
  if (refundedAmountCents > invoice.totalCents) {
    throw new BillingRangeError(`Refund amount (${refundedAmountCents}) cannot exceed invoice total (${invoice.totalCents})`);
  }
  if (reason.length < 3 || reason.length > 300) {
    throw new BillingRangeError(`A credit note reason must be between 3 and 300 characters, received ${reason.length}`);
  }

  // Full refund: mirror original invoice breakdown
  if (refundedAmountCents === invoice.totalCents) {
    return {
      recipient: invoice.recipient,
      supplier: invoice.supplier,
      placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
      supplyType: invoice.supplyType,
      lines: invoice.lines,
      taxableCents: invoice.taxableCents,
      cgstCents: invoice.cgstCents,
      sgstCents: invoice.sgstCents,
      igstCents: invoice.igstCents,
      roundOffCents: invoice.roundOffCents,
      totalCents: invoice.totalCents,
      refundedAmountCents,
      reason,
    };
  }

  // Partial refund: split refunded amount across lines proportional to line paid amount
  const lineWeights = invoice.lines.map((line) => line.taxableCents + line.taxCents);
  const lineShares = shareOut(refundedAmountCents, lineWeights);

  const lines = splitGstInside(
    invoice.lines.map((line, index) => ({
      line,
      paidCents: lineShares[index] ?? 0,
      rateBasisPoints: line.taxRateBasisPoints,
    })),
    invoice.supplyType as SupplyType,
  ).map(
    ({ line, paidCents, taxableCents, cgstCents, sgstCents, igstCents, taxCents }): TaxInvoiceLineRecord => ({
      description: line.description,
      detail: line.detail,
      note: line.note,
      sac: line.sac,
      quantity: line.quantity,
      unitAmountCents: line.unitAmountCents,
      grossAmountCents: paidCents,
      discountAmountCents: 0,
      taxableCents,
      taxRateBasisPoints: line.taxRateBasisPoints,
      cgstCents,
      sgstCents,
      igstCents,
      taxCents,
    }),
  );

  const sum = (pick: (l: TaxInvoiceLineRecord) => number) => lines.reduce((total, l) => total + pick(l), 0);
  const taxableCents = sum((l) => l.taxableCents);
  const cgstCents = sum((l) => l.cgstCents);
  const sgstCents = sum((l) => l.sgstCents);
  const igstCents = sum((l) => l.igstCents);
  const computed = taxableCents + cgstCents + sgstCents + igstCents;
  const roundOffCents = refundedAmountCents - computed;

  return {
    recipient: invoice.recipient,
    supplier: invoice.supplier,
    placeOfSupplyStateCode: invoice.placeOfSupplyStateCode,
    supplyType: invoice.supplyType,
    lines,
    taxableCents,
    cgstCents,
    sgstCents,
    igstCents,
    roundOffCents,
    totalCents: refundedAmountCents,
    refundedAmountCents,
    reason,
  };
}
