import { describe, expect, it } from "vitest";
import { BillingRangeError } from "./billing-range-error";
import { UnknownStateError } from "./gst-states";
import { InvalidGstinError } from "./gstin";
import { chargedAmountCents, GST_BASIS_POINTS } from "./tax";
import { buildTaxInvoice, FIRSTFOLD_SAC, InvoiceAmountMismatchError, placeOfSupply, type InvoiceLineInput } from "./tax-invoice";

const plan = (overrides: Partial<InvoiceLineInput> = {}): InvoiceLineInput => ({
  description: "Firstfold Premium plan",
  detail: "Monthly subscription, 09 Oct to 08 Nov 2026",
  note: null,
  sac: FIRSTFOLD_SAC,
  quantity: 1,
  unitAmountCents: 699_900,
  discountAmountCents: 0,
  taxRateBasisPoints: GST_BASIS_POINTS,
  ...overrides,
});
const recipient = { legalName: "QA Premium Business", gstin: null, addressLines: ["Mumbai 400080"], stateCode: null };

describe("buildTaxInvoice", () => {
  it("bills a Maharashtra GSTIN with a coupon as CGST + SGST, matching what was charged", () => {
    const invoice = buildTaxInvoice({
      supplierStateCode: "mh",
      recipient: { ...recipient, gstin: "27AAPFU0939F1ZV" },
      lines: [plan({ discountAmountCents: 139_980, note: "Coupon GAURAV applied" })],
      amountChargedCents: chargedAmountCents(699_900, 139_980, GST_BASIS_POINTS),
    });
    expect(invoice).toMatchObject({
      placeOfSupplyStateCode: "mh",
      placeOfSupplyBasis: "gstin",
      supplyType: "intra_state",
      taxableCents: 559_920,
      cgstCents: 50_393,
      sgstCents: 50_393,
      igstCents: 0,
      roundOffCents: 0,
      totalCents: 660_706,
    });
    expect(invoice.lines[0]).toMatchObject({ grossAmountCents: 699_900, taxableCents: 559_920, taxCents: 100_786 });
  });

  it("bills an unregistered Karnataka customer with two lines as IGST", () => {
    const seats = plan({ description: "Extra team seats", quantity: 2, unitAmountCents: 49_900 });
    const charged = chargedAmountCents(699_900, 0, GST_BASIS_POINTS) + chargedAmountCents(99_800, 0, GST_BASIS_POINTS);
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, stateCode: "ka" }, lines: [plan(), seats], amountChargedCents: charged });
    expect(invoice).toMatchObject({ placeOfSupplyBasis: "billing_address", supplyType: "inter_state", igstCents: 143_946, totalCents: 943_646, roundOffCents: 0 });
  });

  it("takes the place of supply from the GSTIN over the address", () => {
    const invoice = buildTaxInvoice({
      supplierStateCode: "mh",
      recipient: { ...recipient, gstin: "27AAPFU0939F1ZV", stateCode: "ka" },
      lines: [plan()],
      amountChargedCents: chargedAmountCents(699_900, 0, GST_BASIS_POINTS),
    });
    expect(invoice.supplyType).toBe("intra_state");
  });

  it("falls back to our own state when we know nothing of the customer's", () => {
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan()], amountChargedCents: chargedAmountCents(699_900, 0, GST_BASIS_POINTS) });
    expect(invoice).toMatchObject({ placeOfSupplyStateCode: "mh", placeOfSupplyBasis: "supplier_location" });
  });

  it("prints the paisa CGST + SGST lose against one rounding of 18% as a round-off", () => {
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan({ unitAmountCents: 25 })], amountChargedCents: 30 });
    expect(invoice).toMatchObject({ cgstCents: 2, sgstCents: 2, roundOffCents: 1, totalCents: 30 });
  });

  it("refuses figures that do not explain what was charged", () => {
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan()], amountChargedCents: 826_000 })).toThrow(InvoiceAmountMismatchError);
  });

  it("refuses a GSTIN that fails its check", () => {
    expect(() =>
      buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, gstin: "29AAPFU0939F1ZV" }, lines: [plan()], amountChargedCents: 825_882 }),
    ).toThrow(InvalidGstinError);
  });

  it("refuses a billing address state that is not a known state code", () => {
    expect(() =>
      buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, stateCode: "xx" }, lines: [plan()], amountChargedCents: 825_882 }),
    ).toThrow(UnknownStateError);
  });

  it("refuses an unknown or upper-case address state even when a GSTIN decides the place of supply", () => {
    const charged = chargedAmountCents(699_900, 0, GST_BASIS_POINTS);
    for (const stateCode of ["xx", "KA"]) {
      expect(() =>
        buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, gstin: "27AAPFU0939F1ZV", stateCode }, lines: [plan()], amountChargedCents: charged }),
      ).toThrow(UnknownStateError);
    }
  });

  it("refuses an empty invoice and more lines than one page holds", () => {
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [], amountChargedCents: 0 })).toThrow(RangeError);
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [], amountChargedCents: 0 })).toThrow(BillingRangeError);
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: Array.from({ length: 9 }, () => plan()), amountChargedCents: 1 })).toThrow(RangeError);
  });

  it("prints a negative round-off when the charge is a paisa under the two halves", () => {
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan({ unitAmountCents: 50 })], amountChargedCents: 59 });
    expect(invoice).toMatchObject({ cgstCents: 5, sgstCents: 5, roundOffCents: -1, totalCents: 59 });
  });

  it("accepts a round-off of one paisa per line and no more", () => {
    const lines = [plan({ unitAmountCents: 100 }), plan({ unitAmountCents: 100 })];
    const issue = (amountChargedCents: number) => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines, amountChargedCents });
    expect(issue(238).roundOffCents).toBe(2);
    expect(issue(234).roundOffCents).toBe(-2);
    expect(() => issue(239)).toThrow(InvoiceAmountMismatchError);
    expect(() => issue(233)).toThrow(InvoiceAmountMismatchError);
  });

  it("adds up lines at different rates exactly", () => {
    const lines = [plan({ unitAmountCents: 10_000 }), plan({ unitAmountCents: 10_000, taxRateBasisPoints: 500 }), plan({ unitAmountCents: 10_000, taxRateBasisPoints: 0 })];
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines, amountChargedCents: 32_300 });
    expect(invoice).toMatchObject({ taxableCents: 30_000, cgstCents: 1_150, sgstCents: 1_150, igstCents: 0, roundOffCents: 0, totalCents: 32_300 });
    expect(invoice.lines.map((line) => line.taxCents)).toEqual([1_800, 500, 0]);
  });

  it("refuses a rate that cannot split into CGST and SGST within the state, but allows it as IGST", () => {
    const odd = [plan({ unitAmountCents: 10_000, taxRateBasisPoints: 1_801 })];
    expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: odd, amountChargedCents: 11_801 })).toThrow(RangeError);
    const interState = buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, stateCode: "ka" }, lines: odd, amountChargedCents: 11_801 });
    expect(interState.igstCents).toBe(1_801);
  });

  it("refuses a quantity that is not a whole number from 1", () => {
    for (const quantity of [0, 1.5]) {
      expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan({ quantity })], amountChargedCents: 825_882 })).toThrow(RangeError);
    }
  });

  it("refuses a discount that leaves nothing to invoice", () => {
    for (const discountAmountCents of [699_900, 700_000, -1]) {
      expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan({ discountAmountCents })], amountChargedCents: 825_882 })).toThrow(RangeError);
    }
  });

  it("refuses an amount charged that is not a positive whole number of paise", () => {
    for (const amountChargedCents of [Number.NaN, 0, -1, 118.5, Number.POSITIVE_INFINITY]) {
      expect(() => buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan()], amountChargedCents })).toThrow(RangeError);
    }
  });

  it("stores the GSTIN in its normal form", () => {
    const invoice = buildTaxInvoice({
      supplierStateCode: "mh",
      recipient: { ...recipient, gstin: " 27aapfu0939f1zv " },
      lines: [plan()],
      amountChargedCents: 825_882,
    });
    expect(invoice.recipient.gstin).toBe("27AAPFU0939F1ZV");
    expect(invoice.placeOfSupplyBasis).toBe("gstin");
  });

  it("keeps the recipient's own address state apart from the place of supply", () => {
    const charged = chargedAmountCents(699_900, 0, GST_BASIS_POINTS);
    const byGstin = buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, gstin: "27AAPFU0939F1ZV", stateCode: "ka" }, lines: [plan()], amountChargedCents: charged });
    expect(byGstin).toMatchObject({ placeOfSupplyStateCode: "mh", placeOfSupplyBasis: "gstin" });
    expect(byGstin.recipient.stateCode).toBe("ka");
    const byAddress = buildTaxInvoice({ supplierStateCode: "mh", recipient: { ...recipient, stateCode: "ka" }, lines: [plan()], amountChargedCents: charged });
    expect(byAddress).toMatchObject({ placeOfSupplyStateCode: "ka", placeOfSupplyBasis: "billing_address" });
    expect(byAddress.recipient.stateCode).toBe("ka");
    const bySupplier = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan()], amountChargedCents: charged });
    expect(bySupplier.placeOfSupplyBasis).toBe("supplier_location");
    expect(bySupplier.recipient.stateCode).toBeNull();
  });

  it("leaves contact details off the recipient record", () => {
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [plan()], amountChargedCents: 825_882 });
    expect(invoice.recipient).toMatchObject({ email: null, phone: null, tradeName: null, cin: null });
  });

  it("copies only the known fields of a line into the record", () => {
    const withExtras = { ...plan(), internalId: "plan_123" };
    const invoice = buildTaxInvoice({ supplierStateCode: "mh", recipient, lines: [withExtras], amountChargedCents: 825_882 });
    expect(Object.keys(invoice.lines[0] ?? {}).sort()).toEqual(
      [
        "cgstCents", "description", "detail", "discountAmountCents", "grossAmountCents", "igstCents", "note", "quantity",
        "sac", "sgstCents", "taxCents", "taxRateBasisPoints", "taxableCents", "unitAmountCents",
      ].sort(),
    );
  });

  it("refuses a supplier state that is not a lower-case state code", () => {
    expect(() => buildTaxInvoice({ supplierStateCode: "MH", recipient, lines: [plan()], amountChargedCents: 825_882 })).toThrow(UnknownStateError);
  });

  it("expects a GSTIN already in normal form when asked for the place of supply directly", () => {
    expect(placeOfSupply("mh", { ...recipient, gstin: "27AAPFU0939F1ZV" })).toEqual({ stateCode: "mh", basis: "gstin" });
    expect(() => placeOfSupply("mh", { ...recipient, gstin: "27aapfu0939f1zv" })).toThrow(InvalidGstinError);
  });
});
