import type { BundledAddOn, Subscription } from "@brandbasket/db";
// The subpath, not the package index: this module reaches client components, and the index pulls in the database.
import { chargedAmountCents } from "@brandbasket/billing/tax";
import type { MoneyCurrency } from "../money";
import { addOnById, MONTHLY_ADD_ON_IDS, type AddOnPrice, type MonthlyAddOnId } from "./add-ons";
import { packageLines } from "./packages";

/**
 * The services taken at the first checkout are billed inside one subscription: one payment now, and one every month for
 * them together (docs/superpowers/specs/2026-10-15-checkout-bundle-design.md). Two or more are priced as a package
 * (packages.ts). Pure and browser-safe, so the page, the server and the invoice all price a bundle the same way.
 */

/** One bundled service as the checkout freezes it. All amounts in minor units of the plan's currency, GST included. */
export interface BundleLine {
  readonly addOn: MonthlyAddOnId;
  readonly title: string;
  readonly listCents: number;
  /** The package discount taken off the list price, or 0 for a service bought alone. */
  readonly offerCents: number;
  /** List less the discount: what is added to the subscription's price each month. */
  readonly netCents: number;
}

/**
 * Which services a posted or typed basket names: only catalogue ids, each once, in the catalogue's order. Anything else
 * is dropped, so a tampered form cannot name a service that does not exist or take one twice. The basket is the whole
 * subscription, the website included only when it is named.
 */
export function readBundleSelection(values: readonly string[]): readonly MonthlyAddOnId[] {
  const chosen = new Set(values);
  return MONTHLY_ADD_ON_IDS.filter((id) => chosen.has(id));
}

/** The basket a sign-up link or the plan's page sells when it names no service: the website alone. */
export const WEBSITE_ALONE: readonly MonthlyAddOnId[] = ["managed-website"];

/**
 * The lines of a first-checkout bundle in the plan's currency, each with the package discount, in the catalogue's order.
 * `forfeited` is a business that has given the package offer up for good: its lines are at list.
 */
export function bundleLines(selection: readonly MonthlyAddOnId[], currency: MoneyCurrency, forfeited = false): readonly BundleLine[] {
  return packageLines({ services: selection, forfeited }, currency).map((line) => ({
    addOn: line.addOn,
    title: addOnById(line.addOn).title,
    listCents: line.listCents,
    offerCents: line.offerCents,
    netCents: line.netCents,
  }));
}

/** What a bundle adds to the plan's monthly price, GST included. */
export function bundleNetCents(lines: readonly Pick<BundleLine, "netCents">[]): number {
  return lines.reduce((total, line) => total + line.netCents, 0);
}

/**
 * What the website alone costs a month at list, GST included: what Check and send and a payment recorded by hand for a first
 * purchase charge, since the plan row itself costs nothing.
 */
export function websiteAloneNetCents(currency: MoneyCurrency): number {
  return bundleNetCents(bundleLines(WEBSITE_ALONE, currency));
}

/**
 * What a service the plan holds costs a month, as the page and the console show it: its list price less the package offer it is
 * billed at from the next renewal. A line added or moved by a change keeps the price it was billed at until that renewal
 * (`offerDiscountAmountCents`) while the move waits in `pendingOfferDiscountAmountCents`, but the customer is told the amount
 * they will pay each month, which is the one the provider was told and the Billing page names. Without a move waiting it is
 * the line's own price. The same arithmetic as the database's next-renewal figure for a line (nextBundledNetCents in
 * @brandbasket/db), so the cards always add up to the next payment.
 */
export function bundledLinePrice(
  row: Pick<BundledAddOn, "listAmountCents" | "offerDiscountAmountCents" | "pendingOfferDiscountAmountCents" | "taxRateBasisPoints">,
  currency: MoneyCurrency,
): AddOnPrice {
  const discountCents = row.pendingOfferDiscountAmountCents ?? row.offerDiscountAmountCents;
  const netCents = row.listAmountCents - discountCents;
  return {
    currency,
    listCents: row.listAmountCents,
    discountCents,
    offerCents: discountCents,
    netCents,
    taxRateBasisPoints: row.taxRateBasisPoints,
    chargedCents: chargedAmountCents(netCents, 0),
  };
}

