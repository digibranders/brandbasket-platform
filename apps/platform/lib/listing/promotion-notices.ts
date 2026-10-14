/** What the Listing page's Promotion section says after a Pay press that did not go to payment, keyed by `?promotion=`. */
export const PROMOTION_NOTICES = {
  "other-tag-running": "One tag runs at a time. You can choose a different one when this week ends.",
  "next-week-booked": "Your next week is already paid for. You can renew again once it starts.",
  "payment-required": "Tags open once your plan is paid. You can pay from Billing.",
  "invalid-tag": "Choose one of the three tags.",
} as const satisfies Readonly<Record<string, string>>;

export type PromotionNotice = keyof typeof PROMOTION_NOTICES;

/** The notice a `?promotion=` value names, or null for anything else. */
export function readPromotionNotice(value: string | string[] | undefined): PromotionNotice | null {
  if (typeof value !== "string") return null;
  return Object.hasOwn(PROMOTION_NOTICES, value) ? (value as PromotionNotice) : null;
}

/** The Listing page, showing `notice` in its Promotion section. */
export function promotionNoticeHref(notice: PromotionNotice): string {
  return `/listing?promotion=${notice}#promotion`;
}
