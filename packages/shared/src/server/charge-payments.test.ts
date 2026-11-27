import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({
  findChargeForBusiness: vi.fn(),
  findPaymentLinkByAdvanceChargeId: vi.fn(),
  markAdvancePaid: vi.fn(),
  openMembershipForListingBusiness: vi.fn(),
  recordChargePayment: vi.fn(),
}));
vi.mock("./tax-invoicing", () => ({ issueTaxInvoiceSafely: vi.fn() }));

import { findChargeForBusiness, findPaymentLinkByAdvanceChargeId, markAdvancePaid, openMembershipForListingBusiness, recordChargePayment } from "@brandbasket/db";
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

const ORDINARY_CHARGE = { id: "charge_1", kind: "change_hours" } as never;
const ADVANCE_CHARGE = { id: "charge_1", kind: "website_advance" } as never;

beforeEach(() => {
  vi.mocked(findChargeForBusiness).mockResolvedValue(ORDINARY_CHARGE);
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("recordChargePaymentWithInvoice", () => {
  it("records the payment, then invoices the charge it settled", async () => {
    vi.mocked(recordChargePayment).mockResolvedValue({ payment: PAYMENT, outcome: "paid", alreadyRecorded: false });
    expect(await recordChargePaymentWithInvoice(tx, INPUT)).toEqual({ payment: PAYMENT, outcome: "paid", alreadyRecorded: false, openedMembership: null });
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

  it("marks the deal's advance paid and opens the project in the same transaction for a website advance", async () => {
    vi.mocked(recordChargePayment).mockResolvedValue({ payment: PAYMENT, outcome: "paid", alreadyRecorded: false });
    vi.mocked(findChargeForBusiness).mockResolvedValue(ADVANCE_CHARGE);
    vi.mocked(findPaymentLinkByAdvanceChargeId).mockResolvedValue({ id: "link_1", websiteKind: "ecommerce" } as never);
    vi.mocked(openMembershipForListingBusiness).mockResolvedValue({ businessName: "Chennai Cafe" });

    const recorded = await recordChargePaymentWithInvoice(tx, INPUT);

    expect(markAdvancePaid).toHaveBeenCalledWith(tx, { linkId: "link_1", paidAt: INPUT.paidAt });
    expect(openMembershipForListingBusiness).toHaveBeenCalledWith(tx, "biz_1", { withProject: true, websiteKind: "ecommerce" });
    expect(recorded.openedMembership).toEqual({ businessName: "Chennai Cafe" });
    expect(issueTaxInvoiceSafely).toHaveBeenCalledTimes(1);
  });

  it.each(["not-open", "amount-mismatch"] as const)("starts nothing for an advance that did not settle its charge (%s)", async (outcome) => {
    vi.mocked(recordChargePayment).mockResolvedValue({ payment: PAYMENT, outcome, alreadyRecorded: false });
    vi.mocked(findChargeForBusiness).mockResolvedValue(ADVANCE_CHARGE);
    await recordChargePaymentWithInvoice(tx, INPUT);
    expect(markAdvancePaid).not.toHaveBeenCalled();
    expect(openMembershipForListingBusiness).not.toHaveBeenCalled();
  });

  it("starts nothing again for an advance payment recorded before", async () => {
    vi.mocked(recordChargePayment).mockResolvedValue({ payment: PAYMENT, outcome: "paid", alreadyRecorded: true });
    vi.mocked(findChargeForBusiness).mockResolvedValue(ADVANCE_CHARGE);
    await recordChargePaymentWithInvoice(tx, INPUT);
    expect(openMembershipForListingBusiness).not.toHaveBeenCalled();
  });

  it("throws, rolling the payment back, when an advance charge belongs to no link", async () => {
    vi.mocked(recordChargePayment).mockResolvedValue({ payment: PAYMENT, outcome: "paid", alreadyRecorded: false });
    vi.mocked(findChargeForBusiness).mockResolvedValue(ADVANCE_CHARGE);
    vi.mocked(findPaymentLinkByAdvanceChargeId).mockResolvedValue(null);
    await expect(recordChargePaymentWithInvoice(tx, INPUT)).rejects.toThrow(/belongs to no payment link/);
  });
});
