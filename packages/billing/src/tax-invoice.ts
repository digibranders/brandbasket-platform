import type { PlaceOfSupplyBasis, TaxInvoiceLineRecord, TaxInvoicePartyRecord } from "@brandbasket/db";
import { BillingRangeError } from "./billing-range-error";
import { gstStateCodeOf } from "./gst-states";
import { splitGstAcross, supplyTypeOf, type SupplyType } from "./gst";
import { normaliseGstin, stateCodeOfGstin } from "./gstin";

/** SAC for the managed website subscription and its extras. The owner confirmed 998361. */
export const BRANDBASKET_SAC = "998361";
/** One A4 page holds this many lines in the approved layout; every real invoice today has one. */
export const MAX_INVOICE_LINES = 8;

export interface InvoiceLineInput {
  readonly description: string;
  readonly detail: string | null;
  readonly note: string | null;
  readonly sac: string;
  readonly quantity: number;
  readonly unitAmountCents: number;
  readonly discountAmountCents: number;
  readonly taxRateBasisPoints: number;
}

export interface RecipientInput {
  readonly legalName: string;
  readonly gstin: string | null;
  readonly addressLines: readonly string[];
  /**
   * The state of the address on record, as a platform state code: the billing details, or else the onboarding business
   * address. Null when neither is known. It is kept on the invoice as the address's own state, which can differ from
   * the place of supply when a GSTIN decides that. Contact details are not part of it: an invoice is insert only, so
   * an email or phone frozen into it could never be erased. They are read from the billing details when needed.
   */
  readonly stateCode: string | null;
}

export interface TaxInvoiceDraft {
  readonly recipient: TaxInvoicePartyRecord;
  readonly placeOfSupplyStateCode: string;
  readonly placeOfSupplyBasis: PlaceOfSupplyBasis;
  readonly supplyType: SupplyType;
  readonly lines: readonly TaxInvoiceLineRecord[];
  readonly taxableCents: number;
  readonly cgstCents: number;
  readonly sgstCents: number;
  readonly igstCents: number;
  readonly roundOffCents: number;
  readonly totalCents: number;
}

export class InvoiceAmountMismatchError extends Error {
  constructor(computedCents: number, chargedCents: number) {
    super(`Invoice lines come to ${computedCents} but ${chargedCents} was charged`);
    this.name = "InvoiceAmountMismatchError";
  }
}

/**
 * Section 12(2) IGST Act: a registered recipient's state, else the address on record, else our own location. The
 * basis `billing_address` means the address on record: the billing details, or else the onboarding business address.
 * A GSTIN must already be in normal form (see normaliseGstin); anything else is refused as invalid.
 */
export function placeOfSupply(supplierStateCode: string, recipient: RecipientInput): { stateCode: string; basis: PlaceOfSupplyBasis } {
  if (recipient.gstin !== null) return { stateCode: stateCodeOfGstin(recipient.gstin), basis: "gstin" };
  if (recipient.stateCode !== null) return { stateCode: recipient.stateCode, basis: "billing_address" };
  return { stateCode: supplierStateCode, basis: "supplier_location" };
}

/** A line's gross and taxable value, refusing a quantity that is not whole or a discount that leaves nothing to invoice. */
function priced(line: InvoiceLineInput): { readonly line: InvoiceLineInput; readonly grossAmountCents: number; readonly taxableCents: number } {
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new BillingRangeError(`A quantity must be a whole number from 1, received ${line.quantity}`);
  const grossAmountCents = line.unitAmountCents * line.quantity;
  const taxableCents = grossAmountCents - line.discountAmountCents;
  if (line.discountAmountCents < 0 || taxableCents <= 0) throw new BillingRangeError(`A discount of ${line.discountAmountCents} leaves nothing to invoice on ${grossAmountCents}`);
  return { line, grossAmountCents, taxableCents };
}

/**
 * Everything printed on an invoice except the parties' fixed details and the number, from what was sold and what was
 * charged. The charged amount is the authority: its GST is one rounding on the invoice's total, shared over the lines
 * (splitGstAcross), so across states the lines add up to it exactly. Within a state CGST and SGST are equal, so an odd
 * paisa of GST prints as a round-off. The lines must come within one paisa per line of the charge (D4); anything further
 * off means the lines do not describe the payment, and nothing is issued.
 */
export function buildTaxInvoice(input: {
  readonly supplierStateCode: string;
  readonly recipient: RecipientInput;
  readonly lines: readonly InvoiceLineInput[];
  readonly amountChargedCents: number;
}): TaxInvoiceDraft {
  if (!Number.isSafeInteger(input.amountChargedCents) || input.amountChargedCents <= 0) {
    throw new BillingRangeError(`An amount charged must be a positive whole number of paise, received ${input.amountChargedCents}`);
  }
  if (input.lines.length === 0 || input.lines.length > MAX_INVOICE_LINES) {
    throw new BillingRangeError(`An invoice has 1 to ${MAX_INVOICE_LINES} lines, received ${input.lines.length}`);
  }
  // The address state is stored whatever decides the place of supply, so an unknown or upper-case one never reaches the row.
  if (input.recipient.stateCode !== null) gstStateCodeOf(input.recipient.stateCode);
  const gstin = input.recipient.gstin === null ? null : normaliseGstin(input.recipient.gstin);
  const place = placeOfSupply(input.supplierStateCode, { ...input.recipient, gstin });
  const supplyType = supplyTypeOf(input.supplierStateCode, place.stateCode);
  // The tax is worked out on the invoice's total and shared back over the lines, so the lines add up to the GST the customer
  // was charged to the paisa, whatever the lines' own fractions.
  const lines = splitGstAcross(
    input.lines.map(priced).map((value) => ({ ...value, rateBasisPoints: value.line.taxRateBasisPoints })),
    supplyType,
  ).map(
    ({ line, grossAmountCents, taxableCents, cgstCents, sgstCents, igstCents, taxCents }): TaxInvoiceLineRecord => ({
      description: line.description,
      detail: line.detail,
      note: line.note,
      sac: line.sac,
      quantity: line.quantity,
      unitAmountCents: line.unitAmountCents,
      grossAmountCents,
      discountAmountCents: line.discountAmountCents,
      taxableCents,
      taxRateBasisPoints: line.taxRateBasisPoints,
      cgstCents,
      sgstCents,
      igstCents,
      taxCents,
    }),
  );
  const sum = (pick: (line: TaxInvoiceLineRecord) => number) => lines.reduce((total, line) => total + pick(line), 0);
  const taxableCents = sum((line) => line.taxableCents);
  const cgstCents = sum((line) => line.cgstCents);
  const sgstCents = sum((line) => line.sgstCents);
  const igstCents = sum((line) => line.igstCents);
  const computed = taxableCents + cgstCents + sgstCents + igstCents;
  const roundOffCents = input.amountChargedCents - computed;
  if (!(Math.abs(roundOffCents) <= lines.length)) throw new InvoiceAmountMismatchError(computed, input.amountChargedCents);
  return {
    recipient: {
      legalName: input.recipient.legalName,
      tradeName: null,
      gstin,
      cin: null,
      addressLines: [...input.recipient.addressLines],
      stateCode: input.recipient.stateCode,
      email: null,
      phone: null,
    },
    placeOfSupplyStateCode: place.stateCode,
    placeOfSupplyBasis: place.basis,
    supplyType,
    lines,
    taxableCents,
    cgstCents,
    sgstCents,
    igstCents,
    roundOffCents,
    totalCents: input.amountChargedCents,
  };
}
