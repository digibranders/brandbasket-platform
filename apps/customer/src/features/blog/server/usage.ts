import "server-only";
import { chargeAmountCents } from "@brandbasket/shared/lib/billing/charges";
import type { Payload } from "payload";
import { customerBlogAllowance } from "@/features/checkout/server/charges";
import type { CustomerContext } from "@/lib/guards";
import type { BlogUsage } from "../rules/posts";
import { countBlogPosts } from "./store";

/**
 * The business's posts against its plan, or null when there is no plan to count against (then no limit applies). Ported
 * from apps/platform lib/server/blog-allowance.ts: allowance = the plan's included posts plus a block for every block paid
 * for; the next block is priced from the plan row.
 */
export async function getBlogUsage(payload: Payload, customer: Pick<CustomerContext, "tenant" | "billing">): Promise<BlogUsage | null> {
  const plan = customer.billing.plan;
  if (plan === null) return null;
  const [used, allowance] = await Promise.all([countBlogPosts(payload, customer.tenant.businessId), customerBlogAllowance(customer, plan)]);
  return {
    used,
    allowance,
    nextBlock: { posts: plan.blogPostBlockSize, amountCents: chargeAmountCents(plan.extraBlogPostsAmountCents, 1), currency: plan.currency },
  };
}
