import { findChargeForBusiness, withTenantScope } from "@brandbasket/db";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { z } from "zod";
import { chargeLabel } from "@brandbasket/shared/lib/billing/charges";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { RazorpayCheckoutScreen } from "@/components/panel/razorpay-checkout-screen";
import {
  ADD_ON_RETURN_VALUE,
  AD_RETURN_PARAM,
  AD_RETURN_VALUE,
  PRESS_RELEASE_RETURN_VALUE,
  UPGRADE_RETURN_VALUE,
  chargeNoticeHref,
  chargeReturnHref,
} from "@/lib/billing/charge-notices";
import { getBillingProvider, razorpayKeyId } from "@/lib/server/billing";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { logoOf } from "@/lib/brand";
import { requestAppOrigin, requestBrand } from "@/lib/server/request-brand";

export const metadata: Metadata = { title: "Redirecting to payment" };

interface ChargePayPageProps {
  readonly params: Promise<{ readonly chargeId: string }>;
}

/**
 * Opens Razorpay Checkout on the order the Pay button opened for one of the customer's charges. It only reads: the
 * order was created by the Pay form post (see payChargeAction), and its id is taken from the customer's own charge
 * row, read through row-level security, never from the URL. Reloading reopens the same order rather than a new one.
 * Outside the dashboard's (protected) group, like /billing/pay, so it checks access itself.
 */
export default async function ChargePayPage({ params }: ChargePayPageProps): Promise<ReactElement> {
  if (getBillingProvider().name !== "razorpay") notFound();
  const { chargeId } = await params;
  if (!z.uuid().safeParse(chargeId).success) notFound();

  const { tenant, user } = await requireCustomerAccess({ listingAccount: "allow" });
  const charge = await withTenantScope(getAppDb(), tenant, (tx) => findChargeForBusiness(tx, tenant.businessId, chargeId));
  if (charge === null) notFound();
  // Only a press release has its own page to say so on; the other kinds keep saying it on Billing.
  if (charge.status !== "open") redirect(charge.kind === "press_release" ? chargeReturnHref(charge.kind, "not-open") : chargeNoticeHref("not-open"));
  if (charge.provider !== "razorpay" || charge.providerOrderId === null) redirect("/billing");

  const label = chargeLabel(charge);
  // A won ad spot returns to Advertise, a move up to Upgrade, and a press release or an add-on to Add-ons, not Billing (see the callback route).
  const callbackUrl = new URL("/billing/charges/callback", await requestAppOrigin());
  if (charge.kind === "directory_ad") callbackUrl.searchParams.set(AD_RETURN_PARAM, AD_RETURN_VALUE);
  if (charge.kind === "plan_upgrade") callbackUrl.searchParams.set(AD_RETURN_PARAM, UPGRADE_RETURN_VALUE);
  if (charge.kind === "press_release") callbackUrl.searchParams.set(AD_RETURN_PARAM, PRESS_RELEASE_RETURN_VALUE);
  if (charge.kind === "add_on") callbackUrl.searchParams.set(AD_RETURN_PARAM, ADD_ON_RETURN_VALUE);

  return (
    <RazorpayCheckoutScreen
      brand={logoOf(await requestBrand())}
      openingLede={`${label}: ${formatMoney(charge.amountCents, charge.currency)}`}
      keyId={razorpayKeyId()}
      target={{ kind: "order", orderId: charge.providerOrderId, description: label }}
      email={user.phone === null ? user.email : null}
      contact={user.phone}
      callbackUrl={callbackUrl.toString()}
      dismissHref={chargeReturnHref(charge.kind, "failed")}
    />
  );
}
