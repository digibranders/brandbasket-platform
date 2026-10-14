import { describe, expect, it } from "vitest";
import { paymentLabel, type PaymentMethodFacts } from "./payment-method";

const base: PaymentMethodFacts = {
  provider: "razorpay",
  method: null,
  cardNetwork: null,
  cardType: null,
  cardLast4: null,
  upiVpa: null,
  manualReference: null,
};

describe("paymentLabel", () => {
  it("names a card by network, type and last four", () => {
    expect(paymentLabel({ ...base, method: "card", cardNetwork: "Visa", cardType: "credit", cardLast4: "4366" })).toBe(
      "Visa credit card ending 4366",
    );
  });

  it("leaves out a card network or type the provider did not know", () => {
    expect(paymentLabel({ ...base, method: "card", cardNetwork: "Unknown", cardType: "debit", cardLast4: "0153" })).toBe(
      "Debit card ending 0153",
    );
    expect(paymentLabel({ ...base, method: "card", cardNetwork: "RuPay", cardType: "unknown", cardLast4: "0153" })).toBe(
      "RuPay card ending 0153",
    );
    expect(paymentLabel({ ...base, method: "card", cardLast4: "0153" })).toBe("Card ending 0153");
  });

  it("names UPI by its address, and a bank transfer by its reference", () => {
    expect(paymentLabel({ ...base, method: "upi", upiVpa: "qa@okhdfc" })).toBe("UPI qa@okhdfc");
    expect(paymentLabel({ ...base, provider: "manual", manualReference: "NEFT 0921" })).toBe(
      "Bank transfer, reference NEFT 0921",
    );
  });

  it("falls back to the method the provider reported, or to an online payment when it reported none", () => {
    expect(paymentLabel({ ...base, method: "netbanking" })).toBe("Netbanking");
    expect(paymentLabel({ ...base, method: "card" })).toBe("Card");
    expect(paymentLabel({ ...base, method: "upi" })).toBe("UPI");
    expect(paymentLabel(base)).toBe("Online payment");
  });
});
