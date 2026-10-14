import { describe, expect, it, vi } from "vitest";
import { razorpayCheckoutOptions } from "./razorpay-checkout-options";

const BASE = {
  keyId: "rzp_test_key",
  email: null,
  contact: null,
  callbackUrl: "https://app.firstfold.io/billing/pay/callback",
  onDismiss: () => undefined,
} as const;

describe("razorpayCheckoutOptions", () => {
  it("names Firstfold as who is being paid, never the customer's own business", () => {
    const options = razorpayCheckoutOptions({ ...BASE, target: { kind: "subscription", subscriptionId: "sub_1" } });
    expect(options.name).toBe("Firstfold");
  });

  it("opens a subscription's checkout on its subscription id", () => {
    const options = razorpayCheckoutOptions({ ...BASE, target: { kind: "subscription", subscriptionId: "sub_1" } });
    expect(options).toMatchObject({ key: "rzp_test_key", subscription_id: "sub_1", description: "Firstfold monthly plan" });
    expect(options).not.toHaveProperty("order_id");
  });

  it("describes a subscription with the given description when there is one", () => {
    const options = razorpayCheckoutOptions({
      ...BASE,
      target: { kind: "subscription", subscriptionId: "sub_1", description: "Firstfold Local SEO monthly" },
    });
    expect(options).toMatchObject({ subscription_id: "sub_1", description: "Firstfold Local SEO monthly" });
  });

  it("opens a charge's checkout on its order id, describing the charge", () => {
    const options = razorpayCheckoutOptions({ ...BASE, target: { kind: "order", orderId: "order_1", description: "Extra change hours · 2 h" } });
    expect(options).toMatchObject({ order_id: "order_1", description: "Extra change hours · 2 h" });
    expect(options).not.toHaveProperty("subscription_id");
  });

  it("prefills only what is known", () => {
    const target = { kind: "subscription", subscriptionId: "sub_1" } as const;
    expect(razorpayCheckoutOptions({ ...BASE, target }).prefill).toEqual({});
    expect(razorpayCheckoutOptions({ ...BASE, target, email: "a@b.co", contact: "+919000000002" }).prefill).toEqual({
      email: "a@b.co",
      contact: "+919000000002",
    });
  });

  it("calls onDismiss when the customer closes the payment window", () => {
    const onDismiss = vi.fn();
    const options = razorpayCheckoutOptions({ ...BASE, onDismiss, target: { kind: "subscription", subscriptionId: "sub_1" } });
    const modal = options.modal as { readonly ondismiss: () => void };
    expect(onDismiss).not.toHaveBeenCalled();
    modal.ondismiss();
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
