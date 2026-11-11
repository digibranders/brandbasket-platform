import { bundleLines, bundleNetCents } from "@brandbasket/shared/lib/billing/bundle";
import type { MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { formatMoney, type MoneyCurrency } from "@brandbasket/shared/lib/money";
import type { JoinChoice } from "./join-form";

/*
 * The few membership helpers the sign-up form needs, copied from apps/platform lib/membership.ts. Prices come from the shared
 * bundle and money modules; nothing here works out a price of its own.
 */

/** The plan an owner pays for before their dashboard opens: Managed Website, or null for the dormant free listing. */
export function membershipTierForChoice(choice: string | null): "managed" | null {
  return choice === "managed" ? "managed" : null;
}

/** The part of a plan the price line is made from. */
export interface MembershipPricing {
  readonly recurringAmountCents: number;
  readonly currency: MoneyCurrency;
  readonly taxRateBasisPoints: number;
}

/** "₹2,999 a month, GST included", or "$65 a month" for a plan with no GST. */
export function membershipPriceLine(plan: MembershipPricing, bundledAddOnNetCents = 0): string {
  const amount = formatMoney(plan.recurringAmountCents + bundledAddOnNetCents, plan.currency);
  return `${amount} ${plan.taxRateBasisPoints === 0 ? "a month" : "a month, GST included"}`;
}

/** The services a sign-up is for, as one phrase in catalogue order: "Managed Website, Social Media and Ads and Local SEO + AEO". */
export function servicesPhrase(services: readonly MonthlyAddOnId[]): string {
  const titles = bundleLines(services, "INR").map((line) => line.title);
  return titles.length < 2 ? (titles[0] ?? "") : `${titles.slice(0, -1).join(", ")} and ${titles[titles.length - 1]}`;
}

/** What the services cost a month for a new sign-up, GST included, at the package price. */
export function basketNetCents(services: readonly MonthlyAddOnId[], currency: MoneyCurrency): number {
  return bundleNetCents(bundleLines(services, currency));
}

export type { JoinChoice };
