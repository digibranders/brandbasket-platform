import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { RazorpayCheckoutScreen } from "@/components/panel/razorpay-checkout-screen";
import { PAYMENT_STEP_HREF, REACTIVATE_HREF } from "@brandbasket/shared/lib/billing/payment-step";
import { payCallbackDestination, RETURN_PARAM, RETURN_TO_BILLING } from "@/lib/billing/pay-callback";
import { MEMBERSHIP_CALLBACK_PARAM, membershipPathFor, type MembershipTier } from "@/lib/membership";
import { getBillingProvider, razorpayKeyId } from "@/lib/server/billing";
import { getCustomerBusinessKind, requireCustomerAccess } from "@/lib/server/customer-access";
import { logoOf } from "@/lib/brand";
import { requestAppOrigin, requestBrand } from "@/lib/server/request-brand";

export const metadata: Metadata = { title: "Redirecting to payment" };

/**
 * The `checkoutUrl` every Razorpay checkout redirects to (see `RAZORPAY_PAY_PATH`). It reads the business's own
 * open subscription from the database rather than accepting one from the URL, so there is nothing here for a
 * customer to tamper with — visiting this page always opens checkout for your own account's own pending
 * subscription, never anyone else's.
 *
 * It sits outside the dashboard's (protected) group, same as the fake provider's confirm page next to it, and that
 * group has no shared layout of its own — so, like that page, it checks access itself and builds its own full-page
 * shell with AuthScreen rather than assuming one exists above it.
 *
 * Open to the account a sign-up opened too: it pays for Managed Website here, before it has a
 * project. With nothing to pay it goes back to that plan's page, and its callback is marked with the plan so
 * Razorpay's return lands there as well.
 */
export default async function RazorpayPayPage(): Promise<ReactElement> {
  const provider = getBillingProvider();
  if (provider.name !== "razorpay") notFound();

  const { tenant, user, billing } = await requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" });
  const membership: MembershipTier | null =
    (await getCustomerBusinessKind(tenant.userId, tenant.businessId)) === "listing" ? billing.tier : null;
  // A customer who paid before and lapsed is reactivating from Billing, and goes back there.
  const reactivating = billing.status === "lapsed";
  const backHref = reactivating ? REACTIVATE_HREF : membership === null ? PAYMENT_STEP_HREF : membershipPathFor(membership);
  if (billing.hasAccess) redirect(backHref);
  const subscription = billing.subscription;
  if (subscription === null || subscription.status !== "incomplete" || subscription.provider !== "razorpay") {
    redirect(backHref);
  }
  const callbackUrl = new URL("/billing/pay/callback", await requestAppOrigin());
  if (reactivating) callbackUrl.searchParams.set(RETURN_PARAM, RETURN_TO_BILLING);
  else if (membership !== null) callbackUrl.searchParams.set(MEMBERSHIP_CALLBACK_PARAM, membership);
  // Closing the payment window lands where a failed payment would: the page they started from, with the pay button there.
  const dismissHref = payCallbackDestination({
    failed: true,
    membership: reactivating ? null : membership,
    returnTo: reactivating ? RETURN_TO_BILLING : null,
  });

  return (
    <RazorpayCheckoutScreen
      brand={logoOf(await requestBrand())}
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
