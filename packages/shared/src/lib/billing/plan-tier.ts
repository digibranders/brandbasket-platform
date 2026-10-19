import type { PlanTier } from "@brandbasket/db";

/** What each plan is called wherever staff or customers read it. */
export const PLAN_TIER_LABELS: Readonly<Record<PlanTier, string>> = { managed: "Managed Website" };

/** A plan tier named by an address or a form, or null for anything else. */
export function readPlanTier(value: unknown): PlanTier | null {
  return value === "managed" ? value : null;
}
