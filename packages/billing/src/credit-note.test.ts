import type { TaxInvoice } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { BillingRangeError } from "./billing-range-error";
import { buildCreditNoteDraft } from "./credit-note";

const SUPPLIER = {
  legalName: "BrandBasket Digital Private Limited",
  tradeName: "BrandBasket",
  gstin: "27AABCU9603R1ZM",
  cin: "U72900MH2024PTC123456",
  addressLines: ["Flat 101, Sea View Apartments", "Bandra West, Mumbai 400050"],
  stateCode: "mh",
  email: "billing@brandbasket.com",
  phone: "+919876543210",
};

const RECIPIENT_MH = {
  legalName: "Acme Enterprises",
  tradeName: null,
  gstin: "27AAPCA1234A1Z5",
  cin: null,
  addressLines: ["Shop 4, Market Yard", "Pune 411037"],
  stateCode: "mh",
  email: null,
  phone: null,
};

const RECIPIENT_DL = {
  legalName: "Capital Solutions",
  tradeName: null,
  gstin: "07AAPCC5678B1Z2",
  cin: null,
  addressLines: ["Connaught Place", "New Delhi 110001"],
  stateCode: "dl",
  email: null,
  phone: null,
};

const INTRA_STATE_INVOICE: TaxInvoice = {
  id: "0192f3c4-1111-7000-8000-000000000001",
  businessId: "0192f3c4-2222-7000-8000-000000000002",
  paymentId: "0192f3c4-3333-7000-8000-000000000003",
  prefix: "FY",
  financialYear: "26-27",
  serial: 1,
  number: "FY/26-27/000001",
  issuedOn: "2026-10-15",
  paidOn: "2026-10-15",
  supplier: SUPPLIER,
  recipient: RECIPIENT_MH,
  placeOfSupplyStateCode: "mh",
  placeOfSupplyBasis: "gstin",
  supplyType: "intra_state",
  lines: [
    {
      description: "Managed Website Subscription",
      detail: "Monthly plan",
      note: null,
      sac: "998361",
      quantity: 1,
      unitAmountCents: 353900,
      grossAmountCents: 353900,
      discountAmountCents: 0,
      taxableCents: 299915,
      taxRateBasisPoints: 1800,
      cgstCents: 26992,
      sgstCents: 26992,
      igstCents: 0,
      taxCents: 53984,
    },
  ],
  taxableCents: 299915,
  cgstCents: 26992,
  sgstCents: 26992,
  igstCents: 0,
  roundOffCents: 1,
  totalCents: 353900,
  paymentLabel: "Visa credit card ending 4242",
  paymentReference: "pay_123456",
  createdAt: new Date("2026-10-15T10:00:00.000Z"),
};

const INTER_STATE_INVOICE: TaxInvoice = {
  ...INTRA_STATE_INVOICE,
  id: "0192f3c4-1111-7000-8000-000000000004",
  number: "FY/26-27/000002",
  recipient: RECIPIENT_DL,
  placeOfSupplyStateCode: "dl",
  supplyType: "inter_state",
  lines: [
    {
      description: "Managed Website Subscription",
      detail: "Monthly plan",
      note: null,
      sac: "998361",
      quantity: 1,
      unitAmountCents: 353900,
      grossAmountCents: 353900,
      discountAmountCents: 0,
      taxableCents: 299915,
      taxRateBasisPoints: 1800,
      cgstCents: 0,
      sgstCents: 0,
      igstCents: 53984,
      taxCents: 53984,
    },
  ],
  cgstCents: 0,
  sgstCents: 0,
  igstCents: 53984,
  roundOffCents: 1,
};

