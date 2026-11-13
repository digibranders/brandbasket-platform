import type { BillingInterval, BillingProviderName } from "@brandbasket/db";
// Subpath, not the package index: this module reaches client components, and the index pulls in the database.
import { addMonthsUtc } from "@brandbasket/billing/term";
import type { MoneyCurrency } from "../money";
import { MIN_ADD_REMAINING_MS, quoteAddOn, shareOf } from "./add-on-proration";
import type { AddOnId } from "./add-ons";
import { trialEligible, trialEndsAt, trialPriceCents } from "./trial";

/*
 * Adding a service after sign-up as one combined subscription (plan 63, Option Y). A running Razorpay subscription's amount cannot
 * change, so the customer approves a new one for the new total. It starts on the new billing date, and what falls before that is
 * paid upfront when they approve: the new service until then, and, when the date moves later, the services they already have from
 * the end of their paid period to the new date. Pure, so the page, the server and the tests share one rule.
 */

const MS_PER_DAY = 86_400_000;

export interface AddedServiceInput {
  readonly service: AddOnId;
  /** The new service's full monthly price, GST included. */
  readonly netCents: number;
  /** The business has had this service before, paid or on a trial. */
  readonly hadService: boolean;
  readonly interval: BillingInterval;
  readonly provider: BillingProviderName;
  readonly currency: MoneyCurrency;
  readonly now: Date;
  /** The month the customer has paid for: its end is the current billing date. */
  readonly period: { readonly start: Date; readonly end: Date };
  /** What each renewal takes now, GST and the code's discount included: the services they already have. */
  readonly currentRenewalCents: number;
}

export type AddedServicePlan =
  | {
      readonly kind: "plan";
      /** The new service is on the first-month offer. */
      readonly offer: boolean;
      /** The combined subscription's first full charge: the new billing date. */
      readonly newBillingDate: Date;
      /** The new service until the new billing date: ₹1 on the offer, else its share of the month left. */
      readonly serviceCents: number;
      /** The services already held, from the end of the paid period to the new billing date; 0 when the date does not move. */
      readonly extensionCents: number;
      readonly extensionDays: number;
      /** Everything taken when the customer approves. */
      readonly upfrontCents: number;
      /** What the offer service's first month costs, for its line; null when it is not on the offer. */
      readonly trialPriceCents: number | null;
    }
  /** Less than an hour of the paid month is left: the renewal is about to be taken, so it waits. */
  | { readonly kind: "refused"; readonly reason: "renewal-due" };

export function planAddedService(input: AddedServiceInput): AddedServicePlan {
  const { now, period } = input;
  if (period.end.getTime() - now.getTime() < MIN_ADD_REMAINING_MS) return { kind: "refused", reason: "renewal-due" };

  const offer = trialEligible({ service: input.service, interval: input.interval, provider: input.provider, hadService: input.hadService });
  if (!offer) {
    // The billing date stays: the service costs its share of the month that is left, as an add-on always has.
    const quote = quoteAddOn({ netCents: input.netCents, renewalNetCents: input.netCents, renewalDiscountCents: 0, period, now });
    if (quote.kind === "refused" || quote.free) return { kind: "refused", reason: "renewal-due" };
    return {
      kind: "plan",
      offer: false,
      newBillingDate: period.end,
      serviceCents: quote.chargeCents,
      extensionCents: 0,
      extensionDays: 0,
      upfrontCents: quote.chargeCents,
      trialPriceCents: null,
    };
  }

  // The offer runs one month from today, and the combined subscription starts when it ends.
  const offerEnds = trialEndsAt(now);
  const newBillingDate = offerEnds.getTime() > period.end.getTime() ? offerEnds : period.end;
  const gapMs = newBillingDate.getTime() - period.end.getTime();
  const extensionDays = gapMs > 0 ? Math.ceil(gapMs / MS_PER_DAY) : 0;
  const monthDays = Math.max(1, Math.round((addMonthsUtc(period.end, 1).getTime() - period.end.getTime()) / MS_PER_DAY));
  const extensionCents = extensionDays === 0 ? 0 : shareOf(input.currentRenewalCents, Math.min(extensionDays, monthDays), monthDays);
  const serviceCents = trialPriceCents(input.currency);
  return {
    kind: "plan",
    offer: true,
    newBillingDate,
    serviceCents,
    extensionCents,
    extensionDays,
    upfrontCents: serviceCents + extensionCents,
    trialPriceCents: serviceCents,
  };
}
