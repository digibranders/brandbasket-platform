import { describe, expect, it } from "vitest";
import { paymentsContinue } from "./payments-continue";

const active = { status: "active", provider: "razorpay", cancelRequestedAt: null } as const;

describe("paymentsContinue", () => {
  it("is true for an active card subscription", () => {
    expect(paymentsContinue(active)).toBe(true);
  });

  it("is false once cancelled, once asked to end, and when payments are arranged by hand", () => {
    expect(paymentsContinue({ ...active, status: "cancelled" })).toBe(false);
    expect(paymentsContinue({ ...active, cancelRequestedAt: new Date("2026-10-20T00:00:00Z") })).toBe(false);
    expect(paymentsContinue({ ...active, provider: "manual" })).toBe(false);
  });
});
