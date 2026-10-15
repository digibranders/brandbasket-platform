import { addOnById, addOnPrice, MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "./add-ons";

/**
 * The add-ons taken at the first checkout are billed inside the plan's own subscription: one payment now, and one every
 * month for the plan and these together (docs/superpowers/specs/2026-10-15-checkout-bundle-design.md). Each carries the 5%
 * lifetime offer. Pure and browser-safe, so the page, the server and the invoice all price a bundle the same way.
 */

/** One bundled add-on as the checkout freezes it. All amounts in paise, before GST. */
export interface BundleLine {
  readonly addOn: MonthlyAddOnId;
  readonly title: string;
  readonly listCents: number;
  /** The lifetime offer taken off the list price. */
  readonly offerCents: number;
  /** List less the offer: what is added to the plan's net price each month. */
  readonly netCents: number;
}

/**
 * Which add-ons a posted or typed choice names: only catalogue ids, each once, in the catalogue's order. Anything else is
 * dropped, so a tampered form cannot name an add-on that does not exist or take one twice.
 */
export function readBundleSelection(values: readonly string[]): readonly MonthlyAddOnId[] {
  const chosen = new Set(values);
  return MONTHLY_ADD_ON_IDS.filter((id) => chosen.has(id));
}

/** The lines of a bundle, each with the lifetime offer, in the catalogue's order. */
export function bundleLines(selection: readonly MonthlyAddOnId[]): readonly BundleLine[] {
  return readBundleSelection(selection).map((id) => {
    const price = addOnPrice(addOnById(id), false, true);
    return { addOn: id, title: addOnById(id).title, listCents: price.listCents, offerCents: price.offerCents, netCents: price.netCents };
  });
}

/** What a bundle adds to the plan's net monthly price, before GST. */
export function bundleNetCents(lines: readonly Pick<BundleLine, "netCents">[]): number {
  return lines.reduce((total, line) => total + line.netCents, 0);
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
