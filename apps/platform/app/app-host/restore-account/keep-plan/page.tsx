import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { formatMoney } from "@brandbasket/shared/lib/money";
import { LocalDate } from "@brandbasket/shared/ui/panel/local-date-time";
import { BrandedAuthScreen } from "@/components/panel/branded-auth-screen";
import { RazorpayCheckoutScreen } from "@/components/panel/razorpay-checkout-screen";
import { TestCheckoutForm } from "@/components/panel/test-checkout-form";
import { logoOf } from "@/lib/brand";
import { RESTORE_ACCOUNT_PATH } from "@/lib/account-settings-form";
import { getBillingProvider, razorpayKeyId } from "@/lib/server/billing";
import { getCustomerAccess } from "@/lib/server/customer-access";
import { confirmKeptPlan, findKeepCheckoutFor, verifyKeepCheckoutFor } from "@/lib/server/keep-plan";
import { requestAppOrigin, requestBrand } from "@/lib/server/request-brand";

export const metadata: Metadata = {
  title: "Keep your plan",
  // The fake checkout's token is in this page's URL; it must not travel to anywhere this page links to.
  referrer: "no-referrer",
};

// Never cached: it reads the session, the closure and the waiting checkout.
export const dynamic = "force-dynamic";

interface KeepPlanPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Where Keep my plan sends a closing account to authorise the new mandate (RAZORPAY_KEEP_PAY_PATH, FAKE_KEEP_CONFIRM_PATH).
 * The account is locked, so this sits beside the restore-account page rather than under /billing, and it opens only the
 * account's own waiting checkout, read from the database. With Razorpay it opens the payment window; with the fake provider
 * it is the stand-in confirm page. Nothing here lifts the closure for Razorpay: the signed webhook does.
 */
export default async function KeepPlanPage({ searchParams }: KeepPlanPageProps): Promise<ReactElement> {
  const access = await getCustomerAccess();
  if (access.kind !== "closing") redirect("/");
  const provider = getBillingProvider();

  if (provider.name === "razorpay") {
    const checkout = await findKeepCheckoutFor(access.user.id);
    if (checkout === null || checkout.successor.provider !== "razorpay") redirect(RESTORE_ACCOUNT_PATH);
    const { user } = access;
    return (
      <RazorpayCheckoutScreen
        brand={logoOf(await requestBrand())}
        openingLede="Hang on while we open your payment window."
        keyId={razorpayKeyId()}
        target={{ kind: "subscription", subscriptionId: checkout.successor.providerSubscriptionId }}
        email={user.phone === null ? user.email : null}
        contact={user.phone}
        callbackUrl={new URL("/restore-account/keep-plan/callback", await requestAppOrigin()).toString()}
        dismissHref={RESTORE_ACCOUNT_PATH}
      />
    );
  }

  // The fake provider's stand-in for Razorpay's window; any other provider has no such page.
  if (provider.name !== "fake") notFound();
  const { token } = await searchParams;
  const verified = typeof token === "string" ? await verifyKeepCheckoutFor(provider, access.user.id, { token }) : null;
  if (typeof token !== "string" || verified === null) {
    return (
      <BrandedAuthScreen
        title={
          <>
            Payment not <em>confirmed.</em>
          </>
        }
        lede="This checkout link has expired or isn’t for your account, so nothing has been recorded."
      >
        <Link href={RESTORE_ACCOUNT_PATH} className="link-underline mt-4 inline-block">
          Back to Restore your account
        </Link>
      </BrandedAuthScreen>
    );
  }
  const checkoutToken = token;

  async function confirm(): Promise<void> {
    "use server";
    const current = await getCustomerAccess();
    if (current.kind !== "closing") redirect("/login");
    const again = await verifyKeepCheckoutFor(getBillingProvider(), current.user.id, { token: checkoutToken });
    if (again === null) redirect(RESTORE_ACCOUNT_PATH);
    await confirmKeptPlan(again.checkout.successor.id, new Date());
    redirect("/");
  }

  const { startAt } = verified.checkout.successor;
  const amount = formatMoney(verified.amountCents, verified.currency);
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
          <dt className="text-ink-soft">Amount</dt>
          <dd className="text-right font-serif text-2xl tabular-nums">{amount}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        This page stands in for the payment provider while payments are simulated. Nothing is taken now
        {startAt === null ? "" : <>; the first payment is on <LocalDate iso={startAt.toISOString()} /></>}.
      </p>
      <div className="mt-6">
        <TestCheckoutForm action={confirm} amount={amount} cancelHref={RESTORE_ACCOUNT_PATH} submitLabel="Confirm" />
      </div>
    </BrandedAuthScreen>
  );
}
