import "server-only";
import type { BasketDeps } from "@brandbasket/shared/server/basket-change";
import { ensureDiscountPlanFor } from "@brandbasket/shared/server/discount-plans";
import { getBillingProvider } from "./billing-provider";
import { getStaffDb } from "./db";

/** The connections and plan maker the shared add-on changes run with, in the console. */
export function basketDeps(): BasketDeps {
  const staffDb = getStaffDb();
  return {
    staffDb,
    provider: getBillingProvider(),
    ensureDiscountPlan: (provider, plan, discountAmountCents, addOnNetCents) => ensureDiscountPlanFor(staffDb, provider, plan, discountAmountCents, addOnNetCents),
  };
}
