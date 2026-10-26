import { describe, expect, it } from "vitest";
import { BillingRangeError } from "./billing-range-error";
import { UnknownStateError } from "./gst-states";
import { InvalidGstinError } from "./gstin";
import { chargedAmountCents, GST_BASIS_POINTS, gstInsideCents } from "./tax";
import { buildTaxInvoice, BRANDBASKET_SAC, InvoiceAmountMismatchError, placeOfSupply, type InvoiceLineInput } from "./tax-invoice";

// Every price includes GST (owner, 2026-10-26): a line's amounts are what the customer pays, and the invoice works the GST out of them.
const plan = (overrides: Partial<InvoiceLineInput> = {}): InvoiceLineInput => ({
  description: "Brandbasket Premium plan",
  detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
  note: null,
  sac: BRANDBASKET_SAC,
  quantity: 1,
  unitAmountCents: 699_900,
  discountAmountCents: 0,
  taxRateBasisPoints: GST_BASIS_POINTS,
  ...overrides,
});
const recipient = { legalName: "QA Premium Business", gstin: null, addressLines: ["Mumbai 400080"], stateCode: null };
const PLAN_CHARGE = chargedAmountCents(699_900, 0);

describe("buildTaxInvoice", () => {
  it("bills a Maharashtra GSTIN with a coupon as CGST + SGST, matching what was charged", () => {
    const invoice = buildTaxInvoice({
      supplierStateCode: "mh",
      recipient: { ...recipient, gstin: "27AAPFU0939F1ZV" },
      lines: [plan({ discountAmountCents: 139_980, note: "Coupon GAURAV applied" })],
      amountChargedCents: chargedAmountCents(699_900, 139_980),
    });
    // ₹6,999 less a ₹1,399.80 coupon is ₹5,599.20 paid, which holds ₹854.12 of GST (₹427.06 each).
    expect(invoice).toMatchObject({
      placeOfSupplyStateCode: "mh",
      placeOfSupplyBasis: "gstin",
      supplyType: "intra_state",
      taxableCents: 474_508,
      cgstCents: 42_706,
      sgstCents: 42_706,
      igstCents: 0,
      roundOffCents: 0,
      totalCents: 559_920,
    });
    expect(invoice.lines[0]).toMatchObject({ unitAmountCents: 699_900, grossAmountCents: 699_900, discountAmountCents: 139_980, taxableCents: 474_508, taxCents: 85_412 });
  });

  it("bills an unregistered Karnataka customer with two lines as IGST", () => {
    const seats = plan({ description: "Extra team seats", quantity: 2, unitAmountCents: 49_900 });
    const charged = chargedAmountCents(699_900, 0) + chargedAmountCents(99_800, 0);
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, stateCode: "ka" }, lines: [plan(), seats], amountChargedCents: charged });
    expect(invoice).toMatchObject({ placeOfSupplyBasis: "billing_address", supplyType: "inter_state", igstCents: 121_988, taxableCents: 677_712, totalCents: 799_700, roundOffCents: 0 });
    expect(invoice.lines.map((line) => line.igstCents)).toEqual([106_764, 15_224]);
  });

  it("takes the place of supply from the GSTIN over the address", () => {
    const invoice = buildTaxInvoice({
      supplierStateCode: "mh",
      recipient: { ...recipient, gstin: "27AAPFU0939F1ZV", stateCode: "ka" },
      lines: [plan()],
      amountChargedCents: PLAN_CHARGE,
    });
    expect(invoice.supplyType).toBe("intra_state");
  });

  it("falls back to our own state when we know nothing of the customer's", () => {
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan()], amountChargedCents: PLAN_CHARGE });
    expect(invoice).toMatchObject({ placeOfSupplyStateCode: "mh", placeOfSupplyBasis: "supplier_location" });
  });

  it("never needs a round-off: the GST inside an even paisa count splits into equal halves", () => {
    for (const unitAmountCents of [25, 50, 100, 101, 299_900]) {
      const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan({ unitAmountCents })], amountChargedCents: unitAmountCents });
      expect(invoice.roundOffCents).toBe(0);
      expect(invoice.cgstCents).toBe(invoice.sgstCents);
      expect(invoice.taxableCents + invoice.cgstCents + invoice.sgstCents).toBe(unitAmountCents);
    }
  });

  it("refuses figures that do not explain what was charged, by a single paisa either way", () => {
    for (const amountChargedCents of [PLAN_CHARGE - 1, PLAN_CHARGE + 1, 826_000]) {
      expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan()], amountChargedCents })).toThrow(InvoiceAmountMismatchError);
    }
  });

  it("refuses a GSTIN that fails its check", () => {
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, gstin: "29AAPFU0939F1ZV" }, lines: [plan()], amountChargedCents: PLAN_CHARGE })).toThrow(InvalidGstinError);
  });

  it("refuses a billing address state that is not a known state code", () => {
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, stateCode: "xx" }, lines: [plan()], amountChargedCents: PLAN_CHARGE })).toThrow(UnknownStateError);
  });

  it("refuses an unknown or upper-case address state even when a GSTIN decides the place of supply", () => {
    for (const stateCode of ["xx", "KA"]) {
      expect(() =>
        buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, gstin: "27AAPFU0939F1ZV", stateCode }, lines: [plan()], amountChargedCents: PLAN_CHARGE }),
      ).toThrow(UnknownStateError);
    }
  });

  it("refuses an empty invoice and more lines than one page holds", () => {
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [], amountChargedCents: 1 })).toThrow(RangeError);
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [], amountChargedCents: 1 })).toThrow(BillingRangeError);
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: Array.from({ length: 9 }, () => plan()), amountChargedCents: 1 })).toThrow(RangeError);
  });

  it("adds up lines at different rates exactly", () => {
    const lines = [plan({ unitAmountCents: 10_000 }), plan({ unitAmountCents: 10_000, taxRateBasisPoints: 500 }), plan({ unitAmountCents: 10_000, taxRateBasisPoints: 0 })];
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines, amountChargedCents: 30_000 });
    expect(invoice).toMatchObject({ taxableCents: 27_998, cgstCents: 1_001, sgstCents: 1_001, igstCents: 0, roundOffCents: 0, totalCents: 30_000 });
    expect(invoice.lines.map((line) => line.taxCents)).toEqual([1_526, 476, 0]);
  });

  it("refuses a rate that cannot split into two equal halves, within a state or across states", () => {
    const odd = [plan({ unitAmountCents: 10_000, taxRateBasisPoints: 1_801 })];
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: odd, amountChargedCents: 10_000 })).toThrow(RangeError);
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, stateCode: "ka" }, lines: odd, amountChargedCents: 10_000 })).toThrow(RangeError);
  });

  it("refuses a quantity that is not a whole number from 1", () => {
    for (const quantity of [0, 1.5]) {
      expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan({ quantity })], amountChargedCents: PLAN_CHARGE })).toThrow(RangeError);
    }
  });

  it("refuses a discount that leaves nothing to invoice", () => {
    for (const discountAmountCents of [699_900, 700_000, -1]) {
      expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan({ discountAmountCents })], amountChargedCents: PLAN_CHARGE })).toThrow(RangeError);
    }
  });

  it("refuses an amount charged that is not a positive whole number of paise", () => {
    for (const amountChargedCents of [Number.NaN, 0, -1, 118.5, Number.POSITIVE_INFINITY]) {
      expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan()], amountChargedCents })).toThrow(RangeError);
    }
  });

  it("stores the GSTIN in its normal form", () => {
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, gstin: " 27aapfu0939f1zv " }, lines: [plan()], amountChargedCents: PLAN_CHARGE });
    expect(invoice.recipient.gstin).toBe("27AAPFU0939F1ZV");
    expect(invoice.placeOfSupplyBasis).toBe("gstin");
  });

  it("keeps the recipient's own address state apart from the place of supply", () => {
    const byGstin = buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, gstin: "27AAPFU0939F1ZV", stateCode: "ka" }, lines: [plan()], amountChargedCents: PLAN_CHARGE });
    expect(byGstin).toMatchObject({ placeOfSupplyStateCode: "mh", placeOfSupplyBasis: "gstin" });
    expect(byGstin.recipient.stateCode).toBe("ka");
    const byAddress = buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, stateCode: "ka" }, lines: [plan()], amountChargedCents: PLAN_CHARGE });
    expect(byAddress).toMatchObject({ placeOfSupplyStateCode: "ka", placeOfSupplyBasis: "billing_address" });
    expect(byAddress.recipient.stateCode).toBe("ka");
    const bySupplier = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan()], amountChargedCents: PLAN_CHARGE });
    expect(bySupplier.placeOfSupplyBasis).toBe("supplier_location");
    expect(bySupplier.recipient.stateCode).toBeNull();
  });

  it("leaves contact details off the recipient record", () => {
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan()], amountChargedCents: PLAN_CHARGE });
    expect(invoice.recipient).toMatchObject({ email: null, phone: null, tradeName: null, cin: null });
  });

  it("copies only the known fields of a line into the record", () => {
    const withExtras = { ...plan(), internalId: "plan_123" };
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [withExtras], amountChargedCents: PLAN_CHARGE });
    expect(Object.keys(invoice.lines[0] ?? {}).sort()).toEqual(
      [
        "cgstCents", "description", "detail", "discountAmountCents", "grossAmountCents", "igstCents", "note", "quantity",
        "sac", "sgstCents", "taxCents", "taxRateBasisPoints", "taxableCents", "unitAmountCents",
      ].sort(),
    );
  });

  it("refuses a supplier state that is not a lower-case state code", () => {
    expect(() => buildTaxInvoice({ supplierStateCode: "MH", recipient, lines: [plan()], amountChargedCents: PLAN_CHARGE })).toThrow(UnknownStateError);
  });

  it("expects a GSTIN already in normal form when asked for the place of supply directly", () => {
    expect(placeOfSupply("mh", { ...recipient, gstin: "27AAPFU0939F1ZV" })).toEqual({ stateCode: "mh", basis: "gstin" });
    expect(() => placeOfSupply("mh", { ...recipient, gstin: "27aapfu0939f1zv" })).toThrow(InvalidGstinError);
  });
});

