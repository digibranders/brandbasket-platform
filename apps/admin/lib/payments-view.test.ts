import type { StaffPaymentRow } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import {
  filterCounts,
  matchesFilter,
  paymentFigures,
  paymentFilterHref,
  paymentMonthBounds,
  paymentMonthLinks,
  paymentRowView,
  readPaymentFilter,
} from "./payments-view";

function row(overrides: Partial<StaffPaymentRow> = {}): StaffPaymentRow {
  return {
    id: "p1",
    businessId: "b1",
    businessName: "Om Sweets",
    provider: "razorpay",
    providerPaymentId: "pay_1",
    kind: "renewal",
    amountCents: 299_900,
    currency: "INR",
    status: "captured",
    paidAt: new Date("2026-11-29T12:50:00.000Z"),
    createdAt: new Date("2026-11-29T12:50:00.000Z"),
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

const ROWS: readonly StaffPaymentRow[] = [
  row({ id: "renewal" }),
  row({ id: "extra", kind: "charge", amountCents: 100_000, invoiceNumber: null }),
  row({ id: "refunded", businessId: "b2", status: "refunded", refundedAmountCents: 100_000, refundReason: "Charged twice" }),
  row({ id: "failed", businessId: "b3", status: "failed", paidAt: null, invoiceNumber: null }),
  row({ id: "flagged", businessId: "b4", kind: "initial", amountCents: 2_429_800, attentionReason: "amount_mismatch", invoiceNumber: null }),
  row({ id: "manual", businessId: "b1", provider: "manual", method: null, recordedByName: "Riya Kapoor" }),
  row({ id: "dollars", businessId: "b5", currency: "USD", amountCents: 6_500, invoiceNumber: null }),
];

describe("readPaymentFilter", () => {
  it("reads a known filter and falls back to all", () => {
    expect(readPaymentFilter("failed")).toBe("failed");
    expect(readPaymentFilter("no-invoice")).toBe("no-invoice");
    expect(readPaymentFilter("everything")).toBe("all");
    expect(readPaymentFilter(undefined)).toBe("all");
    expect(readPaymentFilter(["failed"])).toBe("all");
  });
});

describe("filters", () => {
  it("matches each filter to its payments", () => {
    const ids = (filter: Parameters<typeof matchesFilter>[1]) => ROWS.filter((r) => matchesFilter(r, filter)).map((r) => r.id);
    expect(ids("attention")).toEqual(["flagged"]);
    expect(ids("failed")).toEqual(["failed"]);
    expect(ids("refunded")).toEqual(["refunded"]);
    expect(ids("manual")).toEqual(["manual"]);
    // A rupee payment that kept its money, bought something, and has no tax invoice yet.
    expect(ids("no-invoice")).toEqual(["extra"]);
    expect(filterCounts(ROWS)).toEqual({ all: 7, attention: 1, failed: 1, refunded: 1, manual: 1, "no-invoice": 1 });
  });
});

describe("paymentFigures", () => {
  it("adds up what was kept, by plans and extras, in one currency", () => {
    expect(paymentFigures(ROWS, "INR")).toEqual({
      collectedCents: 299_900 + 100_000 + 199_900 + 2_429_800 + 299_900,
      paymentsCount: 5,
      planCents: 299_900 + 199_900 + 2_429_800 + 299_900,
      planClients: 3,
      extrasCents: 100_000,
      extrasCount: 1,
      refundedCents: 100_000,
      refundedCount: 1,
      failedCents: 299_900,
      failedCount: 1,
      attentionCount: 1,
    });
    expect(paymentFigures(ROWS, "USD")).toMatchObject({ collectedCents: 6_500, paymentsCount: 1, failedCount: 0 });
  });

  it("counts a refund with no recorded amount as the whole payment given back", () => {
    expect(paymentFigures([row({ status: "refunded" })], "INR")).toMatchObject({ collectedCents: 0, refundedCents: 299_900 });
  });
});

describe("paymentRowView", () => {
  it("words a payment the way the table shows it", () => {
    expect(paymentRowView(row())).toEqual({
      id: "p1",
      businessId: "b1",
      when: "29 Nov, 18:20",
      client: "Om Sweets",
      forLabel: "Monthly plan",
      method: "Razorpay UPI",
      amount: "₹2,999",
      status: { label: "Paid", tone: "done" },
      invoice: "FY/26-27/000031",
      href: "/clients/b1/billing#payment-p1",
    });
  });

  it("words failed, refunded, flagged and hand-recorded payments", () => {
    expect(paymentRowView(row({ status: "failed", paidAt: null, invoiceNumber: null }))).toMatchObject({ status: { label: "Failed", tone: "problem" }, invoice: "None" });
    expect(paymentRowView(row({ status: "refunded" })).status).toEqual({ label: "Refunded", tone: "todo" });
    expect(paymentRowView(row({ attentionReason: "already_paid", invoiceNumber: null }))).toMatchObject({ status: { label: "Needs a look", tone: "wait" }, invoice: "None" });
    expect(paymentRowView(row({ kind: "charge", invoiceNumber: null })).invoice).toBe("Not yet");
    expect(paymentRowView(row({ provider: "manual", method: null, recordedByName: "Riya Kapoor" })).method).toBe("Recorded by hand, by Riya Kapoor");
    expect(paymentRowView(row({ provider: "fake", method: null })).method).toBe("Test checkout");
    expect(paymentRowView(row({ method: "card", kind: "add_on" }))).toMatchObject({ method: "Razorpay card", forLabel: "Add-on" });
  });
});

describe("months", () => {
  it("bounds a month in India's time and links its neighbours and its CSV", () => {
    expect(paymentMonthBounds("2026-11")).toEqual({ from: new Date("2026-11-01T00:00:00+05:30"), to: new Date("2026-12-01T00:00:00+05:30") });
    expect(paymentMonthBounds("2026-13")).toBeNull();
    expect(paymentMonthLinks("2026-11")).toEqual({
      previous: { href: "/payments?month=2026-10", label: "October 2026" },
      next: { href: "/payments?month=2026-12", label: "December 2026" },
      exportHref: "/payments/export?month=2026-11",
    });
    expect(paymentFilterHref("2026-11", "all")).toBe("/payments?month=2026-11");
    expect(paymentFilterHref("2026-11", "failed")).toBe("/payments?month=2026-11&show=failed");
  });
});
