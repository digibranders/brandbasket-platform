"use client";

import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { useBrand } from "@/components/panel/brand-provider";
import { brandText, supportEmailOf } from "@/lib/brand";
import { razorpayCheckoutOptions, type RazorpayCheckoutTarget } from "@/lib/billing/razorpay-checkout-options";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open(): void };
  }
}

const CHECKOUT_SCRIPT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export interface RazorpayCheckoutLauncherProps {
  readonly keyId: string;
  readonly target: RazorpayCheckoutTarget;
  readonly email: string | null;
  readonly contact: string | null;
  readonly callbackUrl: string;
  /** Where the customer goes when they close the payment window without paying. */
  readonly dismissHref: string;
  /** Checkout's window has opened: the page behind it can stop saying it is opening. */
  readonly onOpened?: () => void;
}

/**
 * Loads Razorpay's own checkout.js and opens it immediately for the given subscription. An ad blocker or privacy
 * extension commonly blocks `checkout.razorpay.com`, and there is otherwise no fallback UI behind this (see the
 * page that renders this, which also carries a plain support-email link for the same reason): rather than leaving
 * the customer stuck on "opening your payment window…" forever with no signal anything went wrong, a script load
 * failure renders its own visible message here.
 */
export function RazorpayCheckoutLauncher({
  keyId,
  target,
  email,
  contact,
  callbackUrl,
  dismissHref,
  onOpened,
}: RazorpayCheckoutLauncherProps): ReactElement | null {
  const brand = useBrand();
  const supportEmail = supportEmailOf(brand);
  const [loadFailed, setLoadFailed] = useState(false);
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
          ? { kind: "subscription", subscriptionId: targetId, ...(description === "" ? {} : { description: brandText(description, brand) }) }
          : { kind: "order", orderId: targetId, description: brandText(description, brand) };
      new window.Razorpay(
        razorpayCheckoutOptions({
          keyId,
          target: checkoutTarget,
          email,
          contact,
          callbackUrl,
          brandName: brand.name,
          onDismiss: () => window.location.assign(dismissHref),
        }),
      ).open();
      onOpened?.();
    };
    script.onerror = () => {
      if (!cancelled) setLoadFailed(true);
    };
    document.body.appendChild(script);
    return () => {
      cancelled = true;
      document.body.removeChild(script);
    };
  }, [keyId, targetKind, targetId, description, email, contact, callbackUrl, dismissHref, onOpened, brand]);

  if (!loadFailed) return null;

  return (
    <p role="alert" className="mt-4 text-sm leading-relaxed text-ink-soft">
      We couldn’t reach the payment provider — this can happen if an ad blocker or privacy extension is active.
      Please email us at{" "}
      <a href={`mailto:${supportEmail}`} className="link-underline text-ink">
        {supportEmail}
      </a>{" "}
      and we’ll help you get set up.
    </p>
  );
}
