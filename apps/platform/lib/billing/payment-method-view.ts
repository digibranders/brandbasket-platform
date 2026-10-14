import type { CurrentPaymentMethod, Subscription } from "@fynix/db";
import { paymentLabel } from "@fynix/shared/lib/billing/payment-method";

/**
 * What Billing's Payment method section says, worked out from the newest payment and the plan. Plain data and no
 * database or request access, so the choice between the three wordings is tested without either; the component draws it.
 */
export type PaymentMethodView =
  /** Staff record each bank transfer by hand, so there is nothing automatic to say. */
  | { readonly kind: "bank-transfer"; readonly reference: string | null }
  /** The provider takes the next payment on this card, UPI or account by itself. */
  | { readonly kind: "renews"; readonly label: string }
  /** The customer pays by hand each time: the plan is not billed by the provider, or has lapsed, or this was a paid extra. */
  | { readonly kind: "last-paid"; readonly label: string };

/** The part of the plan's billing state that decides whether the next payment is taken by itself. */
export interface RenewalFacts {
  readonly status: "paid" | "lapsed" | "unpaid";
  readonly subscription: Pick<Subscription, "provider" | "cancelRequestedAt"> | null;
}

/**
 * The plan renews by itself at the provider: it is paid, billed by a provider (not by hand), and nobody has asked for it to
 * end with the paid period.
 */
export function renewsAutomatically({ status, subscription }: RenewalFacts): boolean {
  return (
    status === "paid" &&
    subscription !== null &&
    subscription.provider !== "manual" &&
    subscription.cancelRequestedAt === null
  );
}

/** The payments that pay for the plan itself. A paid extra or a charge staff recorded is a one-off and is not one of them. */
const PLAN_PAYMENT_KINDS: readonly CurrentPaymentMethod["kind"][] = ["initial", "renewal", "reactivation"];

/**
 * Which wording fits. A paid extra, or a charge staff recorded by hand, may have been paid some other way than the plan
 * is, so it is never presented as the renewal method, and never as "you pay by bank transfer" to a customer whose plan the
 * provider renews. The page asks only for plan payments in that case; this holds the line if one slips through.
 */
export function paymentMethodView(method: CurrentPaymentMethod, renews: boolean): PaymentMethodView {
  const paysForPlan = PLAN_PAYMENT_KINDS.includes(method.kind);
  const label = paymentLabel(method);
  if (method.provider === "manual") {
    return paysForPlan || !renews ? { kind: "bank-transfer", reference: method.manualReference } : { kind: "last-paid", label };
  }
  return renews && paysForPlan ? { kind: "renews", label } : { kind: "last-paid", label };
}
