import "server-only";
import type { BillingProvider } from "@fynix/billing";
import type { Plan } from "@fynix/db";
import { ensureDiscountPlanFor } from "@fynix/shared/server/discount-plans";
import { getStaffDb } from "./db";

export { UnevenPlanDiscountError } from "@fynix/shared/server/discount-plans";

/**
 * The provider plan a discounted subscription runs on, made the first time a discount is used against a base plan and
 * reused after that. The work is in @fynix/shared/server/discount-plans, which the staff console shares; this runs
 * it on the platform's staff connection.
 */
export async function ensureDiscountPlan(
  provider: BillingProvider,
  plan: Plan,
  discountAmountCents: number,
): Promise<string | undefined> {
  return ensureDiscountPlanFor(getStaffDb(), provider, plan, discountAmountCents);
}
