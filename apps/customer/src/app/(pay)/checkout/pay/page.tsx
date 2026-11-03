import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { RazorpayCheckout } from "@/features/checkout/components/razorpay-checkout";
import { payCallbackDestination, RETURN_PARAM, RETURN_TO_BILLING } from "@/features/checkout/rules/pay-callback";
import { MEMBERSHIP_CALLBACK_PARAM, MEMBERSHIP_PATH } from "@/features/checkout/rules/membership";
import { getBillingProvider, razorpayKeyId } from "@/features/checkout/server/billing";
import { loadBusinessEntry } from "@/features/checkout/server/entry";
import { requireCustomer } from "@/lib/guards";
import { serverEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Redirecting to payment" };

/**
 * Opens Razorpay's window on the business's OWN open subscription, read from the database, never an id from the address
 * (ported from apps/platform app/app-host/billing/pay/page.tsx; /billing/pay redirects here). With nothing to pay it goes back to
 * where the payment started: the checkout, or Plan & billing for a reactivation. Razorpay only; a 404 otherwise.
 */
export default async function RazorpayPayPage() {
  // The provider comes from the environment of the running server, so this page is never built ahead of time.
  await connection();
  if (getBillingProvider().name !== "razorpay") notFound();
  const customer = await requireCustomer();
  const { billing, user } = customer;
  const membership = (await loadBusinessEntry(customer)).kind === "listing" ? "managed" : null;
  // A customer who paid before and lapsed is reactivating from Plan & billing, and goes back there.
  const reactivating = billing.status === "lapsed";
  const backHref = reactivating ? "/billing" : MEMBERSHIP_PATH;
  if (billing.hasAccess) redirect(backHref);
  const subscription = billing.subscription;
  if (subscription === null || subscription.status !== "incomplete" || subscription.provider !== "razorpay") redirect(backHref);

  // The old callback address: Razorpay posts back there, and in-flight checkouts carry it.
  const callbackUrl = new URL("/billing/pay/callback", serverEnv().APP_ORIGIN);
  if (reactivating) callbackUrl.searchParams.set(RETURN_PARAM, RETURN_TO_BILLING);
  else if (membership !== null) callbackUrl.searchParams.set(MEMBERSHIP_CALLBACK_PARAM, membership);
  // Closing the payment window lands where a failed payment would: the page they started from, with the Pay button there.
  const dismissHref = payCallbackDestination({ failed: true, membership: reactivating ? null : membership, returnTo: reactivating ? RETURN_TO_BILLING : null });

  return (
    <RazorpayCheckout
      openingLede="Hang on while we open your payment window."
      keyId={razorpayKeyId()}
      target={{ kind: "subscription", subscriptionId: subscription.providerSubscriptionId }}
      email={user.phone === null ? user.email : null}
      contact={user.phone}
      callbackUrl={callbackUrl.toString()}
      dismissHref={dismissHref}
    />
  );
}
