import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@fynix/db", () => {
  class MockAddOnAlreadyBillingError extends Error {}
  class MockAddOnSubscriptionNotPayableError extends Error {}
  class MockAddOnSubscriptionNotFoundError extends Error {}
  return {
    AddOnAlreadyBillingError: MockAddOnAlreadyBillingError,
    AddOnSubscriptionNotPayableError: MockAddOnSubscriptionNotPayableError,
    AddOnSubscriptionNotFoundError: MockAddOnSubscriptionNotFoundError,
    lockAddOnSubscription: vi.fn(),
    markAddOnCancelled: vi.fn(),
    recordAddOnPayment: vi.fn(),
    recordUnappliedAddOnPayment: vi.fn(),
  };
});
vi.mock("./tax-invoicing", () => ({ issueTaxInvoiceSafely: vi.fn() }));

import {
  AddOnAlreadyBillingError,
  AddOnSubscriptionNotPayableError,
  lockAddOnSubscription,
  markAddOnCancelled,
  recordAddOnPayment,
  recordUnappliedAddOnPayment,
} from "@fynix/db";
import { activateAddOnPayment, applyAddOnPayment } from "./add-on-activation";
import { issueTaxInvoiceSafely } from "./tax-invoicing";

const tx = { name: "staff-tx" } as never;
const PAYMENT = { id: "payment_1" } as never;
const RECORD = {
  addOnSubscriptionId: "addon_sub_1",
  provider: "razorpay",
  providerPaymentId: "pay_1",
  amountCents: 1_062_000,
  currency: "INR",
  paidAt: new Date("2026-10-09T09:00:00.000Z"),
  periodStart: new Date("2026-10-09T09:00:00.000Z"),
  periodEnd: new Date("2026-11-09T09:00:00.000Z"),
} as const;

afterEach(() => {
  vi.clearAllMocks();
});

describe("activateAddOnPayment", () => {
  it("records the payment, then invoices it for the period it paid", async () => {
    const calls: string[] = [];
    const predecessorsToCancel = [{ provider: "razorpay", providerSubscriptionId: "sub_old" }] as const;
    vi.mocked(recordAddOnPayment).mockImplementation(async () => {
      calls.push("record");
      return { payment: PAYMENT, alreadyRecorded: false, predecessorsToCancel };
    });
    vi.mocked(issueTaxInvoiceSafely).mockImplementation(async () => {
      calls.push("invoice");
      return null;
    });

    const recorded = await activateAddOnPayment(tx, RECORD);

    expect(recordAddOnPayment).toHaveBeenCalledWith(tx, RECORD);
    expect(issueTaxInvoiceSafely).toHaveBeenCalledWith(tx, PAYMENT, {
      kind: "add_on",
      addOnSubscriptionId: "addon_sub_1",
      periodStart: RECORD.periodStart,
      periodEnd: RECORD.periodEnd,
    });
    expect(calls).toEqual(["record", "invoice"]);
    expect(recorded.predecessorsToCancel).toEqual(predecessorsToCancel);
  });

  it("issues no second invoice for a payment that had already been recorded", async () => {
    vi.mocked(recordAddOnPayment).mockResolvedValue({ payment: PAYMENT, alreadyRecorded: true, predecessorsToCancel: [] });

    const recorded = await activateAddOnPayment(tx, RECORD);

    expect(recorded.alreadyRecorded).toBe(true);
    expect(issueTaxInvoiceSafely).not.toHaveBeenCalled();
  });

  it("lets the database's refusals through, for the webhook's savepoint to handle", async () => {
    const refusal = new Error("already billing");
    vi.mocked(recordAddOnPayment).mockRejectedValue(refusal);

    await expect(activateAddOnPayment(tx, RECORD)).rejects.toBe(refusal);
    expect(issueTaxInvoiceSafely).not.toHaveBeenCalled();
  });
});

describe("applyAddOnPayment", () => {
  const NOW = new Date("2026-10-20T09:00:00.000Z");
  const attempt = { name: "savepoint" } as never;
  // A staff transaction whose savepoint runs the callback at once and rolls back (rethrows) like the real one.
  const outer = { name: "staff-tx", transaction: vi.fn(async (fn: (savepoint: never) => Promise<unknown>) => fn(attempt)) } as never;
  const OWN_ROW = { id: "addon_sub_1", provider: "razorpay", providerSubscriptionId: "sub_rzp_own" } as never;

  it("runs the activation in a savepoint and passes on the halted rows to cancel after the commit", async () => {
    const predecessorsToCancel = [{ provider: "razorpay", providerSubscriptionId: "sub_old" }] as const;
    vi.mocked(recordAddOnPayment).mockResolvedValue({ payment: PAYMENT, alreadyRecorded: false, predecessorsToCancel });

    const result = await applyAddOnPayment(outer, RECORD, NOW);

    expect(recordAddOnPayment).toHaveBeenCalledWith(attempt, RECORD);
    expect(result).toEqual({ kind: "applied", cancelAtProvider: predecessorsToCancel });
    expect(recordUnappliedAddOnPayment).not.toHaveBeenCalled();
  });

  it("reports a payment recorded earlier, with nothing to cancel", async () => {
    vi.mocked(recordAddOnPayment).mockResolvedValue({ payment: PAYMENT, alreadyRecorded: true, predecessorsToCancel: [] });

    await expect(applyAddOnPayment(outer, RECORD, NOW)).resolves.toEqual({ kind: "already-recorded", cancelAtProvider: [] });
  });

  it("keeps money for an add-on already billing as already_paid, cancels this row, and names its own subscription", async () => {
    vi.mocked(recordAddOnPayment).mockRejectedValue(new AddOnAlreadyBillingError("addon_sub_1", "addon_sub_0"));
    vi.mocked(lockAddOnSubscription).mockResolvedValue(OWN_ROW);

    const result = await applyAddOnPayment(outer, RECORD, NOW);

    expect(recordUnappliedAddOnPayment).toHaveBeenCalledWith(outer, { ...RECORD, reason: "already_paid", now: NOW });
    expect(markAddOnCancelled).toHaveBeenCalledWith(outer, "addon_sub_1", NOW);
    expect(result).toEqual({
      kind: "refused",
      reason: "already_paid",
      cancelAtProvider: [{ provider: "razorpay", providerSubscriptionId: "sub_rzp_own" }],
    });
  });

  it("keeps money for a replaced checkout as checkout_replaced, names its subscription, and leaves the row alone", async () => {
    vi.mocked(recordAddOnPayment).mockRejectedValue(new AddOnSubscriptionNotPayableError("addon_sub_1"));
    vi.mocked(lockAddOnSubscription).mockResolvedValue(OWN_ROW);

    const result = await applyAddOnPayment(outer, RECORD, NOW);

    expect(recordUnappliedAddOnPayment).toHaveBeenCalledWith(outer, { ...RECORD, reason: "checkout_replaced", now: NOW });
    expect(markAddOnCancelled).not.toHaveBeenCalled();
    expect(result).toEqual({
      kind: "refused",
      reason: "checkout_replaced",
      cancelAtProvider: [{ provider: "razorpay", providerSubscriptionId: "sub_rzp_own" }],
    });
  });

  it("rethrows any other failure, records nothing as unapplied and cancels nothing", async () => {
    const failure = new Error("connection reset");
    vi.mocked(recordAddOnPayment).mockRejectedValue(failure);

    await expect(applyAddOnPayment(outer, RECORD, NOW)).rejects.toBe(failure);

    expect(recordUnappliedAddOnPayment).not.toHaveBeenCalled();
    expect(markAddOnCancelled).not.toHaveBeenCalled();
  });
});
