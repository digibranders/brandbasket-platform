import type { StaffPaymentRow } from "@brandbasket/db";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClientPayments } from "./client-payments";

const BUSINESS = "01920000-0000-7000-8000-0000000000b1";

function row(overrides: Partial<StaffPaymentRow>): StaffPaymentRow {
  return {
    id: "p1",
    businessId: BUSINESS,
    businessName: "Om Sweets",
    provider: "razorpay",
    providerPaymentId: "pay_1",
    kind: "renewal",
    amountCents: 299_900,
    currency: "INR",
    status: "captured",
    paidAt: new Date("2026-11-20T06:30:00.000Z"),
    createdAt: new Date("2026-11-20T06:30:00.000Z"),
    method: "upi",
    failureReason: null,
    attentionReason: null,
    attentionResolvedAt: null,
    recordedByName: null,
    refundedAmountCents: null,
    refundReason: null,
    invoiceNumber: "FY/26-27/000029",
    ...overrides,
  };
}

const PAYMENTS = [
  row({ id: "paid" }),
  row({ id: "refunded", status: "refunded", refundedAmountCents: 100_000, refundReason: "Charged twice" }),
  row({ id: "failed", status: "failed", paidAt: null, failureReason: "Card declined" }),
];
const action = async (): Promise<void> => undefined;

describe("ClientPayments", () => {
  it("lists every payment with its anchor, and offers Mark refunded on a paid one only, to money roles", () => {
    const html = renderToStaticMarkup(createElement(ClientPayments, { businessId: BUSINESS, payments: PAYMENTS, canRefund: true, notice: null, refundAction: action }));
    expect(html).toContain('id="payment-paid"');
    expect(html).toContain('id="payment-failed"');
    expect(html).toContain("Refunded: Charged twice");
    expect(html).toContain("Failed: Card declined");
    expect(html.match(/Mark refunded<\/summary>/g)).toHaveLength(1);
    expect(html).toContain('name="amount"');
    expect(html).toContain('value="2999.00"');
    expect(html).toContain('name="paymentId" value="paid"');
  });

  it("hides the form from roles without money access and shows a notice", () => {
    const html = renderToStaticMarkup(createElement(ClientPayments, { businessId: BUSINESS, payments: PAYMENTS, canRefund: false, notice: "marked", refundAction: action }));
    expect(html).not.toContain("Mark refunded</summary>");
    expect(html).toContain("Marked refunded. Any affiliate earning still owed for it was cancelled.");
  });

  it("says when there are no payments", () => {
    const html = renderToStaticMarkup(createElement(ClientPayments, { businessId: BUSINESS, payments: [], canRefund: true, notice: null, refundAction: action }));
    expect(html).toContain("No payments yet.");
  });
});
