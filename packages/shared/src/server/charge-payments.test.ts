import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@firstfold/db", () => ({ recordChargePayment: vi.fn() }));
vi.mock("./tax-invoicing", () => ({ issueTaxInvoiceSafely: vi.fn() }));

import { recordChargePayment } from "@firstfold/db";
import { recordChargePaymentWithInvoice } from "./charge-payments";
import { issueTaxInvoiceSafely } from "./tax-invoicing";

const tx = { name: "staff-tx" } as never;
const PAYMENT = { id: "payment_1" } as never;
const INPUT = {
  chargeId: "charge_1",
  businessId: "biz_1",
  provider: "manual",
  providerPaymentId: "manual_charge_1",
  amountCents: 336_300,
  currency: "INR",
  paidAt: new Date("2026-10-09T09:00:00.000Z"),
  now: new Date("2026-10-09T09:00:00.000Z"),
  manual: { recordedByStaffId: "staff_1", reference: "NEFT 0921", receivedOn: "2026-10-09" },
} as const;

afterEach(() => {
  vi.clearAllMocks();
});

describe("recordChargePaymentWithInvoice", () => {
  it("records the payment, then invoices the charge it settled", async () => {
    vi.mocked(recordChargePayment).mockResolvedValue({ payment: PAYMENT, outcome: "paid", alreadyRecorded: false });
    expect(await recordChargePaymentWithInvoice(tx, INPUT)).toEqual({ payment: PAYMENT, outcome: "paid", alreadyRecorded: false });
    expect(recordChargePayment).toHaveBeenCalledWith(tx, INPUT);
    expect(issueTaxInvoiceSafely).toHaveBeenCalledWith(tx, PAYMENT, { kind: "charge", chargeId: "charge_1" });
  });

  it.each(["not-open", "amount-mismatch", "upgrade-not-applied"] as const)("invoices nothing for money that did not settle the charge (%s)", async (outcome) => {
    vi.mocked(recordChargePayment).mockResolvedValue({ payment: PAYMENT, outcome, alreadyRecorded: false });
    await recordChargePaymentWithInvoice(tx, INPUT);
    expect(issueTaxInvoiceSafely).not.toHaveBeenCalled();
  });

  it("invoices nothing again for a payment recorded before", async () => {
    vi.mocked(recordChargePayment).mockResolvedValue({ payment: PAYMENT, outcome: "paid", alreadyRecorded: true });
    await recordChargePaymentWithInvoice(tx, INPUT);
    expect(issueTaxInvoiceSafely).not.toHaveBeenCalled();
  });
});
