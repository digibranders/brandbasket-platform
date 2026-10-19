import "server-only";
import type { BillingProvider } from "@brandbasket/billing";
import type { Plan } from "@brandbasket/db";
import { ensureDiscountPlanFor } from "@brandbasket/shared/server/discount-plans";
import { getStaffDb } from "./db";

export { UnevenPlanDiscountError } from "@brandbasket/shared/server/discount-plans";

/**
 * The provider plan a discounted subscription runs on, made the first time a discount is used against a base plan and
 * reused after that. The work is in @brandbasket/shared/server/discount-plans, which the staff console shares; this runs
 * it on the platform's staff connection.
 */
export async function ensureDiscountPlan(
  provider: BillingProvider,
  plan: Plan,
  discountAmountCents: number,
  bundledAddOnNetCents = 0,
): Promise<string | undefined> {
  return ensureDiscountPlanFor(getStaffDb(), provider, plan, discountAmountCents, bundledAddOnNetCents);
}
