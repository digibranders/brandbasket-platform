import type { Receipt } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { receiptRows } from "./receipt-rows";

function receipt(overrides: Partial<Receipt> = {}): Receipt {
  return {
    id: "0192f3c4-0000-7000-8000-000000000001",
    businessId: "0192f3c4-1111-7000-8000-000000000001",
    subscriptionId: "0192f3c4-2222-7000-8000-000000000001",
    provider: "razorpay",
    providerPaymentId: "pay_1",
    kind: "renewal",
    amountCents: 353_882,
    currency: "INR",
    status: "captured",
    paidAt: new Date("2026-09-12T10:00:00.000Z"),
    failureReason: null,
    attentionReason: null,
    attentionResolvedAt: null,
    createdAt: new Date("2026-09-12T10:00:00.000Z"),
    initialTermMonths: 1,
    planName: "Care",
    taxRateBasisPoints: 1800,
    sequence: 7,
    chargeDescription: null,
    chargeQuantity: null,
    chargeKind: null,
    chargeCreatedAt: null,
    taxInvoiceId: null,
    taxInvoiceNumber: null,
    addOnId: null,
    invoiceBasis: null,
    ...overrides,
  };
}

describe("receiptRows", () => {
  it("words a paid receipt for the table", () => {
    expect(receiptRows([receipt()])).toEqual([
      {
        id: "0192f3c4-0000-7000-8000-000000000001",
        title: "Receipt #007, Sep 2026",
        description: "Monthly payment",
        paidAtIso: "2026-09-12T10:00:00.000Z",
        status: "Paid",
        statusDetail: null,
        tone: "paid",
        amount: "₹3,538.82",
        plan: "Care plan",
        downloadable: true,
      },
    ]);
  });

  it("titles an invoiced payment by its tax invoice number", () => {
    const [row] = receiptRows([receipt({ taxInvoiceId: "0192f3c4-3333-7000-8000-000000000001", taxInvoiceNumber: "FY/26-27/000001" })]);
    expect(row?.title).toBe("Tax invoice FY/26-27/000001");
  });

  it("marks money we could not apply as received, and says what happens next", () => {
    const [waiting] = receiptRows([receipt({ attentionReason: "amount_mismatch" })]);
    const [settled] = receiptRows([
      receipt({ attentionReason: "amount_mismatch", attentionResolvedAt: new Date("2026-09-13T00:00:00Z") }),
    ]);
    expect(waiting).toMatchObject({ status: "Received", tone: "review", statusDetail: "Received. Our team will be in touch." });
    expect(settled).toMatchObject({ status: "Received", statusDetail: "Received, but not applied to your plan." });
  });

  it("offers no download for a failed attempt, but does for a refund", () => {
    const [failed, refunded] = receiptRows([receipt({ status: "failed" }), receipt({ status: "refunded" })]);
    expect(failed).toMatchObject({ status: "Failed", tone: "failed", downloadable: false });
    expect(refunded).toMatchObject({ status: "Refunded", tone: "refunded", downloadable: true });
  });

  it("copes with a payment that has no date or plan", () => {
    const [row] = receiptRows([receipt({ paidAt: null, planName: null, currency: "USD", amountCents: 6_900 })]);
    expect(row).toMatchObject({ title: "Receipt #007", paidAtIso: null, plan: "Brandbasket", amount: "$69" });
  });

  it("names a paid extra by what it was, not by a plan", () => {
    const [row] = receiptRows([
      receipt({
        kind: "charge",
        subscriptionId: null,
        planName: null,
        chargeKind: "change_hours",
        chargeDescription: "Extra change hours",
        chargeQuantity: 2,
        amountCents: 336_300,
      }),
    ]);
    expect(row).toMatchObject({ description: "Extra change hours · 2 h", plan: "Extra", amount: "₹3,363" });
  });

  it("names an add-on payment by the add-on in both columns", () => {
    const [row] = receiptRows([
      receipt({ kind: "add_on", subscriptionId: null, planName: null, addOnId: "digital-growth", amountCents: 1_062_000 }),
    ]);
    expect(row).toMatchObject({ description: "Social Media and Ads, monthly", plan: "Social Media and Ads", amount: "₹10,620" });
  });

  it("calls a payment for an add-on no longer sold just an add-on", () => {
    const [row] = receiptRows([
      receipt({ kind: "add_on", subscriptionId: null, planName: null, addOnId: "social-media", amountCents: 1_062_000 }),
    ]);
    expect(row).toMatchObject({ description: "Add-on", plan: "Add-on", amount: "₹10,620" });
  });

  it("falls back to the general add-on wording when the add-on is not in the catalogue", () => {
    const [row] = receiptRows([receipt({ kind: "add_on", subscriptionId: null, planName: null, addOnId: null })]);
    expect(row).toMatchObject({ description: "Add-on", plan: "Add-on" });
  });
});
