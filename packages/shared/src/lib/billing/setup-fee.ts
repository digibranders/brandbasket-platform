import type { MoneyCurrency } from "../money";
import { type WebsiteKind, websiteBuildFeeCents } from "./website-kind";

/** How staff state a deal's discount on the build fee: an amount off, a share off, or the price agreed. */
export type BuildDiscountInput =
  | { readonly kind: "amount"; readonly cents: number }
  | { readonly kind: "percent"; readonly basisPoints: number }
  | { readonly kind: "final"; readonly cents: number };

const MINOR = 100;
const WHOLE = 10_000;

function whole(value: number, what: string, max: number): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > max) throw new RangeError(`${what} must be a whole number from 0 to ${max}, received ${value}`);
}

/** A share of an amount in basis points, rounded down to a whole rupee or dollar. */
export function wholeUnitShareCents(cents: number, basisPoints: number): number {
  return Math.floor((cents * basisPoints) / WHOLE / MINOR) * MINOR;
}

/** What a deal takes off a build fee, in minor units: from nothing to the whole fee. A percentage rounds down to a whole rupee or dollar. */
export function buildDiscountCents(listCents: number, input: BuildDiscountInput): number {
  whole(listCents, "A build fee", Number.MAX_SAFE_INTEGER);
  switch (input.kind) {
    case "amount":
      whole(input.cents, "A build discount", listCents);
      return input.cents;
    case "percent":
      whole(input.basisPoints, "A build discount percentage", WHOLE);
      return wholeUnitShareCents(listCents, input.basisPoints);
    case "final":
      whole(input.cents, "An agreed build price", listCents);
      return listCents - input.cents;
  }
}

export interface SetupFee {
  readonly listCents: number;
  readonly discountCents: number;
  /** What the customer pays for the build: 0 when the fee is waived. */
  readonly netCents: number;
}

export function setupFeeFor(kind: WebsiteKind, currency: MoneyCurrency, discountCents: number): SetupFee {
  const listCents = websiteBuildFeeCents(kind, currency);
  whole(discountCents, "A build discount", listCents);
  return { listCents, discountCents, netCents: listCents - discountCents };
}
