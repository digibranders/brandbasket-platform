import "server-only";
import { BillingRequiredError, requireBillingAccess } from "./billing";
import type { GrantedCustomer } from "./customer-access";

/**
 * `requireBillingAccess()`, with an unpaid business turned into `null` so each blog action can answer with a
 * "pay first" result rather than throwing to the error boundary. Only `BillingRequiredError` is caught: the sign-in
 * redirect and any real failure still propagate, so an outage is never reported to the customer as "unpaid".
 * Shared by content/blog/actions.ts (posts), content/blog/taxonomy-actions.ts (categories and authors) and
 * details/actions.ts (hours, closures and the announcement).
 */
export async function paidCustomerOrNull(): Promise<GrantedCustomer | null> {
  return requireBillingAccess().catch((error: unknown) => {
    if (error instanceof BillingRequiredError) return null;
    throw error;
  });
}

/** The generic version of `lib/server/blog.ts`'s `BLOG_PAYMENT_REQUIRED_MESSAGE`, for any other `paidCustomerOrNull`
 * caller that isn't the blog — today, details/actions.ts. The blog keeps its own wording; this one names no
 * particular feature, since "Your details" isn't the only thing that will use it. */
export const PAID_PLAN_REQUIRED_MESSAGE = "This opens once your plan is paid. You can pay from Billing.";
