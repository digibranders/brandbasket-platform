/*
 * What Managed Website includes, from the plans document's Plan A (docs/plans/11-platform-plans.md in the BrandBasket
 * workspace): the one list the payment page and the client's Home read. Browser-safe and pure.
 */

/** The plan a business can buy. Brandbasket sells one. */
export type MembershipTier = "managed";

export const MEMBERSHIP_TIERS: readonly MembershipTier[] = ["managed"];

export interface PlanFeature {
  readonly id: string;
  /** The line as the page says it. */
  readonly label: string;
}

/** What the plan includes, in the plans document's order. */
export const PLAN_FEATURES: readonly PlanFeature[] = [
  { id: "website", label: "Your business website, built free" },
  { id: "hosting", label: "Hosting and SSL certificate" },
  { id: "monitoring", label: "Uptime and availability monitoring" },
  { id: "security", label: "Security checks and routine maintenance" },
  { id: "backups", label: "Regular backups and recovery support" },
  { id: "fixes", label: "Bug fixes and small mobile fixes" },
  { id: "forms", label: "Contact and enquiry form checks" },
  { id: "analytics", label: "Analytics, indexing and sitemap checks" },
  { id: "edits", label: "2 small content edits a month, up to 30 minutes each" },
  { id: "report", label: "A monthly website health report" },
  { id: "chatbot", label: "OyeChats professional chatbot" },
];

/** What a plan includes, in order. One plan, so this is the whole list. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- one plan today; callers name it so a second plan needs no call changes
export function featuresOf(_tier: MembershipTier): readonly PlanFeature[] {
  return PLAN_FEATURES;
}
