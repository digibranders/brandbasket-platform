import type { ReactElement, ReactNode } from "react";
import { SummaryCard } from "./summary-card";
import type { PaymentMethodView } from "@/lib/billing/payment-method-view";

interface PaymentMethodProps {
  readonly view: PaymentMethodView;
  /** The support address as a mailto link (the page's EmailUs). */
  readonly emailUs: ReactNode;
}

/**
 * How the customer pays, in the words the tax invoice uses. Only what a merchant is shown: never more than the last four
 * digits of a card, and no issuing bank (Razorpay sends a code for it, not a name). Changing the card is not built: Razorpay's
 * subscription update documents the plan, the quantity and the dates, not the payment method, so the way to change it is a message to us.
 */
export function PaymentMethod({ view, emailUs }: PaymentMethodProps): ReactElement {
  return (
    <SummaryCard id="payment-method" title="Payment method">
      {view.kind === "bank-transfer" ? (
        <div className="space-y-2 text-[0.9375rem] leading-relaxed text-ink">
          <p>You pay us by bank transfer. We record each payment when it reaches us.</p>
          {view.reference === null ? null : <p className="break-words text-ink-2">Last reference: {view.reference}</p>}
        </div>
      ) : view.kind === "renews" ? (
        <div className="space-y-2 text-[0.9375rem] leading-relaxed text-ink">
          <p className="break-words font-medium">{view.label}</p>
          <p>Your plan renews automatically through Razorpay.</p>
          <p className="text-ink-2">To pay with a different card or UPI, email us at {emailUs} and we’ll send you a secure Razorpay link to switch.</p>
        </div>
      ) : (
        <p className="break-words text-[0.9375rem] leading-relaxed text-ink">You last paid with {view.label}. You choose how to pay each time.</p>
      )}
    </SummaryCard>
  );
}
