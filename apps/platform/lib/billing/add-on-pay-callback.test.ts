import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isSignedSubscriptionPayment } from "./add-on-pay-callback";

const SECRET = "rzp_test_key_secret";
const PAYMENT_ID = "pay_QxJ2bH7kLmN9pR";
const SUBSCRIPTION_ID = "sub_QxJ1aG6jKlM8oQ";

function sign(paymentId: string, subscriptionId: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(`${paymentId}|${subscriptionId}`, "utf8").digest("hex");
}

function form(fields: Record<string, string>): FormData {
  const body = new FormData();
  for (const [name, value] of Object.entries(fields)) body.set(name, value);
  return body;
}

const signed = (): Record<string, string> => ({
  razorpay_payment_id: PAYMENT_ID,
  razorpay_subscription_id: SUBSCRIPTION_ID,
  razorpay_signature: sign(PAYMENT_ID, SUBSCRIPTION_ID),
});

describe("isSignedSubscriptionPayment", () => {
  it("accepts a payment signed with the key secret", () => {
    expect(isSignedSubscriptionPayment(form(signed()), SECRET)).toBe(true);
  });

  it("refuses a signature made with another secret", () => {
    const body = form({ ...signed(), razorpay_signature: sign(PAYMENT_ID, SUBSCRIPTION_ID, "someone-elses-secret") });
    expect(isSignedSubscriptionPayment(body, SECRET)).toBe(false);
  });

  it("refuses a signature for another payment or subscription", () => {
    expect(isSignedSubscriptionPayment(form({ ...signed(), razorpay_payment_id: "pay_other" }), SECRET)).toBe(false);
    expect(isSignedSubscriptionPayment(form({ ...signed(), razorpay_subscription_id: "sub_other" }), SECRET)).toBe(false);
  });

  it("refuses a missing, empty, short or oversized field", () => {
    for (const name of ["razorpay_payment_id", "razorpay_subscription_id", "razorpay_signature"]) {
      const without = signed();
      delete without[name];
      expect(isSignedSubscriptionPayment(form(without), SECRET)).toBe(false);
      expect(isSignedSubscriptionPayment(form({ ...signed(), [name]: "" }), SECRET)).toBe(false);
      expect(isSignedSubscriptionPayment(form({ ...signed(), [name]: "x".repeat(201) }), SECRET)).toBe(false);
    }
    expect(isSignedSubscriptionPayment(form({ ...signed(), razorpay_signature: "abc" }), SECRET)).toBe(false);
  });

  it("refuses a return that reports an error, even with a good signature", () => {
    expect(isSignedSubscriptionPayment(form({ ...signed(), "error[code]": "BAD_REQUEST_ERROR" }), SECRET)).toBe(false);
    expect(isSignedSubscriptionPayment(form({ ...signed(), error: "{}" }), SECRET)).toBe(false);
  });

  it("refuses a file in place of a text field", () => {
    const body = form({ razorpay_payment_id: PAYMENT_ID, razorpay_subscription_id: SUBSCRIPTION_ID });
    body.set("razorpay_signature", new File([sign(PAYMENT_ID, SUBSCRIPTION_ID)], "sig.txt"));
    expect(isSignedSubscriptionPayment(body, SECRET)).toBe(false);
  });
});
