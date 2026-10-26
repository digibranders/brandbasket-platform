/**
 * GST on an invoice whose prices include it. The customer is charged the price (chargedAmountCents); the GST inside it is
 * worked out from the charge (gstInsideCents) and shared back over the lines, so each line's taxable value and tax add up
 * to what the customer paid for it, and the lines add up to the charge, to the paisa. Within our own state the tax splits
 * into equal CGST and SGST; across states it is one IGST figure. Pure and browser-safe.
 */
import type { TaxInvoiceSupplyType } from "@brandbasket/db";
import { BillingRangeError } from "./billing-range-error";
import { gstStateCodeOf } from "./gst-states";
import { gstInsideCents } from "./tax";

/** Whether a sale stays inside our own state (CGST and SGST) or crosses a state line (IGST). The invoice table's own type. */
export type SupplyType = TaxInvoiceSupplyType;

/** The tax on one line, in paise. Either CGST and SGST are set (equal) or IGST is, and taxCents is the total. */
export interface GstAmounts {
  readonly cgstCents: number;
  readonly sgstCents: number;
  readonly igstCents: number;
  readonly taxCents: number;
}

/** What one line of an invoice was paid, GST included, and the rate of the GST inside it. */
export interface PaidLine {
  readonly paidCents: number;
  readonly rateBasisPoints: number;
}

/**
 * Compares the two states by their GST codes. Throws UnknownStateError for a code that is not a state (including a
 * wrongly cased one), so a typo can never quietly turn a local sale into an IGST one.
 */
export function supplyTypeOf(supplierStateCode: string, placeOfSupplyStateCode: string): SupplyType {
  return gstStateCodeOf(supplierStateCode) === gstStateCodeOf(placeOfSupplyStateCode) ? "intra_state" : "inter_state";
}

/**
 * Shares `totalCents` out over the lines in proportion to `weights`, by the largest-remainder method: every line gets the
 * whole paise of its share and the paise left over go one each to the lines with the biggest fractions, the earlier line
 * first on a tie, so the answer never depends on anything but the lines and their order. The parts add up to `totalCents`
 * exactly and none is negative.
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
  if (spare !== 0) throw new BillingRangeError(`${totalCents} paise of tax cannot be shared over weights that come to ${weightTotal}`);
  return parts;
}

const NO_GST: GstAmounts = { cgstCents: 0, sgstCents: 0, igstCents: 0, taxCents: 0 };

/**
 * The GST inside each line of an invoice. Lines at the same rate are taxed together: the tax inside their total paid is
 * `gstInsideCents`, an even number of paise, and it is shared back over those lines by the largest remainder (within a state
 * as CGST and SGST halves that stay equal, across states as one IGST figure). Lines at another rate are a group of their own.
 * Returns each line as given, with its tax and its taxable value (what it was paid less its tax), in the order given.
 * Throws RangeError for a line that is not whole, non-negative paise or a rate that cannot split into two whole halves.
 */
export function splitGstInside<T extends PaidLine>(lines: readonly T[], supplyType: SupplyType): (T & GstAmounts & { readonly taxableCents: number })[] {
  const groups = new Map<number, number[]>();
  lines.forEach((line, index) => {
    const members = groups.get(line.rateBasisPoints) ?? [];
    members.push(index);
    groups.set(line.rateBasisPoints, members);
  });
  const taxes: GstAmounts[] = lines.map(() => NO_GST);
  for (const [rateBasisPoints, members] of groups) {
    const paid = members.map((index) => lines[index]?.paidCents ?? 0);
    const total = gstInsideCents(
      paid.reduce((sum, cents) => sum + cents, 0),
      rateBasisPoints,
    );
    const shares = shareOut(supplyType === "inter_state" ? total : total / 2, paid);
    members.forEach((lineIndex, position) => {
      const share = shares[position] ?? 0;
      taxes[lineIndex] =
        supplyType === "inter_state"
          ? { cgstCents: 0, sgstCents: 0, igstCents: share, taxCents: share }
          : { cgstCents: share, sgstCents: share, igstCents: 0, taxCents: share * 2 };
    });
  }
  return lines.map((line, index) => {
    const tax = taxes[index] ?? NO_GST;
    return { ...line, ...tax, taxableCents: line.paidCents - tax.taxCents };
  });
}
