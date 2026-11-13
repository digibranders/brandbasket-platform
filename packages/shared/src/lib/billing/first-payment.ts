import type { BillingInterval, BillingProviderName } from "@brandbasket/db";
import type { MoneyCurrency } from "../money";
import type { AddOnId } from "./add-ons";
import { trialEligible, trialPriceCents } from "./trial";

/*
 * What a first checkout charges when some of its services are on the first-month offer (plan 63): Social Media and Paid Ads for
 * ₹1 or $1 a month for a business that never had them. The subscription at the provider is for the full monthly amount and
 * starts a month later; this month's payment is taken upfront when the customer approves, and it is this much. Pure, so the
 * checkout, the payment check and the tests read one rule.
 */

export interface FirstPaymentLine {
  readonly addOn: AddOnId;
  /** The line's full price for a month, GST included, at the package offer it is bought with. */
  readonly netCents: number;
  /** The business has had this service before, paid or on a trial, on any subscription. */
  readonly hadService: boolean;
}

export interface FirstPaymentInput {
  readonly lines: readonly FirstPaymentLine[];
  readonly interval: BillingInterval;
  readonly provider: BillingProviderName;
  readonly currency: MoneyCurrency;
  /** What the referral code takes off each month, 0 with none. */
  readonly discountCents: number;
}

export type FirstPaymentPlan =
  /** No service is on the offer: the first payment is the ordinary one and the subscription starts now. */
  | { readonly kind: "ordinary" }
  /** At least one is: the first payment is `firstPaymentCents`, each offer service costs `trialPriceByAddOn`, and the subscription starts a month on. */
  | {
      readonly kind: "offer";
      readonly firstPaymentCents: number;
      readonly trialPriceByAddOn: Readonly<Record<string, number>>;
    }
  /** A code with nothing to take off the first payment: it would be worth more than the services that pay full price. The owner's rule: refused. */
  | { readonly kind: "code-refused" };

export function planFirstPayment(input: FirstPaymentInput): FirstPaymentPlan {
  const trialPriceCentsOfOne = trialPriceCents(input.currency);
  const onOffer = input.lines.filter((line) =>
    trialEligible({ service: line.addOn, interval: input.interval, provider: input.provider, hadService: line.hadService }),
  );
  if (onOffer.length === 0) return { kind: "ordinary" };

  const fullPriceNet = input.lines.filter((line) => !onOffer.includes(line)).reduce((total, line) => total + line.netCents, 0);
  if (input.discountCents > fullPriceNet) return { kind: "code-refused" };

  return {
    kind: "offer",
    firstPaymentCents: fullPriceNet + onOffer.length * trialPriceCentsOfOne - input.discountCents,
    trialPriceByAddOn: Object.fromEntries(onOffer.map((line) => [line.addOn, trialPriceCentsOfOne])),
  };
}
