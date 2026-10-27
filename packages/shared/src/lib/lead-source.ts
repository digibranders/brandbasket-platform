import type { LeadSource } from "@brandbasket/db";

/** Where an enquiry came from, in the order the console's filters list them. */
export const LEAD_SOURCE_ORDER = ["website_form", "pricing_page", "signup", "staff"] as const satisfies readonly LeadSource[];

export const LEAD_SOURCE_LABELS: Readonly<Record<LeadSource, string>> = {
  website_form: "Website form",
  pricing_page: "Pricing page",
  signup: "Sign-up",
  staff: "Added after a call",
};

/** The plans on the website's basket, by the ids the website sends (brandbasket-website lib/pricing.ts PLAN_IDS). */
const WEBSITE_PLAN_LABELS: Readonly<Record<string, string>> = { website: "Website", growth: "Social & Ads", search: "Search" };

/** The website's plan ids by name; an id this list does not know is shown as it is. */
export function websitePlanLabels(plans: readonly string[]): readonly string[] {
  return plans.map((plan) => WEBSITE_PLAN_LABELS[plan] ?? plan);
}