/**
 * What the services cost a month from the next renewal: the amount after any the customer has asked to remove have stopped,
 * or the current one when none are waiting. What the billing page says the next payment is, and what a plan change made now
 * must keep.
 */
export function nextBundledNetCents(subscription: {
  readonly bundledAddOnNetCents: number;
  readonly pendingBundledAddOnNetCents: number | null;
}): number {
  return subscription.pendingBundledAddOnNetCents ?? subscription.bundledAddOnNetCents;
}

/**
 * What the code takes off from the next renewal: the amount waiting (0 once the code's months have run out, or a percentage code
 * repriced after the basket changed) when there is one, else the amount it takes now. Pairs with `nextBundledNetCents`.
 */
export function nextDiscountCents(subscription: Pick<Subscription, "discountAmountCents" | "nextDiscountAmountCents">): number {
  return subscription.nextDiscountAmountCents ?? subscription.discountAmountCents;
}

/** What a reactivation needs to know of the business's newest subscription. */
export type LapsedSubscription = Pick<Subscription, "status" | "activatedAt" | "cancelRequestedAt" | "adCreditCents">;

/** What a reactivation needs to know of one of the lines of the subscription the business last paid for. */
export type LapsedLine = Pick<BundledAddOn, "addOn" | "activatedAt" | "endRequestedAt">;

/** The basket a reactivation restores. */
export interface ReactivationBasket {
  /** The services to bill again, once each, in the catalogue's order. */
  readonly services: readonly MonthlyAddOnId[];
  /** Priced at list: the business gave the package offer up, or its subscription was cancelled. */
  readonly forfeited: boolean;
  /** The monthly ad credit the lapsed subscription kept, or 0 when the offer is gone. Never grows. */
  readonly adCreditCents: number;
  /** The customer asked the plan to end (cancelRequestedAt), so its package offer ended with it. A cancel they did not ask for is a lapse. */
  readonly cancelled: boolean;
}

/**
 * The basket a reactivation restores (docs/plans/16-platform-pricing-offers.md): the services the lapsed subscription was
 * billing, at the offer they earn as a set, with the ad credit it kept. A failed payment loses none of that, and neither does a
 * mandate the customer revoked at their bank: the provider ending the subscription without the customer asking is a lapse.
 * Only a plan the customer asked to end (`cancelRequestedAt`) has no package left to restore: its services come back at list
 * with no ad credit, as the exit flow warns, and the customer chooses them again.
 *
 * Two subscriptions are read, because a reactivation checkout that was left unpaid or dropped sits between the business and the
 * one it last paid for. `subscription` is the newest, which carries the ad credit forward, and whose `cancelRequestedAt` says
 * whether the business cancelled (the loader reads it from the last paid subscription when the newest never took a payment): a
 * checkout that never took a payment and was then cancelled (by the provider, or dropped when the account was deleted) is not
 * a cancelled subscription. `lines` are those of the newest subscription a payment activated: the services it
 * billed, each one that was paid for and never asked to end. They are still there after a reactivation replaced it, which
 * ends the lines it holds but leaves when they were activated and asked to end.
 * With none, or no subscription, the website alone.
 *
 * The one place the checkout, the payment recorded by hand and the price on Billing take the basket from, so they agree.
 */
export function reactivationBasketOf(input: {
  readonly subscription: LapsedSubscription | null;
  readonly lines: readonly LapsedLine[];
  /** The business has dropped a service from a package for good (isPackageOfferForfeited). */
  readonly forfeited: boolean;
}): ReactivationBasket {
  const { subscription } = input;
  const cancelled = subscription !== null && subscription.cancelRequestedAt !== null;
  const staying = input.lines.filter((line) => line.activatedAt !== null && line.endRequestedAt === null);
  const services = readBundleSelection(staying.map((line) => line.addOn));
  const forfeited = input.forfeited || cancelled;
  return {
    services: services.length === 0 ? WEBSITE_ALONE : services,
    forfeited,
    // The website alone, when nothing is left to restore, is not the package the credit was earned by.
    adCreditCents: forfeited || subscription === null || services.length === 0 ? 0 : subscription.adCreditCents,
    cancelled,
  };
}

/** What the basket costs a month, GST included. */
export function reactivationNetCents(basket: ReactivationBasket, currency: MoneyCurrency): number {
  return bundleNetCents(bundleLines(basket.services, currency, basket.forfeited));
}