describe("buildCreditNoteDraft", () => {
  it("builds a full refund credit note matching the intra-state invoice breakdown", () => {
    const draft = buildCreditNoteDraft({
      invoice: INTRA_STATE_INVOICE,
      refundedAmountCents: 353900,
      reason: "Customer requested cancellation within satisfaction guarantee",
    });

    expect(draft.supplyType).toBe("intra_state");
    expect(draft.totalCents).toBe(353900);
    expect(draft.refundedAmountCents).toBe(353900);
    expect(draft.taxableCents).toBe(299915);
    expect(draft.cgstCents).toBe(26992);
    expect(draft.sgstCents).toBe(26992);
    expect(draft.igstCents).toBe(0);
    expect(draft.totalCents).toBe(draft.taxableCents + draft.cgstCents + draft.sgstCents + draft.igstCents + draft.roundOffCents);
    expect(draft.lines).toHaveLength(1);
    expect(draft.lines[0]?.taxableCents).toBe(299915);
    expect(draft.lines[0]?.cgstCents).toBe(26992);
    expect(draft.lines[0]?.sgstCents).toBe(26992);
  });

  it("builds a full refund credit note matching the inter-state invoice breakdown", () => {
    const draft = buildCreditNoteDraft({
      invoice: INTER_STATE_INVOICE,
      refundedAmountCents: 353900,
      reason: "Service discontinued",
    });

    expect(draft.supplyType).toBe("inter_state");
    expect(draft.totalCents).toBe(353900);
    expect(draft.refundedAmountCents).toBe(353900);
    expect(draft.taxableCents).toBe(299915);
    expect(draft.cgstCents).toBe(0);
    expect(draft.sgstCents).toBe(0);
    expect(draft.igstCents).toBe(53984);
    expect(draft.totalCents).toBe(draft.taxableCents + draft.cgstCents + draft.sgstCents + draft.igstCents + draft.roundOffCents);
  });

  it("builds a partial refund credit note for intra-state with proportional GST reversal", () => {
    const draft = buildCreditNoteDraft({
      invoice: INTRA_STATE_INVOICE,
      refundedAmountCents: 100000,
      reason: "Partial downtime compensation",
    });

    expect(draft.supplyType).toBe("intra_state");
    expect(draft.totalCents).toBe(100000);
    expect(draft.refundedAmountCents).toBe(100000);
    expect(draft.cgstCents).toBe(draft.sgstCents);
    expect(draft.igstCents).toBe(0);
    expect(draft.totalCents).toBe(draft.taxableCents + draft.cgstCents + draft.sgstCents + draft.igstCents + draft.roundOffCents);
    // 100000 paise at 18% GST: tax is 15254 (split 7627 / 7627), taxable is 84746
    expect(draft.cgstCents).toBe(7627);
    expect(draft.sgstCents).toBe(7627);
    expect(draft.taxableCents).toBe(84746);
  });

  it("builds a partial refund credit note for inter-state with proportional GST reversal", () => {
    const draft = buildCreditNoteDraft({
      invoice: INTER_STATE_INVOICE,
      refundedAmountCents: 100000,
      reason: "Partial adjustment",
    });

    expect(draft.supplyType).toBe("inter_state");
    expect(draft.totalCents).toBe(100000);
    expect(draft.refundedAmountCents).toBe(100000);
    expect(draft.cgstCents).toBe(0);
    expect(draft.sgstCents).toBe(0);
    expect(draft.igstCents).toBe(15254);
    expect(draft.taxableCents).toBe(84746);
    expect(draft.totalCents).toBe(draft.taxableCents + draft.cgstCents + draft.sgstCents + draft.igstCents + draft.roundOffCents);
  });

  it("refuses refund amount exceeding invoice total", () => {
    expect(() =>
      buildCreditNoteDraft({
        invoice: INTRA_STATE_INVOICE,
        refundedAmountCents: 400000,
        reason: "Over-refund attempt",
      }),
    ).toThrow(BillingRangeError);
  });

  it("refuses zero or negative refund amount", () => {
    expect(() =>
      buildCreditNoteDraft({
        invoice: INTRA_STATE_INVOICE,
        refundedAmountCents: 0,
        reason: "Zero refund",
      }),
    ).toThrow(BillingRangeError);

    expect(() =>
      buildCreditNoteDraft({
        invoice: INTRA_STATE_INVOICE,
        refundedAmountCents: -500,
        reason: "Negative refund",
      }),
    ).toThrow(BillingRangeError);
  });

  it("refuses invalid reason lengths", () => {
    expect(() =>
      buildCreditNoteDraft({
        invoice: INTRA_STATE_INVOICE,
        refundedAmountCents: 100000,
        reason: "no",
      }),
    ).toThrow(BillingRangeError);

    expect(() =>
      buildCreditNoteDraft({
        invoice: INTRA_STATE_INVOICE,
        refundedAmountCents: 100000,
        reason: "x".repeat(301),
      }),
    ).toThrow(BillingRangeError);
  });
});
