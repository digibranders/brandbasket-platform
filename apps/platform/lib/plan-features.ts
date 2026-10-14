/*
 * What each plan includes (docs/superpowers/specs/2026-10-07-care-plan-design.md). The comparison table on the website's
 * Premium page is the source of truth; this is its twin for the dashboard, so the payment pages and the Care client's
 * Home read the same lists. Browser-safe and pure.
 */

/** A plan a business can buy. */
export type MembershipTier = "care" | "premium";

export const MEMBERSHIP_TIERS: readonly MembershipTier[] = ["care", "premium"];

/** What a plan gives for one row of the table: a yes, a no, or a short note ("5 pages (free)"). */
export type FeatureValue = boolean | string;

export interface PlanFeature {
  readonly id: string;
  /** The row's label, as the table words it. */
  readonly label: string;
  readonly free: FeatureValue;
  readonly care: FeatureValue;
  readonly premium: FeatureValue;
}

/** The table's rows, in its order. */
export const PLAN_FEATURES: readonly PlanFeature[] = [
  { id: "listing", label: "Business listing", free: true, care: false, premium: true },
  { id: "images", label: "Images", free: true, care: false, premium: true },
  { id: "videos", label: "Videos", free: false, care: false, premium: true },
  { id: "competitor-ads", label: "No competitor ads on your listing", free: false, care: false, premium: true },
  { id: "listing-management", label: "Business listing management", free: false, care: false, premium: true },
  { id: "website", label: "Next.js business website", free: false, care: true, premium: "5 pages (free)" },
  { id: "website-management", label: "Website management", free: false, care: true, premium: true },
  { id: "chatbot", label: "OyeChats professional chatbot", free: false, care: true, premium: true },
  { id: "hosting", label: "Server and hosting", free: false, care: true, premium: true },
  { id: "appointments", label: "Appointment management system", free: false, care: false, premium: true },
  { id: "featured", label: "Homepage featured placement", free: false, care: false, premium: "Hot & Growing" },
  { id: "ranking", label: "Better listing ranking", free: false, care: false, premium: true },
  { id: "google-business", label: "Google Business Profile management", free: false, care: false, premium: true },
  { id: "facebook", label: "Facebook account management", free: false, care: false, premium: true },
  { id: "instagram", label: "Instagram account management", free: false, care: false, premium: true },
  { id: "marketing-discount", label: "10% off digital marketing services", free: false, care: false, premium: true },
];

/** Whether a plan includes a row: a note counts as yes. */
export function includes(value: FeatureValue): boolean {
  return value !== false;
}

/** The rows a plan includes, in the table's order. */
export function featuresOf(tier: MembershipTier): readonly PlanFeature[] {
  return PLAN_FEATURES.filter((feature) => includes(feature[tier]));
}

/** The rows only Premium includes: what a Care client is shown as the step up. */
export function premiumOnlyFeatures(): readonly PlanFeature[] {
  return PLAN_FEATURES.filter((feature) => includes(feature.premium) && !includes(feature.care));
}

/**
 * The parts of the customer dashboard that belong to Premium. A Care client has none of them: their menu items are
 * not drawn and their pages send them Home (lib/server/customer-access.ts, `plan: "premium"`).
 */
export const PREMIUM_ONLY_SECTIONS = ["appointments", "patients", "listing", "leads", "photos", "advertise"] as const;
export type PremiumOnlySection = (typeof PREMIUM_ONLY_SECTIONS)[number];

/** The four things Care includes, for the Care client's Home: what each is called and what it means for them. */
export const CARE_INCLUDES = [
  { id: "website", title: "Your website", line: "A fast, custom Next.js website, built and launched for you." },
  { id: "website-management", title: "Website management", line: "Changes, updates and your blog, looked after by our team." },
  { id: "chatbot", title: "OyeChats chatbot", line: "A professional chatbot on your site that answers visitors for you." },
  { id: "hosting", title: "Server and hosting", line: "Your site is hosted, secured and kept online. Nothing to manage." },
] as const;
