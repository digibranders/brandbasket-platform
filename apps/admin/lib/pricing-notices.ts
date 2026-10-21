import type { PricingFormProblem } from "@brandbasket/shared/lib/billing/pricing-form";

/** What the pricing page says after a save. Fixed messages only: the query parameter picks one, nothing more. */
export type PricingNotice = "extras-updated" | "unchanged" | "no-plan" | PricingFormProblem;

export const PRICING_NOTICES: Readonly<Record<PricingNotice, { readonly text: string; readonly ok: boolean }>> = {
  "extras-updated": {
    text: "Saved. New extras are charged at these prices; extras already added keep theirs.",
    ok: true,
  },
  unchanged: { text: "Nothing changed: those are already the prices.", ok: false },
  "no-plan": { text: "Nothing changed: there is no plan on sale in that currency.", ok: false },
  "invalid-currency": { text: "Nothing changed: pick dollars or rupees.", ok: false },
  "invalid-tier": { text: "Nothing changed: that plan is not one Brandbasket sells.", ok: false },
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
