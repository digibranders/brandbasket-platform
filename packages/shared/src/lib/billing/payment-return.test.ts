import { describe, expect, it } from "vitest";
import { paymentReturnView, readPaymentReturn } from "./payment-return";

describe("readPaymentReturn", () => {
  it("reads only the two codes the return addresses use", () => {
    expect(readPaymentReturn("received")).toBe("received");
    expect(readPaymentReturn("failed")).toBe("failed");
    for (const other of [undefined, "", "paid", "RECEIVED", ["received"]]) expect(readPaymentReturn(other)).toBeNull();
  });
});

describe("paymentReturnView", () => {
  const base = { hasAccess: false, paymentUnderReview: false } as const;

  it("shows nothing when the customer did not just come back from paying", () => {
    expect(paymentReturnView({ ...base, returned: null })).toBe("none");
    expect(paymentReturnView({ returned: null, hasAccess: true, paymentUnderReview: false })).toBe("none");
  });

  it("waits for the confirmation while the payment has not been recorded yet", () => {
    expect(paymentReturnView({ ...base, returned: "received" })).toBe("confirming");
  });

  it("says the payment is confirmed once the plan has access", () => {
    expect(paymentReturnView({ ...base, returned: "received", hasAccess: true })).toBe("confirmed");
  });

  it("says a payment failed only while the customer has no access", () => {
    expect(paymentReturnView({ ...base, returned: "failed" })).toBe("failed");
    expect(paymentReturnView({ ...base, returned: "failed", hasAccess: true })).toBe("none");
  });

  it("leaves a payment under review to the page's own message, whatever the address says", () => {
    expect(paymentReturnView({ returned: "received", hasAccess: false, paymentUnderReview: true })).toBe("none");
    expect(paymentReturnView({ returned: "failed", hasAccess: false, paymentUnderReview: true })).toBe("none");
  });
});
