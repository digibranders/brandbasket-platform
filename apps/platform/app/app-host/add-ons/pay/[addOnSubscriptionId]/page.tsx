import { findAddOnSubscription, withTenantScope } from "@firstfold/db";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { z } from "zod";
import { ADD_ONS_PATH, isMonthlyAddOnId } from "@firstfold/shared/lib/billing/add-ons";
import { RazorpayCheckoutScreen } from "@/components/panel/razorpay-checkout-screen";
import { addOnPaymentLabel } from "@/lib/billing/add-on-label";
import { ADD_ON_KEPT_CALLBACK_PARAM } from "@/lib/billing/add-on-notices";
import { getBillingProvider, razorpayKeyId } from "@/lib/server/billing";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { logoOf } from "@/lib/brand";
import { requestAppOrigin, requestBrand } from "@/lib/server/request-brand";

export const metadata: Metadata = { title: "Redirecting to payment" };

interface AddOnPayPageProps {
  readonly params: Promise<{ readonly addOnSubscriptionId: string }>;
}

/**
 * Opens Razorpay Checkout on the subscription a Get it, Resume, Pay now or Keep it button opened for one of the
 * customer's add-ons. It only reads: the subscription was opened by the button's server action, and its id is taken
 * from the customer's own add-on row, read through row-level security, never from the URL. A row that is not theirs
 * reads as missing. Reloading reopens the same subscription rather than a new one. Outside the dashboard's (protected)
 * group, like /billing/pay, so it checks access itself.
 */
export default async function AddOnPayPage({ params }: AddOnPayPageProps): Promise<ReactElement> {
  if (getBillingProvider().name !== "razorpay") notFound();
  const { addOnSubscriptionId } = await params;
  if (!z.uuid().safeParse(addOnSubscriptionId).success) notFound();

  const { tenant, user } = await requireCustomerAccess({ listingAccount: "allow" });
  const row = await withTenantScope(getAppDb(), tenant, (tx) => findAddOnSubscription(tx, tenant.businessId, addOnSubscriptionId));
  if (row === null) notFound();
  // Paid already, cancelled or replaced: there is nothing to pay, and the Add-ons page shows where things stand.
  if (row.status !== "incomplete" || row.provider !== "razorpay" || !isMonthlyAddOnId(row.addOn)) redirect(ADD_ONS_PATH);

  const callbackUrl = new URL("/add-ons/pay/callback", await requestAppOrigin());
  // A row with a start date is a Keep it: Razorpay charges nothing now, so its return says "Done", not "Payment received".
  if (row.startAt !== null) callbackUrl.searchParams.set(ADD_ON_KEPT_CALLBACK_PARAM, row.addOn);

  return (
    <RazorpayCheckoutScreen
      brand={logoOf(await requestBrand())}
      openingLede="Hang on while we open your payment window."
      keyId={razorpayKeyId()}
      target={{ kind: "subscription", subscriptionId: row.providerSubscriptionId, description: addOnPaymentLabel(row.addOn) }}
      email={user.phone === null ? user.email : null}
      contact={user.phone}
      callbackUrl={callbackUrl.toString()}
      // Closing the payment window means they did not pay: back to Add-ons, where the button is still there.
      dismissHref={ADD_ONS_PATH}
    />
  );
}
