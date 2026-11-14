import type { BillingProvider } from "@brandbasket/billing";
import { createFakeBillingProvider } from "@brandbasket/billing";
import type { Payment, TaxInvoice } from "@brandbasket/db";
import * as db from "@brandbasket/db";
import { describe, expect, it, vi } from "vitest";
import { executePaymentRefund } from "./payment-refund";
import * as taxInvoicing from "./tax-invoicing";

vi.mock("server-only", () => ({}));

const BUSINESS_ID = "01920000-0000-7000-8000-0000000000b1";
const PAYMENT_ID = "01920000-0000-7000-8000-0000000000a1";
const STAFF_ID = "staff-user-1";
const NOW = new Date("2026-11-12T10:00:00.000Z");

const FAKE_SECRET = "0123456789abcdef0123456789abcdef";

function mockPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: PAYMENT_ID,
    businessId: BUSINESS_ID,
    subscriptionId: null,
    provider: "fake",
    providerPaymentId: "fake_pay_123",
    kind: "renewal",
    amountCents: 299_900,
    currency: "INR",
    status: "captured",
    paidAt: new Date("2026-11-10T10:00:00.000Z"),
    failureReason: null,
    attentionReason: null,
    attentionResolvedAt: null,
    createdAt: new Date("2026-11-10T10:00:00.000Z"),
    ...overrides,
  };
}

function mockTaxInvoice(): TaxInvoice {
  return {
    id: "0192f3c4-1111-7000-8000-000000000001",
    businessId: BUSINESS_ID,
    paymentId: PAYMENT_ID,
    prefix: "FY",
    financialYear: "26-27",
    serial: 1,
    number: "FY/26-27/000001",
    issuedOn: "2026-10-15",
    paidOn: "2026-10-15",
    supplier: {
      legalName: "BrandBasket Pvt Ltd",
      tradeName: "BrandBasket",
      gstin: "27AAICD9268J1Z0",
      cin: null,
      addressLines: ["Mumbai"],
      stateCode: "mh",
      email: "billing@brandbasket.in",
      phone: null,
    },
    recipient: {
      legalName: "Acme Enterprises",
      tradeName: null,
      gstin: "27AAPCA1234A1Z5",
      cin: null,
      addressLines: ["Shop 4", "Pune 411037"],
      stateCode: "mh",
      email: null,
      phone: null,
    },
    placeOfSupplyStateCode: "mh",
    placeOfSupplyBasis: "gstin",
    supplyType: "intra_state",
    lines: [
      {
        description: "Services Plan",
        detail: "Monthly plan",
        note: null,
        sac: "998361",
        quantity: 1,
        unitAmountCents: 299900,
        grossAmountCents: 299900,
        discountAmountCents: 0,
        taxableCents: 254153,
        taxRateBasisPoints: 1800,
        cgstCents: 22873,
        sgstCents: 22874,
        igstCents: 0,
        taxCents: 45747,
      },
    ],
    taxableCents: 254153,
    cgstCents: 22873,
    sgstCents: 22874,
    igstCents: 0,
    roundOffCents: 0,
    totalCents: 299900,
    paymentLabel: "Card",
    paymentReference: "fake_pay_123",
    createdAt: new Date("2026-10-15T10:00:00.000Z"),
  };
}

