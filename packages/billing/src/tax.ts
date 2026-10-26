/**
 * What a customer is actually charged. Every price includes GST (owner, 2026-10-26; docs/plans/25-money-gst-and-offers.md),
 * so the charge is the price less any discount and nothing is added on top. The GST inside it is worked out from the
 * charge, never the other way round, which is how the invoice splits it. The one place this is worked out, so the price
 * shown, the amount Razorpay is set up to take, the amount the webhook expects and the amount recorded against the payment
 * can never be computed several different ways.
 *
 * Tax rates are held in basis points (1800 is 18%) so they stay whole numbers, like every amount of money here.
 */

/** India's GST on this service, in basis points. */
export const GST_BASIS_POINTS = 1_800;

/** No tax of ours: dollar prices outside India. */
export const NO_TAX = 0;

const BASIS_POINTS = 10_000;

function assertWholeNonNegative(value: number, what: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${what} must be a whole, non-negative number, received ${value}`);
  }
}

/**
 * `priceCents` less `discountAmountCents`, in whole minor units: the price the customer pays, GST included. A ₹500 code
 * on the ₹2,999 plan is ₹2,499 paid. Nothing outside this function computes the figure, and the Razorpay plan a customer
 * is subscribed to is created from it, so the provider and our expectation agree by construction.
 */
export function chargedAmountCents(priceCents: number, discountAmountCents: number): number {
  assertWholeNonNegative(priceCents, "A price");
  assertWholeNonNegative(discountAmountCents, "A discount");
  const charged = priceCents - discountAmountCents;
  if (charged <= 0) {
    throw new RangeError(`A discount of ${discountAmountCents} leaves nothing to charge against ${priceCents}`);
  }
  return charged;
}

/**
 * The GST inside a price that includes it, in minor units. CGST and SGST are each the amount times half the rate over
 * (100% plus the rate), rounded half up, and are always equal, so the tax is always an even number: ₹2,999 holds ₹457.48
 * of GST (₹228.74 each) and ₹2,541.52 taxable. Across states the same figure is one IGST, so a sale is taxed the same
 * wherever the customer is. Throws RangeError for a rate that cannot split into two whole halves.
 */
export function gstInsideCents(chargedCents: number, taxRateBasisPoints: number): number {
  assertWholeNonNegative(chargedCents, "A charged amount");
  assertWholeNonNegative(taxRateBasisPoints, "A tax rate");
  if (taxRateBasisPoints === 0) return 0;
  if (taxRateBasisPoints % 2 !== 0) throw new RangeError(`A rate of ${taxRateBasisPoints} basis points cannot split into CGST and SGST`);
  const divisor = BASIS_POINTS + taxRateBasisPoints;
  // Rounding half up is floor((2a + b) / 2b) for a / b.
  const half = Math.floor((2 * chargedCents * (taxRateBasisPoints / 2) + divisor) / (2 * divisor));
  return half * 2;
}

/** What the customer's payment is worth before the GST inside it: the charge less `gstInsideCents`. */
export function taxableCents(chargedCents: number, taxRateBasisPoints: number): number {
  return chargedCents - gstInsideCents(chargedCents, taxRateBasisPoints);
}
