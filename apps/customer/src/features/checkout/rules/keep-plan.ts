import type { Subscription } from "@brandbasket/db";

/* Ported from apps/platform lib/account-exit-rules.ts (keepPlanOffered only). */


/**
 * Whether the restore-account page offers Keep my plan: the plan was cancelled by the client (cancelRequestedAt), the
 * provider has it set to stop at the end of the month they paid for and that month is still running, a person's plan
 * rather than one collected by hand, and no new mandate for it has been authorised yet (`waiting` is the successor a
 * keep checkout opened, `active` once the provider holds its mandate).
 */
export function keepPlanOffered(
  input: { readonly subscription: Subscription | null; readonly waiting: Pick<Subscription, "status"> | null },
  now: Date,
): boolean {
  const { subscription, waiting } = input;
  if (subscription === null || subscription.cancelRequestedAt === null || subscription.provider === "manual") return false;
  if (subscription.status !== "active" && subscription.status !== "past_due") return false;
  if (subscription.paidThroughAt === null || subscription.paidThroughAt.getTime() <= now.getTime()) return false;
  return waiting === null || waiting.status !== "active";
}