describe("executePaymentRefund", () => {
  it("processes a full refund: calls fake provider, marks refunded, and issues credit note", async () => {
    const payment = mockPayment();
    const invoice = mockTaxInvoice();
    const fakeProvider = createFakeBillingProvider({ secret: FAKE_SECRET });
    const refundSpy = vi.spyOn(fakeProvider, "refundPayment");

    const mockTx = {} as any;
    const mockDb = {
      transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    } as any;

    vi.spyOn(db, "lockPaymentForRefund").mockResolvedValue({
      kind: "locked",
      payment,
    });

    const applySpy = vi.spyOn(db, "applyPaymentRefund").mockResolvedValue({
      cancelledEarnings: 1,
      paidEarnings: 0,
    });

    vi.spyOn(taxInvoicing, "issueCreditNote").mockResolvedValue({
      creditNote: {
        id: "cn-1",
        number: "CN/26-27/000001",
        refundedAmountCents: 299_900,
      } as any,
      issued: true,
    });

    const result = await executePaymentRefund(mockDb, fakeProvider, {
      paymentId: PAYMENT_ID,
      businessId: BUSINESS_ID,
      refundedAmountCents: 299_900,
      reason: "Charged twice by mistake",
      staffUserId: STAFF_ID,
      now: NOW,
      findInvoice: async () => invoice,
    });

    expect(result.kind).toBe("refunded");
    if (result.kind === "refunded") {
      expect(result.providerRefundId).toMatch(/^fake_rfnd_/);
      expect(result.creditNote?.number).toBe("CN/26-27/000001");
      expect(result.cancelledEarnings).toBe(1);
    }
    expect(refundSpy).toHaveBeenCalledWith({
      providerPaymentId: "fake_pay_123",
      amountCents: 299_900,
      reason: "Charged twice by mistake",
    });
    expect(applySpy).toHaveBeenCalledWith(mockTx, {
      paymentId: PAYMENT_ID,
      refundedAmountCents: 299_900,
      reason: "Charged twice by mistake",
      staffUserId: STAFF_ID,
      now: NOW,
    });
  });

  it("handles double press: returns already-refunded without calling provider or modifying DB", async () => {
    const fakeProvider = createFakeBillingProvider({ secret: FAKE_SECRET });
    const refundSpy = vi.spyOn(fakeProvider, "refundPayment");

    const mockTx = {} as any;
    const mockDb = {
      transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    } as any;

    vi.spyOn(db, "lockPaymentForRefund").mockResolvedValue({
      kind: "already-refunded",
    });
    const applySpy = vi.spyOn(db, "applyPaymentRefund");

    const result = await executePaymentRefund(mockDb, fakeProvider, {
      paymentId: PAYMENT_ID,
      businessId: BUSINESS_ID,
      refundedAmountCents: 299_900,
      reason: "Charged twice",
      staffUserId: STAFF_ID,
      now: NOW,
    });

    expect(result.kind).toBe("already-refunded");
    expect(refundSpy).not.toHaveBeenCalled();
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("handles provider failure: rolls back transaction, modifies nothing, and returns provider-failed", async () => {
    const payment = mockPayment();
    const failingProvider = {
      name: "razorpay",
      refundPayment: vi.fn().mockRejectedValue(new Error("Gateway connection timeout")),
    } as unknown as BillingProvider;

    const mockTx = {} as any;
    const mockDb = {
      transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    } as any;

    vi.spyOn(db, "lockPaymentForRefund").mockResolvedValue({
      kind: "locked",
      payment,
    });
    const applySpy = vi.spyOn(db, "applyPaymentRefund");

    const result = await executePaymentRefund(mockDb, failingProvider, {
      paymentId: PAYMENT_ID,
      businessId: BUSINESS_ID,
      refundedAmountCents: 100_000,
      reason: "Customer request",
      staffUserId: STAFF_ID,
      now: NOW,
    });

    expect(result.kind).toBe("provider-failed");
    if (result.kind === "provider-failed") {
      expect(result.error).toContain("Gateway connection timeout");
    }
    expect(applySpy).not.toHaveBeenCalled();
  });

  it("refuses a refund if amount exceeds payment amount", async () => {
    const payment = mockPayment({ amountCents: 100_000 });
    const fakeProvider = createFakeBillingProvider({ secret: FAKE_SECRET });

    const mockTx = {} as any;
    const mockDb = {
      transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    } as any;

    vi.spyOn(db, "lockPaymentForRefund").mockResolvedValue({
      kind: "locked",
      payment,
    });

    const result = await executePaymentRefund(mockDb, fakeProvider, {
      paymentId: PAYMENT_ID,
      businessId: BUSINESS_ID,
      refundedAmountCents: 150_000,
      reason: "Too much",
      staffUserId: STAFF_ID,
    });

    expect(result.kind).toBe("amount-too-high");
  });

  it("refuses a non-captured payment", async () => {
    const fakeProvider = createFakeBillingProvider({ secret: FAKE_SECRET });

    const mockTx = {} as any;
    const mockDb = {
      transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    } as any;

    vi.spyOn(db, "lockPaymentForRefund").mockResolvedValue({
      kind: "not-refundable",
    });

    const result = await executePaymentRefund(mockDb, fakeProvider, {
      paymentId: PAYMENT_ID,
      businessId: BUSINESS_ID,
      refundedAmountCents: 50_000,
      reason: "Should fail",
      staffUserId: STAFF_ID,
    });

    expect(result.kind).toBe("not-refundable");
  });

  it("processes a refund with Razorpay provider stub", async () => {
    const payment = mockPayment({ provider: "razorpay", providerPaymentId: "pay_rzp_456" });
    const invoice = mockTaxInvoice();

    const razorpayStub = {
      name: "razorpay",
      refundPayment: vi.fn().mockResolvedValue({ providerRefundId: "rfnd_rzp_789" }),
    } as unknown as BillingProvider;

    const mockTx = {} as any;
    const mockDb = {
      transaction: vi.fn().mockImplementation(async (cb) => cb(mockTx)),
    } as any;

    vi.spyOn(db, "lockPaymentForRefund").mockResolvedValue({
      kind: "locked",
      payment,
    });

    const applySpy = vi.spyOn(db, "applyPaymentRefund").mockResolvedValue({
      cancelledEarnings: 0,
      paidEarnings: 0,
    });

    vi.spyOn(taxInvoicing, "issueCreditNote").mockResolvedValue({
      creditNote: {
        id: "cn-2",
        number: "CN/26-27/000002",
        refundedAmountCents: 100_000,
      } as any,
      issued: true,
    });

    const result = await executePaymentRefund(mockDb, razorpayStub, {
      paymentId: PAYMENT_ID,
      businessId: BUSINESS_ID,
      refundedAmountCents: 100_000,
      reason: "Partial refund requested",
      staffUserId: STAFF_ID,
      now: NOW,
      findInvoice: async () => invoice,
    });

    expect(result.kind).toBe("refunded");
    if (result.kind === "refunded") {
      expect(result.providerRefundId).toBe("rfnd_rzp_789");
      expect(result.creditNote?.number).toBe("CN/26-27/000002");
    }
    expect(razorpayStub.refundPayment).toHaveBeenCalledWith({
      providerPaymentId: "pay_rzp_456",
      amountCents: 100_000,
      reason: "Partial refund requested",
    });
    expect(applySpy).toHaveBeenCalledWith(mockTx, {
      paymentId: PAYMENT_ID,
      refundedAmountCents: 100_000,
      reason: "Partial refund requested",
      staffUserId: STAFF_ID,
      now: NOW,
    });
  });
});