/**
 * The seven baskets of the three services at their list prices (₹2,999, ₹9,999 and ₹24,999, GST included), built by hand the
 * way the package rule works: each line loses its percentage of its list, half a paisa up, then the package saving is
 * floored to the whole rupee and the difference goes onto the discount of the dearest line (the earlier one on a tie).
 */
const LIST_PRICES = { website: 299_900, social: 999_900, seo: 2_499_900 } as const;
type Service = keyof typeof LIST_PRICES;
const BASKETS: readonly { readonly services: readonly Service[]; readonly basisPoints: number }[] = [
  { services: ["website"], basisPoints: 0 },
  { services: ["social"], basisPoints: 0 },
  { services: ["seo"], basisPoints: 0 },
  { services: ["website", "social"], basisPoints: 1_000 },
  { services: ["website", "seo"], basisPoints: 1_000 },
  { services: ["social", "seo"], basisPoints: 1_000 },
  { services: ["website", "social", "seo"], basisPoints: 2_000 },
];

function basketLines(services: readonly Service[], basisPoints: number): InvoiceLineInput[] {
  const discounts = services.map((service) => Math.floor((LIST_PRICES[service] * basisPoints * 2 + 10_000) / 20_000));
  if (basisPoints > 0) {
    const listTotal = services.reduce((total, service) => total + LIST_PRICES[service], 0);
    const saving = Math.floor((listTotal * basisPoints) / 1_000_000) * 100;
    const dearest = services.reduce((best, service, index) => (LIST_PRICES[service] > LIST_PRICES[services[best] ?? service] ? index : best), 0);
    discounts[dearest] = (discounts[dearest] ?? 0) + saving - discounts.reduce((total, discount) => total + discount, 0);
  }
  return services.map((service, index) => plan({ description: service, unitAmountCents: LIST_PRICES[service], discountAmountCents: discounts[index] ?? 0 }));
}

