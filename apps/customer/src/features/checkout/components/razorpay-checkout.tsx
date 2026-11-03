"use client";

import { useCallback, useEffect, useState } from "react";
import { Banner } from "@/ui";
import { BRAND } from "../rules/brand";
import { razorpayCheckoutOptions, type RazorpayCheckoutTarget } from "../rules/razorpay-checkout-options";

/*
 * The page behind Razorpay's payment window, ported from apps/platform components/panel/razorpay-checkout-screen.tsx and
 * razorpay-checkout-launcher.tsx. It loads Razorpay's checkout.js and opens it at once. It says it is opening the payment only
 * until the window is open; after that it is only seen once the customer has paid, so it says the payment is being confirmed.
 * Closing the window leaves for `dismissHref`. An ad blocker that stops checkout.razorpay.com gets a visible message.
 */

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void };
  }
}

const CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export interface RazorpayCheckoutProps {
  readonly openingLede: string;
  readonly keyId: string;
  readonly target: RazorpayCheckoutTarget;
  /** Filled in on the payment form; null for an account that signs in by phone (its email is a placeholder). */
  readonly email: string | null;
  readonly contact: string | null;
  readonly callbackUrl: string;
  readonly dismissHref: string;
}

export function RazorpayCheckout({ openingLede, keyId, target, email, contact, callbackUrl, dismissHref }: RazorpayCheckoutProps) {
  const [windowOpen, setWindowOpen] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const markOpen = useCallback(() => setWindowOpen(true), []);
  // Primitive dependencies, so the effect does not reopen Checkout on a re-render with an equal but new object.
  const targetKind = target.kind;
  const targetId = target.kind === "subscription" ? target.subscriptionId : target.orderId;
  const description = target.description ?? "";

  useEffect(() => {
    let cancelled = false;
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      if (cancelled || window.Razorpay === undefined) return;
      const checkoutTarget: RazorpayCheckoutTarget =
        targetKind === "subscription"
          ? { kind: "subscription", subscriptionId: targetId, ...(description === "" ? {} : { description }) }
          : { kind: "order", orderId: targetId, description };
      new window.Razorpay(
        razorpayCheckoutOptions({ keyId, target: checkoutTarget, email, contact, callbackUrl, brandName: BRAND.name, onDismiss: () => window.location.assign(dismissHref) }),
      ).open();
      markOpen();
    };
    script.onerror = () => {
      if (!cancelled) setLoadFailed(true);
    };
    document.body.appendChild(script);
    return () => {
      cancelled = true;
      document.body.removeChild(script);
    };
  }, [keyId, targetKind, targetId, description, email, contact, callbackUrl, dismissHref, markOpen]);

  return (
    <div className="mx-auto flex w-full max-w-100 flex-col gap-4 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="type-title text-ink">{windowOpen ? "Confirming payment…" : "Opening payment…"}</h1>
        <p className="type-body text-ink-3">{windowOpen ? "Keep this page open while we confirm your payment with the bank." : openingLede}</p>
      </div>
      {windowOpen || loadFailed ? null : (
        <p className="type-body text-ink-3">
          If nothing happens after a few seconds, email us at <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a>.
        </p>
      )}
      {loadFailed ? (
        <Banner tone="neg">
          We couldn’t reach the payment provider. This can happen if an ad blocker or privacy extension is active. Please email us at{" "}
          <a href={`mailto:${BRAND.contactEmail}`}>{BRAND.contactEmail}</a> and we’ll help you get set up.
        </Banner>
      ) : null}
    </div>
  );
}
