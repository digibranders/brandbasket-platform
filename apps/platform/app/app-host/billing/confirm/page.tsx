import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { BrandedAuthScreen } from "@/components/panel/branded-auth-screen";
import { TestCheckoutForm } from "@/components/panel/test-checkout-form";
import {
  afterPaymentHref,
  PAYMENT_RECEIVED_HREF,
  PAYMENT_STEP_HREF,
  reactivationReturnHref,
} from "@brandbasket/shared/lib/billing/payment-step";
import { chargedAmountCents } from "@brandbasket/billing";
import { describeDiscountedPlanTerms } from "@brandbasket/shared/lib/billing/terms";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { MEMBER_WELCOME_HREF } from "@/lib/celebration";
import {
  MEMBERSHIP_NAMES,
  membershipFailedHref,
  membershipPathFor,
  membershipReceivedHref,
  type MembershipTier,
} from "@/lib/membership";
import { isOnboardingLocked } from "@/lib/onboarding/snapshot";
import { isFakeBillingProvider } from "@/lib/server/billing";
import { getCustomerBusinessKind, requireCustomerAccess, type CustomerAccessOptions } from "@/lib/server/customer-access";
import { getProjectOverview } from "@/lib/server/onboarding";
import {
  confirmFirstPayment,
  verifyCheckoutFor,
  type PaymentConfirmation,
} from "@/lib/server/payment-confirmation";

export const metadata: Metadata = {
  title: "Test payment",
  // The checkout token is in this page's URL; it must not travel to anywhere this page links to.
  referrer: "no-referrer",
};

const FAILED_HREF = `${PAYMENT_STEP_HREF}?payment=failed`;

/**
 * Open to the account a sign-up opened too: it pays for Managed Website here, before it has a project. The token still
 * has to be its own business's.
 */
const PAYING: CustomerAccessOptions = { listingAccount: "allow", membershipCheckout: "allow" };

interface ConfirmPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Where each confirmation outcome sends the customer. `membership` is the plan a free listing account is buying, or null:
 * such an account has no Check and send to go back to, so a payment that did not open its plan returns it to that
 * plan's page.
 */
function hrefAfter(result: PaymentConfirmation, membership: MembershipTier | null): string {
  switch (result.kind) {
    case "invalid":
      return membership === null ? FAILED_HREF : membershipFailedHref(membership);
    case "needs-attention":
      return membership === null ? PAYMENT_RECEIVED_HREF : membershipReceivedHref(membership);
    case "membership-opened":
      return MEMBER_WELCOME_HREF;
    case "reactivated":
      return reactivationReturnHref("received");
    case "paid":
    case "already-recorded":
      return afterPaymentHref(result.projectStillOpen);
    default: {
      const unhandled: never = result;
      throw new Error(`Unhandled payment confirmation: ${JSON.stringify(unhandled)}`);
    }
  }
}

/** Where a customer who has already paid belongs: a refreshed confirm page records nothing and just moves on. */
async function redirectIfPaid(hasAccess: boolean): Promise<void> {
  if (!hasAccess) return;
  const { project } = await getProjectOverview();
  redirect(afterPaymentHref(!isOnboardingLocked(project)));
}

/**
 * The fake provider's checkout. It stands in for Razorpay's hosted page while payments are simulated, and does not
 * exist otherwise: with any other provider this route is a 404. It sits outside the dashboard's (protected) group, so
 * it checks access itself, and every check is repeated in the Pay action, which can be called directly.
 *
 * The token is verified (signature, expiry, and that it is this customer's business) before anything is shown, and
 * is never rendered: the Pay action captures it in a closure, which Next.js encrypts.
 */
