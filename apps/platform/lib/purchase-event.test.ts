import { describe, expect, it } from "vitest";
import { purchaseEventFrom, pushPurchase, type PurchaseEvent } from "./purchase-event";

const PURCHASE: PurchaseEvent = { transactionId: "pay_Abc123", value: 2541.54, currency: "INR" };

function storage(): Pick<Storage, "getItem" | "setItem"> & { readonly kept: Map<string, string> } {
  const kept = new Map<string, string>();
  return { kept, getItem: (key) => kept.get(key) ?? null, setItem: (key, value) => void kept.set(key, value) };
}

describe("pushPurchase", () => {
  it("clears the last ecommerce object, then pushes the purchase in GA4's shape", () => {
    const layer: unknown[] = [];
    expect(pushPurchase(layer, storage(), PURCHASE)).toBe(true);
    expect(layer).toEqual([
      { ecommerce: null },
      { event: "purchase", ecommerce: { transaction_id: "pay_Abc123", value: 2541.54, currency: "INR", items: [{ item_id: "first-payment", item_name: "Brandbasket first payment", price: 2541.54, quantity: 1 }] } },
    ]);
  });

  it("pushes a transaction once, however often the popup opens in this browser", () => {
    const layer: unknown[] = [];
    const kept = storage();
    expect(pushPurchase(layer, kept, PURCHASE)).toBe(true);
    expect(pushPurchase(layer, kept, PURCHASE)).toBe(false);
    expect(layer).toHaveLength(2);
    expect(pushPurchase(layer, kept, { ...PURCHASE, transactionId: "pay_other" })).toBe(true);
  });

  it("does nothing, and remembers nothing, while Tag Manager has not started", () => {
    const kept = storage();
    expect(pushPurchase(undefined, kept, PURCHASE)).toBe(false);
    expect(kept.kept.size).toBe(0);
  });

  it("still pushes when the browser will not keep a note of it", () => {
    const layer: unknown[] = [];
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(pushPurchase(layer, blocked, PURCHASE)).toBe(true);
    expect(pushPurchase(layer, null, PURCHASE)).toBe(true);
  });
});

describe("purchaseEventFrom", () => {
  it("is the provider's payment id and the money without GST", () => {
    expect(purchaseEventFrom({ providerPaymentId: "pay_Abc123", amountCents: 299900, currency: "INR" }, 45746)).toEqual(PURCHASE);
    expect(purchaseEventFrom({ providerPaymentId: "pay_us", amountCents: 6500, currency: "USD" }, null)).toEqual({ transactionId: "pay_us", value: 65, currency: "USD" });
  });
});
