import type { ReactElement, ReactNode } from "react";
import { SectionHeading, Surface } from "@brandbasket/shared/ui/panel/surface";
import type { PaymentMethodView } from "@/lib/billing/payment-method-view";

interface PaymentMethodProps {
  readonly view: PaymentMethodView;
  /** `card` is its own card; `inline` sits inside another card (the plan's), with a small label instead of a heading. */
  readonly variant?: "card" | "inline";
  /** The support address as a mailto link (the page's EmailUs). */
  readonly emailUs: ReactNode;
}

/**
 * How the customer pays, in the words the tax invoice uses. Only what a merchant is shown: never more than the last four
 * digits of a card, and no issuing bank (Razorpay sends a code for it, not a name). Changing the card is not built, so the
 * way to do it is a message to us.
 */
export function PaymentMethod({ view, emailUs, variant = "card" }: PaymentMethodProps): ReactElement {
  const body = (
    <>
      {view.kind === "bank-transfer" ? (
        <div className="mt-4 space-y-2 text-sm leading-relaxed">
          <p>You pay us by bank transfer. We record each payment when it reaches us.</p>
          {view.reference === null ? null : <p className="break-words text-ink-soft">Last reference: {view.reference}</p>}
        </div>
      ) : view.kind === "renews" ? (
        <div className="mt-4 space-y-2 text-sm leading-relaxed">
          <p className="break-words text-[0.9375rem] font-medium text-ink">{view.label}</p>
          <p>Your plan renews on this automatically through Razorpay.</p>
          <p className="text-ink-soft">
            To pay with a different card or UPI, email us at {emailUs} and we’ll send you a secure Razorpay link to switch.
          </p>
        </div>
      ) : (
        <p className="mt-4 break-words text-sm leading-relaxed">
          You last paid with {view.label}. You choose how to pay each time.
        </p>
      )}
    </>
  );

  if (variant === "inline") {
    return (
      <div aria-labelledby="payment-method">
        <h3 id="payment-method" className="text-xs font-semibold text-ink-soft">
          Payment method
        </h3>
        <div className="-mt-1">{body}</div>
      </div>
    );
  }
  return (
    <Surface labelledBy="payment-method">
      <SectionHeading id="payment-method">Payment method</SectionHeading>
      {body}
    </Surface>
  );
}
