import { findChargeForBusiness, withTenantScope } from "@firstfold/db";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { BrandedAuthScreen } from "@/components/panel/branded-auth-screen";
import { chargeLabel } from "@firstfold/shared/lib/billing/charges";
import { formatMoney } from "@firstfold/shared/lib/money";
import { TestCheckoutForm } from "@/components/panel/test-checkout-form";
import { chargeReturnHref, type ChargeNotice } from "@/lib/billing/charge-notices";
import { isFakeBillingProvider } from "@/lib/server/billing";
import { confirmFakeChargePayment, verifyChargePaymentFor, type ChargeConfirmation } from "@/lib/server/charges";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";

export const metadata: Metadata = {
  title: "Test payment",
  // The payment token is in this page's URL; it must not travel to anywhere this page links to.
  referrer: "no-referrer",
};

const NOTICE_AFTER: Readonly<Record<ChargeConfirmation, ChargeNotice>> = {
  paid: "paid",
  "not-open": "duplicate",
  "amount-mismatch": "review",
  "upgrade-not-applied": "stale",
  invalid: "failed",
};

/** Where Cancel goes for the kinds of charge that have a page of their own; any other goes to Billing. */
const CANCEL_HREF: Readonly<Partial<Record<string, string>>> = {
  plan_upgrade: "/upgrade",
  press_release: "/add-ons",
};

interface ChargeConfirmPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The fake provider's stand-in for Razorpay's payment window, for a charge. It exists only while payments are
 * simulated (a 404 otherwise), and every check is repeated in the Pay action, which can be called directly. The link
 * is verified (signature, expiry, and that it is this customer's business) before anything is shown, and the token
 * is never rendered: the Pay action captures it in a closure, which Next.js encrypts.
 */
export default async function ChargeTestCheckoutPage({ searchParams }: ChargeConfirmPageProps): Promise<ReactElement> {
  if (!isFakeBillingProvider()) notFound();
  const { tenant } = await requireCustomerAccess({ listingAccount: "allow" });

  const { token } = await searchParams;
  const confirmed = typeof token === "string" ? await verifyChargePaymentFor(tenant, { token }) : null;
  const charge =
    confirmed === null
      ? null
      : await withTenantScope(getAppDb(), tenant, (tx) => findChargeForBusiness(tx, tenant.businessId, confirmed.chargeId));
  if (typeof token !== "string" || confirmed === null || charge === null) {
    return (
      <BrandedAuthScreen
        title={
          <>
            Payment not <em>confirmed.</em>
          </>
        }
        lede="This payment link has expired or isn’t for your account, so nothing has been recorded."
      >
        <Link href="/billing" className="link-underline mt-2 inline-block">
          Back to Billing
        </Link>
      </BrandedAuthScreen>
    );
  }
  const paymentToken = token;
  const chargeKind = charge.kind;

  async function pay(): Promise<void> {
    "use server";
    if (!isFakeBillingProvider()) notFound();
    const customer = await requireCustomerAccess({ listingAccount: "allow" });
    const result = await confirmFakeChargePayment(customer.tenant, { token: paymentToken }, new Date());
    redirect(chargeReturnHref(chargeKind, NOTICE_AFTER[result]));
  }

  const amount = formatMoney(confirmed.amountCents, confirmed.currency);
  return (
    <BrandedAuthScreen
      title={
        <>
          Test <em>payment.</em>
        </>
      }
      lede="Test payment. No money will move."
    >
      <p className="inline-flex rounded-full bg-accent-pale px-3 py-1 text-[0.8125rem] font-semibold text-accent-deep">
        Test checkout
      </p>
      <dl className="mt-5 space-y-3">
        <div className="flex justify-between gap-4">
          <dt className="text-ink-soft">For</dt>
          <dd className="text-right font-medium">{chargeLabel(charge)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-soft">Amount</dt>
          <dd className="text-right font-serif text-2xl tabular-nums">{amount}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        This page stands in for the payment provider while payments are simulated. Pay records the payment; Cancel
        takes you back with nothing recorded.
      </p>
      <div className="mt-6">
        <TestCheckoutForm action={pay} amount={amount} cancelHref={CANCEL_HREF[chargeKind] ?? "/billing"} />
      </div>
    </BrandedAuthScreen>
  );
}
