import "server-only";
import {
  attachProviderPlan,
  findActivePlan,
  largestLiveReferralDiscount,
  listActivePlans,
  listPriceChanges,
  planVersionCode,
  replaceMonthlyPrice,
  updateExtraPrices,
  type Plan,
  type PriceChange,
} from "@firstfold/db";
import type { PriceSheet } from "@firstfold/shared/lib/billing/pricing-form";
import { deploymentBrandShortName } from "@firstfold/shared/lib/deployment-brand";
import { describeError } from "@firstfold/shared/server/billing-log";
import { getBillingProvider } from "./billing-provider";
import { getStaffDb } from "./db";

/** What the payment provider's checkout calls a plan, in this deployment's brand: "Fynix Care plan (INR)". */
export function providerPlanItemName(tier: "care" | "premium", currency: string, env: Readonly<Record<string, string | undefined>> = process.env): string {
  return `${deploymentBrandShortName(env)} ${tier === "care" ? "Care" : "Premium"} plan (${currency})`;
}

/** How many past price changes the pricing page lists. */
const PRICE_CHANGES_SHOWN = 30;

export async function listPricingPlans(): Promise<Plan[]> {
  return listActivePlans(getStaffDb());
}

export async function listRecentPriceChanges(): Promise<PriceChange[]> {
  return listPriceChanges(getStaffDb(), PRICE_CHANGES_SHOWN);
}

/** What saving a plan's prices did. */
export type PriceUpdateOutcome =
  | { readonly kind: "updated"; readonly monthlyChanged: boolean; readonly extrasChanged: number }
  | { readonly kind: "unchanged" }
  | { readonly kind: "no-plan" }
  /** The monthly price would leave a live referral code nothing to charge. Nothing was changed. */
  | { readonly kind: "below-referral"; readonly largestDiscountCents: number }
  /** The provider refused to create the new plan. Nothing was changed. */
  | { readonly kind: "provider-failed" };

/**
 * Saves one plan's prices in one currency from the staff console. Everything is checked before anything changes. A new monthly
 * price goes to the payment provider first (a new Razorpay plan at the taxed amount): if that fails, nothing here
 * changes; if it succeeds, a new plan version takes over for new sign-ups and existing subscribers keep theirs.
 * Extra prices are then set on every plan in the currency. Every change is logged against the signed-in staff user.
 */
export async function savePriceSheet(
  input: { readonly sheet: PriceSheet; readonly staffUserId: string },
  now: Date,
): Promise<PriceUpdateOutcome> {
  const db = getStaffDb();
  const { sheet } = input;
  const current = await findActivePlan(db, sheet.currency, sheet.tier);
  if (current === null) return { kind: "no-plan" };

  const monthlyChanged = current.recurringAmountCents !== sheet.monthlyCents;
  if (monthlyChanged) {
    const largest = await largestLiveReferralDiscount(db, sheet.currency, now);
    if (sheet.monthlyCents <= largest) return { kind: "below-referral", largestDiscountCents: largest };

    const code = planVersionCode(sheet.currency, sheet.tier, now);
    let providerPlanId: string | null;
    try {
      ({ providerPlanId } = await getBillingProvider().createPlan({
        currency: sheet.currency,
        netMonthlyCents: sheet.monthlyCents,
        taxRateBasisPoints: current.taxRateBasisPoints,
        code,
        itemName: providerPlanItemName(sheet.tier, sheet.currency),
      }));
    } catch (error) {
      console.error(`[firstfold:pricing] could not create the provider plan for ${code}`, describeError(error));
      return { kind: "provider-failed" };
    }
    await replaceMonthlyPrice(db, {
      currency: sheet.currency,
      tier: sheet.tier,
      netMonthlyCents: sheet.monthlyCents,
      providerPlanId,
      staffId: input.staffUserId,
      now,
    });
  }

  // A price a migration put on sale (Care's, Premium's ₹9,999) has no provider plan yet, so the provider would refuse to
  // charge it. Saving it here is how it gets one: the plan the same price already is, given its provider plan, with
  // nothing about its price changed.
  let providerPlanFilled = false;
  if (!monthlyChanged && current.providerPlanId === null) {
    try {
      const { providerPlanId } = await getBillingProvider().createPlan({
        currency: sheet.currency,
        netMonthlyCents: current.recurringAmountCents,
        taxRateBasisPoints: current.taxRateBasisPoints,
        code: current.code,
        itemName: providerPlanItemName(current.tier, sheet.currency),
      });
      if (providerPlanId !== null) providerPlanFilled = await attachProviderPlan(db, { planId: current.id, providerPlanId });
    } catch (error) {
      console.error(`[firstfold:pricing] could not create the provider plan for ${current.code}`, describeError(error));
      return { kind: "provider-failed" };
    }
  }

  const extrasChanged = await updateExtraPrices(db, {
    currency: sheet.currency,
    prices: {
      extraHourAmountCents: sheet.extraHourCents,
      extraPublishAmountCents: sheet.extraPublishCents,
      extraBlogPostsAmountCents: sheet.extraBlogPostsCents,
    },
    staffId: input.staffUserId,
  });

  if (!monthlyChanged && !providerPlanFilled && extrasChanged.length === 0) return { kind: "unchanged" };
  return { kind: "updated", monthlyChanged: monthlyChanged || providerPlanFilled, extrasChanged: extrasChanged.length };
}
