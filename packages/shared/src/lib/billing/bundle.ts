import type { MoneyCurrency } from "../money";
import { addOnById, MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "./add-ons";
import { packageLines } from "./packages";

/**
 * The services taken at the first checkout are billed inside one subscription: one payment now, and one every month for
 * them together (docs/superpowers/specs/2026-10-15-checkout-bundle-design.md). Two or more are priced as a package
 * (packages.ts). Pure and browser-safe, so the page, the server and the invoice all price a bundle the same way.
 */

/** One bundled service as the checkout freezes it. All amounts in minor units of the plan's currency, before any tax. */
export interface BundleLine {
  readonly addOn: MonthlyAddOnId;
  readonly title: string;
  readonly listCents: number;
  /** The package discount taken off the list price, or 0 for a service bought alone. */
  readonly offerCents: number;
  /** List less the discount: what is added to the subscription's net price each month. */
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

/** The lines of a first-checkout bundle in the plan's currency, each with the package discount, in the catalogue's order. */
export function bundleLines(selection: readonly MonthlyAddOnId[], currency: MoneyCurrency): readonly BundleLine[] {
  return packageLines({ services: selection, forfeited: false }, currency).map((line) => ({
    addOn: line.addOn,
    title: addOnById(line.addOn).title,
    listCents: line.listCents,
    offerCents: line.offerCents,
    netCents: line.netCents,
  }));
}

/** What a bundle adds to the plan's net monthly price, before GST. */
export function bundleNetCents(lines: readonly Pick<BundleLine, "netCents">[]): number {
  return lines.reduce((total, line) => total + line.netCents, 0);
}

/**
 * What the website alone nets a month at list, before GST: what a reactivation or a payment recorded by hand charges, since
 * the plan row itself costs nothing.
 */
export function websiteAloneNetCents(currency: MoneyCurrency): number {
  return bundleNetCents(bundleLines(WEBSITE_ALONE, currency));
}

/**
 * What the add-ons cost a month from the next renewal: the amount after any the customer has asked to remove have stopped,
 * or the current one when none are waiting. What the billing page says the next payment is, and what a plan change made now
 * must keep.
 */
export function nextBundledNetCents(subscription: {
  readonly bundledAddOnNetCents: number;
  readonly pendingBundledAddOnNetCents: number | null;
}): number {
  return subscription.pendingBundledAddOnNetCents ?? subscription.bundledAddOnNetCents;
}
