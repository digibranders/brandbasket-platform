import { chargedAmountCents } from "@brandbasket/billing";
import type { BundledAddOn } from "@brandbasket/db";
import { addOnById, MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { listTotalCents } from "@brandbasket/shared/lib/billing/packages";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";

/** What the customer is shown before a service is dropped from the plan's payment. */
export interface DropPreview {
  /** The services that stay, in the catalogue's order. */
  readonly keeps: readonly MonthlyAddOnId[];
  /** The monthly payment from the next bill: the services that stay at list price, GST included in rupees. */
  readonly newMonthlyCents: number;
  readonly currency: MoneyCurrency;
  readonly taxRateBasisPoints: number;
  /** Dropping ends a package price and ad credit the business still has: false once the offer is already given up. */
  readonly endsPackage: boolean;
}

/**
 * What dropping `dropping` would leave, from the lines that are staying now (removeBundledAddOn in
 * @brandbasket/shared/server/basket-change does the same on the server, from the database). Null when it is the only
 * service: stopping that is cancelling, so no drop is offered. The figures are display only; the server prices again.
 */
export function dropPreview(input: {
  readonly staying: readonly Pick<BundledAddOn, "addOn" | "listAmountCents" | "taxRateBasisPoints">[];
  readonly dropping: MonthlyAddOnId;
  readonly forfeited: boolean;
  readonly currency: MoneyCurrency;
}): DropPreview | null {
  const kept = input.staying.filter((line) => line.addOn !== input.dropping);
  const taxRateBasisPoints = kept[0]?.taxRateBasisPoints;
  if (taxRateBasisPoints === undefined) return null;
  return {
    keeps: MONTHLY_ADD_ON_IDS.filter((id) => kept.some((line) => line.addOn === id)),
    newMonthlyCents: chargedAmountCents(listTotalCents(kept), 0, taxRateBasisPoints),
    currency: input.currency,
    taxRateBasisPoints,
    endsPackage: !input.forfeited,
  };
}

/** Said before a package price and ad credit are given up, word for word as the owner's plan has it. */
export const PACKAGE_ENDS = "Your package price and ad credit end for good. Adding a service again later will be at its own price.";

/** The sentences of the confirm step: what stays, what is paid from the next bill, and what is lost when a package ends. */
export interface DropCopy {
  readonly keeps: string;
  readonly monthly: string;
  /** Null when the business has no package to lose. */
  readonly packageEnds: string | null;
}

/** "You keep Managed Website and Social Media and Ads." / "From 12 November 2026 you pay ₹15,340 a month, GST included." */
export function dropCopy(preview: DropPreview, nextBillingOn: string): DropCopy {
  const titles = preview.keeps.map((id) => addOnById(id).title);
  const tax = preview.taxRateBasisPoints > 0 ? ", GST included" : "";
  return {
    keeps: `You keep ${titles.join(" and ")}.`,
    monthly: `From ${nextBillingOn} you pay ${formatMoney(preview.newMonthlyCents, preview.currency)} a month${tax}.`,
    packageEnds: preview.endsPackage ? PACKAGE_ENDS : null,
  };
}
