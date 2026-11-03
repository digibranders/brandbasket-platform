import { chargedAmountCents } from "@brandbasket/billing";
import { describeDiscountedPlanTerms } from "@brandbasket/shared/lib/billing/terms";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { LinkButton } from "@/ui";
import { TestCheckout, TestCheckoutRefused } from "@/features/checkout/components/test-checkout";
import { afterPaymentHref, hrefAfter } from "@/features/checkout/rules/confirm-href";
import { MEMBERSHIP_PATH } from "@/features/checkout/rules/membership";
import { isFakeBillingProvider } from "@/features/checkout/server/billing";
import { loadBusinessEntry } from "@/features/checkout/server/entry";
import { confirmFirstPayment, projectIsOpen, verifyCheckoutFor } from "@/features/checkout/server/payment-confirmation";
import { formatMoney } from "@/lib/format";
import { requireCustomer } from "@/lib/guards";

export const metadata: Metadata = {
  title: "Test payment",
  // The checkout token is in this page's address; it must not travel to anywhere this page links to.
  referrer: "no-referrer",
};

/**
 * The fake provider's checkout (development only; a 404 with any other provider), at the address the fake provider sends to
 * (FAKE_CONFIRM_PATH). Ported from apps/platform app/app-host/billing/confirm/page.tsx. The token is verified (signature,
 * expiry, this customer's business) before anything is shown, and is never rendered: the Pay action captures it in a closure,
 * which Next.js encrypts. Every check is repeated in the action, which can be called directly.
 */
export default async function TestCheckoutPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (!isFakeBillingProvider()) notFound();
  const customer = await requireCustomer();
  const { tenant, billing } = customer;
  // A refreshed confirm page after paying records nothing and just moves on.
  if (billing.hasAccess) redirect(afterPaymentHref(await projectIsOpen(tenant)));

  const { token } = await searchParams;
  const confirmed = typeof token === "string" ? await verifyCheckoutFor(tenant, { token }) : null;
  if (typeof token !== "string" || confirmed === null) {
    return (
      <TestCheckoutRefused lede="This checkout link has expired or isn’t for your account, so nothing has been recorded.">
        <p className="type-body text-ink-3">Start again from the Checkout page to get a fresh one.</p>
        <LinkButton href={MEMBERSHIP_PATH}>Back to Checkout</LinkButton>
      </TestCheckoutRefused>
    );
  }
  const checkoutToken = token;

  async function pay(): Promise<void> {
    "use server";
    if (!isFakeBillingProvider()) notFound();
    const current = await requireCustomer();
    // Read before the payment: confirming it is what turns a sign-up account into a client.
    const buying = (await loadBusinessEntry(current)).kind === "listing" ? "managed" : null;
    const result = await confirmFirstPayment(current.tenant, { token: checkoutToken }, new Date());
    redirect(hrefAfter(result, buying));
  }

  const amount = formatMoney(confirmed.amountCents, confirmed.currency);
  const plan = billing.plan;
  // Describe the plan only when this checkout really is for it; a mismatch shows the amount alone.
  const discountAmountCents = billing.subscription?.discountAmountCents ?? 0;
  const bundledAddOnNetCents = billing.subscription?.bundledAddOnNetCents ?? 0;
  const netCents = plan === null ? 0 : plan.initialAmountCents + bundledAddOnNetCents;
  const expected = plan === null || discountAmountCents >= netCents ? null : chargedAmountCents(netCents, discountAmountCents);
  const terms =
    plan !== null && expected === confirmed.amountCents && plan.currency === confirmed.currency
      ? describeDiscountedPlanTerms(
          plan,
          discountAmountCents === 0 ? null : { amountCents: discountAmountCents, months: billing.subscription?.discountMonthsLeft ?? null },
          bundledAddOnNetCents,
        )
      : null;

  return (
    <TestCheckout
      rows={[
        { label: "Business", value: tenant.businessName },
        { label: "Amount", value: amount },
      ]}
      note={
        <>
          {terms === null ? null : <>{terms} </>}
          This page stands in for the payment provider while payments are simulated. Pay records the payment; Cancel takes you back with nothing recorded.
        </>
      }
      action={pay}
      cancelHref={MEMBERSHIP_PATH}
      submitLabel={`Pay ${amount}`}
    />
  );
}
