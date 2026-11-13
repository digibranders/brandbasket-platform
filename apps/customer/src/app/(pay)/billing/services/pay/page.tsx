import { findWaitingAddedServiceSuccessor, withTenantScope } from "@brandbasket/db";
import { combinedStillFits } from "@brandbasket/shared/server/added-service";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { RazorpayCheckout } from "@/features/checkout/components/razorpay-checkout";
import { RETURN_PARAM, RETURN_TO_BILLING } from "@/features/checkout/rules/pay-callback";
import { getBillingProvider, razorpayKeyId } from "@/features/checkout/server/billing";
import { getAppDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { requireOwner } from "@/lib/guards";

export const metadata: Metadata = { title: "Redirecting to payment" };

const BILLING_PATH = "/billing";

/**
 * Opens Razorpay's window on the combined subscription the customer opened by adding a service (plan 63, Option Y), read from the
 * database as the one waiting to continue their current subscription, never an id from the address. Approving it pays the upfront
 * amount; the webhook records it. With nothing waiting that still fits, it goes back to Plan & billing. Razorpay only; a 404 otherwise.
 */
export default async function AddedServicePayPage() {
  // The provider comes from the environment of the running server, so this page is never built ahead of time.
  await connection();
  if (getBillingProvider().name !== "razorpay") notFound();
  const { tenant, user, billing } = await requireOwner();
  const current = billing.subscription;
  if (current === null) redirect(BILLING_PATH);
  // One that no longer fits the plan (it renewed, a service stopped, the account is closing) can buy nothing, so it is not offered.
  const payable = await withTenantScope(getAppDb(), tenant, async (tx) => {
    const waiting = await findWaitingAddedServiceSuccessor(tx, current.id);
    return waiting !== null && waiting.businessId === tenant.businessId && waiting.provider === "razorpay" && (await combinedStillFits(tx, waiting)) !== null ? waiting : null;
  });
  if (payable === null) redirect(BILLING_PATH);

  // The plan callback: its `return` mark sends a paid or failed approval back to Plan & billing.
  const callbackUrl = new URL("/billing/pay/callback", serverEnv().APP_ORIGIN);
  callbackUrl.searchParams.set(RETURN_PARAM, RETURN_TO_BILLING);

  return (
    <RazorpayCheckout
      openingLede="Hang on while we open your payment window."
      keyId={razorpayKeyId()}
      target={{ kind: "subscription", subscriptionId: payable.providerSubscriptionId }}
      email={user.phone === null ? user.email : null}
      contact={user.phone}
      callbackUrl={callbackUrl.toString()}
      dismissHref={BILLING_PATH}
    />
  );
}
