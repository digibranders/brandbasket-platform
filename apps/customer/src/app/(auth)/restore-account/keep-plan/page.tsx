import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { TestCheckout, TestCheckoutRefused } from "@/features/checkout/components/test-checkout";
import { RazorpayCheckout } from "@/features/checkout/components/razorpay-checkout";
import { getBillingProvider, razorpayKeyId } from "@/features/checkout/server/billing";
import { confirmKeptPlan, findKeepCheckoutFor, verifyKeepCheckoutFor } from "@/features/checkout/server/keep-plan";
import { findClosingAccount } from "@/features/restore/server";
import { serverEnv } from "@/lib/env";
import { formatDate, formatMoney } from "@/lib/format";
import { requireSignedIn } from "@/lib/guards";
import { LinkButton } from "@/ui";

export const metadata: Metadata = {
  title: "Keep your plan",
  // The fake checkout's token is in this page's address; it must not travel to anywhere this page links to.
  referrer: "no-referrer",
};

const RESTORE_ACCOUNT_PATH = "/restore-account";

/**
 * Where Keep my plan sends a closing account to authorise the new mandate (RAZORPAY_KEEP_PAY_PATH, FAKE_KEEP_CONFIRM_PATH).
 * Ported from apps/platform app/app-host/restore-account/keep-plan/page.tsx. It opens only the account's own waiting checkout,
 * read from the database. With Razorpay it opens the payment window; with the fake provider it is the test confirm page.
 * Nothing here lifts the closure for Razorpay: the signed webhook in apps/platform does.
 */
export default async function KeepPlanPage({ searchParams }: { readonly searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireSignedIn();
  const closing = await findClosingAccount();
  if (closing === null) redirect("/");
  const provider = getBillingProvider();
  const { user } = closing;

  if (provider.name === "razorpay") {
    const checkout = await findKeepCheckoutFor(user.id);
    if (checkout === null || checkout.successor.provider !== "razorpay") redirect(RESTORE_ACCOUNT_PATH);
    return (
      <RazorpayCheckout
        openingLede="Hang on while we open your payment window."
        keyId={razorpayKeyId()}
        target={{ kind: "subscription", subscriptionId: checkout.successor.providerSubscriptionId }}
        email={user.phone === null ? user.email : null}
        contact={user.phone}
        callbackUrl={new URL("/restore-account/keep-plan/callback", serverEnv().APP_ORIGIN).toString()}
        dismissHref={RESTORE_ACCOUNT_PATH}
      />
    );
  }

  // The fake provider's stand-in for Razorpay's window; any other provider has no such page.
  if (provider.name !== "fake") notFound();
  const { token } = await searchParams;
  const verified = typeof token === "string" ? await verifyKeepCheckoutFor(provider, user.id, { token }) : null;
  if (typeof token !== "string" || verified === null) {
    return (
      <TestCheckoutRefused lede="This checkout link has expired or isn’t for your account, so nothing has been recorded.">
        <LinkButton href={RESTORE_ACCOUNT_PATH}>Back to Restore your account</LinkButton>
      </TestCheckoutRefused>
    );
  }
  const checkoutToken = token;

  async function confirm(): Promise<void> {
    "use server";
    await requireSignedIn();
    const current = await findClosingAccount();
    if (current === null) redirect("/login");
    const again = await verifyKeepCheckoutFor(getBillingProvider(), current.user.id, { token: checkoutToken });
    if (again === null) redirect(RESTORE_ACCOUNT_PATH);
    await confirmKeptPlan(again.checkout.successor.id, new Date());
    redirect("/");
  }

  const { startAt } = verified.checkout.successor;
  return (
    <TestCheckout
      rows={[{ label: "Amount", value: formatMoney(verified.amountCents, verified.currency) }]}
      note={`This page stands in for the payment provider while payments are simulated. Nothing is taken now${startAt === null ? "" : `; the first payment is on ${formatDate(startAt)}`}.`}
      action={confirm}
      cancelHref={RESTORE_ACCOUNT_PATH}
      submitLabel="Confirm"
    />
  );
}
