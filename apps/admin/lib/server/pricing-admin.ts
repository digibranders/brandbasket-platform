import "server-only";
import { findActivePlan, listActivePlans, listPriceChanges, updateExtraPrices, type Plan, type PriceChange } from "@brandbasket/db";
import type { PriceSheet } from "@brandbasket/shared/lib/billing/pricing-form";
import { getStaffDb } from "./db";

/** How many past price changes the pricing page lists. */
const PRICE_CHANGES_SHOWN = 30;

export async function listPricingPlans(): Promise<Plan[]> {
  return listActivePlans(getStaffDb());
}

export async function listRecentPriceChanges(): Promise<PriceChange[]> {
  return listPriceChanges(getStaffDb(), PRICE_CHANGES_SHOWN);
}

/** What saving a currency's extras did. */
export type PriceUpdateOutcome = { readonly kind: "updated"; readonly extrasChanged: number } | { readonly kind: "unchanged" } | { readonly kind: "no-plan" };

/**
 * Saves one currency's extra prices from the staff console, on every plan in the currency. The services themselves are priced
 * in code (the shared catalogue and package offers), so no plan row is created or repriced here and nothing goes to the
 * payment provider. Every change is logged against the signed-in staff user.
 */
export async function savePriceSheet(input: { readonly sheet: PriceSheet; readonly staffUserId: string }): Promise<PriceUpdateOutcome> {
  const db = getStaffDb();
  const { sheet } = input;
  if ((await findActivePlan(db, sheet.currency, sheet.tier)) === null) return { kind: "no-plan" };

  const extrasChanged = await updateExtraPrices(db, {
    currency: sheet.currency,
    prices: {
      extraHourAmountCents: sheet.extraHourCents,
      extraPublishAmountCents: sheet.extraPublishCents,
      extraBlogPostsAmountCents: sheet.extraBlogPostsCents,
    },
    staffId: input.staffUserId,
  });
  return extrasChanged.length === 0 ? { kind: "unchanged" } : { kind: "updated", extrasChanged: extrasChanged.length };
}
