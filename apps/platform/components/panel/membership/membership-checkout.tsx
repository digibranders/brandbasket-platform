import type { ReactElement } from "react";
import { supportEmailOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { EmailUs } from "@/components/panel/email-us";
import { PAYMENT_RECEIVED_MESSAGE } from "@brandbasket/shared/lib/billing/payment-step";
import { PaymentWaiting } from "@/components/panel/payment-waiting";
import { isWaitingOnPayment, unsettledCheckout, type MembershipPaymentNotice } from "@/lib/membership";
import type { GrantedCustomer } from "@/lib/server/customer-access";
import type { MembershipCheckoutView } from "@/lib/server/membership-checkout";

interface MembershipCheckoutProps {
  readonly view: MembershipCheckoutView;
  /** What the address says about a payment the customer was sent back from, or null. */
  readonly notice: MembershipPaymentNotice | null;
  readonly billing: GrantedCustomer["billing"];
}

/**
 * What the plan's page says instead of the checkout when the account cannot pay: its payment is on its way, is under review,
 * or no plan is on sale. The checkout itself, with the code and the invoice details, is checkout-ledger.tsx.
 *
 * An account whose payment is on its way, or under review, is told so and offered nothing to pay: a second payment
 * for the same plan would only be refused.
 */
export async function MembershipCheckout({ view, notice, billing }: MembershipCheckoutProps): Promise<ReactElement | null> {
  const { plan } = view;
  // Only an account with a checkout open can be waiting to hear about a payment: the address alone is not believed.
  const checkout = unsettledCheckout(billing.subscription);
  const waiting = checkout !== null && isWaitingOnPayment(billing.subscription, notice);

  if (billing.paymentUnderReview) {
    return (
      <p role="status" className="rounded-control bg-paper-deep px-4 py-3 text-sm text-ink">
        {PAYMENT_RECEIVED_MESSAGE}
      </p>
    );
  }
  if (waiting) {
    return (
      <PaymentWaiting
        waitKey={`membership:${checkout.id}`}
        waitingText="We’ve received your payment. Opening your membership…"
        delayedText="Opening your membership is taking longer than usual."
        supportEmail={supportEmailOf(await requestBrand())}
      />
    );
  }
  if (plan === null) {
    return (
      <p className="text-sm leading-relaxed text-ink-soft">
        We can&rsquo;t take payment for this plan just yet. Email us at <EmailUs /> and we&rsquo;ll sort it out.
      </p>
    );
  }
  // An account that can pay is shown the checkout, not this.
  return null;
}
