import type { ReactElement } from "react";
import { supportEmailOf } from "@/lib/brand";
import { requestBrand } from "@/lib/server/request-brand";
import { EmailUs } from "@/components/panel/email-us";
import { PAYMENT_RECEIVED_MESSAGE } from "@brandbasket/shared/lib/billing/payment-step";
import { describeDiscountedPlanTerms, discountedFirstPaymentAmount } from "@brandbasket/shared/lib/billing/terms";
import { BillingDetails } from "@/components/panel/billing/billing-details";
import { MembershipPayForm } from "@/components/panel/membership/membership-pay-form";
import { PaymentWaiting } from "@/components/panel/payment-waiting";
import { ReferralCodeForm } from "@/components/panel/referral-code-form";
import { isWaitingOnPayment, unsettledCheckout, type MembershipPaymentNotice, type MembershipTier } from "@/lib/membership";
import type { GrantedCustomer } from "@/lib/server/customer-access";
import type { MembershipCheckoutView } from "@/lib/server/membership-checkout";
import { applyMembershipCode, removeMembershipCode, startMembership } from "@/app/app-host/(protected)/plan/actions";

interface MembershipCheckoutProps {
  readonly tier: MembershipTier;
  readonly view: MembershipCheckoutView;
  /** What the address says about a payment the customer was sent back from, or null. */
  readonly notice: MembershipPaymentNotice | null;
  readonly billing: GrantedCustomer["billing"];
  /** False when the page draws the order summary and the Pay button itself (membership-page.tsx). Defaults to true. */
  readonly includePay?: boolean;
}

/**
 * The way to pay for one plan, for a free listing account: a code, the invoice details and the Pay button, or, when
 * the account cannot pay, the reason. Shared by the plan's own page and the Upgrade page, so both show the same price
 * and open the same checkout.
 *
 * An account whose payment is on its way, or under review, is told so and offered nothing to pay: a second payment
 * for the same plan would only be refused.
 */
export async function MembershipCheckout({ tier, view, notice, billing, includePay = true }: MembershipCheckoutProps): Promise<ReactElement> {
  const { plan, discount, lapsedCode, billingDetails } = view;
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
  return (
    <>
      <div className="max-w-xl space-y-6">
        {notice === "failed" ? (
          <p role="alert" className="rounded-control bg-accent-pale px-4 py-3 text-sm text-accent-deep">
            We couldn&rsquo;t confirm that payment, so nothing has been recorded. You can try again below.
          </p>
        ) : null}
        <ReferralCodeForm
          applyAction={applyMembershipCode}
          removeAction={removeMembershipCode}
          discount={discount}
          currency={plan.currency}
          label="Have a code?"
          lapsedCode={lapsedCode}
          compact
        />
        {billingDetails === null ? null : <BillingDetails view={billingDetails} variant="checkout" />}
        {includePay ? <p className="text-sm leading-relaxed text-ink-soft">{describeDiscountedPlanTerms(plan, discount)}</p> : null}
      </div>
      {includePay ? (
        <div className="pointer-events-none sticky bottom-0 z-10 pb-4 pt-3">
          <div className="pointer-events-auto [&_button]:shadow-[0_10px_28px_-10px_rgb(20_20_30/0.55)]">
            <MembershipPayForm action={startMembership} amount={discountedFirstPaymentAmount(plan, discount)} tier={tier} />
          </div>
        </div>
      ) : null}
    </>
  );
}
