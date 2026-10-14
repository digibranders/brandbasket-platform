import type { PricingFormProblem } from "@firstfold/shared/lib/billing/pricing-form";

/** What the pricing page says after a save. Fixed messages only: the query parameter picks one, nothing more. */
export type PricingNotice =
  | "monthly-updated"
  | "extras-updated"
  | "unchanged"
  | "no-plan"
  | "below-referral"
  | "provider-failed"
  | PricingFormProblem;

export const PRICING_NOTICES: Readonly<Record<PricingNotice, { readonly text: string; readonly ok: boolean }>> = {
  "monthly-updated": {
    text: "Saved. The new monthly price is live for new sign-ups (a new Razorpay plan was created); existing customers keep their price. The website shows it within 5 minutes.",
    ok: true,
  },
  "extras-updated": {
    text: "Saved. New extras are charged at these prices; extras already added keep theirs. The website shows them within 5 minutes.",
    ok: true,
  },
  unchanged: { text: "Nothing changed: those are already the prices.", ok: false },
  "no-plan": { text: "Nothing changed: there is no plan of that kind on sale in that currency.", ok: false },
  "below-referral": {
    text: "Nothing changed: a live referral code takes that much or more off every month. Set a higher price, or turn that code off first.",
    ok: false,
  },
  "provider-failed": {
    text: "Nothing changed: Razorpay didn’t create the new plan. Check the Razorpay keys and try again.",
    ok: false,
  },
  "invalid-currency": { text: "Nothing changed: pick dollars or rupees.", ok: false },
  "invalid-tier": { text: "Nothing changed: pick Care or Premium.", ok: false },
  "invalid-monthly": { text: "Nothing changed: give a monthly price above zero, like 69 or 2,999.", ok: false },
  "invalid-extra-hour": { text: "Nothing changed: give an hourly price above zero.", ok: false },
  "invalid-extra-publish": { text: "Nothing changed: give an extra publish price above zero.", ok: false },
  "invalid-extra-blog-posts": { text: "Nothing changed: give a blog-post block price above zero.", ok: false },
};

export function pricingNoticeHref(notice: PricingNotice): string {
  return `/pricing?saved=${notice}`;
}

export function readPricingNotice(value: string | string[] | undefined): PricingNotice | null {
  return typeof value === "string" && Object.hasOwn(PRICING_NOTICES, value) ? (value as PricingNotice) : null;
}
