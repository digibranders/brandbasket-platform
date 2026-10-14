import type { Charge, Receipt } from "@firstfold/db";
import { describe, expect, it } from "vitest";
import { billingMonths } from "./billing-months";

function receipt(overrides: Partial<Receipt>): Receipt {
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
    paidAt: new Date("2026-10-01T05:00:00Z"),
    failureReason: null,
    attentionReason: null,
    attentionResolvedAt: null,
    createdAt: new Date("2026-10-01T05:00:00Z"),
    initialTermMonths: 1,
    planName: "Care",
    taxRateBasisPoints: 1800,
    sequence: 2,
    chargeDescription: null,
    chargeQuantity: null,
    chargeKind: null,
    chargeCreatedAt: null,
    taxInvoiceId: null,
    taxInvoiceNumber: null,
    addOnId: null,
    ...overrides,
  };
}

function charge(overrides: Partial<Charge>): Charge {
  return {
    id: "0192f3c4-3333-7000-8000-000000000003",
    businessId: "0192f3c4-1111-7000-8000-000000000001",
    kind: "extra_publish",
    description: "Extra publish",
    quantity: 1,
    unitAmountCents: 95_000,
    taxRateBasisPoints: 1800,
    amountCents: 112_100,
    currency: "INR",
    status: "open",
    createdByStaffId: "staff-1",
    provider: null,
    providerOrderId: null,
    paymentId: null,
    paidAt: null,
    waivedAt: null,
    createdAt: new Date("2026-10-20T09:00:00Z"),
    ...overrides,
  };
}

const PLAN_OCT = receipt({ id: "plan-oct", sequence: 3 });
const PLAN_SEP = receipt({
  id: "plan-sep",
  sequence: 1,
  kind: "initial",
  paidAt: new Date("2026-09-01T05:00:00Z"),
  createdAt: new Date("2026-09-01T05:00:00Z"),
});
/** Added on 30 September, paid on 2 October: it stays in September. */
const HOURS_PAID = receipt({
  id: "hours",
  sequence: 2,
  kind: "charge",
  subscriptionId: null,
  planName: null,
  amountCents: 336_300,
  paidAt: new Date("2026-10-02T10:00:00Z"),
  createdAt: new Date("2026-10-02T10:00:00Z"),
  chargeKind: "change_hours",
  chargeDescription: "Extra change hours",
  chargeQuantity: 2,
  chargeCreatedAt: new Date("2026-09-30T10:00:00Z"),
});

describe("billingMonths", () => {
  it("groups the plan, paid extras and unpaid extras into their months, newest month first", () => {
    const months = billingMonths([PLAN_OCT, HOURS_PAID, PLAN_SEP], [charge({})]);

    expect(months.map((month) => [month.key, month.label, month.total])).toEqual([
      ["2026-10", "October 2026", "₹4,659.82"],
      ["2026-09", "September 2026", "₹6,901.82"],
    ]);
    expect(months[0]?.lines.map((line) => (line.kind === "receipt" ? line.row.id : line.chargeId))).toEqual([
      "plan-oct",
      "0192f3c4-3333-7000-8000-000000000003",
    ]);
    expect(months[1]?.lines.map((line) => (line.kind === "receipt" ? line.row.id : "due"))).toEqual(["plan-sep", "hours"]);
  });

  it("words an unpaid extra with its price and tax", () => {
    const [month] = billingMonths([], [charge({})]);
    expect(month?.lines).toEqual([
      {
        kind: "due",
        chargeId: "0192f3c4-3333-7000-8000-000000000003",
        title: "Extra publish",
        addedIso: "2026-10-20T09:00:00.000Z",
        amount: "₹1,121",
        taxNote: "includes 18% GST",
      },
    ]);
  });

  it("leaves refunds, failures and set-aside payments out of the total, but still lists them", () => {
    const months = billingMonths(
      [
        PLAN_OCT,
        receipt({ id: "refund", status: "refunded", amountCents: 1_000 }),
        receipt({ id: "failed", status: "failed", amountCents: 2_000 }),
        receipt({ id: "flagged", attentionReason: "already_paid", amountCents: 3_000 }),
      ],
      [],
    );
    expect(months[0]?.total).toBe("₹3,538.82");
    expect(months[0]?.lines).toHaveLength(4);
  });

  it("never lists a waived charge", () => {
    expect(billingMonths([], [charge({ status: "waived" })])).toEqual([]);
  });

  it("totals each currency on its own", () => {
    const months = billingMonths([PLAN_OCT, receipt({ id: "usd", currency: "USD", amountCents: 6_900 })], []);
    expect(months[0]?.total).toBe("₹3,538.82 + $69");
  });
});
