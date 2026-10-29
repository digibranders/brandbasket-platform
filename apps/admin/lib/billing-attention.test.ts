import type { ClientBilling } from "@brandbasket/db";
import type { ClientPaymentState } from "@brandbasket/shared/lib/billing/client-payment";
import { describe, expect, it } from "vitest";
import { billingNeedsAttention } from "./billing-attention";

const PAID: Pick<ClientPaymentState, "kind"> = { kind: "paid" };
const LAPSED: Pick<ClientPaymentState, "kind"> = { kind: "lapsed" };

function billingWith(status: NonNullable<ClientBilling["subscription"]>["status"] | null): Pick<ClientBilling, "subscription"> {
  return {
    subscription:
      status === null
        ? null
        : ({ status, provider: "fake", activatedAt: null, paidThroughAt: null, commitmentEndsAt: null } as unknown as NonNullable<ClientBilling["subscription"]>),
  };
}

describe("billingNeedsAttention", () => {
  it("is true when the paid period has lapsed", () => {
    expect(billingNeedsAttention(LAPSED, billingWith("cancelled"))).toBe(true);
  });

  it("is true when the provider is retrying a failed renewal, even inside the paid period", () => {
    expect(billingNeedsAttention(PAID, billingWith("past_due"))).toBe(true);
  });

  it("is false for a paid client whose renewal is fine", () => {
    expect(billingNeedsAttention(PAID, billingWith("active"))).toBe(false);
  });

  it("is false for a client who has not paid yet, which is not a lapse", () => {
    expect(billingNeedsAttention({ kind: "not-paid" }, billingWith(null))).toBe(false);
    expect(billingNeedsAttention({ kind: "checkout-open" }, billingWith("incomplete"))).toBe(false);
  });
});
