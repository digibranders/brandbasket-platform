import type { AccountExitReason } from "@firstfold/db";

/*
 * The delete-account flow's words and its one piece of arithmetic. Pure and free of the database, so the page's client
 * steps and the server action both read the same reasons, the same offer and the same price. Only types come from
 * the db package: a runtime import would pull the database into the browser.
 */

/** Keyed by reason so that adding one to the database enum fails to compile until it has a label and an offer. */
const REASONS: Readonly<Record<AccountExitReason, { readonly label: string; readonly offerPercent: number | null }>> = {
  too_expensive: { label: "It costs more than I can justify", offerPercent: 30 },
  not_enough_enquiries: { label: "I’m not getting enough enquiries", offerPercent: 20 },
  not_using: { label: "I’m not using it enough", offerPercent: 20 },
  missing_feature: { label: "It’s missing something I need", offerPercent: 15 },
  found_alternative: { label: "I’m moving to something else", offerPercent: 25 },
  closing_business: { label: "I’m closing the business", offerPercent: null },
  other: { label: "Something else", offerPercent: null },
};

/** Order matters: it is the order of the radio buttons. */
export const EXIT_REASON_ORDER = [
  "too_expensive",
  "not_enough_enquiries",
  "not_using",
  "missing_feature",
  "found_alternative",
  "closing_business",
  "other",
] as const satisfies readonly AccountExitReason[];

export const EXIT_REASON_OPTIONS: readonly { readonly value: AccountExitReason; readonly label: string }[] =
  EXIT_REASON_ORDER.map((value) => ({ value, label: REASONS[value].label }));

export function isExitReason(value: unknown): value is AccountExitReason {
  return typeof value === "string" && Object.hasOwn(REASONS, value);
}

/** The percentage off a reason is offered, or null when it is offered nothing (the person is closing down). */
export function retentionOfferPercent(reason: AccountExitReason): number | null {
  return REASONS[reason].offerPercent;
}

/** The most that referral codes and a stay offer may take off a month between them. */
export const MAX_TOTAL_DISCOUNT_PERCENT = 80;

const PERCENT_DENOMINATOR = 100;

/**
 * What the stay offer takes off the plan's net monthly price, in minor units: `percent` of the price, added to what a
 * referral code already takes off, but never pushing the total past MAX_TOTAL_DISCOUNT_PERCENT of the price. Null when
 * that leaves nothing to give (the code already takes the most), so no offer is made rather than a worthless one.
 */
export function retentionDiscountCentsFor(input: {
  readonly recurringAmountCents: number;
  readonly currentDiscountCents: number;
  readonly percent: number;
}): number | null {
  const { recurringAmountCents, currentDiscountCents, percent } = input;
  if (!Number.isSafeInteger(recurringAmountCents) || recurringAmountCents <= 0) {
    throw new RangeError(`The recurring amount must be a positive whole number of minor units, received ${recurringAmountCents}`);
  }
  if (!Number.isSafeInteger(currentDiscountCents) || currentDiscountCents < 0) {
    throw new RangeError(`The current discount must be a whole number of minor units, received ${currentDiscountCents}`);
  }
  if (!Number.isInteger(percent) || percent < 1 || percent > MAX_TOTAL_DISCOUNT_PERCENT) {
    throw new RangeError(`The offer must be a whole percentage from 1 to ${MAX_TOTAL_DISCOUNT_PERCENT}, received ${percent}`);
  }
  const ceiling = Math.floor((recurringAmountCents * MAX_TOTAL_DISCOUNT_PERCENT) / PERCENT_DENOMINATOR);
  const wanted = Math.round((recurringAmountCents * percent) / PERCENT_DENOMINATOR);
  const room = ceiling - currentDiscountCents;
  const given = Math.min(wanted, room);
  return given > 0 ? given : null;
}

/** The longest comment taken. The database enforces the same figure. */
export const EXIT_COMMENT_MAX_LENGTH = 1000;

/** The word that must be typed to confirm. A deliberate act, not a click that slips. */
export const DELETE_CONFIRMATION_WORD = "DELETE";
