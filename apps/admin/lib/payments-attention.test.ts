import type { PaymentNeedingAttention, StaffPaymentRow } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { paymentsAttention } from "./payments-attention";

function row(overrides: Partial<StaffPaymentRow>): StaffPaymentRow {
  return {
    id: "p1",
    businessId: "b1",
    businessName: "Sai Dental Care",
    provider: "razorpay",
    providerPaymentId: "pay_1",
    kind: "renewal",
    amountCents: 299_900,
    currency: "INR",
    status: "captured",
    paidAt: new Date("2026-11-10T03:44:00.000Z"),
    createdAt: new Date("2026-11-10T03:44:00.000Z"),
    method: "upi",
    failureReason: null,
    attentionReason: null,
    attentionResolvedAt: null,
    recordedByName: null,
    refundedAmountCents: null,
    refundReason: null,
    invoiceNumber: "FY/26-27/000031",
    ...overrides,
  };
}

const flagged = (paymentId: string): PaymentNeedingAttention => ({
  paymentId,
  businessId: "b9",
  businessName: "Old Month Traders",
  reason: "already_paid",
  raisedAt: new Date("2026-10-02T00:00:00.000Z"),
  provider: "razorpay",
  providerPaymentId: "pay_9",
  amountCents: 299_900,
  currency: "INR",
  paidAt: null,
});

describe("paymentsAttention", () => {
  it("shows a failed payment as needing a look, never All clear", () => {
    const result = paymentsAttention("2026-11", [row({ id: "f", status: "failed", paidAt: null, failureReason: "Card declined" })], []);
    expect(result.count).toBe(1);
    expect(result.items[0]).toMatchObject({ title: "Payment failed: Card declined", href: "/payments?month=2026-11&open=f" });
  });

  it("counts a payment once when it is both failed and flagged, and skips paid and resolved ones", () => {
    const rows = [
      row({ id: "both", status: "failed", attentionReason: "amount_mismatch" }),
      row({ id: "paid" }),
      row({ id: "done", attentionReason: "already_paid", attentionResolvedAt: new Date("2026-11-11T00:00:00.000Z") }),
    ];
    const result = paymentsAttention("2026-11", rows, [flagged("both")]);
    expect(result.items.map((item) => item.key)).toEqual(["both"]);
  });

  it("adds payments flagged in other months and sends them to the client's page", () => {
    const result = paymentsAttention("2026-11", [row({ id: "paid" })], [flagged("old")]);
    expect(result.count).toBe(1);
    expect(result.items[0]).toMatchObject({ client: "Old Month Traders", href: "/clients/b9/billing#payment-old" });
  });
});
