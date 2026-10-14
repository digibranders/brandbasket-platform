/**
 * What a customer is actually charged: a plan's net price, less any referral discount, with the plan's tax added
 * on top. The one place this is worked out, so the price shown, the amount Razorpay is set up to take, the amount
 * the webhook expects and the amount recorded against the payment can never be computed four different ways.
 *
 * Tax rates are held in basis points (1800 is 18%) so they stay whole numbers, like every amount of money here.
 */

/** India's GST on this service, in basis points. */
export const GST_BASIS_POINTS = 1_800;

/** No tax of ours: dollar prices outside India. */
export const NO_TAX = 0;

const BASIS_POINTS = 10_000;
/** Adding half the divisor before flooring rounds half a minor unit up, and anything less down. */
const HALF = BASIS_POINTS / 2;

function assertWholeNonNegative(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a whole, non-negative number, received ${value}`);
  }
}

/**
 * `netAmountCents` less `discountAmountCents`, with `taxRateBasisPoints` of tax added, in whole minor units.
 *
 * The discount comes off **before** tax, because GST is charged on what is actually sold: a ₹500 code on the
 * ₹2,999 plan is ₹2,499 plus 18%, which is ₹2,948.82, not ₹3,538.82 less ₹500. Tax that lands on a fraction of a
 * minor unit is rounded half up. Nothing outside this function computes the figure, and the Razorpay plan a
 * customer is subscribed to is created from it, so the provider and our expectation agree by construction.
 */
export function chargedAmountCents(
  netAmountCents: number,
  discountAmountCents: number,
  taxRateBasisPoints: number,
): number {
  assertWholeNonNegative(netAmountCents, "A net amount");
  assertWholeNonNegative(discountAmountCents, "A discount");
  assertWholeNonNegative(taxRateBasisPoints, "A tax rate");
  const taxable = netAmountCents - discountAmountCents;
  if (taxable <= 0) {
    throw new RangeError(`A discount of ${discountAmountCents} leaves nothing to charge against ${netAmountCents}`);
  }
  return Math.floor((taxable * (BASIS_POINTS + taxRateBasisPoints) + HALF) / BASIS_POINTS);
}
