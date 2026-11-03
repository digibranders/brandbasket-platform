"use client";

import { useEffect } from "react";
import { pushPurchase, type PurchaseEvent } from "../purchase-event";

/**
 * Reports the first payment to Tag Manager once, on the page that welcomes it (plan 59). Renders nothing. pushPurchase does
 * nothing until Tag Manager has started, and once per transaction in this browser. Ported from the effect in apps/platform
 * components/first-look/payment-welcome.tsx.
 */
export function PurchasePush({ event }: { readonly event: PurchaseEvent | null }) {
  useEffect(() => {
    if (event === null) return;
    let notes: Storage | null = null;
    try {
      notes = window.localStorage;
    } catch {
      // Storage blocked: pushPurchase carries on without its note.
    }
    pushPurchase(window.dataLayer, notes, event);
  }, [event]);
  return null;
}
