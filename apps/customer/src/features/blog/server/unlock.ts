import "server-only";
import { openBlogPostsCharge, type Charge, type Plan } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { chargeAmountCents, chargePricing } from "@brandbasket/shared/lib/billing/charges";
import { getStaffDb } from "@/lib/db";

/**
 * The open charge that unlocks the next block of blog posts, added at the plan's price when there is none yet; a second ask
 * (a double click, two tabs) reuses the open one. Ported from apps/platform lib/server/charges.ts openBlogUnlock. The caller
 * has checked this is a paying writer at their limit.
 *
 * Staff connection: charges are insert-only for bb_staff (packages/db migration 0048). The business comes only from the
 * session tenant, the price only from the plan row, and the partial unique index allows one open unlock per business.
 */
export async function openBlogUnlock(tenant: TenantContext, plan: Plan): Promise<Charge> {
  const pricing = chargePricing("blog_posts", plan);
  if (pricing.unitAmountCents === null) throw new Error("Blog posts must have a price on the plan");
  return openBlogPostsCharge(getStaffDb(), {
    businessId: tenant.businessId,
    kind: "blog_posts",
    description: pricing.description,
    quantity: 1,
    unitAmountCents: pricing.unitAmountCents,
    taxRateBasisPoints: plan.taxRateBasisPoints,
    amountCents: chargeAmountCents(pricing.unitAmountCents, 1),
    currency: plan.currency,
    createdByStaffId: null,
  });
}
