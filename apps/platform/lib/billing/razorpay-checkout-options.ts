import { siteConfig } from "@fynix/shared/lib/site-config";

/**
 * What Checkout takes payment for: a subscription (the monthly plan, or an add-on with its own `description`), or a
 * one-time order for a charge.
 */
export type RazorpayCheckoutTarget =
  | { readonly kind: "subscription"; readonly subscriptionId: string; readonly description?: string }
  | { readonly kind: "order"; readonly orderId: string; readonly description: string };

export interface RazorpayCheckoutInput {
  readonly keyId: string;
  readonly target: RazorpayCheckoutTarget;
  /** Filled in on the payment form for the customer; null for an account with no real address (it signs in by phone). */
  readonly email: string | null;
  /** The customer's mobile number, E.164, filled in the same way; null when we do not have one. */
  readonly contact: string | null;
  readonly callbackUrl: string;
  /** Who is being paid, as the window names them: the brand the dashboard is sold under. The site's own name when left out. */
  readonly brandName?: string;
  /** The customer closed the payment window without finishing: where they go next is the caller's to decide. */
  readonly onDismiss: () => void;
}

/**
 * The options Razorpay Checkout opens with. `name` is who is being paid, and Checkout prints it in the window's header and
 * in the line telling the customer who will charge them every month, so it is always the brand the dashboard is sold under: the customer's own business
 * is the one paying, not the one being paid.
 */
export function razorpayCheckoutOptions({ keyId, target, email, contact, callbackUrl, brandName = siteConfig.name, onDismiss }: RazorpayCheckoutInput): Record<string, unknown> {
  return {
    key: keyId,
    ...(target.kind === "subscription" ? { subscription_id: target.subscriptionId } : { order_id: target.orderId }),
    name: brandName,
    description:
      target.kind === "subscription" ? (target.description ?? `${brandName} monthly plan`) : target.description,
    prefill: { ...(email === null ? {} : { email }), ...(contact === null ? {} : { contact }) },
    callback_url: callbackUrl,
    // Closing the window with X reports nothing to the callback address, so without this the customer is left on the
    // "Opening payment" page with no way back.
    modal: { ondismiss: onDismiss },
  };
}