export default async function TestCheckoutPage({ searchParams }: ConfirmPageProps): Promise<ReactElement> {
  if (!isFakeBillingProvider()) notFound();
  const { tenant, billing } = await requireCustomerAccess(PAYING);
  await redirectIfPaid(billing.hasAccess);
  // The plan a free listing account is buying; null for a website client, which pays on Check and send.
  const membership: MembershipTier | null =
    (await getCustomerBusinessKind(tenant.userId, tenant.businessId)) === "listing" ? billing.tier : null;
  const backHref = membership === null ? PAYMENT_STEP_HREF : membershipPathFor(membership);

  const { token } = await searchParams;
  const confirmed = typeof token === "string" ? await verifyCheckoutFor(tenant, { token }) : null;
  if (typeof token !== "string" || confirmed === null) {
    return (
      <BrandedAuthScreen
        title={
          <>
            Payment not <em>confirmed.</em>
          </>
        }
        lede="This checkout link has expired or isn’t for your account, so nothing has been recorded."
      >
        <p className="leading-relaxed text-ink-soft">
          {membership === null
            ? "Start again from Check and send to get a fresh one."
            : `Start again from the ${MEMBERSHIP_NAMES[membership]} page to get a fresh one.`}
        </p>
        <Link href={backHref} className="link-underline mt-4 inline-block">
          {membership === null ? "Back to Check and send" : `Back to ${MEMBERSHIP_NAMES[membership]}`}
        </Link>
      </BrandedAuthScreen>
    );
  }
  const checkoutToken = token;

  async function pay(): Promise<void> {
    "use server";
    if (!isFakeBillingProvider()) notFound();
    const customer = await requireCustomerAccess(PAYING);
    // Read before the payment: confirming it is what turns a free listing account into a client.
    const buyingMembership: MembershipTier | null =
      (await getCustomerBusinessKind(customer.tenant.userId, customer.tenant.businessId)) === "listing" ? customer.billing.tier : null;
    const result = await confirmFirstPayment(customer.tenant, { token: checkoutToken }, new Date());
    redirect(hrefAfter(result, buyingMembership));
  }

  const amount = formatMoney(confirmed.amountCents, confirmed.currency);
  const plan = billing.plan;
  // Describe the plan only when this checkout really is for it: the amount must be what the subscription charges, the
  // services on its lines (the plan row costs nothing) less the discount frozen on it, tax included. A mismatch (a price
  // changed mid-checkout, say) shows the amount alone rather than terms that would not describe what is being paid.
  const discountAmountCents = billing.subscription?.discountAmountCents ?? 0;
  const bundledAddOnNetCents = billing.subscription?.bundledAddOnNetCents ?? 0;
  const netCents = plan === null ? 0 : plan.initialAmountCents + bundledAddOnNetCents;
  const expected =
    plan === null || discountAmountCents >= netCents ? null : chargedAmountCents(netCents, discountAmountCents, plan.taxRateBasisPoints);
  const terms =
    plan !== null && expected === confirmed.amountCents && plan.currency === confirmed.currency
      ? describeDiscountedPlanTerms(
          plan,
          discountAmountCents === 0 ? null : { amountCents: discountAmountCents, months: billing.subscription?.discountMonthsLeft ?? null },
          bundledAddOnNetCents,
        )
      : null;

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
          <dt className="text-ink-soft">Business</dt>
          <dd className="text-right font-medium">{tenant.businessName}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-soft">Amount</dt>
          <dd className="text-right font-serif text-2xl tabular-nums">{amount}</dd>
        </div>
      </dl>
      {terms === null ? null : <p className="mt-4 text-sm leading-relaxed text-ink-soft">{terms}</p>}
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        This page stands in for the payment provider while payments are simulated. Pay records the payment and{" "}
        {membership === null ? "sends your answers to us" : `takes you back to ${MEMBERSHIP_NAMES[membership]}`}; Cancel takes you back with nothing recorded.
      </p>
      <div className="mt-6">
        <TestCheckoutForm action={pay} amount={amount} cancelHref={backHref} />
      </div>
    </BrandedAuthScreen>
  );
}
