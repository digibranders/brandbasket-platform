/** What the client page says after staff move a client up to Premium, or finish a move. Fixed messages only: the query picks one. */
export type PlanUpgradeNotice =
  | "moved"
  | "moved-provider-failed"
  | "finished"
  | "finish-failed"
  | "nothing-to-finish"
  | "confirm"
  | "refused-blocked"
  | "refused-unavailable"
  | "refused-changed";

export const PLAN_UPGRADE_NOTICES: Readonly<Record<PlanUpgradeNotice, { readonly text: string; readonly ok: boolean }>> = {
  moved: {
    text: "Moved up to Premium. Nothing was charged. Their dashboard is Premium’s now, and Premium’s price starts at their next renewal.",
    ok: true,
  },
  "moved-provider-failed": {
    text: "They have Premium, but the payment provider didn’t accept the change. Use Finish the move below to try again.",
    ok: false,
  },
  finished: { text: "Done. The provider will bill Premium from their next renewal.", ok: true },
  "finish-failed": {
    text: "The provider still didn’t accept it. Check the Razorpay keys and that Premium has a Razorpay plan, then try again.",
    ok: false,
  },
  "nothing-to-finish": { text: "There was nothing to finish: the move had already reached the provider.", ok: false },
  confirm: { text: "Tick the box to confirm moving them without a charge.", ok: false },
  "refused-blocked": { text: "They can’t be moved up right now. The reason is shown in the Plan section.", ok: false },
  "refused-unavailable": { text: "A move can’t be worked out for them right now. The reason is shown in the Plan section.", ok: false },
  "refused-changed": { text: "Their plan changed while you were on the page, so nothing was moved. Look again.", ok: false },
};

/** `#plan` scrolls the reader to the Plan section, since the notice renders inside it. */
export function planUpgradeNoticeHref(businessId: string, notice: PlanUpgradeNotice): string {
  return `/clients/${businessId}?plan=${notice}#plan`;
}

export function readPlanUpgradeNotice(value: string | string[] | undefined): PlanUpgradeNotice | null {
  return typeof value === "string" && Object.hasOwn(PLAN_UPGRADE_NOTICES, value) ? (value as PlanUpgradeNotice) : null;
}
