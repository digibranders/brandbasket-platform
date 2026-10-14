/**
 * GST on one invoice line. Within our own state the rate splits into CGST and SGST, each rounded on its own so the two
 * are always equal; across states it is one IGST figure. Rounding is half up, as in tax.ts. Pure and browser-safe.
 */
import type { TaxInvoiceSupplyType } from "@fynix/db";
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
