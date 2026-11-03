import { findChargeForBusiness, withTenantScope } from "@brandbasket/db";
import { chargeLabel } from "@brandbasket/shared/lib/billing/charges";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LinkButton } from "@/ui";
import { TestCheckout, TestCheckoutRefused } from "@/features/checkout/components/test-checkout";
import { chargeReturnHref, type ChargeNotice } from "@/features/checkout/rules/charge-notices";
import { isFakeBillingProvider } from "@/features/checkout/server/billing";
import { confirmFakeChargePayment, loadTicketIdOfChangeCharge, verifyChargePaymentFor, type ChargeConfirmation } from "@/features/checkout/server/charges";
import { getAppDb } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { requireCustomer } from "@/lib/guards";

export const metadata: Metadata = {
  title: "Test payment",
  // The payment token is in this page's address; it must not travel to anywhere this page links to.
  referrer: "no-referrer",
};

const NOTICE_AFTER: Readonly<Record<ChargeConfirmation, ChargeNotice>> = {
  paid: "paid",
  "not-open": "duplicate",
  "amount-mismatch": "review",
  "upgrade-not-applied": "stale",
  "add-on-not-applied": "stale",
  invalid: "failed",
};

/**
 * The fake provider's stand-in for Razorpay's window for a charge (development only; a 404 otherwise), at the address the fake
 * provider sends to (FAKE_CHARGE_CONFIRM_PATH). Ported from apps/platform app/app-host/billing/charges/confirm/page.tsx. The link
 * is verified before anything is shown and the token is never rendered; every check is repeated in the Pay action.
 */
export default async function ChargeTestCheckoutPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!isFakeBillingProvider()) notFound();
  const { tenant } = await requireCustomer();
  const { token } = await searchParams;
  const confirmed = typeof token === "string" ? await verifyChargePaymentFor(tenant, { token }) : null;
  const charge = confirmed === null ? null : await withTenantScope(getAppDb(), tenant, (tx) => findChargeForBusiness(tx, tenant.businessId, confirmed.chargeId));
  if (typeof token !== "string" || confirmed === null || charge === null) {
    return (
      <TestCheckoutRefused lede="This payment link has expired or isn’t for your account, so nothing has been recorded.">
        <LinkButton href="/billing">Back to Plan & billing</LinkButton>
      </TestCheckoutRefused>
    );
  }
  const paymentToken = token;
  const chargeKind = charge.kind;
  const ticketId = chargeKind === "change_hours" ? await loadTicketIdOfChangeCharge(tenant, charge.id) : undefined;

  async function pay(): Promise<void> {
    "use server";
    if (!isFakeBillingProvider()) notFound();
    const customer = await requireCustomer();
    const result = await confirmFakeChargePayment(customer.tenant, { token: paymentToken }, new Date());
    redirect(chargeReturnHref(chargeKind, NOTICE_AFTER[result], ticketId));
  }

  const amount = formatMoney(confirmed.amountCents, confirmed.currency);
  return (
    <TestCheckout
      rows={[
        { label: "For", value: chargeLabel(charge) },
        { label: "Amount", value: amount },
      ]}
      note="This page stands in for the payment provider while payments are simulated. Pay records the payment; Cancel takes you back with nothing recorded."
      action={pay}
      cancelHref="/billing"
      submitLabel={`Pay ${amount}`}
    />
  );
}
