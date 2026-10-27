import type { StaffPaymentRow } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { paymentsCsv } from "./payments-csv";

const PAID: StaffPaymentRow = {
  id: "p1",
  businessId: "b1",
  businessName: "Sharma, Rao & Sons",
  provider: "razorpay",
  providerPaymentId: "pay_1",
  kind: "renewal",
  amountCents: 299_900,
  currency: "INR",
  status: "refunded",
  paidAt: new Date("2026-11-29T12:50:00.000Z"),
  createdAt: new Date("2026-11-29T12:50:00.000Z"),
  method: "upi",
  failureReason: null,
  attentionReason: null,
  attentionResolvedAt: null,
  recordedByName: null,
  refundedAmountCents: 100_000,
  refundReason: "=Charged twice",
  invoiceNumber: "FY/26-27/000031",
};

describe("paymentsCsv", () => {
  it("writes a header and one row per payment, in India's time, safe for a spreadsheet", () => {
    const [header, line, ...rest] = paymentsCsv([PAID]).split("\r\n");
    expect(header).toBe("Date,Client,For,Method,Status,Currency,Amount,Refunded,Provider payment id,Invoice,Failure reason,Refund reason");
    expect(line).toBe('2026-11-29 18:20,"Sharma, Rao & Sons",Monthly plan,Razorpay UPI,Refunded,INR,2999.00,1000.00,pay_1,FY/26-27/000031,,\'=Charged twice');
    expect(rest).toEqual([]);
  });

  it("leaves the refunded amount empty when nothing was refunded", () => {
    const line = paymentsCsv([{ ...PAID, status: "failed", paidAt: null, refundedAmountCents: null, refundReason: null, failureReason: "Card declined" }]).split("\r\n")[1];
    expect(line).toBe('2026-11-29 18:20,"Sharma, Rao & Sons",Monthly plan,Razorpay UPI,Failed,INR,2999.00,,pay_1,FY/26-27/000031,Card declined,');
  });
});
