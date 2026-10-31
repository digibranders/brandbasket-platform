import { conversionValueCents } from "@/lib/conversions/value";

/** A customer's first payment as the browser reports it to Tag Manager (plan 59). */
export interface PurchaseEvent {
  /** The provider's payment id. The server reports the same id to GA4, which counts one purchase per transaction id. */
  readonly transactionId: string;
  /** Major units (rupees or dollars), without GST: the same figure the server sends. */
  readonly value: number;
  readonly currency: "INR" | "USD";
}

export function purchaseEventFrom(payment: { readonly providerPaymentId: string; readonly amountCents: number; readonly currency: "INR" | "USD" }, gstCents: number | null): PurchaseEvent {
  return { transactionId: payment.providerPaymentId, value: conversionValueCents({ amountCents: payment.amountCents, currency: payment.currency, gstCents }) / 100, currency: payment.currency };
}

const NOTE_PREFIX = "bb-purchase-";

/**
 * Pushes the purchase to the dataLayer, once per transaction in this browser. Returns whether it pushed. Nothing is pushed, and
 * nothing remembered, while Tag Manager has not started (the visitor has not allowed measurement). A browser that will not keep the
 * note still gets the push: a repeat is rare and GA4 counts one purchase per transaction id anyway.
 */
export function pushPurchase(layer: unknown[] | undefined, storage: Pick<Storage, "getItem" | "setItem"> | null, purchase: PurchaseEvent): boolean {
  if (layer === undefined) return false;
  const key = `${NOTE_PREFIX}${purchase.transactionId}`;
  try {
    if (storage?.getItem(key)) return false;
  } catch {
    // Storage blocked: carry on without the note.
  }
  layer.push({ ecommerce: null });
  layer.push({
    event: "purchase",
    ecommerce: {
      transaction_id: purchase.transactionId,
      value: purchase.value,
      currency: purchase.currency,
      items: [{ item_id: "first-payment", item_name: "Brandbasket first payment", price: purchase.value, quantity: 1 }],
    },
  });
  try {
    storage?.setItem(key, "1");
  } catch {
    // As above.
  }
  return true;
}
