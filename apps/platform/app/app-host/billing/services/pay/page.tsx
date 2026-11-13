import { findWaitingAddedServiceSuccessor, withTenantScope } from "@brandbasket/db";
import { combinedStillFits } from "@brandbasket/shared/server/added-service";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { RazorpayCheckoutScreen } from "@/components/panel/razorpay-checkout-screen";
import { logoOf } from "@/lib/brand";
import { RETURN_PARAM, RETURN_TO_SERVICES } from "@/lib/billing/pay-callback";
import { ADD_ONS_PATH } from "@brandbasket/shared/lib/billing/add-ons";
import { getBillingProvider, razorpayKeyId } from "@/lib/server/billing";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { requestAppOrigin, requestBrand } from "@/lib/server/request-brand";

export const metadata: Metadata = { title: "Redirecting to payment" };

/**
 * Opens Razorpay's window on the combined subscription the customer opened by adding a service (plan 63, Option Y). Like the plan's
 * own pay page it reads what to pay from the database, as the subscription waiting to continue the business's current one, and
 * never accepts an id from the address. Approving it pays the upfront amount; the signed webhook records it. One that no longer
 * fits the plan (it renewed, a service stopped, the account is closing) can buy nothing, so it is not offered: with nothing
 * waiting that still fits, the customer goes back to Your services. Razorpay only; a 404 otherwise.
 *
 * Outside the dashboard's (protected) group, like /billing/pay, so it checks access itself.
 */
export default async function AddedServicePayPage(): Promise<ReactElement> {
  if (getBillingProvider().name !== "razorpay") notFound();

  const { tenant, user, billing } = await requireCustomerAccess({ listingAccount: "allow", access: "owner" });
  const current = billing.subscription;
  if (current === null) redirect(ADD_ONS_PATH);
  const payable = await withTenantScope(getAppDb(), tenant, async (tx) => {
    const waiting = await findWaitingAddedServiceSuccessor(tx, current.id);
    return waiting !== null && waiting.businessId === tenant.businessId && waiting.provider === "razorpay" && (await combinedStillFits(tx, waiting)) !== null ? waiting : null;
  });
  if (payable === null) redirect(ADD_ONS_PATH);

  // The plan callback: its `return` mark sends a paid or failed approval back to Billing.
  const callbackUrl = new URL("/billing/pay/callback", await requestAppOrigin());
  callbackUrl.searchParams.set(RETURN_PARAM, RETURN_TO_SERVICES);

  return (
    <RazorpayCheckoutScreen
      brand={logoOf(await requestBrand())}
      openingLede="Hang on while we open your payment window."
      keyId={razorpayKeyId()}
      target={{ kind: "subscription", subscriptionId: payable.providerSubscriptionId }}
      email={user.phone === null ? user.email : null}
      contact={user.phone}
      callbackUrl={callbackUrl.toString()}
      dismissHref={ADD_ONS_PATH}
    />
  );
}
