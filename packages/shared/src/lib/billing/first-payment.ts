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

/** The service a build fee comes with: its own first month is the one the fee replaces (plan 65, owner decision D5). */
export const BUILD_FEE_ADD_ON = "managed-website" satisfies AddOnId;

export interface FirstPaymentInput {
  readonly lines: readonly FirstPaymentLine[];
  readonly interval: BillingInterval;
  readonly provider: BillingProviderName;
  readonly currency: MoneyCurrency;
  /** What the referral code takes off each cycle, 0 with none. */
  readonly discountCents: number;
  /**
   * The website build fee less its deal discount (plan 65), or absent when none is owed. 0 is a waived fee: the checkout is then the
   * ordinary one, with no free month.
   */
  readonly setupFeeNetCents?: number;
}

export type FirstPaymentPlan =
  /** No service is on the offer and no fee is owed: the first payment is the ordinary one and the subscription starts now. */
  | { readonly kind: "ordinary" }
  /**
   * The first payment is `firstPaymentCents`, taken upfront; each offer service costs `trialPriceByAddOn`; the provider's subscription
   * starts `firstChargeMonths` after the payment.
   */
  | {
      readonly kind: "offer";
      readonly firstPaymentCents: number;
      readonly trialPriceByAddOn: Readonly<Record<string, number>>;
      /** Months from the payment to the provider's first full charge: 1, or 13 for a yearly build-fee deal (owner decision D6). */
      readonly firstChargeMonths: number;
      /** Services this payment does not charge: the website, on a monthly build-fee deal (D5). */
      readonly deferredAddOns: readonly AddOnId[];
      /** The part of `discountCents` this payment took. The checks after payment subtract this, never the whole discount. */
      readonly firstPaymentDiscountCents: number;
    }
  /** A code with nothing to take off the first payment: it would be worth more than the services that pay full price. The owner's rule: refused. */
  | { readonly kind: "code-refused" };

const sum = (lines: readonly FirstPaymentLine[]): number => lines.reduce((total, line) => total + line.netCents, 0);

export function planFirstPayment(input: FirstPaymentInput): FirstPaymentPlan {
  const fee = input.setupFeeNetCents ?? 0;
  if (!Number.isSafeInteger(fee) || fee < 0) throw new RangeError(`A build fee must be whole, non-negative minor units, received ${fee}`);
  if (input.setupFeeNetCents !== undefined && !input.lines.some((line) => line.addOn === BUILD_FEE_ADD_ON)) {
    throw new RangeError("A build fee needs Website Management in the basket");
  }
  if (fee > 0) return withBuildFee(input, fee);

  const trialPriceCentsOfOne = trialPriceCents(input.currency);
  const onOffer = input.lines.filter((line) => trialEligible({ service: line.addOn, interval: input.interval, provider: input.provider, hadService: line.hadService }));
  if (onOffer.length === 0) return { kind: "ordinary" };

  const fullPriceNet = sum(input.lines.filter((line) => !onOffer.includes(line)));
  if (input.discountCents > fullPriceNet) return { kind: "code-refused" };

  return {
    kind: "offer",
    firstPaymentCents: fullPriceNet + onOffer.length * trialPriceCentsOfOne - input.discountCents,
    trialPriceByAddOn: Object.fromEntries(onOffer.map((line) => [line.addOn, trialPriceCentsOfOne])),
    firstChargeMonths: 1,
    deferredAddOns: [],
    firstPaymentDiscountCents: input.discountCents,
  };
}

function withBuildFee(input: FirstPaymentInput, fee: number): FirstPaymentPlan {
  if (input.interval === "year") {
    // D6: the fee and every service's whole year today; the whole basket renews 13 months on, so the website's year runs from month two.
    // A code is refused here: settling a yearly code after payment moves the provider's plan, which Razorpay refuses for card and UPI
    // subscriptions. Staff discount the build fee of a yearly deal instead (plan 65, amended 2026-11-27).
    if (input.discountCents > 0) return { kind: "code-refused" };
    return {
      kind: "offer",
      firstPaymentCents: fee + sum(input.lines),
      trialPriceByAddOn: {},
      firstChargeMonths: 13,
      deferredAddOns: [],
      firstPaymentDiscountCents: 0,
    };
  }
  // D5: the fee and the other services' first month, at list or on their first-month offer. The website's own price starts a month on,
  // and so does the code: it keeps all its months and takes nothing off today's payment.
  const others = input.lines.filter((line) => line.addOn !== BUILD_FEE_ADD_ON);
  const trialPriceCentsOfOne = trialPriceCents(input.currency);
  const onOffer = others.filter((line) => trialEligible({ service: line.addOn, interval: input.interval, provider: input.provider, hadService: line.hadService }));
  return {
    kind: "offer",
    firstPaymentCents: fee + sum(others.filter((line) => !onOffer.includes(line))) + onOffer.length * trialPriceCentsOfOne,
    trialPriceByAddOn: Object.fromEntries(onOffer.map((line) => [line.addOn, trialPriceCentsOfOne])),
    firstChargeMonths: 1,
    deferredAddOns: [BUILD_FEE_ADD_ON],
    firstPaymentDiscountCents: 0,
  };
}
