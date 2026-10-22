import type { ReferralDiscount, ReferralReward } from "@brandbasket/db";

/**
 * The rules a referral code obeys, with no database or provider behind them. A code takes a flat amount or a
 * percentage off every month of a subscription; the money it is worth is computed once, when the checkout opens,
 * and frozen on the subscription from then on (see packages/db's `subscriptions.discount_amount_cents`).
 *
 * Only `import type` from the database package: this module reaches client components through its own subpath,
 * and a value import would pull the database driver into the browser bundle.
 */

/** The longest a code may be. Long enough to be memorable, short enough to type on a phone. */
export const MAX_REFERRAL_CODE_LENGTH = 24;

/** The shortest. Two characters would collide with far too much of what a customer might type by accident. */
export const MIN_REFERRAL_CODE_LENGTH = 3;

/** A code always leaves something to charge: Razorpay cannot authorise a subscription for nothing. */
export const MIN_DISCOUNT_AMOUNT_CENTS = 1;

/** Percentages are held in basis points: 10000 is 100%, 1250 is 12.5%, 1 is 0.01%. */
export const BASIS_POINTS_PER_WHOLE = 10_000;

/** The largest percentage discount, 99%. 100% would leave Razorpay nothing to authorise. */
export const MAX_DISCOUNT_BASIS_POINTS = 9_900;

/** The largest percentage reward, 100%: the referrer may be given all of what the customer pays, never more. */
export const MAX_REWARD_BASIS_POINTS = BASIS_POINTS_PER_WHOLE;

const HALF_BASIS_POINTS = BASIS_POINTS_PER_WHOLE / 2;

function assertWholeNonNegative(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a whole, non-negative number, received ${value}`);
  }
}

function assertBasisPoints(basisPoints: number, max: number, what: string): void {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 1 || basisPoints > max) {
    throw new RangeError(`${what} must be between 1 and ${max} basis points, received ${basisPoints}`);
  }
}


const CODE_PATTERN = new RegExp(`^[A-Z0-9][A-Z0-9-]{${MIN_REFERRAL_CODE_LENGTH - 1},${MAX_REFERRAL_CODE_LENGTH - 1}}$`);

/**
 * What a customer typed, as it is stored: trimmed and uppercased. Returns null for anything that is not a code at
 * all, so a malformed one takes exactly the same path as an unknown one. The caller shows one message for both,
 * and the field never becomes an oracle for which codes exist.
 */
export function normaliseReferralCode(typed: string): string | null {
  const normalised = typed.trim().toUpperCase();
  return CODE_PATTERN.test(normalised) ? normalised : null;
}

/**
 * True when a code's discount can actually be charged against a plan: a whole, positive number of minor units
 * that still leaves something for Razorpay to authorise. Pass the resolved figure (discountCentsFor), not the code:
 * a percentage has already been rounded to whole minor units by then, so this is only a bounds check.
 *
 * Both amounts are in the same currency's minor units. The caller is responsible for that: a code carries its own
 * currency precisely so an INR discount is never measured against a USD plan.
 */
export function isChargeableDiscount(planAmountCents: number, discountAmountCents: number): boolean {
  if (!Number.isSafeInteger(planAmountCents) || planAmountCents <= 0) return false;
  if (!Number.isSafeInteger(discountAmountCents)) return false;
  return discountAmountCents >= MIN_DISCOUNT_AMOUNT_CENTS && discountAmountCents < planAmountCents;
}


/**
 * What a code's discount is worth in minor units against a basket's pre-tax price. The price is the basket's package net:
 * every service's list price less the package discount, added up, so a code is taken once, after the package offer (a
 * single service has no offer, so its net is its list price). A flat amount is itself, on any basket; a percentage is that
 * share of the net, rounded half up (half a paisa or cent and over rounds up, anything less down), in integer arithmetic so
 * no float ever touches the figure. 12.5% of ₹2,999 is 37,487.5 paise, so 37,488; 10% of the ₹10,398 that the website and Social Media and
 * Ads come to together at the 20% package price is ₹1,039.80.
 *
 * This is worked out at the moment a checkout opens and the result is frozen onto the subscription; nothing
 * re-derives it afterwards, so a later plan price change never alters what an existing customer pays. The result
 * may still fail isChargeableDiscount (a tiny share of a tiny price rounds to nothing), and every caller checks.
 */
export function discountCentsFor(discount: ReferralDiscount, basketNetCents: number): number {
  assertWholeNonNegative(basketNetCents, "A basket net");
  if (discount.kind === "amount") return discount.amountCents;
  assertBasisPoints(discount.basisPoints, MAX_DISCOUNT_BASIS_POINTS, "A percentage discount");
  return Math.floor((basketNetCents * discount.basisPoints + HALF_BASIS_POINTS) / BASIS_POINTS_PER_WHOLE);
}

/**
 * Our code for the provider plan a discount runs on: the base plan's code and the discount, "managed-inr-2026-10-less-
 * 29990". Recorded on the Razorpay plan, so anyone looking at it there can trace it back.
 */
export function discountPlanCode(basePlanCode: string, discountAmountCents: number): string {
  assertWholeNonNegative(discountAmountCents, "A discount");
  return `${basePlanCode}-less-${discountAmountCents}`;
}

/**
 * What an affiliate earns for one month, given what the member paid that month before GST and after their
 * discount. A flat reward is itself; a percentage is that share, rounded down, so an affiliate is never owed a
 * fraction of a minor unit that was never received.
 */
export function rewardCentsFor(reward: ReferralReward, customerPaysPreTaxCents: number): number {
  assertWholeNonNegative(customerPaysPreTaxCents, "A payment");
  if (reward.kind === "amount") return reward.amountCents;
  assertBasisPoints(reward.basisPoints, MAX_REWARD_BASIS_POINTS, "A percentage reward");
  return Math.floor((customerPaysPreTaxCents * reward.basisPoints) / BASIS_POINTS_PER_WHOLE);
}
