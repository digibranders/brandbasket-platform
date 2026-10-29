import type { StaffPaymentRow, TaxInvoice } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { reconciliationItems } from "./invoice-reconciliation";

function payment(overrides: Partial<StaffPaymentRow>): StaffPaymentRow {
  return {
    id: "pay-1", businessId: "biz-1", businessName: "Riverside Dental", provider: "razorpay", providerPaymentId: "pay_x", kind: "initial",
    amountCents: 353_900, currency: "INR", status: "captured", paidAt: new Date("2026-10-09T06:00:00Z"), createdAt: new Date("2026-10-09T06:00:00Z"),
    method: "upi", failureReason: null, attentionReason: null, attentionResolvedAt: null, recordedByName: null, refundedAmountCents: null, refundReason: null,
    invoiceNumber: "FY/26-27/000001", ...overrides,
  };
}

const invoice = (paidOn: string): TaxInvoice => ({ paidOn, issuedOn: "2026-10-20", totalCents: 100_000 }) as TaxInvoice;

function valueOf(items: readonly { label: string; value: string }[], label: string): string | undefined {
  return items.find((item) => item.label === label)?.value;
}

describe("reconciliationItems", () => {
  it("counts what came in, what still needs an invoice, and what is only for the CA to know", () => {
    const items = reconciliationItems(
      [
        payment({ id: "a" }),
        payment({ id: "b", invoiceNumber: null }),
        payment({ id: "c", status: "refunded", refundedAmountCents: 353_900 }),
        payment({ id: "d", status: "failed", invoiceNumber: null }),
        payment({ id: "e", invoiceNumber: null, attentionReason: "already_paid" }),
      ],
      [invoice("2026-09-28"), invoice("2026-10-02")],
      "2026-10",
    );
    expect(valueOf(items, "Received in the month")).toBe("4 payments, ₹14,156.00");
    expect(valueOf(items, "Invoice still to issue")).toBe("1 payment, ₹3,539.00");
    expect(valueOf(items, "Paid but bought nothing, so no invoice")).toBe("1 payment, ₹3,539.00");
    expect(valueOf(items, "Refunded after an invoice was issued (no credit note)")).toBe("1 payment, ₹3,539.00");
    expect(valueOf(items, "Failed attempts")).toBe("1 payment, ₹3,539.00");
    expect(valueOf(items, "Invoiced this month for payments of an earlier month")).toBe("1 invoice, ₹1,000.00");
  });

  it("keeps dollar payments out of the rupee lines and says how many there were", () => {
    const items = reconciliationItems([payment({ id: "usd", currency: "USD", amountCents: 6_500, invoiceNumber: null })], [], "2026-10");
    expect(valueOf(items, "Received in the month")).toBe("0 payments, ₹0.00");
    expect(valueOf(items, "Dollar payments (no GST invoice)")).toBe("1 payment");
  });

  it("shows no dollar line when there are none", () => {
    expect(valueOf(reconciliationItems([], [], "2026-10"), "Dollar payments (no GST invoice)")).toBeUndefined();
  });
});
