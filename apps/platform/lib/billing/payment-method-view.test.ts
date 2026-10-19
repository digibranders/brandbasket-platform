import type { CurrentPaymentMethod } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { paymentMethodView, renewsAutomatically } from "./payment-method-view";

const CARD: CurrentPaymentMethod = {
  provider: "razorpay",
  kind: "renewal",
  method: "card",
  cardNetwork: "Visa",
  cardType: "credit",
  cardLast4: "4366",
  upiVpa: null,
  manualReference: null,
  paidAt: new Date("2026-05-01T10:00:00.000Z"),
};

const BANK: CurrentPaymentMethod = {
  ...CARD,
  provider: "manual",
  kind: "initial",
  method: null,
  cardNetwork: null,
  cardType: null,
  cardLast4: null,
  manualReference: "NEFT 0921",
};

describe("renewsAutomatically", () => {
  const live = { provider: "razorpay", cancelRequestedAt: null } as const;

  it("is true for a paid plan billed by the provider with no ending asked for", () => {
    expect(renewsAutomatically({ status: "paid", subscription: live })).toBe(true);
  });

  it.each([
    ["is billed by hand", { status: "paid", subscription: { ...live, provider: "manual" } }],
    ["has been asked to end", { status: "paid", subscription: { ...live, cancelRequestedAt: new Date() } }],
    ["has lapsed", { status: "lapsed", subscription: live }],
    ["has not been paid yet", { status: "unpaid", subscription: live }],
    ["has no subscription", { status: "paid", subscription: null }],
  ] as const)("is false for a plan that %s", (_name, facts) => {
    expect(renewsAutomatically(facts)).toBe(false);
  });
});

describe("paymentMethodView", () => {
  it("says a card renews by itself when the plan does", () => {
    expect(paymentMethodView(CARD, true)).toEqual({ kind: "renews", label: "Visa credit card ending 4366" });
  });

  it("says only what was last used when the plan does not renew by itself", () => {
    expect(paymentMethodView(CARD, false)).toEqual({ kind: "last-paid", label: "Visa credit card ending 4366" });
  });

  it.each(["charge", "extra_publish"] as const)("does not call a %s payment's card the renewal method", (kind) => {
    expect(paymentMethodView({ ...CARD, kind }, true).kind).toBe("last-paid");
  });

  it.each(["initial", "renewal", "reactivation"] as const)("calls a %s payment's card the renewal method", (kind) => {
    expect(paymentMethodView({ ...CARD, kind }, true).kind).toBe("renews");
  });

  it("gives a bank transfer that paid for the plan with its reference, whatever the plan does", () => {
    expect(paymentMethodView(BANK, true)).toEqual({ kind: "bank-transfer", reference: "NEFT 0921" });
    expect(paymentMethodView(BANK, false)).toEqual({ kind: "bank-transfer", reference: "NEFT 0921" });
  });

  it("does not tell a card customer they pay by bank transfer because staff recorded a charge", () => {
    const manualCharge = { ...BANK, kind: "charge" } as const;
    expect(paymentMethodView(manualCharge, true)).toEqual({
      kind: "last-paid",
      label: "Bank transfer, reference NEFT 0921",
    });
  });

  it("still gives a staff-recorded charge as a bank transfer to a customer who pays by hand", () => {
    expect(paymentMethodView({ ...BANK, kind: "charge" }, false)).toEqual({
      kind: "bank-transfer",
      reference: "NEFT 0921",
    });
  });

  it("words a UPI payment with its address and never shows more than four card digits", () => {
    const upi = { ...CARD, method: "upi", cardNetwork: null, cardType: null, cardLast4: null, upiVpa: "ana@okhdfc" };
    expect(paymentMethodView(upi, true)).toEqual({ kind: "renews", label: "UPI ana@okhdfc" });
  });
});
