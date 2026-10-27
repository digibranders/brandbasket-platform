import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaymentMethod } from "@/components/panel/billing/payment-method";

const render = (view: Parameters<typeof PaymentMethod>[0]["view"]): string => renderToStaticMarkup(createElement(PaymentMethod, { view, emailUs: "support@brandbasket.in" }));

describe("Payment method", () => {
  it("is a section on the page called Payment method", () => {
    const html = render({ kind: "renews", label: "Visa credit card ending 4242" });
    expect(html).toContain('<section aria-labelledby="payment-method-title"');
    expect(html).toContain(">Payment method</h2>");
    expect(html).not.toContain("rounded-card");
  });

  it("says a renewing plan renews by itself, and that changing the card is a message to us", () => {
    const html = render({ kind: "renews", label: "Visa credit card ending 4242" }).replaceAll("<!-- -->", "");
    expect(html).toContain("Visa credit card ending 4242");
    expect(html).toContain("Your plan renews on this automatically through Razorpay.");
    expect(html).toContain("email us at support@brandbasket.in");
  });

  it("says a bank transfer is recorded by hand, with the last reference when there is one", () => {
    expect(render({ kind: "bank-transfer", reference: "UTR 123" })).toContain("Last reference: UTR 123");
    expect(render({ kind: "bank-transfer", reference: null })).not.toContain("Last reference");
  });

  it("says what was last paid with when each payment is made by hand", () => {
    expect(render({ kind: "last-paid", label: "UPI" }).replaceAll("<!-- -->", "")).toContain("You last paid with UPI. You choose how to pay each time.");
  });
});
