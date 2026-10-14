import type { Plan } from "@firstfold/db";
import { monthlyPaymentAmount } from "@firstfold/shared/lib/billing/terms";
import { membershipPriceParts, type MembershipTier } from "@/lib/membership";
import { BRANDS, type Brand } from "@/lib/brand";
import { planListFor } from "@/lib/plan-comparison";

/*
 * The words on the Upgrade page's two cards that do not depend on who is looking: what each plan is called, its
 * one-line pitch and its price. Pure, so the free and the Care versions of the page say the same things.
 */

export const PLAN_NAMES: Readonly<Record<MembershipTier, string>> = { care: "Care plan", premium: "Premium Membership" };

const PITCHES: Readonly<Record<MembershipTier, string>> = {
  care: "A fast website, chatbot and hosting, kept running for you.",
  premium: "Your listing, website and social media, all managed for you.",
};

/** Premium's pitch under a brand that does not sell the listing. */
const PREMIUM_PITCH_WITHOUT_LISTING = "Your website, appointments and social media, all managed for you.";

/** The card's price: the monthly figure before tax, what follows it, and what a month takes in all with GST. */
export function planCardPrice(plan: Plan | null): { readonly amount: string; readonly terms: string; readonly inAll: string | null } | null {
  if (plan === null) return null;
  const { amount, terms } = membershipPriceParts(plan);
  return { amount, terms, inAll: plan.taxRateBasisPoints === 0 ? null : `${monthlyPaymentAmount(plan)} in all, each month` };
}

/** What a card says before its action: the name, price, pitch and the list. */
export function planCardBase(
  tier: MembershipTier,
  plan: Plan | null,
  brand: Brand = BRANDS.firstfold,
): { readonly tier: MembershipTier; readonly name: string; readonly price: ReturnType<typeof planCardPrice>; readonly pitch: string; readonly list: readonly string[] } {
  return { tier, name: PLAN_NAMES[tier], price: planCardPrice(plan), pitch: tier === "premium" && !brand.showsListing ? PREMIUM_PITCH_WITHOUT_LISTING : PITCHES[tier], list: planListFor(tier, brand) };
}
