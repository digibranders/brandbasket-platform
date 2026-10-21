/**
 * GST on one invoice line. Within our own state the rate splits into CGST and SGST, each rounded on its own so the two
 * are always equal; across states it is one IGST figure. Rounding is half up, as in tax.ts. Pure and browser-safe.
 */
import type { TaxInvoiceSupplyType } from "@brandbasket/db";
import { BillingRangeError } from "./billing-range-error";
import { gstStateCodeOf } from "./gst-states";

/** Whether a sale stays inside our own state (CGST and SGST) or crosses a state line (IGST). The invoice table's own type. */
export type SupplyType = TaxInvoiceSupplyType;

/** The tax on one line, in paise. Either CGST and SGST are set (equal) or IGST is, and taxCents is the total. */
export interface GstAmounts {
  readonly cgstCents: number;
  readonly sgstCents: number;
  readonly igstCents: number;
  readonly taxCents: number;
}

const BASIS_POINTS = 10_000;
const HALF = BASIS_POINTS / 2;

function taxAt(taxableCents: number, rateBasisPoints: number): number {
  return Math.floor((taxableCents * rateBasisPoints + HALF) / BASIS_POINTS);
}

/**
 * Compares the two states by their GST codes. Throws UnknownStateError for a code that is not a state (including a
 * wrongly cased one), so a typo can never quietly turn a local sale into an IGST one.
 */
export function supplyTypeOf(supplierStateCode: string, placeOfSupplyStateCode: string): SupplyType {
  return gstStateCodeOf(supplierStateCode) === gstStateCodeOf(placeOfSupplyStateCode) ? "intra_state" : "inter_state";
}

/**
 * The GST on a taxable value in paise at a rate in basis points (1800 = 18%). Within a state each half is rounded on
 * its own, so a rate that cannot be halved into whole basis points is refused. Throws BillingRangeError for bad input.
 */
export function splitGst(taxableCents: number, rateBasisPoints: number, supplyType: SupplyType): GstAmounts {
  if (!Number.isSafeInteger(taxableCents) || taxableCents < 0) {
    throw new BillingRangeError(`A taxable value must be whole and non-negative, received ${taxableCents}`);
  }
  if (!Number.isSafeInteger(rateBasisPoints) || rateBasisPoints < 0 || rateBasisPoints > BASIS_POINTS) {
    throw new BillingRangeError(`Not a tax rate: ${rateBasisPoints}`);
  }
  if (supplyType === "inter_state") {
    const igstCents = taxAt(taxableCents, rateBasisPoints);
    return { cgstCents: 0, sgstCents: 0, igstCents, taxCents: igstCents };
  }
  if (rateBasisPoints % 2 !== 0) {
    throw new BillingRangeError(`A rate of ${rateBasisPoints} basis points cannot split into CGST and SGST`);
  }
  const half = taxAt(taxableCents, rateBasisPoints / 2);
  return { cgstCents: half, sgstCents: half, igstCents: 0, taxCents: half * 2 };
}

/** What one line of an invoice is taxed on. */
export interface TaxableLine {
  readonly taxableCents: number;
  readonly rateBasisPoints: number;
}

/**
 * Shares `totalCents` out over the lines in proportion to `weights` (each line's exact share is weight x rate over 10,000), by
 * the largest-remainder method: every line gets the whole paise of its share and the paise left over go one each to the
 * lines with the biggest fractions, the earlier line first on a tie, so the answer never depends on anything but the
 * lines and their order. The parts add up to `totalCents` exactly and none is negative.
 */
function shareOut(totalCents: number, weights: readonly number[], rateBasisPoints: number): number[] {
  const shares = weights.map((weight) => weight * rateBasisPoints);
  const parts = shares.map((share) => Math.floor(share / BASIS_POINTS));
  let spare = totalCents - parts.reduce((sum, part) => sum + part, 0);
  const byLargestFraction = shares
    .map((share, index) => ({ index, fraction: share % BASIS_POINTS }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of byLargestFraction) {
    if (spare <= 0) break;
    parts[index] = (parts[index] ?? 0) + 1;
    spare -= 1;
  }
  if (spare !== 0) throw new BillingRangeError(`${totalCents} paise of tax cannot be shared over lines whose shares come to ${totalCents - spare}`);
  return parts;
}

const NO_GST: GstAmounts = { cgstCents: 0, sgstCents: 0, igstCents: 0, taxCents: 0 };

/**
 * The GST on each line of an invoice, such that the lines add up to the GST on the invoice's total taxable value rounded
 * once, which is exactly what the customer is charged (chargedAmountCents): rounding every line on its own can land a paisa
 * either side of that. Lines at the same rate are taxed together (the total is split as splitGst does it, so within a
 * state CGST and SGST stay equal) and the total is shared back over those lines by the largest remainder. Lines at
 * another rate are a group of their own. Returns each line as given with its tax, in the order given. Pure and browser-safe.
 */
export function splitGstAcross<T extends TaxableLine>(lines: readonly T[], supplyType: SupplyType): (T & GstAmounts)[] {
  const groups = new Map<number, number[]>();
  lines.forEach((line, index) => {
    const members = groups.get(line.rateBasisPoints) ?? [];
    members.push(index);
    groups.set(line.rateBasisPoints, members);
  });
  const taxes: GstAmounts[] = lines.map(() => NO_GST);
  for (const [rateBasisPoints, members] of groups) {
    const taxable = members.map((index) => lines[index]?.taxableCents ?? 0);
    const total = splitGst(
      taxable.reduce((sum, cents) => sum + cents, 0),
      rateBasisPoints,
      supplyType,
    );
    // Within a state each half is its own rounding at half the rate; across states the one figure is at the full rate.
    const shares = supplyType === "inter_state" ? shareOut(total.igstCents, taxable, rateBasisPoints) : shareOut(total.cgstCents, taxable, rateBasisPoints / 2);
    members.forEach((lineIndex, position) => {
      const share = shares[position] ?? 0;
      taxes[lineIndex] =
        supplyType === "inter_state"
          ? { cgstCents: 0, sgstCents: 0, igstCents: share, taxCents: share }
          : { cgstCents: share, sgstCents: share, igstCents: 0, taxCents: share * 2 };
    });
  }
  return lines.map((line, index) => ({ ...line, ...(taxes[index] ?? NO_GST) }));
}
