import "server-only";
import type { BasketDeps } from "@brandbasket/shared/server/basket-change";
import { getBillingProvider } from "./billing";
import { getStaffDb } from "./db";
import { ensureDiscountPlan } from "./discount-plans";

/** The connections and plan maker the shared basket changes run with. Ported from apps/platform lib/server/add-ons.ts basketDeps. */
export function basketDeps(): BasketDeps {
  return { staffDb: getStaffDb(), provider: getBillingProvider(), ensureDiscountPlan };
}
