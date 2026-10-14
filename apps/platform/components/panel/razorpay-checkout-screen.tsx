"use client";

import { useCallback, useState, type ReactElement } from "react";
import { useBrand } from "@/components/panel/brand-provider";
import { supportEmailOf } from "@/lib/brand";
import type { BrandLogo } from "@fynix/shared/ui/logo";
import { AuthScreen } from "@fynix/shared/ui/panel/auth-screen";
import {
  RazorpayCheckoutLauncher,
  type RazorpayCheckoutLauncherProps,
} from "@/components/panel/razorpay-checkout-launcher";

interface RazorpayCheckoutScreenProps extends RazorpayCheckoutLauncherProps {
  /** What the page says while the payment window is still opening. */
  readonly openingLede: string;
  /** The logo to draw (lib/brand.ts logoOf). */
  readonly brand: BrandLogo;
}

/**
 * The full page behind Razorpay's payment window. It says it is opening the payment only until the window is open; after
 * that the page is only seen once the customer has paid (Checkout closes and the browser is on its way to the callback),
 * so it says the payment is being confirmed instead of still opening. Paying inside the window hides this page, and
 * closing the window leaves for `dismissHref`.
 */
export function RazorpayCheckoutScreen({ openingLede, brand, ...launcher }: RazorpayCheckoutScreenProps): ReactElement {
  const supportEmail = supportEmailOf(useBrand());
  const [windowOpen, setWindowOpen] = useState(false);
  // Stable, because the launcher opens Checkout in an effect that depends on it: a new function each render would reopen it.
  const markOpen = useCallback(() => setWindowOpen(true), []);
  return (
    <AuthScreen
      brand={brand}
      title={
        windowOpen ? (
          <>
            Confirming <em>payment…</em>
          </>
        ) : (
          <>
            Opening <em>payment…</em>
          </>
        )
      }
      lede={windowOpen ? "Keep this page open while we confirm your payment with the bank." : openingLede}
    >
      {windowOpen ? null : (
        <p className="text-sm leading-relaxed text-ink-soft">
          If nothing happens after a few seconds, email us at{" "}
          <a href={`mailto:${supportEmail}`} className="link-underline text-ink">
            {supportEmail}
          </a>
          .
        </p>
      )}
      <RazorpayCheckoutLauncher {...launcher} onOpened={markOpen} />
    </AuthScreen>
  );
}