describe("buildTaxInvoice over every basket at the list prices", () => {
  const cases = BASKETS.flatMap((basket) => (["intra_state", "inter_state"] as const).map((supplyType) => ({ ...basket, supplyType })));

  it.each(cases)("adds up to the charge to the paisa: $services at $basisPoints bp, $supplyType", ({ services, basisPoints, supplyType }) => {
    const lines = basketLines(services, basisPoints);
    const paid = lines.reduce((total, line) => total + line.unitAmountCents - line.discountAmountCents, 0);
    const charged = chargedAmountCents(paid, 0);
    expect(charged % 100).toBe(0);

    const invoice = buildTaxInvoice({
      supplierStateCode: "mh",
      recipient: { ...recipient, stateCode: supplyType === "intra_state" ? "mh" : "ka" },
      lines,
      amountChargedCents: charged,
    });

    const lineTax = invoice.lines.reduce((total, line) => total + line.taxCents, 0);
    expect(invoice.supplyType).toBe(supplyType);
    expect(invoice.totalCents).toBe(charged);
    expect(invoice.roundOffCents).toBe(0);
    expect(invoice.taxableCents + invoice.cgstCents + invoice.sgstCents + invoice.igstCents).toBe(charged);
    expect(lineTax).toBe(gstInsideCents(charged, GST_BASIS_POINTS));
    expect(lineTax).toBe(invoice.cgstCents + invoice.sgstCents + invoice.igstCents);
    expect(invoice.lines.every((line) => line.taxableCents > 0 && line.taxCents >= 0)).toBe(true);
    // Each line's taxable value and tax add up to what it was paid.
    invoice.lines.forEach((line, index) => expect(line.taxableCents + line.taxCents).toBe((lines[index]?.unitAmountCents ?? 0) - (lines[index]?.discountAmountCents ?? 0)));
    if (supplyType === "intra_state") expect(invoice.cgstCents).toBe(invoice.sgstCents);
    // Each line's tax is within two paise of its exact share of the tax inside the total.
    invoice.lines.forEach((line, index) => {
      const paidLine = (lines[index]?.unitAmountCents ?? 0) - (lines[index]?.discountAmountCents ?? 0);
      expect(Math.abs(line.taxCents - (lineTax * paidLine) / paid)).toBeLessThanOrEqual(2);
    });
  });

  it("charges Website + Social at ₹11,699 with the GST of ₹1,784.60 shared over its two lines", () => {
    const lines = basketLines(["website", "social"], 1_000);
    expect(lines.map((line) => line.unitAmountCents - line.discountAmountCents)).toEqual([269_910, 899_990]);
    const inter = buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, stateCode: "ka" }, lines, amountChargedCents: 1_169_900 });
    expect(inter).toMatchObject({ taxableCents: 991_440, igstCents: 178_460, roundOffCents: 0, totalCents: 1_169_900 });
    expect(inter.lines.map((line) => line.taxCents)).toEqual([41_173, 137_287]);
    const intra = buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, stateCode: "mh" }, lines, amountChargedCents: 1_169_900 });
    expect(intra).toMatchObject({ cgstCents: 89_230, sgstCents: 89_230, roundOffCents: 0 });
    expect(intra.lines.map((line) => line.taxCents)).toEqual([41_172, 137_288]);
  });
});
