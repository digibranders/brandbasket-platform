/** The code a lapsed client keeps when staff record their reactivation, as the hint beside the amount names it. */
export interface CarriedCodeHint {
  readonly code: string;
  /** The paid months the code's discount has left; null for no limit. */
  readonly monthsLeft: number | null;
}

/**
 * What the manual reactivation hint says about the coupon: "with no coupon" for a client who cancelled themselves or whose
 * code has run its months out, else the code taken off, with the months it has left.
 */
export function couponPhrase(carried: CarriedCodeHint | null): string {
  if (carried === null) return "with no coupon";
  const taken = `with their code ${carried.code} taken off`;
  if (carried.monthsLeft === null) return taken;
  return `${taken} (${carried.monthsLeft} ${carried.monthsLeft === 1 ? "month" : "months"} left)`;
}
