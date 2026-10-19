import type { PlanTier } from "@brandbasket/db";

/** What each plan is called wherever staff or customers read it. */
export const PLAN_TIER_LABELS: Readonly<Record<PlanTier, string>> = { care: "Care", premium: "Premium" };

/** A plan tier named by an address or a form, or null for anything else. */
export function readPlanTier(value: unknown): PlanTier | null {
  return value === "care" || value === "premium" ? value : null;
}
