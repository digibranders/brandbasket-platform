/**
 * The first-checkout offer: each add-on bought before the first plan payment (Social media, Outreach and lead generation, Paid advertising) is
 * 5% off for good. It is earned add-on by add-on: one not bought then stays at its full price. The plan itself is never
 * discounted by it. Pure and browser-safe. Which add-ons were claimed is read from the purchases themselves
 * (packages/db findLifetimeOfferStanding), so there is no flag to drift from the money.
 */

/** The owner's wording, in the two parts the card sets in different sizes. It names no one add-on: all three carry the offer. */
export const LIFETIME_OFFER_HEADLINE = "Add any package and get an additional 5% lifetime discount!";
export const LIFETIME_OFFER_NOTE = "This is a one-time offer available only during this checkout.";
export const LIFETIME_OFFER_TEXT = `${LIFETIME_OFFER_HEADLINE} ${LIFETIME_OFFER_NOTE}`;

export const LIFETIME_OFFER_PERCENT = 5;

const PERCENT_DENOMINATOR = 100;

/** The offer's worth against a net price in minor units: 5%, half a unit rounding up. */
export function lifetimeOfferCentsFor(netCents: number): number {
  if (!Number.isSafeInteger(netCents) || netCents < 0) {
    throw new RangeError(`A net price must be a whole, non-negative number of minor units, received ${netCents}`);
  }
  return Math.floor((netCents * LIFETIME_OFFER_PERCENT * 2 + PERCENT_DENOMINATOR) / (PERCENT_DENOMINATOR * 2));
}

/** Whether the checkout shows the offer: never after the first plan payment. */
export function lifetimeOfferVisible(input: { readonly hasEverPaid: boolean }): boolean {
  return !input.hasEverPaid;
}

/**
 * Whether a new purchase of an add-on is priced with the offer. Each add-on earns it on its own: bought at the first
 * checkout (before the first plan payment), or bought that way before, so a later purchase of the same add-on keeps it. An
 * add-on missed at the first checkout stays at its full price.
 */
export function lifetimeOfferApplies(input: { readonly hasEverPaid: boolean; readonly claimedBefore: boolean }): boolean {
  return input.claimedBefore || !input.hasEverPaid;
}
