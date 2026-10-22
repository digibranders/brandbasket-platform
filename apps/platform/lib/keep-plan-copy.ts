/** What the restore-account page says about Keep my plan. */
export const KEEP_PLAN_NOTE = "Your plan carries on as it is. Nothing changes on your next bill.";

/** Why a Keep my plan press was refused, by the mark it comes back with (`?keep=`), so the page can say so without keeping any state. */
export const KEEP_PLAN_REFUSALS = {
  busy: "That’s a lot of attempts in a short time. Please wait a little and try again.",
  unavailable: "We couldn’t open your payment just now. Please try again in a minute.",
  changed: "Something changed while we were setting up your payment. Please try again.",
} as const;

export type KeepPlanRefusal = keyof typeof KEEP_PLAN_REFUSALS;

/** The sentence for a `?keep=` mark, or null for none or an unknown one. */
export function keepPlanRefusal(mark: string | string[] | undefined): string | null {
  return typeof mark === "string" && Object.hasOwn(KEEP_PLAN_REFUSALS, mark) ? KEEP_PLAN_REFUSALS[mark as KeepPlanRefusal] : null;
}
