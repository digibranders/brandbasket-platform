import type { PlaceOfSupplyBasis, TaxInvoiceLineRecord, TaxInvoicePartyRecord } from "@brandbasket/db";
import { BillingRangeError } from "./billing-range-error";
import { gstStateCodeOf } from "./gst-states";
import { splitGstInside, supplyTypeOf, type SupplyType } from "./gst";
import { normaliseGstin, stateCodeOfGstin } from "./gstin";

/** SAC for the managed website subscription and its extras. The owner confirmed 998361. */
export const BRANDBASKET_SAC = "998361";
/** One A4 page holds this many lines in the approved layout; every real invoice today has one. */
export const MAX_INVOICE_LINES = 8;

/**
 * One thing sold. Every price includes GST (owner, 2026-10-26), so `unitAmountCents` and `discountAmountCents` are what the
 * customer pays, GST inside: the invoice works the tax out of them. `taxRateBasisPoints` is the rate of the GST inside.
 */
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

/** A line's gross (before its discount) and what was paid for it, both with GST inside, refusing a quantity that is not whole or a discount that leaves nothing to invoice. */
function priced(line: InvoiceLineInput): { readonly line: InvoiceLineInput; readonly grossAmountCents: number; readonly paidCents: number } {
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new BillingRangeError(`A quantity must be a whole number from 1, received ${line.quantity}`);
  const grossAmountCents = line.unitAmountCents * line.quantity;
  const paidCents = grossAmountCents - line.discountAmountCents;
  if (line.discountAmountCents < 0 || paidCents <= 0) throw new BillingRangeError(`A discount of ${line.discountAmountCents} leaves nothing to invoice on ${grossAmountCents}`);
  return { line, grossAmountCents, paidCents };
}

/**
 * Everything printed on an invoice except the parties' fixed details and the number, from what was sold and what was
 * charged. Prices include GST, so the lines must add up to the charge exactly (anything else means the lines do not
 * describe the payment, and nothing is issued). The GST inside the charge is worked out once and shared over the lines
 * (splitGstInside), within a state as equal CGST and SGST and across states as IGST, so each line's taxable value and tax
 * add up to what it was paid and the lines add up to the charge to the paisa: there is never a round-off.
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
  const pricedLines = input.lines.map(priced);
  const paidTotal = pricedLines.reduce((total, value) => total + value.paidCents, 0);
  if (paidTotal !== input.amountChargedCents) throw new InvoiceAmountMismatchError(paidTotal, input.amountChargedCents);
  // The GST inside the charge is worked out once and shared back over the lines, so each line's taxable value and tax add up
  // to what it was paid, whatever the lines' own fractions.
  const lines = splitGstInside(
    pricedLines.map((value) => ({ ...value, rateBasisPoints: value.line.taxRateBasisPoints })),
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
  if (roundOffCents !== 0) throw new InvoiceAmountMismatchError(computed, input.amountChargedCents);
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
