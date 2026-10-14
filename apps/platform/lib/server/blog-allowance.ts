import "server-only";
import type { Plan } from "@firstfold/db";
import { getPayload } from "payload";
import config from "@/payload.config";
import { chargeAmountCents } from "@firstfold/shared/lib/billing/charges";
import { formatMoney } from "@firstfold/shared/lib/money";
import { customerBlogAllowance } from "./charges";
import type { GrantedCustomer } from "./customer-access";

/** How many posts the customer has, how many they may have, and what the next block costs. */
export interface BlogUsage {
  readonly used: number;
  readonly allowance: number;
  /** Posts in the next block, and its price with tax: "₹560.50". */
  readonly nextBlock: { readonly posts: number; readonly price: string };
}

/** Every post of the business counts, drafts included; a deleted post frees its slot. */
async function countBlogPosts(businessId: string): Promise<number> {
  const payload = await getPayload({ config });
  const { totalDocs } = await payload.count({
    collection: "blogPosts",
    where: { businessId: { equals: businessId } },
    overrideAccess: true,
  });
  return totalDocs;
}

/** The customer's blog usage against their plan, or null when there is no plan to count against. */
export async function getBlogUsage(customer: Pick<GrantedCustomer, "tenant">, plan: Plan | null): Promise<BlogUsage | null> {
  if (plan === null) return null;
  const [used, allowance] = await Promise.all([
    countBlogPosts(customer.tenant.businessId),
    customerBlogAllowance(customer, plan),
  ]);
  return {
    used,
    allowance,
    nextBlock: {
      posts: plan.blogPostBlockSize,
      price: formatMoney(chargeAmountCents(plan.extraBlogPostsAmountCents, 1, plan.taxRateBasisPoints), plan.currency),
    },
  };
}

/** True when the customer may not create another post until they unlock more. */
export function isAtBlogLimit(usage: BlogUsage | null): boolean {
  return usage !== null && usage.used >= usage.allowance;
}
