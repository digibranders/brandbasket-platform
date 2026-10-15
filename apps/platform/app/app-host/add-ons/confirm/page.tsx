import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactElement } from "react";
import { addOnById, ADD_ONS_PATH } from "@fynix/shared/lib/billing/add-ons";
import { formatMoney } from "@fynix/shared/lib/money";
import { BrandedAuthScreen } from "@/components/panel/branded-auth-screen";
import { TestCheckoutForm } from "@/components/panel/test-checkout-form";
import { addOnPaymentLabel } from "@/lib/billing/add-on-label";
import { testCheckoutCopy } from "@/lib/billing/add-on-copy";
import { addOnConfirmationHref } from "@/lib/billing/add-on-notices";
import { isFakeBillingProvider } from "@/lib/server/billing";
import { confirmFakeAddOnPaymentFor, verifyAddOnPaymentFor } from "@/lib/server/add-ons";
import { requireCustomerAccess } from "@/lib/server/customer-access";

export const metadata: Metadata = {
  title: "Test payment",
  // The payment token is in this page's URL; it must not travel to anywhere this page links to.
  referrer: "no-referrer",
};

interface AddOnConfirmPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * The fake provider's stand-in for Razorpay's payment window, for a monthly add-on. It exists only while payments are
 * simulated (a 404 otherwise), and every check is repeated in the Pay action, which can be called directly. The link
 * is verified (signature, expiry, that it is this customer's business and their own add-on) before anything is shown,
 * and the token is never rendered: the Pay action captures it in a closure, which Next.js encrypts.
 */
export default async function AddOnTestCheckoutPage({ searchParams }: AddOnConfirmPageProps): Promise<ReactElement> {
  if (!isFakeBillingProvider()) notFound();
  const { tenant } = await requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" });

  const { token } = await searchParams;
  const verified = typeof token === "string" ? await verifyAddOnPaymentFor({ tenant }, token) : null;
  if (typeof token !== "string" || verified === null) {
    return (
      <BrandedAuthScreen
        title={
          <>
            Payment not <em>confirmed.</em>
          </>
        }
        lede="This payment link has expired or isn’t for your account, so nothing has been recorded."
      >
        <Link href={ADD_ONS_PATH} className="link-underline mt-2 inline-block">
          Back to Add-ons
        </Link>
      </BrandedAuthScreen>
    );
  }
  const paymentToken = token;
  const addOn = verified.addOn;

  async function pay(): Promise<void> {
    "use server";
    if (!isFakeBillingProvider()) notFound();
    const customer = await requireCustomerAccess({ listingAccount: "allow", membershipCheckout: "allow" });
    const result = await confirmFakeAddOnPaymentFor(customer, paymentToken, new Date());
    // A Keep it is only authorised here, so it reads as kept; the mapping lives with the other notices.
    redirect(addOnConfirmationHref(result.kind, addOn));
  }

  const amount = formatMoney(verified.amountCents, verified.currency);
  const copy = testCheckoutCopy(addOnById(verified.addOn).title, verified.startAt);
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
          <dd className="text-right font-medium">{addOnPaymentLabel(verified.addOn)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-ink-soft">Amount</dt>
          <dd className="text-right font-serif text-2xl tabular-nums">{amount}</dd>
        </div>
      </dl>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">{copy.body}</p>
      <div className="mt-6">
        <TestCheckoutForm action={pay} amount={amount} cancelHref={ADD_ONS_PATH} submitLabel={verified.startAt === null ? `${copy.buttonLabel} ${amount}` : copy.buttonLabel} />
      </div>
    </BrandedAuthScreen>
  );
}
