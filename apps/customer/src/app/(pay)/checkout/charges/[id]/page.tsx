import { findChargeForBusiness, withTenantScope } from "@brandbasket/db";
import { chargeLabel } from "@brandbasket/shared/lib/billing/charges";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { RazorpayCheckout } from "@/features/checkout/components/razorpay-checkout";
import {
  AD_RETURN_PARAM,
  AD_RETURN_VALUE,
  ADD_ON_RETURN_VALUE,
  CHANGE_RETURN_VALUE,
  CHANGE_TICKET_PARAM,
  chargeNoticeHref,
  chargeReturnHref,
  PRESS_RELEASE_RETURN_VALUE,
  UPGRADE_RETURN_VALUE,
} from "@/features/checkout/rules/charge-notices";
import { getBillingProvider, razorpayKeyId } from "@/features/checkout/server/billing";
import { loadTicketIdOfChangeCharge } from "@/features/checkout/server/charges";
import { getAppDb } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { formatMoney } from "@/lib/format";
import { requireCustomer } from "@/lib/guards";

export const metadata: Metadata = { title: "Redirecting to payment" };

/** Which page a paid charge returns to, by its kind (the callback route reads the mark). */
const RETURN_MARK: Readonly<Partial<Record<string, string>>> = {
  directory_ad: AD_RETURN_VALUE,
  plan_upgrade: UPGRADE_RETURN_VALUE,
  press_release: PRESS_RELEASE_RETURN_VALUE,
  add_on: ADD_ON_RETURN_VALUE,
  change_hours: CHANGE_RETURN_VALUE,
};

/**
 * Opens Razorpay's window on the order the Pay button opened for one of the customer's charges (ported from apps/platform
 * app/app-host/billing/charges/[chargeId]/pay/page.tsx; the old address redirects here). It only reads: the order id comes from
 * the customer's own charge row, read through row-level security, never from the address. Reloading reopens the same order.
 */
export default async function ChargePayPage({ params }: { readonly params: Promise<{ readonly id: string }> }) {
  // The provider comes from the environment of the running server, so this page is never built ahead of time.
  await connection();
  if (getBillingProvider().name !== "razorpay") notFound();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const { tenant, user } = await requireCustomer();
  const charge = await withTenantScope(getAppDb(), tenant, (tx) => findChargeForBusiness(tx, tenant.businessId, id));
  if (charge === null) notFound();
  // A change quote returns to its own request, so the notice is on the request that was paid.
  const ticketId = charge.kind === "change_hours" ? await loadTicketIdOfChangeCharge(tenant, id) : undefined;
  if (charge.status !== "open") redirect(charge.kind === "press_release" ? chargeReturnHref(charge.kind, "not-open") : chargeNoticeHref("not-open"));
  if (charge.provider !== "razorpay" || charge.providerOrderId === null) redirect("/billing");

  const label = chargeLabel(charge);
  const callbackUrl = new URL("/billing/charges/callback", serverEnv().APP_ORIGIN);
  const mark = RETURN_MARK[charge.kind];
  if (mark !== undefined) callbackUrl.searchParams.set(AD_RETURN_PARAM, mark);
  if (charge.kind === "change_hours" && ticketId !== undefined) callbackUrl.searchParams.set(CHANGE_TICKET_PARAM, ticketId);

  return (
    <RazorpayCheckout
      openingLede={`${label}: ${formatMoney(charge.amountCents, charge.currency)}`}
      keyId={razorpayKeyId()}
      target={{ kind: "order", orderId: charge.providerOrderId, description: label }}
      email={user.phone === null ? user.email : null}
      contact={user.phone}
      callbackUrl={callbackUrl.toString()}
      dismissHref={chargeReturnHref(charge.kind, "failed", ticketId)}
    />
  );
}
