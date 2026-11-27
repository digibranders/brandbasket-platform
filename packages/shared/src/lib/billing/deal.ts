import type { BillingInterval } from "@brandbasket/db";
import type { MoneyCurrency } from "../money";
import type { MonthlyAddOnId } from "./add-ons";
import { type PriceOverrides, priceLinesFor } from "./packages";
import { wholeUnitShareCents } from "./setup-fee";
import type { WebsiteKind } from "./website-kind";

/*
 * Money rules of a staff deal (plan 66). Pure: the console form, the checkout and the activation read these, so the advance, the
 * balance and a custom price are worked out in one place.
 */

/** How staff state the advance of a paid deal: an amount, a share of the net price, or the whole price. */
export type DealAdvanceInput =
  | { readonly kind: "amount"; readonly cents: number }
  | { readonly kind: "percent"; readonly basisPoints: number }
  | { readonly kind: "full" };

export interface DealAmountsInput {
  readonly currency: MoneyCurrency;
  readonly kind: WebsiteKind;
  /** The build fee before any discount, minor units. */
  readonly listCents: number;
  readonly discountCents: number;
  readonly advance: DealAdvanceInput;
}

export interface DealAmounts {
  readonly listCents: number;
  readonly discountCents: number;
  /** List less discount: what the build costs the customer. */
  readonly netCents: number;
  /** Paid first, never refunded. */
  readonly advanceCents: number;
  /** Paid before go-live: net less advance. */
  readonly balanceCents: number;
}

const WHOLE = 10_000;

export function dealAmounts(input: DealAmountsInput): DealAmounts {
  const { listCents, discountCents, advance } = input;
  if (!Number.isSafeInteger(listCents) || listCents < 0) throw new RangeError(`A deal list price must be whole, non-negative minor units, received ${listCents}`);
  if (!Number.isSafeInteger(discountCents) || discountCents < 0 || discountCents > listCents) {
    throw new RangeError(`A deal discount must be whole minor units from 0 to ${listCents}, received ${discountCents}`);
  }
  const netCents = listCents - discountCents;
  if (netCents === 0) throw new RangeError("A waived build (net price 0) takes no advance");

  let advanceCents: number;
  switch (advance.kind) {
    case "amount":
      advanceCents = advance.cents;
      break;
    case "percent":
      if (!Number.isSafeInteger(advance.basisPoints) || advance.basisPoints < 0 || advance.basisPoints > WHOLE) {
        throw new RangeError(`An advance percentage must be whole basis points from 0 to ${WHOLE}, received ${advance.basisPoints}`);
      }
      advanceCents = wholeUnitShareCents(netCents, advance.basisPoints);
      break;
    case "full":
      advanceCents = netCents;
      break;
  }
  if (!Number.isSafeInteger(advanceCents) || advanceCents < 1 || advanceCents > netCents) {
    throw new RangeError(`An advance must be whole minor units from 1 to the net price ${netCents}, received ${advanceCents}`);
  }
  return { listCents, discountCents, netCents, advanceCents, balanceCents: netCents - advanceCents };
}

/** Custom prices a staff deal sets, minor units for the link's billing period, GST included. */
export type DealCustomPrices = PriceOverrides & {
  "managed-website"?: number;
  "social-media"?: number;
  "paid-ads"?: number;
  "expert-monitoring"?: number;
};

export interface DealLine {
  readonly addOn: MonthlyAddOnId;
  readonly listCents: number;
  readonly netCents: number;
  readonly isCustom: boolean;
}

export interface DealLinesInput {
  readonly services: readonly MonthlyAddOnId[];
  readonly interval: BillingInterval;
  readonly currency: MoneyCurrency;
  readonly kind: WebsiteKind;
  readonly customPrices: DealCustomPrices;
}

/** The deal's services priced for its period: the catalogue price, or the custom one where staff set it. */
export function dealLines(input: DealLinesInput): DealLine[] {
  return priceLinesFor({ services: input.services, forfeited: false }, input.currency, input.interval, input.kind, input.customPrices).map((line) => ({
    addOn: line.addOn,
    listCents: line.listCents,
    netCents: line.netCents,
    isCustom: input.customPrices[line.addOn] !== undefined,
  }));
}
