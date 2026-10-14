import { createHmac, timingSafeEqual } from "node:crypto";

/** Real Razorpay ids and hex signatures are well under 100 characters; this only caps what gets hashed. */
const MAX_FIELD_LENGTH = 200;

function field(body: FormData, name: string): string | null {
  const value = body.get(name);
  return typeof value === "string" && value !== "" && value.length <= MAX_FIELD_LENGTH ? value : null;
}

/**
 * True only when Razorpay's return carries a payment whose signature checks out. For a subscription, Razorpay signs
 * `razorpay_payment_id|razorpay_subscription_id` with the account's key secret (HMAC-SHA256, hex), so a hand-made
 * POST to the callback address cannot pass for a payment. A decline (`error` fields), a missing field or a wrong
 * signature all come back false.
 *
 * This is still not the record of the payment: the signed webhook is. Passing this only lets the page say "received".
 */
export function isSignedSubscriptionPayment(body: FormData, keySecret: string): boolean {
  if (Array.from(body.keys()).some((key) => key === "error" || key.startsWith("error["))) return false;
  const paymentId = field(body, "razorpay_payment_id");
  const subscriptionId = field(body, "razorpay_subscription_id");
  const signature = field(body, "razorpay_signature");
  if (paymentId === null || subscriptionId === null || signature === null) return false;

  const expected = Buffer.from(createHmac("sha256", keySecret).update(`${paymentId}|${subscriptionId}`, "utf8").digest("hex"));
  const given = Buffer.from(signature);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
