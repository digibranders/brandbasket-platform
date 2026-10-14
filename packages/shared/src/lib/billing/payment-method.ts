/**
 * How a payment was made, as fields on the payments row. Only what a merchant is shown: the card network, type and last
 * four digits, or the UPI address, never a full card number.
 */
export interface PaymentMethodFacts {
  readonly provider: string;
  /** The provider's method: "card", "upi", "netbanking", "wallet", or a newer one. Null when it did not say. */
  readonly method: string | null;
  readonly cardNetwork: string | null;
  readonly cardType: string | null;
  readonly cardLast4: string | null;
  readonly upiVpa: string | null;
  readonly manualReference: string | null;
}

/** Razorpay reports a network or card type it could not tell as "unknown", which reads badly on an invoice. */
function known(value: string | null): string | null {
  const text = value?.trim() ?? "";
  return text === "" || text.toLowerCase() === "unknown" ? null : text;
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * "Visa credit card ending 4366", "UPI qa@okhdfc", "Bank transfer, reference NEFT 0921". Printed on the tax invoice and
 * on the Billing page's Payment method section, so both say the same words. Pure and browser-safe.
 */
export function paymentLabel(payment: PaymentMethodFacts): string {
  if (payment.provider === "manual") return `Bank transfer, reference ${payment.manualReference ?? "not given"}`;
  if (payment.method === "card" && payment.cardLast4 !== null) {
    const words = [known(payment.cardNetwork), known(payment.cardType), "card ending", payment.cardLast4];
    return capitalised(words.filter((word): word is string => word !== null).join(" "));
  }
  if (payment.method === "upi") return payment.upiVpa === null ? "UPI" : `UPI ${payment.upiVpa}`;
  if (payment.method === null) return "Online payment";
  return capitalised(payment.method);
}
